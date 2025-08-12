import path from 'path';
import os from 'os';
import fs from 'fs-extra';

import { IndexEntry } from '../../core/index';
import { BlobObject } from '../../core/objects';
import { FileUtils } from '../../utils';
import { IndexEntryComparator, ChangeType } from '../../core/index/services/index-entry-comparator';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

describe('IndexEntryComparator', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-index-entry-comparator-'));
  });

  afterEach(async () => {
    await fs.remove(tmp);
    jest.restoreAllMocks();
  });

  const writeWorkingFile = async (rel: string, content: string) => {
    const abs = path.join(tmp, rel);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content, 'utf8');
    return abs;
  };

  const makeEntryFromDisk = async (relPath: string): Promise<IndexEntry> => {
    const abs = path.join(tmp, relPath);
    const stats = await fs.stat(abs);
    const content = await fs.readFile(abs);
    const sha = await new BlobObject(new Uint8Array(content)).sha();

    return IndexEntry.fromFileStats(
      relPath,
      {
        ctimeMs: stats.ctimeMs,
        mtimeMs: stats.mtimeMs,
        dev: stats.dev,
        ino: stats.ino,
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
        size: stats.size,
      } as any,
      sha
    );
  };

  const setMtimeSeconds = async (abs: string, seconds: number) => {
    const st = await fs.stat(abs);
    const at = st.atime;
    const mt = new Date(seconds * 1000);
    await fs.utimes(abs, at, mt);
  };

  const opts = (
    overrides: Partial<Parameters<typeof IndexEntryComparator.createOptions>[1]> = {}
  ) => IndexEntryComparator.createOptions(tmp, overrides);

  test('returns FILE_MISSING when file not present', async () => {
    const entry = new IndexEntry({
      filePath: 'missing.txt',
      fileSize: 0,
      contentHash: '0'.repeat(40),
    });
    const res = await IndexEntryComparator.compare(entry, opts());
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.FILE_MISSING);
    expect(res.details.exists).toBe(false);
    expect(res.quickCheck).toBe(true);
  });

  test('returns FILE_MISSING when stat fails even if exists() was true', async () => {
    const rel = 'err.txt';
    await writeWorkingFile(rel, 'content');
    const entry = await makeEntryFromDisk(rel);

    const orig = fs.stat;
    jest.spyOn(fs, 'stat').mockImplementation(async (p: any) => {
      if (String(p).endsWith(rel)) throw new Error('cannot stat');
      return orig(p);
    });

    const res = await IndexEntryComparator.compare(entry, opts());
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.FILE_MISSING);
    expect(res.details.exists).toBe(false);
    expect(res.details.reason).toMatch(/Cannot stat file/);
    expect(res.quickCheck).toBe(true);
  });

  test('detects SIZE_CHANGED (quick)', async () => {
    const rel = 'size.txt';
    const abs = await writeWorkingFile(rel, 'A');
    const entry = await makeEntryFromDisk(rel);

    await fs.writeFile(abs, 'AB', 'utf8');

    const stats = await fs.stat(abs);
    const res = await IndexEntryComparator.compareWithStats(entry, stats, opts());
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.SIZE_CHANGED);
    expect(res.details.size).toEqual({ index: entry.fileSize, workingDir: stats.size });
    expect(res.quickCheck).toBe(true);
  });

  test('detects MODE_CHANGED (quick)', async () => {
    const rel = 'mode.txt';
    await writeWorkingFile(rel, 'X');
    const entry = await makeEntryFromDisk(rel);

    // Make index reflect a different mode than on disk to trigger mode change
    entry.fileMode = entry.fileMode ^ 0o1;

    const stats = await fs.stat(path.join(tmp, rel));
    const res = await IndexEntryComparator.compareWithStats(entry, stats, opts());
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.MODE_CHANGED);
    expect(res.details.mode).toEqual({ index: entry.fileMode, workingDir: stats.mode });
    expect(res.quickCheck).toBe(true);
  });

  test('detects MULTIPLE_CHANGES when size and mode differ (quick)', async () => {
    const rel = 'multi.txt';
    const abs = await writeWorkingFile(rel, 'ONE'); // length 3
    const entry = await makeEntryFromDisk(rel);

    // change content length (size differs)
    await fs.writeFile(abs, 'TWO2', 'utf8'); // length 4
    // and change index mode to differ from working
    entry.fileMode = entry.fileMode ^ 0o1;

    const stats = await fs.stat(abs);
    const res = await IndexEntryComparator.compareWithStats(entry, stats, opts());
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.MULTIPLE_CHANGES);
    expect(res.details.size).toBeDefined();
    expect(res.details.mode).toBeDefined();
    expect(res.quickCheck).toBe(true);
  });

  test('detects TIME_CHANGED (quick=true) when only mtime seconds differ', async () => {
    const rel = 'time-quick.txt';
    const abs = await writeWorkingFile(rel, 'SAME');
    const entry = await makeEntryFromDisk(rel);

    const nextSec = entry.modificationTime.seconds + 10;
    await setMtimeSeconds(abs, nextSec);

    const stats = await fs.stat(abs);
    const res = await IndexEntryComparator.compareWithStats(
      entry,
      stats,
      opts({ quickCheck: true })
    );
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.TIME_CHANGED);
    expect(res.details.modificationTime).toEqual({
      index: entry.modificationTime.seconds,
      workingDir: Math.floor(stats.mtimeMs / 1000),
    });
    expect(res.quickCheck).toBe(true);
  });

  test('deep check (quick=false) with time change but same content -> TIME_CHANGED', async () => {
    const rel = 'time-deep-unchanged.txt';
    const abs = await writeWorkingFile(rel, 'UNCHANGED');
    const entry = await makeEntryFromDisk(rel);

    const nextSec = entry.modificationTime.seconds + 60;
    await setMtimeSeconds(abs, nextSec);

    const stats = await fs.stat(abs);
    const res = await IndexEntryComparator.compareWithStats(
      entry,
      stats,
      opts({ quickCheck: false })
    );
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.TIME_CHANGED);
    expect(res.quickCheck).toBe(false);
  });

  test('deep check (quick=false) with time change and same size but content changed -> CONTENT_CHANGED', async () => {
    const rel = 'time-deep-content.txt';
    const abs = await writeWorkingFile(rel, 'ABC'); // len 3
    const entry = await makeEntryFromDisk(rel);

    // Change content but keep same length so size check does not trigger
    await fs.writeFile(abs, 'XYZ', 'utf8');

    // Also ensure mtime seconds differs to go into timeChanged branch
    const nextSec = entry.modificationTime.seconds + 5;
    await setMtimeSeconds(abs, nextSec);

    const stats = await fs.stat(abs);
    const res = await IndexEntryComparator.compareWithStats(
      entry,
      stats,
      opts({ quickCheck: false })
    );
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.CONTENT_CHANGED);
    expect(res.details.contentHash).toBeDefined();
    expect(res.details.reason).toMatch(/File content has been modified/);
    expect(res.quickCheck).toBe(false);
  });

  test('content changed with same mtime seconds -> CONTENT_CHANGED (deep path outside timeChanged)', async () => {
    const rel = 'content-same-time.txt';
    const abs = await writeWorkingFile(rel, 'aaa'); // len 3
    const entry = await makeEntryFromDisk(rel);

    // Modify content to different bytes but same length
    await fs.writeFile(abs, 'bbb', 'utf8');

    // Reset mtime seconds back to index value so timeChanged=false
    await setMtimeSeconds(abs, entry.modificationTime.seconds);

    const stats = await fs.stat(abs);
    const res = await IndexEntryComparator.compareWithStats(
      entry,
      stats,
      opts({ quickCheck: false })
    );
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.CONTENT_CHANGED);
    expect(res.details.contentHash).toBeDefined();
    expect(res.quickCheck).toBe(false);
  });

  test('unreadable file during deep content check -> CONTENT_CHANGED with workingDir "<unreadable>"', async () => {
    const rel = 'unreadable.txt';
    const abs = await writeWorkingFile(rel, 'visible');
    const entry = await makeEntryFromDisk(rel);

    // Keep time unchanged so we hit the "else" content check
    await setMtimeSeconds(abs, entry.modificationTime.seconds);

    const spy = jest.spyOn(FileUtils, 'readFile').mockImplementation(async () => {
      throw new Error('no read');
    });

    const stats = await fs.stat(abs);
    const res = await IndexEntryComparator.compareWithStats(
      entry,
      stats,
      opts({ quickCheck: false })
    );

    expect(spy).toHaveBeenCalled();
    expect(res.hasChanged).toBe(true);
    expect(res.changeType).toBe(ChangeType.CONTENT_CHANGED);
    expect(res.details.contentHash).toEqual({
      index: entry.contentHash,
      workingDir: '<unreadable>',
    });
    expect(res.quickCheck).toBe(false);
  });

  test('unchanged file -> UNCHANGED', async () => {
    const rel = 'unchanged.txt';
    const abs = await writeWorkingFile(rel, 'stable');
    const entry = await makeEntryFromDisk(rel);

    // Ensure mtime seconds matches entry
    await setMtimeSeconds(abs, entry.modificationTime.seconds);

    const stats = await fs.stat(abs);
    const res = await IndexEntryComparator.compareWithStats(entry, stats, opts());
    expect(res.hasChanged).toBe(false);
    expect(res.changeType).toBe(ChangeType.UNCHANGED);
    expect(res.details.reason).toBe('File unchanged');
    expect(res.quickCheck).toBe(false);
  });

  test('createOptions provides defaults and applies overrides', () => {
    const base = IndexEntryComparator.createOptions(tmp);
    expect(base.workingDirectory).toBe(tmp);
    expect(base.quickCheck).toBe(false);

    const overridden = IndexEntryComparator.createOptions(tmp, { quickCheck: true });
    expect(overridden.quickCheck).toBe(true);
  });
});

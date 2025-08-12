import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { PathScurry } from 'path-scurry';

import type { Path } from 'glob';
import { GitIndex, IndexEntry } from '../../core/index';
import { WorkingDirectoryValidator } from '../../core/work-dir/internal';
import { BlobObject } from '../../core/objects';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

describe('WorkingDirectoryValidator', () => {
  let tmp: string;
  let scurry: PathScurry;
  let wd: Path;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-wd-validator-'));
    scurry = new PathScurry(tmp);
    wd = scurry.cwd;
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  const writeWorkingFile = async (rel: string, content: string) => {
    const abs = path.join(wd.fullpath(), rel);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content, 'utf8');
    return abs;
  };

  const makeSha = async (content: string) => {
    const blob = new BlobObject(toBytes(content));
    return await blob.sha();
  };

  const makeEntryFromDisk = async (relPath: string, sha: string): Promise<IndexEntry> => {
    const stats = await fs.stat(path.join(wd.fullpath(), relPath));
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
      },
      sha
    );
  };

  const newValidator = () => new WorkingDirectoryValidator(wd.fullpath());

  test('validateCleanState: reports clean when all entries match', async () => {
    await writeWorkingFile('a.txt', 'A');
    await writeWorkingFile('b.txt', 'BB');

    const eA = await makeEntryFromDisk('a.txt', await makeSha('A'));
    const eB = await makeEntryFromDisk('b.txt', await makeSha('BB'));

    const index = new GitIndex(2, [eA, eB]);
    const validator = newValidator();

    const status = await validator.validateCleanState(index);

    expect(status.clean).toBe(true);
    expect(status.modifiedFiles).toEqual([]);
    expect(status.deletedFiles).toEqual([]);
    expect(status.details).toEqual([]);
  });

  test('validateCleanState: detects deleted file', async () => {
    await writeWorkingFile('d.txt', 'X');
    const eD = await makeEntryFromDisk('d.txt', await makeSha('X'));

    // delete the file from working dir
    await fs.remove(path.join(wd.fullpath(), 'd.txt'));

    const index = new GitIndex(2, [eD]);
    const validator = newValidator();

    const status = await validator.validateCleanState(index);

    expect(status.clean).toBe(false);
    expect(status.deletedFiles).toEqual(['d.txt']);
    expect(status.modifiedFiles).toEqual([]);
    expect(status.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'd.txt', status: 'deleted' })])
    );
  });

  test('validateCleanState: detects size-changed when file length differs', async () => {
    await writeWorkingFile('s.txt', 'ONE');
    const eS = await makeEntryFromDisk('s.txt', await makeSha('ONE'));

    await fs.writeFile(path.join(wd.fullpath(), 's.txt'), 'LONGER', 'utf8');

    const index = new GitIndex(2, [eS]);
    const validator = newValidator();

    const status = await validator.validateCleanState(index);

    expect(status.clean).toBe(false);
    expect(status.modifiedFiles).toEqual(['s.txt']);
    expect(status.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 's.txt', status: 'size-changed' })])
    );
  });

  test('validateCleanState: detects time-changed when mtime seconds differ but content is identical', async () => {
    await writeWorkingFile('t.txt', 'TIME');
    const eT = await makeEntryFromDisk('t.txt', await makeSha('TIME'));

    // change only mtime seconds (keep content same and size same)
    const filePath = path.join(wd.fullpath(), 't.txt');
    const preStats = await fs.stat(filePath);
    const newMtime = new Date(Math.floor(preStats.mtimeMs / 1000 + 10) * 1000);
    await fs.utimes(filePath, preStats.atime, newMtime);

    const index = new GitIndex(2, [eT]);
    const validator = newValidator();

    const status = await validator.validateCleanState(index);

    expect(status.clean).toBe(false);
    expect(status.modifiedFiles).toEqual(['t.txt']);
    expect(status.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 't.txt', status: 'time-changed' })])
    );
  });

  test('validateCleanState: detects content-changed when same size but different content', async () => {
    await writeWorkingFile('c.txt', 'AAAA'); // length 4
    const eC = await makeEntryFromDisk('c.txt', await makeSha('AAAA'));

    // change content to same length
    await fs.writeFile(path.join(wd.fullpath(), 'c.txt'), 'BBBB', 'utf8');

    const index = new GitIndex(2, [eC]);
    const validator = newValidator();

    const status = await validator.validateCleanState(index);

    expect(status.clean).toBe(false);
    expect(status.modifiedFiles).toEqual(['c.txt']);
    expect(status.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'c.txt', status: 'content-changed' }),
      ])
    );
  });

  test('formatStatusSummary: renders clean and changes summaries', () => {
    const validator = newValidator();

    expect(
      validator.formatStatusSummary({
        clean: true,
        modifiedFiles: [],
        deletedFiles: [],
        details: [],
      })
    ).toBe('Working directory is clean');

    expect(
      validator.formatStatusSummary({
        clean: false,
        modifiedFiles: ['a.txt', 'b.txt'],
        deletedFiles: ['c.txt'],
        details: [],
      })
    ).toBe('Changes: 2 modified, 1 deleted');
  });

  test('isClean: returns boolean clean state', async () => {
    await writeWorkingFile('ok.txt', 'OK');
    const e = await makeEntryFromDisk('ok.txt', await makeSha('OK'));
    const index = new GitIndex(2, [e]);
    const validator = newValidator();
    expect(await validator.isClean(index)).toBe(true);

    // change file
    await fs.writeFile(path.join(wd.fullpath(), 'ok.txt'), 'NOT-OK', 'utf8');
    expect(await validator.isClean(index)).toBe(false);
  });

  test('getFileDetails: respects maxFiles and format "  path (status)"', () => {
    const validator = newValidator();
    const status = {
      clean: false,
      modifiedFiles: [],
      deletedFiles: [],
      details: [
        { path: 'a.txt', status: 'size-changed' as const },
        { path: 'b.txt', status: 'time-changed' as const },
        { path: 'c.txt', status: 'deleted' as const },
      ],
    };
    expect(validator.getFileDetails(status, 2)).toEqual([
      '  a.txt (size-changed)',
      '  b.txt (time-changed)',
    ]);
  });

  test('validateSafeOverwrite: treats time-changed as safe and other changes as conflicts', async () => {
    // Setup three files with entries
    await writeWorkingFile('tc.txt', 'SAME'); // time change only
    await writeWorkingFile('cc.txt', 'AAAA'); // content change to BBBB
    await writeWorkingFile('del.txt', 'TODELETE'); // will be deleted

    const eTC = await makeEntryFromDisk('tc.txt', await makeSha('SAME'));
    const eCC = await makeEntryFromDisk('cc.txt', await makeSha('AAAA'));
    const eDEL = await makeEntryFromDisk('del.txt', await makeSha('TODELETE'));

    // mutate working directory to create desired states
    // time-changed
    const tcPath = path.join(wd.fullpath(), 'tc.txt');
    const tcStats = await fs.stat(tcPath);
    await fs.utimes(tcPath, tcStats.atime, new Date(Math.floor(tcStats.mtimeMs / 1000 + 5) * 1000));

    // content-changed same size
    await fs.writeFile(path.join(wd.fullpath(), 'cc.txt'), 'BBBB', 'utf8');

    // deleted
    await fs.remove(path.join(wd.fullpath(), 'del.txt'));

    const index = new GitIndex(2, [eTC, eCC, eDEL]);
    const validator = newValidator();

    const toOverwrite = ['tc.txt', 'cc.txt', 'del.txt', 'unknown.txt'];
    const res = await validator.validateSafeOverwrite(index, toOverwrite);

    expect(res.safe).toBe(false);
    expect(res.conflicts.sort()).toEqual(['cc.txt', 'del.txt'].sort());
  });

  test('validateCleanState: returns clean for empty index', async () => {
    const index = new GitIndex(2, []);
    const validator = newValidator();

    const status = await validator.validateCleanState(index);

    expect(status).toEqual({
      clean: true,
      modifiedFiles: [],
      deletedFiles: [],
      details: [],
    });
  });

  test('validateCleanState: ignores millisecond-only mtime changes (same second)', async () => {
    await writeWorkingFile('ms.txt', 'SAME');
    const e = await makeEntryFromDisk('ms.txt', await makeSha('SAME'));

    const filePath = path.join(wd.fullpath(), 'ms.txt');
    const preStats = await fs.stat(filePath);
    const baseSecMs = Math.floor(preStats.mtimeMs / 1000) * 1000;
    await fs.utimes(filePath, preStats.atime, new Date(baseSecMs + 500)); // same second

    const index = new GitIndex(2, [e]);
    const validator = newValidator();

    const status = await validator.validateCleanState(index);
    expect(status.clean).toBe(true);
    expect(status.details).toEqual([]);
  });

  test('formatStatusSummary: only deleted', () => {
    const validator = newValidator();
    expect(
      validator.formatStatusSummary({
        clean: false,
        modifiedFiles: [],
        deletedFiles: ['x.txt'],
        details: [],
      })
    ).toBe('Changes: 1 deleted');
  });

  test('validateSafeOverwrite: all safe when only time-changed or unchanged', async () => {
    await writeWorkingFile('u1.txt', 'S');
    await writeWorkingFile('u2.txt', 'S');

    const e1 = await makeEntryFromDisk('u1.txt', await makeSha('S'));
    const e2 = await makeEntryFromDisk('u2.txt', await makeSha('S'));

    // Make u2 time-changed (seconds differ) but same content
    const p2 = path.join(wd.fullpath(), 'u2.txt');
    const s2 = await fs.stat(p2);
    await fs.utimes(p2, s2.atime, new Date(Math.floor(s2.mtimeMs / 1000 + 3) * 1000));

    const index = new GitIndex(2, [e1, e2]);
    const validator = newValidator();

    const res = await validator.validateSafeOverwrite(index, ['u1.txt', 'u2.txt', 'unknown.txt']);
    expect(res.safe).toBe(true);
    expect(res.conflicts).toEqual([]);
  });
});

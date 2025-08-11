import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { GitIndex } from '../../core/index/git-index';
import { IndexEntry } from '../../core/index/index-entry';
import { ObjectException } from '../../core/exceptions';
import { FileUtils } from '../../utils';
import { GitTimestamp } from '../../core/index/index-entry-utils';

const shaAB = 'ab'.repeat(20);
const shaCD = 'cd'.repeat(20);
const shaEF = 'ef'.repeat(20);

const makeEntry = (overrides: Partial<IndexEntry> = {}): IndexEntry => {
  return new IndexEntry({
    filePath: 'file.txt',
    creationTime: new GitTimestamp(1_700_000_000, 111),
    modificationTime: new GitTimestamp(1_700_000_010, 222),
    deviceId: 1,
    inodeNumber: 2,
    fileMode: 0o100644,
    userId: 1000,
    groupId: 1000,
    fileSize: 123,
    contentHash: shaAB,
    assumeValid: false,
    stageNumber: 0,
    ...overrides,
  });
};

describe('GitIndex: construction and helpers', () => {
  test('constructor sorts entries by compareTo (directory vs file)', () => {
    const eFileA = makeEntry({ filePath: 'a' });
    const eDirA = makeEntry({ filePath: 'a', fileMode: 0 }); // directory-like
    const eFileB = makeEntry({ filePath: 'b' });
    const gi = new GitIndex(2, [eFileB, eDirA, eFileA]);

    expect(gi.entryNames()).toEqual(['a', 'a', 'b']); // 'a' (file) < 'a/' (dir) < 'b'
    // Verify the directory-like entry is second
    expect(gi.entries[1]?.isDirectory).toBe(true);
  });

  test('entryNames/hasEntry/getEntry/removeEntry/clear work', () => {
    const e1 = makeEntry({ filePath: 'one' });
    const e2 = makeEntry({ filePath: 'two' });
    const gi = new GitIndex(2, [e1, e2]);

    expect(gi.entryNames().sort()).toEqual(['one', 'two']);

    expect(gi.hasEntry('one')).toBe(true);
    expect(gi.hasEntry('zzz')).toBe(false);

    expect(gi.getEntry('two')?.filePath).toBe('two');
    expect(gi.getEntry('zzz')).toBeUndefined();

    gi.removeEntry('one');
    expect(gi.hasEntry('one')).toBe(false);
    expect(gi.entryNames()).toEqual(['two']);

    gi.clear();
    expect(gi.entryNames()).toEqual([]);
  });
});

describe('GitIndex: serialize/deserialize', () => {
  test('round-trips header, entries, and checksum', () => {
    const e1 = makeEntry({
      filePath: 'path/to/a.txt',
      creationTime: new GitTimestamp(1, 2),
      modificationTime: new GitTimestamp(3, 4),
      deviceId: 5,
      inodeNumber: 6,
      fileMode: 0o100755,
      userId: 7,
      groupId: 8,
      fileSize: 9,
      contentHash: shaCD,
      assumeValid: true,
      stageNumber: 2,
    });
    const e2 = makeEntry({
      filePath: 'z.txt',
      creationTime: new GitTimestamp(10, 11),
      modificationTime: new GitTimestamp(12, 13),
      deviceId: 14,
      inodeNumber: 15,
      fileMode: 0o120777, // symlink
      userId: 16,
      groupId: 17,
      fileSize: 18,
      contentHash: shaEF,
      assumeValid: false,
      stageNumber: 1,
    });

    const gi1 = new GitIndex(2, [e2, e1]); // constructor sorts
    const buf = gi1.serialize();

    const gi2 = GitIndex.deserialize(buf);

    expect(gi2.version).toBe(2);
    expect(gi2.entries.length).toBe(2);

    // Verify sorted names first
    expect(gi2.entryNames()).toEqual(['path/to/a.txt', 'z.txt']);

    // Verify important fields are preserved
    const a = gi2.getEntry('path/to/a.txt')!;
    expect(a.contentHash).toBe(shaCD);
    expect(a.creationTime).toEqual(new GitTimestamp(1, 2));
    expect(a.modificationTime).toEqual(new GitTimestamp(3, 4));
    expect(a.fileMode).toBe(0o100755);
    expect(a.assumeValid).toBe(true);
    expect(a.stageNumber).toBe(2);

    const z = gi2.getEntry('z.txt')!;
    expect(z.contentHash).toBe(shaEF);
    expect(z.fileMode).toBe(0o120777);
    expect(z.assumeValid).toBe(false);
    expect(z.stageNumber).toBe(1);
  });

  test('invalid signature throws', () => {
    const gi = new GitIndex(2, [makeEntry({ filePath: 'x', contentHash: shaAB })]);
    const buf = gi.serialize();
    buf[0] = 0x58; // change 'D' in 'DIRC' to 'X'

    expect(() => GitIndex.deserialize(buf)).toThrow(ObjectException);
    expect(() => GitIndex.deserialize(buf)).toThrow(/Invalid index signature/);
  });

  test('checksum mismatch throws', () => {
    const gi = new GitIndex(2, [makeEntry({ filePath: 'x', contentHash: shaAB })]);
    const buf = gi.serialize();
    // flip a bit in the last byte (part of checksum)
    const idx = buf.length - 1;
    buf[idx]! ^= 0xff;

    expect(() => GitIndex.deserialize(buf)).toThrow(ObjectException);
    expect(() => GitIndex.deserialize(buf)).toThrow(/checksum mismatch/);
  });
});

describe('GitIndex: read/write integration', () => {
  const mkTmpFile = async (): Promise<string> => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-index-'));
    return path.join(dir, 'index');
  };

  test('read returns empty index when file is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-index-missing-'));
    const missing = path.join(dir, 'no-index-file');
    const gi = await GitIndex.read(missing);
    expect(gi.version).toBe(2);
    expect(gi.entries).toHaveLength(0);
  });

  test('write then read returns identical entries', async () => {
    const indexPath = await mkTmpFile();

    const e1 = makeEntry({ filePath: 'a', contentHash: shaCD });
    const e2 = makeEntry({ filePath: 'b/nested', contentHash: shaEF, fileMode: 0 }); // directory-like flags impact sort key
    const gi1 = new GitIndex(2, [e2, e1]);

    await gi1.write(indexPath);
    // sanity: file exists
    expect(await FileUtils.exists(indexPath)).toBe(true);

    const gi2 = await GitIndex.read(indexPath);
    expect(gi2.version).toBe(2);
    expect(gi2.entryNames()).toEqual(['a', 'b/nested']);
    expect(gi2.getEntry('a')?.contentHash).toBe(shaCD);
    expect(gi2.getEntry('b/nested')?.contentHash).toBe(shaEF);
  });
});

describe('GitIndex: isEntryModified()', () => {
  test('true when size differs', () => {
    const e = makeEntry({ fileSize: 10, modificationTime: new GitTimestamp(100, 0) });
    const gi = new GitIndex();
    const modified = gi.isEntryModified(e, { mtimeMs: 100_000, size: 11 });
    expect(modified).toBe(true);
  });

  test('true when mtime seconds differ (even if assumeValid=true is set later)', () => {
    const e = makeEntry({
      fileSize: 10,
      modificationTime: new GitTimestamp(100, 0),
      assumeValid: true,
    });
    const gi = new GitIndex();
    // mtimeMs 101000 translates to seconds 101, which differs from 100
    const modified = gi.isEntryModified(e, { mtimeMs: 101_000, size: 10 });
    expect(modified).toBe(true);
  });

  test('false when size and mtime seconds equal and assumeValid=false', () => {
    const e = makeEntry({ fileSize: 10, modificationTime: new GitTimestamp(100, 0) });
    const gi = new GitIndex();
    const modified = gi.isEntryModified(e, { mtimeMs: 100_123, size: 10 });
    expect(modified).toBe(false);
  });

  test('false when size and mtime seconds equal and assumeValid=true', () => {
    const e = makeEntry({
      fileSize: 10,
      modificationTime: new GitTimestamp(100, 0),
      assumeValid: true,
    });
    const gi = new GitIndex();
    const modified = gi.isEntryModified(e, { mtimeMs: 100_999, size: 10 });
    expect(modified).toBe(false);
  });
});

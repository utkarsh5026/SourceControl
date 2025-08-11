import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { GitIndex } from '../../core/index/git-index';
import { IndexEntry } from '../../core/index/index-entry';
import { ObjectException } from '../../core/exceptions';
import { FileUtils } from '../../utils';

const shaAB = 'ab'.repeat(20);
const shaCD = 'cd'.repeat(20);
const shaEF = 'ef'.repeat(20);

const makeEntry = (overrides: Partial<IndexEntry> = {}): IndexEntry => {
  return new IndexEntry({
    name: 'file.txt',
    ctime: [1_700_000_000, 111],
    mtime: [1_700_000_010, 222],
    dev: 1,
    ino: 2,
    mode: 0o100644,
    uid: 1000,
    gid: 1000,
    fileSize: 123,
    sha: shaAB,
    assumeValid: false,
    stage: 0,
    ...overrides,
  });
};

describe('GitIndex: construction and helpers', () => {
  test('constructor sorts entries by compareTo (directory vs file)', () => {
    const eFileA = makeEntry({ name: 'a' });
    const eDirA = makeEntry({ name: 'a', mode: 0 }); // directory-like
    const eFileB = makeEntry({ name: 'b' });
    const gi = new GitIndex(2, [eFileB, eDirA, eFileA]);

    expect(gi.entryNames()).toEqual(['a', 'a', 'b']); // 'a' (file) < 'a/' (dir) < 'b'
    // Verify the directory-like entry is second
    expect(gi.entries[1]?.isDirectory).toBe(true);
  });

  test('entryNames/hasEntry/getEntry/removeEntry/clear work', () => {
    const e1 = makeEntry({ name: 'one' });
    const e2 = makeEntry({ name: 'two' });
    const gi = new GitIndex(2, [e1, e2]);

    expect(gi.entryNames().sort()).toEqual(['one', 'two']);

    expect(gi.hasEntry('one')).toBe(true);
    expect(gi.hasEntry('zzz')).toBe(false);

    expect(gi.getEntry('two')?.name).toBe('two');
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
      name: 'path/to/a.txt',
      ctime: [1, 2],
      mtime: [3, 4],
      dev: 5,
      ino: 6,
      mode: 0o100755,
      uid: 7,
      gid: 8,
      fileSize: 9,
      sha: shaCD,
      assumeValid: true,
      stage: 2,
    });
    const e2 = makeEntry({
      name: 'z.txt',
      ctime: [10, 11],
      mtime: [12, 13],
      dev: 14,
      ino: 15,
      mode: 0o120777, // symlink
      uid: 16,
      gid: 17,
      fileSize: 18,
      sha: shaEF,
      assumeValid: false,
      stage: 1,
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
    expect(a.sha).toBe(shaCD);
    expect(a.ctime).toEqual([1, 2]);
    expect(a.mtime).toEqual([3, 4]);
    expect(a.mode).toBe(0o100755);
    expect(a.assumeValid).toBe(true);
    expect(a.stage).toBe(2);

    const z = gi2.getEntry('z.txt')!;
    expect(z.sha).toBe(shaEF);
    expect(z.mode).toBe(0o120777);
    expect(z.assumeValid).toBe(false);
    expect(z.stage).toBe(1);
  });

  test('invalid signature throws', () => {
    const gi = new GitIndex(2, [makeEntry({ name: 'x', sha: shaAB })]);
    const buf = gi.serialize();
    buf[0] = 0x58; // change 'D' in 'DIRC' to 'X'

    expect(() => GitIndex.deserialize(buf)).toThrow(ObjectException);
    expect(() => GitIndex.deserialize(buf)).toThrow(/Invalid index signature/);
  });

  test('checksum mismatch throws', () => {
    const gi = new GitIndex(2, [makeEntry({ name: 'x', sha: shaAB })]);
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

    const e1 = makeEntry({ name: 'a', sha: shaCD });
    const e2 = makeEntry({ name: 'b/nested', sha: shaEF, mode: 0 }); // directory-like flags impact sort key
    const gi1 = new GitIndex(2, [e2, e1]);

    await gi1.write(indexPath);
    // sanity: file exists
    expect(await FileUtils.exists(indexPath)).toBe(true);

    const gi2 = await GitIndex.read(indexPath);
    expect(gi2.version).toBe(2);
    expect(gi2.entryNames()).toEqual(['a', 'b/nested']);
    expect(gi2.getEntry('a')?.sha).toBe(shaCD);
    expect(gi2.getEntry('b/nested')?.sha).toBe(shaEF);
  });
});

describe('GitIndex: isEntryModified()', () => {
  test('true when size differs', () => {
    const e = makeEntry({ fileSize: 10, mtime: [100, 0] });
    const gi = new GitIndex();
    const modified = gi.isEntryModified(e, { mtimeMs: 100_000, size: 11 });
    expect(modified).toBe(true);
  });

  test('true when mtime seconds differ (even if assumeValid=true is set later)', () => {
    const e = makeEntry({ fileSize: 10, mtime: [100, 0], assumeValid: true });
    const gi = new GitIndex();
    // mtimeMs 101000 translates to seconds 101, which differs from 100
    const modified = gi.isEntryModified(e, { mtimeMs: 101_000, size: 10 });
    expect(modified).toBe(true);
  });

  test('false when size and mtime seconds equal and assumeValid=false', () => {
    const e = makeEntry({ fileSize: 10, mtime: [100, 0] });
    const gi = new GitIndex();
    const modified = gi.isEntryModified(e, { mtimeMs: 100_123, size: 10 });
    expect(modified).toBe(false);
  });

  test('false when size and mtime seconds equal and assumeValid=true', () => {
    const e = makeEntry({ fileSize: 10, mtime: [100, 0], assumeValid: true });
    const gi = new GitIndex();
    const modified = gi.isEntryModified(e, { mtimeMs: 100_999, size: 10 });
    expect(modified).toBe(false);
  });
});

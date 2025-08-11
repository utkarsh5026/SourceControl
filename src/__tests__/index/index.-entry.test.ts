import { IndexEntry } from '../../core/index';
import { ObjectException } from '../../core/exceptions';
import { GitTimestamp } from '../../core/index/index-entry-utils';

const hexRepeat = (chunk: string, times: number) => chunk.repeat(times); // hex-only
const toBytes = (arr: number[]) => Uint8Array.from(arr);

const expectedPaddedLen = (nameLen: number) => {
  const total = 62 + nameLen + 1; // header + name + null
  return Math.ceil(total / 8) * 8;
};

describe('IndexEntry: construction and mode helpers', () => {
  test('defaults are sane', () => {
    const e = new IndexEntry();
    expect(e.creationTime).toEqual(new GitTimestamp(0, 0));
    expect(e.modificationTime).toEqual(new GitTimestamp(0, 0));
    expect(e.deviceId).toBe(0);
    expect(e.inodeNumber).toBe(0);
    expect(e.fileMode).toBe(0o100644);
    expect(e.userId).toBe(0);
    expect(e.groupId).toBe(0);
    expect(e.fileSize).toBe(0);
    expect(e.contentHash).toBe('');
    expect(e.assumeValid).toBe(false);
    expect(e.stageNumber).toBe(0);
    expect(e.filePath).toBe('');
  });

  test('modeType/perms and type getters', () => {
    const reg = new IndexEntry({ fileMode: 0o100644 });
    expect(reg.modeType).toBe(0b1000);
    expect(reg.modePerms).toBe(0o644);
    expect(reg.isRegularFile).toBe(true);
    expect(reg.isSymlink).toBe(false);
    expect(reg.isGitlink).toBe(false);
    expect(reg.isDirectory).toBe(false);

    const symlink = new IndexEntry({ fileMode: 0o120777 });
    expect(symlink.isSymlink).toBe(true);

    const gitlink = new IndexEntry({ fileMode: 0o160000 });
    expect(gitlink.isGitlink).toBe(true);

    const dirLike = new IndexEntry({ fileMode: 0 });
    expect(dirLike.isDirectory).toBe(true);
  });
});

describe('IndexEntry: compareTo()', () => {
  test('basic lexicographic by name', () => {
    const a = new IndexEntry({ filePath: 'a' });
    const b = new IndexEntry({ filePath: 'b' });
    expect(a.compareTo(b)).toBeLessThan(0);
    expect(b.compareTo(a)).toBeGreaterThan(0);
    expect(a.compareTo(new IndexEntry({ filePath: 'a' }))).toBe(0);
  });

  test('directories are compared as if with trailing slash', () => {
    const dir = new IndexEntry({ filePath: 'a', fileMode: 0 }); // directory-like
    const file = new IndexEntry({ filePath: 'a' }); // same name, regular

    // 'a/' vs 'a' -> 'a' < 'a/' so file < dir
    expect(file.compareTo(dir)).toBeLessThan(0);
    expect(dir.compareTo(file)).toBeGreaterThan(0);

    // 'a' vs 'a/b' -> 'a' < 'a/b' so file < nested
    const nested = new IndexEntry({ filePath: 'a/b' });
    expect(file.compareTo(nested)).toBeLessThan(0);
  });
});

describe('IndexEntry: serialize() and deserialize() round-trip', () => {
  const sha40 = hexRepeat('ab', 20); // 40 hex chars -> 20 bytes 0xAB

  const sample = () =>
    new IndexEntry({
      filePath: 'path/to/file.txt',
      creationTime: new GitTimestamp(1_700_000_000, 123), // sec, "nsec" (ms remainder in impl)
      modificationTime: new GitTimestamp(1_700_000_111, 456),
      deviceId: 12,
      inodeNumber: 34,
      fileMode: 0o100755,
      userId: 501,
      groupId: 20,
      fileSize: 4096,
      contentHash: sha40,
      assumeValid: true,
      stageNumber: 2,
    });

  test('round-trips all fields', () => {
    const e1 = sample();
    const buf = e1.serialize();

    const { entry: e2, nextOffset } = IndexEntry.deserialize(buf, 0);

    expect(nextOffset).toBe(expectedPaddedLen(e1.filePath.length));
    expect(e2.filePath).toBe(e1.filePath);
    expect(e2.creationTime).toEqual(e1.creationTime);
    expect(e2.modificationTime).toEqual(e1.modificationTime);
    expect(e2.deviceId).toBe(e1.deviceId);
    expect(e2.inodeNumber).toBe(e1.inodeNumber);
    expect(e2.fileMode).toBe(e1.fileMode);
    expect(e2.userId).toBe(e1.userId);
    expect(e2.groupId).toBe(e1.groupId);
    expect(e2.fileSize).toBe(e1.fileSize);
    expect(e2.contentHash).toBe(e1.contentHash);
    expect(e2.assumeValid).toBe(true);
    expect(e2.stageNumber).toBe(2);
  });

  test('padding to 8 bytes for varying name lengths', () => {
    for (let n = 0; n <= 9; n++) {
      const name = 'x'.repeat(n);
      const e = new IndexEntry({ filePath: name, contentHash: sha40 });
      const buf = e.serialize();
      expect(buf.length).toBe(expectedPaddedLen(n));
    }
  });

  test('stage is masked to 2 bits during encoding', () => {
    const e = new IndexEntry({ filePath: 'a', contentHash: sha40, stageNumber: 5 }); // 0b0101 -> masked to 0b0001
    const { entry: d } = IndexEntry.deserialize(e.serialize(), 0);
    expect(d.stageNumber).toBe(1);
  });

  test('assumeValid false/true carried via flags', () => {
    const e1 = new IndexEntry({ filePath: 'a', contentHash: sha40, assumeValid: false });
    const e2 = new IndexEntry({ filePath: 'b', contentHash: sha40, assumeValid: true });

    expect(IndexEntry.deserialize(e1.serialize(), 0).entry.assumeValid).toBe(false);
    expect(IndexEntry.deserialize(e2.serialize(), 0).entry.assumeValid).toBe(true);
  });

  test('sha bytes occupy 20 bytes and match input', () => {
    const e = new IndexEntry({ filePath: 'n', contentHash: sha40 });
    const buf = e.serialize();

    // sha begins after timestamps (16) + metadata (24) = 40 bytes
    const shaBytes = buf.slice(40, 60);
    const expected = toBytes(new Array(20).fill(0xab));
    expect(Array.from(shaBytes)).toEqual(Array.from(expected));
  });
});

describe('IndexEntry: long name >= 4095 uses null-terminated scan on read', () => {
  test('deserializes full name beyond 4095 bytes', () => {
    const longName = 'p/'.repeat(2500); // 5000 chars approx
    const e = new IndexEntry({ filePath: longName, contentHash: hexRepeat('cd', 20) });
    const { entry: d, nextOffset } = IndexEntry.deserialize(e.serialize(), 0);
    expect(d.filePath).toBe(longName);
    expect(nextOffset).toBe(expectedPaddedLen(longName.length));
  });
});

describe('IndexEntry: extended flag is rejected', () => {
  test('setting bit 14 (extended) triggers ObjectException', () => {
    const e = new IndexEntry({ filePath: 'x', contentHash: hexRepeat('ef', 20) });
    const buf = e.serialize();

    // flags are 2 bytes at offset 60 from the start of the entry
    const view = new DataView(buf.buffer, buf.byteOffset);
    const flags = view.getUint16(60, false);
    view.setUint16(60, flags | 0x4000, false); // set extended flag

    expect(() => IndexEntry.deserialize(buf, 0)).toThrow(ObjectException);
    expect(() => IndexEntry.deserialize(buf, 0)).toThrow(/Extended flags not supported/);
  });
});

describe('IndexEntry: fromFileStats()', () => {
  test('maps fs.Stats fields correctly', () => {
    const stats = {
      ctimeMs: 1700000123.789,
      mtimeMs: 1700000456.123,
      dev: 10,
      ino: 20,
      mode: 0o100600,
      uid: 1000,
      gid: 1000,
      size: 1234,
    };
    const sha = hexRepeat('aa', 20);
    const e = IndexEntry.fromFileStats('dir/file.txt', stats as any, sha);

    expect(e.filePath).toBe('dir/file.txt');
    expect(e.creationTime.seconds).toBe(Math.floor(stats.ctimeMs / 1000));
    expect(e.creationTime.nanoseconds).toBe(stats.ctimeMs % 1000);
    expect(e.modificationTime.seconds).toBe(Math.floor(stats.mtimeMs / 1000));
    expect(e.modificationTime.nanoseconds).toBe(stats.mtimeMs % 1000);
    expect(e.deviceId).toBe(stats.dev);
    expect(e.inodeNumber).toBe(stats.ino);
    expect(e.fileMode).toBe(stats.mode);
    expect(e.userId).toBe(stats.uid);
    expect(e.groupId).toBe(stats.gid);
    expect(e.fileSize).toBe(stats.size);
    expect(e.contentHash).toBe(sha);
  });
});

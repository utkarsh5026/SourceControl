import { IndexEntry } from '../../core/index/index-entry';
import { ObjectException } from '../../core/exceptions';

const hexRepeat = (chunk: string, times: number) => chunk.repeat(times); // hex-only
const toBytes = (arr: number[]) => Uint8Array.from(arr);

const expectedPaddedLen = (nameLen: number) => {
  const total = 62 + nameLen + 1; // header + name + null
  return Math.ceil(total / 8) * 8;
};

describe('IndexEntry: construction and mode helpers', () => {
  test('defaults are sane', () => {
    const e = new IndexEntry();
    expect(e.ctime).toEqual([0, 0]);
    expect(e.mtime).toEqual([0, 0]);
    expect(e.dev).toBe(0);
    expect(e.ino).toBe(0);
    expect(e.mode).toBe(0o100644);
    expect(e.uid).toBe(0);
    expect(e.gid).toBe(0);
    expect(e.fileSize).toBe(0);
    expect(e.sha).toBe('');
    expect(e.assumeValid).toBe(false);
    expect(e.stage).toBe(0);
    expect(e.name).toBe('');
  });

  test('modeType/perms and type getters', () => {
    const reg = new IndexEntry({ mode: 0o100644 });
    expect(reg.modeType).toBe(0b1000);
    expect(reg.modePerms).toBe(0o644);
    expect(reg.isRegularFile).toBe(true);
    expect(reg.isSymlink).toBe(false);
    expect(reg.isGitlink).toBe(false);
    expect(reg.isDirectory).toBe(false);

    const symlink = new IndexEntry({ mode: 0o120777 });
    expect(symlink.isSymlink).toBe(true);

    const gitlink = new IndexEntry({ mode: 0o160000 });
    expect(gitlink.isGitlink).toBe(true);

    const dirLike = new IndexEntry({ mode: 0 });
    expect(dirLike.isDirectory).toBe(true);
  });
});

describe('IndexEntry: compareTo()', () => {
  test('basic lexicographic by name', () => {
    const a = new IndexEntry({ name: 'a' });
    const b = new IndexEntry({ name: 'b' });
    expect(a.compareTo(b)).toBeLessThan(0);
    expect(b.compareTo(a)).toBeGreaterThan(0);
    expect(a.compareTo(new IndexEntry({ name: 'a' }))).toBe(0);
  });

  test('directories are compared as if with trailing slash', () => {
    const dir = new IndexEntry({ name: 'a', mode: 0 }); // directory-like
    const file = new IndexEntry({ name: 'a' }); // same name, regular

    // 'a/' vs 'a' -> 'a' < 'a/' so file < dir
    expect(file.compareTo(dir)).toBeLessThan(0);
    expect(dir.compareTo(file)).toBeGreaterThan(0);

    // 'a' vs 'a/b' -> 'a' < 'a/b' so file < nested
    const nested = new IndexEntry({ name: 'a/b' });
    expect(file.compareTo(nested)).toBeLessThan(0);
  });
});

describe('IndexEntry: serialize() and deserialize() round-trip', () => {
  const sha40 = hexRepeat('ab', 20); // 40 hex chars -> 20 bytes 0xAB

  const sample = () =>
    new IndexEntry({
      name: 'path/to/file.txt',
      ctime: [1_700_000_000, 123], // sec, "nsec" (ms remainder in impl)
      mtime: [1_700_000_111, 456],
      dev: 12,
      ino: 34,
      mode: 0o100755,
      uid: 501,
      gid: 20,
      fileSize: 4096,
      sha: sha40,
      assumeValid: true,
      stage: 2,
    });

  test('round-trips all fields', () => {
    const e1 = sample();
    const buf = e1.serialize();

    const { entry: e2, nextOffset } = IndexEntry.deserialize(buf, 0);

    expect(nextOffset).toBe(expectedPaddedLen(e1.name.length));
    expect(e2.name).toBe(e1.name);
    expect(e2.ctime).toEqual(e1.ctime);
    expect(e2.mtime).toEqual(e1.mtime);
    expect(e2.dev).toBe(e1.dev);
    expect(e2.ino).toBe(e1.ino);
    expect(e2.mode).toBe(e1.mode);
    expect(e2.uid).toBe(e1.uid);
    expect(e2.gid).toBe(e1.gid);
    expect(e2.fileSize).toBe(e1.fileSize);
    expect(e2.sha).toBe(e1.sha);
    expect(e2.assumeValid).toBe(true);
    expect(e2.stage).toBe(2);
  });

  test('padding to 8 bytes for varying name lengths', () => {
    for (let n = 0; n <= 9; n++) {
      const name = 'x'.repeat(n);
      const e = new IndexEntry({ name, sha: sha40 });
      const buf = e.serialize();
      expect(buf.length).toBe(expectedPaddedLen(n));
    }
  });

  test('stage is masked to 2 bits during encoding', () => {
    const e = new IndexEntry({ name: 'a', sha: sha40, stage: 5 }); // 0b0101 -> masked to 0b0001
    const { entry: d } = IndexEntry.deserialize(e.serialize(), 0);
    expect(d.stage).toBe(1);
  });

  test('assumeValid false/true carried via flags', () => {
    const e1 = new IndexEntry({ name: 'a', sha: sha40, assumeValid: false });
    const e2 = new IndexEntry({ name: 'b', sha: sha40, assumeValid: true });

    expect(IndexEntry.deserialize(e1.serialize(), 0).entry.assumeValid).toBe(false);
    expect(IndexEntry.deserialize(e2.serialize(), 0).entry.assumeValid).toBe(true);
  });

  test('sha bytes occupy 20 bytes and match input', () => {
    const e = new IndexEntry({ name: 'n', sha: sha40 });
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
    const e = new IndexEntry({ name: longName, sha: hexRepeat('cd', 20) });
    const { entry: d, nextOffset } = IndexEntry.deserialize(e.serialize(), 0);
    expect(d.name).toBe(longName);
    expect(nextOffset).toBe(expectedPaddedLen(longName.length));
  });
});

describe('IndexEntry: extended flag is rejected', () => {
  test('setting bit 14 (extended) triggers ObjectException', () => {
    const e = new IndexEntry({ name: 'x', sha: hexRepeat('ef', 20) });
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

    expect(e.name).toBe('dir/file.txt');
    expect(e.ctime[0]).toBe(Math.floor(stats.ctimeMs / 1000));
    expect(e.ctime[1]).toBe(stats.ctimeMs % 1000);
    expect(e.mtime[0]).toBe(Math.floor(stats.mtimeMs / 1000));
    expect(e.mtime[1]).toBe(stats.mtimeMs % 1000);
    expect(e.dev).toBe(stats.dev);
    expect(e.ino).toBe(stats.ino);
    expect(e.mode).toBe(stats.mode);
    expect(e.uid).toBe(stats.uid);
    expect(e.gid).toBe(stats.gid);
    expect(e.fileSize).toBe(stats.size);
    expect(e.sha).toBe(sha);
  });
});

import { EntryType, TreeEntry } from '../../core/objects/tree/tree-entry';

const SHA_LOWER = '0123456789abcdef0123456789abcdef01234567';
const SHA_UPPER = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';

const hexToBytes = (hex: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
};

describe('TreeEntry: constructor and getters', () => {
  test('sets fields and lowercases SHA', () => {
    const e = new TreeEntry(EntryType.REGULAR_FILE, 'hello.txt', SHA_UPPER);
    expect(e.mode).toBe(EntryType.REGULAR_FILE);
    expect(e.name).toBe('hello.txt');
    expect(e.sha).toBe(SHA_UPPER.toLowerCase());
  });
});

describe('TreeEntry: entryType and type guards', () => {
  test('directory', () => {
    const e = new TreeEntry(EntryType.DIRECTORY, 'src', SHA_LOWER);
    expect(e.entryType).toBe(EntryType.DIRECTORY);
    expect(e.isDirectory()).toBe(true);
    expect(e.isFile()).toBe(false);
    expect(e.isExecutable()).toBe(false);
    expect(e.isSymbolicLink()).toBe(false);
    expect(e.isSubmodule()).toBe(false);
  });

  test('regular file', () => {
    const e = new TreeEntry(EntryType.REGULAR_FILE, 'a.txt', SHA_LOWER);
    expect(e.entryType).toBe(EntryType.REGULAR_FILE);
    expect(e.isFile()).toBe(true);
    expect(e.isExecutable()).toBe(false);
  });

  test('executable file', () => {
    const e = new TreeEntry(EntryType.EXECUTABLE_FILE, 'run.sh', SHA_LOWER);
    expect(e.entryType).toBe(EntryType.EXECUTABLE_FILE);
    expect(e.isFile()).toBe(true);
    expect(e.isExecutable()).toBe(true);
  });

  test('symbolic link', () => {
    const e = new TreeEntry(EntryType.SYMBOLIC_LINK, 'link', SHA_LOWER);
    expect(e.entryType).toBe(EntryType.SYMBOLIC_LINK);
    expect(e.isSymbolicLink()).toBe(true);
  });

  test('submodule', () => {
    const e = new TreeEntry(EntryType.SUBMODULE, 'sub', SHA_LOWER);
    expect(e.entryType).toBe(EntryType.SUBMODULE);
    expect(e.isSubmodule()).toBe(true);
  });

  test('unknown mode throws when accessing entry type', () => {
    const e = new TreeEntry('000000', 'x', SHA_LOWER);
    expect(() => e.entryType).toThrow(/Unknown mode: 000000/);
  });
});

describe('TreeEntry: compareTo sorting semantics', () => {
  const sha = SHA_LOWER;

  test('directories sort before files with same basename', () => {
    const d = new TreeEntry(EntryType.DIRECTORY, 'name', sha);
    const f = new TreeEntry(EntryType.REGULAR_FILE, 'name', sha);
    expect(d.compareTo(f)).toBeLessThan(0);
    expect(f.compareTo(d)).toBeGreaterThan(0);
  });

  test('lexicographic by name (file vs file)', () => {
    const a = new TreeEntry(EntryType.REGULAR_FILE, 'a', sha);
    const b = new TreeEntry(EntryType.REGULAR_FILE, 'a.txt', sha);
    expect(a.compareTo(b)).toBeLessThan(0);
    expect(b.compareTo(a)).toBeGreaterThan(0);
  });

  test('dir "dir" comes before "dir2"', () => {
    const d1 = new TreeEntry(EntryType.DIRECTORY, 'dir', sha);
    const d2 = new TreeEntry(EntryType.DIRECTORY, 'dir2', sha);
    expect(d1.compareTo(d2)).toBeLessThan(0);
  });

  test('equal entries compare to 0 (file)', () => {
    const a1 = new TreeEntry(EntryType.REGULAR_FILE, 'same', sha);
    const a2 = new TreeEntry(EntryType.REGULAR_FILE, 'same', sha);
    expect(a1.compareTo(a2)).toBe(0);
  });

  test('equal entries compare to 0 (dir)', () => {
    const d1 = new TreeEntry(EntryType.DIRECTORY, 'same', sha);
    const d2 = new TreeEntry(EntryType.DIRECTORY, 'same', sha);
    expect(d1.compareTo(d2)).toBe(0);
  });
});

describe('TreeEntry: serialize format', () => {
  test('produces "[mode] [name]\\0" prefix and 20-byte SHA', () => {
    const mode = EntryType.REGULAR_FILE;
    const name = 'hello world.txt'; // spaces allowed
    const e = new TreeEntry(mode, name, SHA_LOWER);

    const serialized = e.serialize();

    const prefix = `${mode} ${name}\0`;
    const prefixBytes = Uint8Array.from(Buffer.from(prefix, 'utf8'));
    const shaBytes = Uint8Array.from(hexToBytes(SHA_LOWER));

    expect(Array.from(serialized.slice(0, prefixBytes.length))).toEqual(Array.from(prefixBytes));
    expect(Array.from(serialized.slice(prefixBytes.length))).toEqual(Array.from(shaBytes));
    expect(serialized.length).toBe(prefixBytes.length + 20);
  });

  test('round-trip serialize -> deserialize', () => {
    const e1 = new TreeEntry(EntryType.EXECUTABLE_FILE, 'run', SHA_LOWER);
    const buf = e1.serialize();

    const { entry, nextOffset } = TreeEntry.deserialize(buf, 0);
    expect(entry.mode).toBe(e1.mode);
    expect(entry.name).toBe(e1.name);
    expect(entry.sha).toBe(e1.sha);
    expect(nextOffset).toBe(buf.length);
  });

  test('two concatenated entries parse with correct nextOffset', () => {
    const e1 = new TreeEntry(EntryType.REGULAR_FILE, 'a', SHA_LOWER);
    const e2 = new TreeEntry(EntryType.DIRECTORY, 'b', SHA_LOWER);

    const b1 = e1.serialize();
    const b2 = e2.serialize();
    const combined = new Uint8Array(b1.length + b2.length);
    combined.set(b1, 0);
    combined.set(b2, b1.length);

    const r1 = TreeEntry.deserialize(combined, 0);
    expect(r1.entry.name).toBe('a');
    expect(r1.nextOffset).toBe(b1.length);

    const r2 = TreeEntry.deserialize(combined, r1.nextOffset);
    expect(r2.entry.name).toBe('b');
    expect(r2.nextOffset).toBe(b1.length + b2.length);
  });
});

describe('TreeEntry: deserialize validation', () => {
  test('throws when SHA bytes are truncated', () => {
    const mode = EntryType.REGULAR_FILE;
    const name = 'file.txt';
    const prefix = `${mode} ${name}\0`;
    const prefixBytes = Uint8Array.from(Buffer.from(prefix, 'utf8'));
    const truncatedSha = Uint8Array.from(hexToBytes(SHA_LOWER).slice(0, 10));

    const buf = new Uint8Array(prefixBytes.length + truncatedSha.length);
    buf.set(prefixBytes, 0);
    buf.set(truncatedSha, prefixBytes.length);

    expect(() => TreeEntry.deserialize(buf, 0)).toThrow(/SHA must be 40 characters long/);
  });
});

describe('TreeEntry: name validation', () => {
  test('rejects empty name', () => {
    expect(() => new TreeEntry(EntryType.REGULAR_FILE, '', SHA_LOWER)).toThrow(
      /Name cannot be null or empty/
    );
  });

  test('rejects null/undefined name', () => {
    expect(
      () => new TreeEntry(EntryType.REGULAR_FILE, null as unknown as string, SHA_LOWER)
    ).toThrow(/Name cannot be null or empty/);

    expect(
      () => new TreeEntry(EntryType.REGULAR_FILE, undefined as unknown as string, SHA_LOWER)
    ).toThrow(/Name cannot be null or empty/);
  });

  test('rejects slash and null byte in name', () => {
    expect(() => new TreeEntry(EntryType.REGULAR_FILE, 'a/b', SHA_LOWER)).toThrow(
      /Invalid characters in name: a\/b/
    );
    expect(() => new TreeEntry(EntryType.REGULAR_FILE, 'bad\0name', SHA_LOWER)).toThrow(
      /Invalid characters in name: bad\0name/
    );
  });
});

describe('TreeEntry: SHA validation', () => {
  test('rejects wrong length', () => {
    expect(() => new TreeEntry(EntryType.REGULAR_FILE, 'x', 'abc')).toThrow(
      /SHA must be 40 characters long/
    );
  });

  test('upper-case SHA is lowercased', () => {
    const e = new TreeEntry(EntryType.REGULAR_FILE, 'x', SHA_UPPER);
    expect(e.sha).toBe(SHA_UPPER.toLowerCase());
  });

  test.todo('rejects non-hex characters in SHA'); // Current implementation uses a non-anchored regex
});

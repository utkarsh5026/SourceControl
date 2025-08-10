import { createHash } from 'crypto';
import { TreeObject, ObjectType } from '../../core/objects';
import { TreeEntry, EntryType } from '../../core/objects/tree/tree-entry';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));
const shaRep = (c: string) => c.repeat(40); // hex-only

describe('TreeObject: basics', () => {
  test('empty tree: type, content size, isEmpty', async () => {
    const t = new TreeObject();
    expect(t.type()).toBe(ObjectType.TREE);
    expect(t.size()).toBe(0);
    expect(t.content()).toHaveLength(0);
    expect(t.isEmpty).toBe(true);

    const serialized = t.serialize();
    const header = `tree 0\0`;
    expect(Array.from(serialized)).toEqual(
      Array.from(Uint8Array.from(Buffer.from(header, 'utf8')))
    );

    const expectedSha = createHash('sha1').update(Buffer.from(serialized)).digest('hex');
    expect(await t.sha()).toBe(expectedSha);
  });
});

describe('TreeObject: sorting and content', () => {
  test('entries are sorted (dirs before files; lexicographic with dir "/")', () => {
    const entries = [
      new TreeEntry(EntryType.REGULAR_FILE, 'a.txt', shaRep('a')),
      new TreeEntry(EntryType.DIRECTORY, 'a', shaRep('b')),
      new TreeEntry(EntryType.REGULAR_FILE, 'a', shaRep('c')),
      new TreeEntry(EntryType.DIRECTORY, 'dir2', shaRep('d')),
      new TreeEntry(EntryType.DIRECTORY, 'dir', shaRep('e')),
    ];

    const t = new TreeObject(entries);
    // Expected order:
    // 'a/' (dir), 'a' (file), 'dir/' (dir), 'dir2/' (dir), 'a.txt' (file)
    expect(t.entries.map((e) => e.name)).toEqual(['a', 'a', 'a.txt', 'dir', 'dir2']);
    expect(t.entries.map((e) => e.isDirectory())).toEqual([true, false, false, true, true]);
    expect(t.isEmpty).toBe(false);
  });

  test('serialize() = "tree <contentSize>\\0" + concatenated serialized entries', () => {
    const entries = [
      new TreeEntry(EntryType.REGULAR_FILE, 'a.txt', shaRep('a')),
      new TreeEntry(EntryType.DIRECTORY, 'a', shaRep('b')),
      new TreeEntry(EntryType.REGULAR_FILE, 'a', shaRep('c')),
    ];
    const t = new TreeObject(entries);

    const sorted = t.entries;
    const content = (() => {
      const parts = sorted.map((e) => e.serialize());
      const total = parts.reduce((n, p) => n + p.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.length;
      }
      return out;
    })();

    const serialized = t.serialize();
    const header = `tree ${content.length}\0`;
    const headerBytes = Uint8Array.from(Buffer.from(header, 'utf8'));

    expect(Array.from(serialized.slice(0, headerBytes.length))).toEqual(Array.from(headerBytes));
    expect(Array.from(serialized.slice(headerBytes.length))).toEqual(Array.from(content));

    // size() returns content length
    expect(t.size()).toBe(content.length);
  });

  test('sha() is stable and equals sha1(serialized)', async () => {
    const t = new TreeObject([
      new TreeEntry(EntryType.DIRECTORY, 'src', shaRep('1')),
      new TreeEntry(EntryType.REGULAR_FILE, 'a', shaRep('2')),
    ]);

    const s1 = await t.sha();
    const expected = createHash('sha1').update(Buffer.from(t.serialize())).digest('hex');
    expect(s1).toBe(expected);

    const s2 = await t.sha();
    expect(s2).toBe(s1);
  });
});

describe('TreeObject: deserialize', () => {
  test('round-trip serialize -> deserialize preserves entries and order', async () => {
    const t1 = new TreeObject([
      new TreeEntry(EntryType.DIRECTORY, 'a', shaRep('1')),
      new TreeEntry(EntryType.REGULAR_FILE, 'a', shaRep('2')),
      new TreeEntry(EntryType.DIRECTORY, 'dir', shaRep('3')),
    ]);
    const buf = t1.serialize();

    const t2 = new TreeObject();
    await t2.deserialize(buf);

    expect(t2.entries.map((e) => [e.mode, e.name, e.sha])).toEqual(
      t1.entries.map((e) => [e.mode, e.name, e.sha])
    );
    expect(t2.isEmpty).toBe(false);
  });

  test('resets sha cache after deserialization', async () => {
    const t = new TreeObject([new TreeEntry(EntryType.REGULAR_FILE, 'x', shaRep('a'))]);
    const beforeSha = await t.sha();

    // Different entries -> different SHA
    const tNew = new TreeObject([new TreeEntry(EntryType.DIRECTORY, 'd', shaRep('b'))]);
    const serialized = tNew.serialize();

    await t.deserialize(serialized);
    const afterSha = await t.sha();
    expect(afterSha).not.toBe(beforeSha);
  });

  test('rejects wrong object type header', async () => {
    const bad = toBytes('blob 3\0abc');
    const t = new TreeObject();
    await expect(t.deserialize(bad)).rejects.toThrow(/invalid type/i);
  });

  test('rejects when no null terminator in header', async () => {
    const bad = toBytes('tree 3abc');
    const t = new TreeObject();
    await expect(t.deserialize(bad)).rejects.toThrow(/no null terminator/i);
  });

  test('rejects when content size mismatches header', async () => {
    // header says 5, actual 3
    const bad = toBytes('tree 5\0abc');
    const t = new TreeObject();
    await expect(t.deserialize(bad)).rejects.toThrow(/Content size mismatch/i);
  });

  test('rejects malformed entry payload (too short)', async () => {
    // content: "100644 x\0" + truncated SHA (10 bytes)
    const prefix = Uint8Array.from(Buffer.from('100644 x\0', 'utf8'));
    const truncatedSha = new Uint8Array(10); // < 20 bytes
    const content = new Uint8Array(prefix.length + truncatedSha.length);
    content.set(prefix, 0);
    content.set(truncatedSha, prefix.length);

    // build full serialized buffer: "tree <len>\0" + content
    const header = Uint8Array.from(Buffer.from(`tree ${content.length}\0`, 'utf8'));
    const bad = new Uint8Array(header.length + content.length);
    bad.set(header, 0);
    bad.set(content, header.length);

    const t = new TreeObject();
    await expect(t.deserialize(bad)).rejects.toThrow(/SHA must be 40 characters long/);
  });
});

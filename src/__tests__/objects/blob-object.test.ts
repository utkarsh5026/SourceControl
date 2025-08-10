import { createHash } from 'crypto';
import { BlobObject, ObjectType } from '../../core/objects';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

describe('BlobObject: construction and basic API', () => {
  test('default constructor creates empty blob', () => {
    const b = new BlobObject();
    expect(b.type()).toBe(ObjectType.BLOB);
    expect(b.size()).toBe(0);
    expect(b.content()).toBeInstanceOf(Uint8Array);
    expect(b.content()).toHaveLength(0);
  });

  test('constructor with content copies input', () => {
    const input = Uint8Array.from([1, 2, 3]);
    const b = new BlobObject(input);

    expect(b.size()).toBe(3);
    expect(Array.from(b.content())).toEqual([1, 2, 3]);

    // mutate original input; blob must not change
    input[0] = 9;
    expect(Array.from(b.content())).toEqual([1, 2, 3]);
  });

  test('content() returns a defensive copy', () => {
    const b = new BlobObject(Uint8Array.from([10, 20, 30]));
    const out = b.content();
    out[0] = 99;
    expect(Array.from(b.content())).toEqual([10, 20, 30]);
  });
});

describe('BlobObject: serialization format and SHA-1', () => {
  test('serialize() produces "blob <size>\\0<content>"', () => {
    const text = 'Hello World';
    const bytes = toBytes(text);
    const b = new BlobObject(bytes);

    const serialized = b.serialize();
    const expectedHeader = `blob ${bytes.length}\0`;
    const headerBytes = Uint8Array.from(Buffer.from(expectedHeader, 'utf8'));

    // header matches
    expect(Array.from(serialized.slice(0, headerBytes.length))).toEqual(Array.from(headerBytes));
    // content matches
    expect(Array.from(serialized.slice(headerBytes.length))).toEqual(Array.from(bytes));
  });

  test('sha() matches sha1 of serialized data and is stable across calls', async () => {
    const data = toBytes('abc');
    const b = new BlobObject(data);

    const s1 = await b.sha();
    const expected = createHash('sha1').update(Buffer.from(b.serialize())).digest('hex');
    expect(s1).toBe(expected);

    const s2 = await b.sha();
    expect(s2).toBe(s1);
  });

  test('empty blob has correct serialization and sha', async () => {
    const b = new BlobObject();
    const serialized = b.serialize();
    const expectedHeader = `blob 0\0`;
    const headerBytes = Uint8Array.from(Buffer.from(expectedHeader, 'utf8'));

    expect(Array.from(serialized)).toEqual(Array.from(headerBytes));

    const expectedSha = createHash('sha1').update(Buffer.from(serialized)).digest('hex');
    expect(await b.sha()).toBe(expectedSha);
  });
});

describe('BlobObject: deserialize()', () => {
  test('valid deserialization sets content and resets sha cache', async () => {
    const c1 = toBytes('one');
    const c2 = toBytes('two');

    const b = new BlobObject(c1);
    const sha1 = await b.sha();

    // prepare serialized "two"
    const ser2 = Uint8Array.from(Buffer.from(`blob ${c2.length}\0two`, 'utf8'));
    await b.deserialize(ser2);

    expect(b.size()).toBe(3);
    expect(Array.from(b.content())).toEqual(Array.from(c2));

    const sha2 = await b.sha();
    expect(sha2).not.toBe(sha1);

    const expected2 = createHash('sha1').update(Buffer.from(b.serialize())).digest('hex');
    expect(sha2).toBe(expected2);
  });

  test('rejects wrong object type (e.g., "tree")', async () => {
    const bad = Uint8Array.from(Buffer.from('tree 3\0abc', 'utf8'));
    const b = new BlobObject();
    await expect(b.deserialize(bad)).rejects.toThrow(/invalid type/i);
  });

  test('rejects when no null terminator found in header', async () => {
    // "blob 3" + "abc" but no "\0" between header and content
    const bad = Uint8Array.from(Buffer.from('blob 3abc', 'utf8'));
    const b = new BlobObject();
    await expect(b.deserialize(bad)).rejects.toThrow(/no null terminator/i);
  });

  test('rejects when content size mismatches header', async () => {
    // header says 5 but actual is 3
    const bad = Uint8Array.from(Buffer.from('blob 5\0abc', 'utf8'));
    const b = new BlobObject();
    await expect(b.deserialize(bad)).rejects.toThrow(/Content size mismatch/i);
  });

  test('rejects when size is missing', async () => {
    const bad = Uint8Array.from(Buffer.from('blob \0abc', 'utf8'));
    const b = new BlobObject();
    await expect(b.deserialize(bad)).rejects.toThrow(/invalid size/i);
  });

  test('rejects when size is not a number', async () => {
    const bad = Uint8Array.from(Buffer.from('blob abc\0xyz', 'utf8'));
    const b = new BlobObject();
    await expect(b.deserialize(bad)).rejects.toThrow(/Content size mismatch/i);
  });

  test('content remains immutable after deserialization', async () => {
    const ser = Uint8Array.from(Buffer.from('blob 3\0xyz', 'utf8'));
    const b = new BlobObject();
    await b.deserialize(ser);

    const out = b.content();
    out[0] = 64; // '@'
    expect(Array.from(b.content())).toEqual(Array.from(toBytes('xyz')));
  });
});

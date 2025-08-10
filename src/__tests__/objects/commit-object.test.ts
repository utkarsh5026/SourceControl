import { createHash } from 'crypto';
import { CommitObject, ObjectType } from '../../core/objects';
import { CommitPerson } from '../../core/objects/commit/commit-person';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));
const fromBytes = (u: Uint8Array) => Buffer.from(u).toString('utf8');
const shaRep = (c: string) => c.repeat(40); // hex-only

const commitHeader = (len: number) => Uint8Array.from(Buffer.from(`commit ${len}\0`, 'utf8'));
const withHeader = (content: string) => {
  const contentBytes = toBytes(content);
  const header = commitHeader(contentBytes.length);
  const out = new Uint8Array(header.length + contentBytes.length);
  out.set(header, 0);
  out.set(contentBytes, header.length);
  return out;
};

describe('CommitObject: basics and required fields', () => {
  test('type() is commit', () => {
    const c = new CommitObject();
    expect(c.type()).toBe(ObjectType.COMMIT);
  });

  test('content() requires tree, author, committer (errors in order)', () => {
    const c = new CommitObject();
    expect(() => c.content()).toThrow(/Tree SHA is required/);

    (c as any)._treeSha = shaRep('a');
    expect(() => c.content()).toThrow(/Author is required/);

    (c as any)._author = new CommitPerson('Alice', 'a@example.com', 1, '0');
    expect(() => c.content()).toThrow(/Committer is required/);

    (c as any)._committer = new CommitPerson('Alice', 'a@example.com', 1, '0');
    (c as any)._message = ''; // avoid "null" in output
    const bytes = c.content();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe('CommitObject: serialization format and size()', () => {
  test('serialize() = "commit <len>\\0" + proper content: tree, parents, author, committer, blank, message', () => {
    const tree = shaRep('1');
    const parents = [shaRep('2'), shaRep('3')];

    const author = new CommitPerson('John Doe', 'john@example.com', 1609459200, '0'); // +0000
    const committer = new CommitPerson('Jane Roe', 'jane@example.com', 1609459300, '19800'); // +0530
    const message = 'Initial commit\n\nDetails...';

    const c = new CommitObject();
    (c as any)._treeSha = tree;
    (c as any)._parentShas = parents.slice();
    (c as any)._author = author;
    (c as any)._committer = committer;
    (c as any)._message = message;

    const content =
      `tree ${tree}\n` +
      parents.map((p) => `parent ${p}\n`).join('') +
      `author ${author.formatForGit()}\n` +
      `committer ${committer.formatForGit()}\n` +
      `\n` +
      message;

    const serialized = c.serialize();
    const expectedHeader = commitHeader(toBytes(content).length);

    expect(Array.from(serialized.slice(0, expectedHeader.length))).toEqual(
      Array.from(expectedHeader)
    );
    expect(fromBytes(serialized.slice(expectedHeader.length))).toBe(content);

    // size() returns content length
    expect(c.size()).toBe(toBytes(content).length);
  });

  test('no parents => no "parent" lines', () => {
    const tree = shaRep('a');
    const author = new CommitPerson('A', 'a@a.a', 10, '0');
    const committer = new CommitPerson('B', 'b@b.b', 11, '-18000'); // -0500
    const message = 'msg';

    const c = new CommitObject();
    (c as any)._treeSha = tree;
    (c as any)._parentShas = [];
    (c as any)._author = author;
    (c as any)._committer = committer;
    (c as any)._message = message;

    const content =
      `tree ${tree}\n` +
      `author ${author.formatForGit()}\n` +
      `committer ${committer.formatForGit()}\n\n` +
      message;

    const serialized = c.serialize();
    const header = commitHeader(toBytes(content).length);

    expect(Array.from(serialized.slice(0, header.length))).toEqual(Array.from(header));
    expect(fromBytes(serialized.slice(header.length))).toBe(content);
  });
});

describe('CommitObject: sha() caching and reset after deserialize()', () => {
  test('sha() equals sha1(serialized) and is stable, then resets after deserialize with new content', async () => {
    const mk = (msg: string) => {
      const c = new CommitObject();
      (c as any)._treeSha = shaRep('a');
      (c as any)._parentShas = [shaRep('b')];
      (c as any)._author = new CommitPerson('X', 'x@x.x', 1, '0');
      (c as any)._committer = new CommitPerson('Y', 'y@y.y', 2, '0');
      (c as any)._message = msg;
      return c;
    };

    const c = mk('m1');
    const s1 = await c.sha();
    const expected1 = createHash('sha1').update(Buffer.from(c.serialize())).digest('hex');
    expect(s1).toBe(expected1);

    const s2 = await c.sha();
    expect(s2).toBe(s1);

    const other = mk('m2'); // different content
    const bufOther = other.serialize();

    await c.deserialize(bufOther);
    const s3 = await c.sha();
    const expected3 = createHash('sha1').update(Buffer.from(c.serialize())).digest('hex');
    expect(s3).toBe(expected3);
    expect(s3).not.toBe(s1);

    const s4 = await c.sha();
    expect(s4).toBe(s3);
  });
});

describe('CommitObject: deserialize() valid payload', () => {
  test('parses headers and multi-line message correctly', async () => {
    const tree = shaRep('a');
    const p1 = shaRep('b');
    const p2 = shaRep('c');

    const authorLine = 'John Doe <john@example.com> 1609459200 +0000';
    const committerLine = 'John Doe <john@example.com> 1609459800 +0530';
    const message = 'Line1\nLine2\nLine3';

    const content =
      `tree ${tree}\n` +
      `parent ${p1}\n` +
      `parent ${p2}\n` +
      `author ${authorLine}\n` +
      `committer ${committerLine}\n\n` +
      message;

    const ser = withHeader(content);
    const c = new CommitObject();
    await c.deserialize(ser);

    expect(c.treeSha).toBe(tree);
    expect(c.parentShas).toEqual([p1, p2]);
    expect(c.author?.name).toBe('John Doe');
    expect(c.author?.email).toBe('john@example.com');
    expect(c.author?.timestamp).toBe(1609459200);
    expect(c.author?.timezone).toBe('0'); // +0000 -> 0 seconds

    expect(c.committer?.timestamp).toBe(1609459800);
    expect(c.committer?.timezone).toBe('19800'); // +0530 -> 19800 seconds
    expect(c.message).toBe(message);
  });
});

describe('CommitObject: deserialize() rejects invalid payloads', () => {
  test('wrong type in header', async () => {
    const bad = toBytes('tree 3\0abc');
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('no null terminator in header', async () => {
    const bad = toBytes('commit 3abc');
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('content size mismatch', async () => {
    const bad = toBytes('commit 5\0abc');
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('unknown header line', async () => {
    const tree = shaRep('a');
    const author = 'A <a@a.a> 1 +0000';
    const committer = 'B <b@b.b> 2 +0000';
    const content = `tree ${tree}\nweird x\nauthor ${author}\ncommitter ${committer}\n\nmsg`;
    const bad = withHeader(content);
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('missing author', async () => {
    const tree = shaRep('a');
    const committer = 'B <b@b.b> 2 +0000';
    const content = `tree ${tree}\ncommitter ${committer}\n\nmsg`;
    const bad = withHeader(content);
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('missing committer', async () => {
    const tree = shaRep('a');
    const author = 'A <a@a.a> 1 +0000';
    const content = `tree ${tree}\nauthor ${author}\n\nmsg`;
    const bad = withHeader(content);
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('missing tree', async () => {
    const author = 'A <a@a.a> 1 +0000';
    const committer = 'B <b@b.b> 2 +0000';
    const content = `author ${author}\ncommitter ${committer}\n\nmsg`;
    const bad = withHeader(content);
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('invalid tree sha (length)', async () => {
    const badTree = 'a'.repeat(39);
    const author = 'A <a@a.a> 1 +0000';
    const committer = 'B <b@b.b> 2 +0000';
    const content = `tree ${badTree}\nauthor ${author}\ncommitter ${committer}\n\nm`;
    const bad = withHeader(content);
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('invalid parent sha (non-hex)', async () => {
    const tree = shaRep('a');
    const badParent = 'z'.repeat(40);
    const author = 'A <a@a.a> 1 +0000';
    const committer = 'B <b@b.b> 2 +0000';
    const content = `tree ${tree}\nparent ${badParent}\nauthor ${author}\ncommitter ${committer}\n\nm`;
    const bad = withHeader(content);
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('duplicate author', async () => {
    const tree = shaRep('a');
    const author = 'A <a@a.a> 1 +0000';
    const committer = 'B <b@b.b> 2 +0000';
    const content = `tree ${tree}\nauthor ${author}\nauthor ${author}\ncommitter ${committer}\n\nm`;
    const bad = withHeader(content);
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('duplicate committer', async () => {
    const tree = shaRep('a');
    const author = 'A <a@a.a> 1 +0000';
    const committer = 'B <b@b.b> 2 +0000';
    const content = `tree ${tree}\nauthor ${author}\ncommitter ${committer}\ncommitter ${committer}\n\nm`;
    const bad = withHeader(content);
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });

  test('duplicate tree', async () => {
    const tree = shaRep('a');
    const author = 'A <a@a.a> 1 +0000';
    const committer = 'B <b@b.b> 2 +0000';
    const content = `tree ${tree}\ntree ${tree}\nauthor ${author}\ncommitter ${committer}\n\nm`;
    const bad = withHeader(content);
    const c = new CommitObject();
    await expect(c.deserialize(bad)).rejects.toThrow(/Failed to deserialize commit/);
  });
});

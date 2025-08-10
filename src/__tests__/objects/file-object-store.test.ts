import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { PathScurry } from 'path-scurry';
import { createHash } from 'crypto';

import type { Path } from 'glob';
import { FileObjectStore } from '../../core/object-store';
import { BlobObject, TreeObject, CommitObject } from '../../core/objects';
import { TreeEntry, EntryType } from '../../core/objects/tree/tree-entry';
import { CompressionUtils } from '../../utils';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

describe('FileObjectStore', () => {
  let tmp: string;
  let scurry: PathScurry;
  let gitDir: Path;
  let store: FileObjectStore;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-objstore-'));
    scurry = new PathScurry(tmp);
    gitDir = scurry.cwd.resolve('.git');
    store = new FileObjectStore();
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  const objectFilePath = (sha: string) =>
    gitDir.resolve('objects').resolve(sha.slice(0, 2)).resolve(sha.slice(2)).fullpath();

  test('initialize creates .git/objects directory', async () => {
    await store.initialize(gitDir);
    const objectsPath = gitDir.resolve('objects').fullpath();
    expect(await fs.pathExists(objectsPath)).toBe(true);
    const stat = await fs.stat(objectsPath);
    expect(stat.isDirectory()).toBe(true);
  });

  test('write/read Blob: stores compressed by sha path and round-trips', async () => {
    await store.initialize(gitDir);

    const blob = new BlobObject(toBytes('hello world'));
    const serialized = blob.serialize();
    const sha = await blob.sha();

    const writtenSha = await store.writeObject(blob);
    expect(writtenSha).toBe(sha);

    const fpath = objectFilePath(sha);
    expect(await fs.pathExists(fpath)).toBe(true);

    const onDiskCompressed = await fs.readFile(fpath);
    const decompressed = await CompressionUtils.decompress(onDiskCompressed);
    expect(Array.from(decompressed)).toEqual(Array.from(serialized));

    const read = await store.readObject(sha);
    expect(read).toBeInstanceOf(BlobObject);
    expect(Array.from((read as BlobObject).content())).toEqual(Array.from(blob.content()));
  });

  test('writeObject is idempotent for same content', async () => {
    await store.initialize(gitDir);

    const blob = new BlobObject(toBytes('same data'));
    const sha1 = await store.writeObject(blob);
    const sha2 = await store.writeObject(blob);
    expect(sha2).toBe(sha1);

    const fpath = objectFilePath(sha1);
    expect(await fs.pathExists(fpath)).toBe(true);
  });

  test('hasObject returns true for existing, false for non-existing and short sha', async () => {
    await store.initialize(gitDir);

    const blob = new BlobObject(toBytes('exists'));
    const sha = await store.writeObject(blob);

    expect(await store.hasObject(sha)).toBe(true);
    expect(await store.hasObject('a'.repeat(40))).toBe(false); // valid length but not written
    expect(await store.hasObject('ab')).toBe(false); // short sha => false
  });

  test('readObject returns null for short sha and for missing object', async () => {
    await store.initialize(gitDir);

    expect(await store.readObject('ab')).toBeNull(); // short
    const missingSha = createHash('sha1').update('missing').digest('hex');
    expect(await store.readObject(missingSha)).toBeNull();
  });

  test('uninitialized store throws expected errors', async () => {
    const blob = new BlobObject(toBytes('data'));
    await expect(store.writeObject(blob)).rejects.toThrow(/Failed to write object/);

    const someSha = createHash('sha1').update('x').digest('hex');
    await expect(store.readObject(someSha)).rejects.toThrow(/Failed to read object: /);

    await expect(store.hasObject(someSha)).rejects.toThrow(/Object store not initialized/);
  });

  test('readObject returns proper subclass for tree and commit', async () => {
    await store.initialize(gitDir);

    // Prepare a blob to reference from tree
    const blob = new BlobObject(toBytes('file content'));
    const blobSha = await store.writeObject(blob);

    // Build a tree with one regular file entry pointing to blob
    const entry = new TreeEntry(EntryType.REGULAR_FILE, 'file.txt', blobSha);
    const tree = new TreeObject([entry]);
    const treeSha = await store.writeObject(tree);

    const readTree = await store.readObject(treeSha);
    expect(readTree).toBeInstanceOf(TreeObject);

    // Build a commit by deserializing a valid commit payload
    const author = 'John Doe <john@example.com> 1609459200 +0000';
    const committer = author;
    const commitContent = [
      'tree ',
      treeSha,
      '\n',
      'author ',
      author,
      '\n',
      'committer ',
      committer,
      '\n',
      '\n',
      'Initial commit',
    ].join('');
    const commitBytes = Uint8Array.from(
      Buffer.from(`commit ${Buffer.from(commitContent, 'utf8').length}\0${commitContent}`, 'utf8')
    );

    const commit = new CommitObject();
    await commit.deserialize(commitBytes);

    const commitSha = await store.writeObject(commit);
    const readCommit = await store.readObject(commitSha);
    expect(readCommit).toBeInstanceOf(CommitObject);

    // Round-trip check
    expect(Array.from((readCommit as CommitObject).serialize())).toEqual(
      Array.from(commit.serialize())
    );
  });

  test('readObject throws on invalid compressed data', async () => {
    await store.initialize(gitDir);

    // Put invalid (not deflated) bytes at a valid sha path
    const sha = createHash('sha1').update('invalid-compressed').digest('hex');
    const fpath = objectFilePath(sha);
    await fs.ensureDir(path.dirname(fpath));
    await fs.writeFile(fpath, Buffer.from('not deflated'), 'utf8');

    await expect(store.readObject(sha)).rejects.toThrow(
      new RegExp(`Failed to read object: ${sha}`)
    );
  });
});

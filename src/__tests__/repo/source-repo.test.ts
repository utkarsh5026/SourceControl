// src/__tests__/repo/source-repo.test.ts
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { PathScurry } from 'path-scurry';

import type { Path } from 'glob';
import { SourceRepository, RepositoryException } from '../../core/repo';
import { BlobObject } from '../../core/objects';
import { FileObjectStore } from '../../core/object-store';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn: () => Promise<boolean> | boolean, timeoutMs = 1500, stepMs = 25) => {
  const start = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await sleep(stepMs);
  }
};

describe('SourceRepository', () => {
  let tmp: string;
  let scurry: PathScurry;
  let wd: Path;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-sourcerepo-'));
    scurry = new PathScurry(tmp);
    wd = scurry.cwd;
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('workingDirectory() and gitDirectory() throw before init', () => {
    const repo = new SourceRepository();
    expect(() => repo.workingDirectory()).toThrow(RepositoryException);
    expect(() => repo.gitDirectory()).toThrow(RepositoryException);
  });

  test('objectStore() is available and of FileObjectStore', () => {
    const repo = new SourceRepository();
    expect(repo.objectStore()).toBeInstanceOf(FileObjectStore);
  });

  test('init creates .source structure and initial files with expected contents', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    const gitDir = wd.resolve('.source');
    const objectsDir = gitDir.resolve('objects');
    const refsDir = gitDir.resolve('refs');
    const headsDir = refsDir.resolve('heads');
    const tagsDir = refsDir.resolve('tags');
    const headFile = gitDir.resolve('HEAD').fullpath();
    const descFile = gitDir.resolve('description').fullpath();
    const configFile = gitDir.resolve('config').fullpath();

    // wait for async file/directory operations to settle
    await waitFor(async () => fs.pathExists(gitDir.fullpath()));
    await waitFor(async () => fs.pathExists(objectsDir.fullpath()));
    await waitFor(async () => fs.pathExists(refsDir.fullpath()));
    await waitFor(async () => fs.pathExists(headsDir.fullpath()));
    await waitFor(async () => fs.pathExists(tagsDir.fullpath()));
    await waitFor(async () => fs.pathExists(headFile));
    await waitFor(async () => fs.pathExists(descFile));
    await waitFor(async () => fs.pathExists(configFile));

    expect(repo.workingDirectory().fullpath()).toBe(wd.fullpath());
    expect(repo.gitDirectory().fullpath()).toBe(gitDir.fullpath());

    const head = await fs.readFile(headFile, 'utf8');
    expect(head).toBe('ref: refs/heads/master\n');

    const description = await fs.readFile(descFile, 'utf8');
    expect(description).toBe(
      "Unnamed repository; edit this file 'description' to name the repository.\n"
    );

    const config = await fs.readFile(configFile, 'utf8');
    expect(config).toBe(
      [
        '[core]',
        '    repositoryformatversion = 0',
        '    filemode = false',
        '    bare = false',
        '',
      ].join('\n')
    );
  });

  test('writeObject/readObject round-trips via object store under .source', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    const blob = new BlobObject(toBytes('hello from repo'));
    const sha = await repo.writeObject(blob);
    expect(sha).toHaveLength(40);

    const objectsDir = wd.resolve('.source').resolve('objects');
    const objectPath = objectsDir.resolve(sha.slice(0, 2)).resolve(sha.slice(2)).fullpath();

    await waitFor(async () => fs.pathExists(objectPath));
    expect(await fs.pathExists(objectPath)).toBe(true);

    const read = await repo.readObject(sha);
    expect(read).not.toBeNull();
    // minimal verification: same serialization
    if (read) {
      expect(Array.from(read.serialize())).toEqual(Array.from(blob.serialize()));
    }
  });

  test('readObject/writeObject map underlying store errors to RepositoryException when uninitialized', async () => {
    const repo = new SourceRepository();

    // writeObject before init -> RepositoryException('Failed to write object')
    await expect(repo.writeObject(new BlobObject(toBytes('x')))).rejects.toThrow(
      /Failed to write object/
    );

    // readObject before init (non-short sha path) -> RepositoryException('Failed to read object')
    // use a valid-length sha to bypass short-sha early return in FileObjectStore
    const validSha = 'a'.repeat(40);
    await expect(repo.readObject(validSha)).rejects.toThrow(/Failed to read object/);
  });

  test('findRepository discovers repository from root and nested paths', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    const foundRoot = await SourceRepository.findRepository(wd);
    expect(foundRoot).not.toBeNull();
    if (foundRoot) {
      expect(foundRoot.workingDirectory().fullpath()).toBe(wd.fullpath());
      expect(foundRoot.gitDirectory().fullpath()).toBe(wd.resolve('.source').fullpath());
    }

    // from nested path
    const nestedDir = wd.resolve('a').resolve('b');
    await fs.ensureDir(nestedDir.fullpath());

    const foundNested = await SourceRepository.findRepository(nestedDir);
    expect(foundNested).not.toBeNull();
    if (foundNested) {
      expect(foundNested.workingDirectory().fullpath()).toBe(wd.fullpath());
      expect(foundNested.gitDirectory().fullpath()).toBe(wd.resolve('.source').fullpath());
    }
  });

  test('init on an existing repository path should fail with RepositoryException', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    const again = new SourceRepository();
    await expect(again.init(wd)).rejects.toThrow(/Already a git repository/);
  });

  test('findRepository returns null when no repository exists', async () => {
    const found = await SourceRepository.findRepository(wd);
    expect(found).toBeNull();
  });
});

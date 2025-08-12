import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { PathScurry } from 'path-scurry';

import type { Path } from 'glob';
import { SourceRepository } from '../../core/repo';
import { GitIndex } from '../../core/index';
import { IndexFileAdder } from '../../core/index/index-file-adder';

describe('IndexFileAdder', () => {
  let tmp: string;
  let scurry: PathScurry;
  let wd: Path;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-index-file-adder-'));
    scurry = new PathScurry(tmp);
    wd = scurry.cwd;
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  const writeWorkingFile = async (rel: string, content: string) => {
    const abs = path.join(wd.fullpath(), rel);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content, 'utf8');
    return abs;
  };

  const newRepo = async () => {
    const repo = new SourceRepository();
    await repo.init(wd);
    return repo;
  };

  const newAdder = (repo: SourceRepository) =>
    new IndexFileAdder(repo, repo.workingDirectory().fullpath());

  test('fails when adding a non-existent path', async () => {
    const repo = await newRepo();
    const adder = newAdder(repo);
    const index = new GitIndex();

    const res = await adder.addFiles(['nope.txt'], index);

    expect(res.added).toEqual([]);
    expect(res.modified).toEqual([]);
    expect(res.ignored).toEqual([]);
    expect(res.failed).toEqual([{ path: 'nope.txt', reason: 'File does not exist' }]);
  });

  test('adds a single file by relative path', async () => {
    const repo = await newRepo();
    const adder = newAdder(repo);
    const index = new GitIndex();

    await writeWorkingFile('a.txt', 'hello');

    const res = await adder.addFiles(['a.txt'], index);

    expect(res.added.sort()).toEqual(['a.txt']);
    expect(res.modified).toEqual([]);
    expect(res.ignored).toEqual([]);
    expect(res.failed).toEqual([]);

    const entry = index.getEntry('a.txt');
    expect(entry).toBeTruthy();
    // verify blob exists in object store
    const hasBlob = await repo.objectStore().hasObject(entry!.contentHash);
    expect(hasBlob).toBe(true);
  });

  test('adds a single file by absolute path (result paths are relative)', async () => {
    const repo = await newRepo();
    const adder = newAdder(repo);
    const index = new GitIndex();

    const abs = await writeWorkingFile('b.txt', 'world');

    const res = await adder.addFiles([abs], index);

    expect(res.added.sort()).toEqual(['b.txt']);
    expect(res.modified).toEqual([]);
    expect(res.ignored).toEqual([]);
    expect(res.failed).toEqual([]);

    expect(index.getEntry('b.txt')).toBeTruthy();
  });

  test('marks as modified when adding a file already present in index', async () => {
    const repo = await newRepo();
    const adder = newAdder(repo);
    const index = new GitIndex();

    await writeWorkingFile('m.txt', 'v1');

    let res = await adder.addFiles(['m.txt'], index);
    expect(res.added).toEqual(['m.txt']);
    expect(res.modified).toEqual([]);

    // change content and add again
    await fs.writeFile(path.join(wd.fullpath(), 'm.txt'), 'v2', 'utf8');

    res = await adder.addFiles(['m.txt'], index);
    expect(res.added).toEqual([]);
    expect(res.modified).toEqual(['m.txt']);
    expect(res.failed).toEqual([]);
  });

  test('recursively adds files in a directory and skips .source dir', async () => {
    const repo = await newRepo();
    const adder = newAdder(repo);
    const index = new GitIndex();

    // create working files
    await writeWorkingFile('dir/a.txt', 'A');
    await writeWorkingFile('dir/b.bin', 'BINARY');
    await writeWorkingFile('dir/sub/c.txt', 'C');

    // ensure .source is present with some content that must be ignored
    const objectsDir = path.join(repo.gitDirectory().fullpath(), 'objects');
    await fs.ensureDir(objectsDir);
    await fs.writeFile(path.join(objectsDir, 'dummy'), 'ignored-internal', 'utf8');

    const dirAbs = path.join(wd.fullpath(), 'dir');
    const res = await adder.addFiles([dirAbs], index);

    const expected = ['dir/a.txt', 'dir/b.bin', 'dir/sub/c.txt'].sort();
    expect(res.added.sort()).toEqual(expected);
    expect(res.modified).toEqual([]);
    expect(res.ignored).toEqual([]);
    expect(res.failed).toEqual([]);

    expected.forEach((p) => expect(index.getEntry(p)).toBeTruthy());
  });
});

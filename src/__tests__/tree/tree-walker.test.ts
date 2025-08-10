import path from 'path';
import { TreeWalker } from '../../core/tree';
import { Repository } from '../../core/repo';
import { RefManager } from '../../core/refs';
import { TreeObject } from '../../core/objects/tree/tree-object';
import { TreeEntry, EntryType } from '../../core/objects/tree/tree-entry';
import { CommitObject } from '../../core/objects/commit/commit-object';
import { Path } from 'glob';

const sha = (c: string) => c.repeat(40); // quick 40-hex helper

const makePath = (p: string): Path => ({ fullpath: () => p }) as unknown as Path;

class FakeRepository extends Repository {
  private store = new Map<string, any>();
  private wd = makePath('/repo');
  private gd = makePath('/repo/.git');

  async init(): Promise<void> {}
  workingDirectory(): Path {
    return this.wd;
  }
  gitDirectory(): Path {
    return this.gd;
  }
  objectStore(): any {
    return {} as any;
  }

  put(sha: string, obj: any) {
    this.store.set(sha, obj);
  }

  async readObject(sha: string): Promise<any | null> {
    return this.store.get(sha) ?? null;
  }

  async writeObject(): Promise<string> {
    throw new Error('not used');
  }
}

const mapToObject = (m: Map<string, string>) =>
  Object.fromEntries([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));

describe('TreeWalker.walkTree', () => {
  test('empty tree returns empty map', async () => {
    const repo = new FakeRepository();
    const walker = new TreeWalker(repo);

    const rootTreeSha = sha('r');
    const emptyTree = new TreeObject([]);
    repo.put(rootTreeSha, emptyTree);

    const files = await walker.walkTree(rootTreeSha);
    expect(files.size).toBe(0);
  });

  test('flat files in root directory', async () => {
    const repo = new FakeRepository();
    const walker = new TreeWalker(repo);

    const file1 = new TreeEntry(EntryType.REGULAR_FILE, 'a.txt', sha('a'));
    const file2 = new TreeEntry(EntryType.EXECUTABLE_FILE, 'run.sh', sha('b'));
    const rootTree = new TreeObject([file1, file2]);
    const rootTreeSha = sha('r');
    repo.put(rootTreeSha, rootTree);

    const files = await walker.walkTree(rootTreeSha);
    expect(mapToObject(files)).toEqual({
      ['a.txt']: sha('a'),
      ['run.sh']: sha('b'),
    });
  });

  test('nested directories are traversed with full paths', async () => {
    const repo = new FakeRepository();
    const walker = new TreeWalker(repo);

    // subdirectory "src"
    const subFile1 = new TreeEntry(EntryType.REGULAR_FILE, 'index.ts', sha('1'));
    const subSubDirTreeSha = sha('e'); // deeper subdir: src/utils
    const subSubDirEntry = new TreeEntry(EntryType.DIRECTORY, 'utils', subSubDirTreeSha);
    const srcTree = new TreeObject([subFile1, subSubDirEntry]);
    const srcTreeSha = sha('f');
    repo.put(srcTreeSha, srcTree);

    // deeper subdir: "src/utils"
    const utilFile = new TreeEntry(EntryType.REGULAR_FILE, 'helper.ts', sha('2'));
    const utilsTree = new TreeObject([utilFile]);
    repo.put(subSubDirTreeSha, utilsTree);

    // root tree
    const readme = new TreeEntry(EntryType.REGULAR_FILE, 'README.md', sha('3'));
    const srcDir = new TreeEntry(EntryType.DIRECTORY, 'src', srcTreeSha);
    const rootTree = new TreeObject([readme, srcDir]);
    const rootTreeSha = sha('r');
    repo.put(rootTreeSha, rootTree);

    const files = await walker.walkTree(rootTreeSha);

    const expected = {
      [path.join('README.md')]: sha('3'),
      [path.join('src', 'index.ts')]: sha('1'),
      [path.join('src', 'utils', 'helper.ts')]: sha('2'),
    };
    expect(mapToObject(files)).toEqual(expected);
  });

  test('invalid tree object or missing returns empty map (error swallowed and logged)', async () => {
    const repo = new FakeRepository();
    const walker = new TreeWalker(repo);

    // No object stored for this sha -> readObject returns null
    const files = await walker.walkTree(sha('x'));
    expect(files.size).toBe(0);

    // Wrong type at tree sha -> also returns empty
    const wrong = new CommitObject();
    (wrong as any)._treeSha = null; // invalid commit content, but only type() is used here
    repo.put(sha('w'), wrong);

    const files2 = await walker.walkTree(sha('w'));
    expect(files2.size).toBe(0);
  });
});

describe('TreeWalker.getCommitFiles', () => {
  test('throws for non-commit object', async () => {
    const repo = new FakeRepository();
    const walker = new TreeWalker(repo);

    const notCommitSha = sha('n');
    repo.put(notCommitSha, new TreeObject([]));

    await expect(walker.getCommitFiles(notCommitSha)).rejects.toThrow(
      new RegExp(`Invalid commit: ${notCommitSha}`)
    );
  });

  test('throws when commit has no tree', async () => {
    const repo = new FakeRepository();
    const walker = new TreeWalker(repo);

    const c = new CommitObject();
    (c as any)._treeSha = null;
    const commitSha = sha('c');
    repo.put(commitSha, c);

    await expect(walker.getCommitFiles(commitSha)).rejects.toThrow(/Commit has no tree/);
  });

  test('returns files for a valid commit pointing to a tree', async () => {
    const repo = new FakeRepository();
    const walker = new TreeWalker(repo);

    // tree with a single file
    const file = new TreeEntry(EntryType.REGULAR_FILE, 'a.txt', sha('a'));
    const tree = new TreeObject([file]);
    const treeSha = sha('t');
    repo.put(treeSha, tree);

    const c = new CommitObject();
    (c as any)._treeSha = treeSha;
    const commitSha = sha('c');
    repo.put(commitSha, c);

    const files = await walker.getCommitFiles(commitSha);
    expect(mapToObject(files)).toEqual({ ['a.txt']: sha('a') });
  });
});

describe('TreeWalker.headFiles', () => {
  test('resolves HEAD to commit and returns files', async () => {
    const repo = new FakeRepository();
    const walker = new TreeWalker(repo);

    // Prepare tree and commit objects
    const file = new TreeEntry(EntryType.REGULAR_FILE, 'readme.md', sha('d'));
    const tree = new TreeObject([file]);
    const treeSha = sha('t');
    repo.put(treeSha, tree);

    const c = new CommitObject();
    (c as any)._treeSha = treeSha;
    const commitSha = sha('h');
    repo.put(commitSha, c);

    // Mock resolveReferenceToSha to return our commitSha
    const spy = jest
      .spyOn(RefManager.prototype, 'resolveReferenceToSha')
      .mockResolvedValue(commitSha);

    const files = await walker.headFiles();
    expect(mapToObject(files)).toEqual({ ['readme.md']: sha('d') });

    spy.mockRestore();
  });

  test('propagates error with context when HEAD cannot be read', async () => {
    const repo = new FakeRepository();
    const walker = new TreeWalker(repo);

    const spy = jest
      .spyOn(RefManager.prototype, 'resolveReferenceToSha')
      .mockRejectedValue(new Error('boom'));

    await expect(walker.headFiles()).rejects.toThrow(/Failed to read HEAD commit: /);

    spy.mockRestore();
  });
});

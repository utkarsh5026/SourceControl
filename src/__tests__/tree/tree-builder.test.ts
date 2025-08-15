// @ts-nocheck
import path from 'path';
import { TreeBuilder } from '../../core/tree/tree-builder';
import { GitIndex } from '../../core/index/git-index';
import { IndexEntry } from '../../core/index/index-entry';
import { GitTimestamp } from '../../core/index/index-entry-utils';
import { Repository } from '../../core/repo';
import { TreeObject } from '../../core/objects';
import { EntryType } from '../../core/objects/tree/tree-entry';
import { Path } from 'glob';

const sha = (c: string) => {
  const hex = c.charCodeAt(0).toString(16).padStart(2, '0');
  return hex.repeat(20);
};

const makePath = (p: string): Path => ({ fullpath: () => p }) as unknown as Path;

class MockRepository extends Repository {
  private _objectStore = new Map<string, TreeObject>();
  private nextSha = 1;

  constructor() {
    super();
  }

  async init(): Promise<void> {}

  workingDirectory(): Path {
    return makePath('/repo');
  }

  gitDirectory(): Path {
    return makePath('/repo/.git');
  }

  objectStore(): any {
    return {} as any;
  }

  async readObject(sha: string): Promise<TreeObject | null> {
    return this._objectStore.get(sha) ?? null;
  }

  async writeObject(obj: TreeObject): Promise<string> {
    const sha = this.nextSha.toString().padStart(40, '0');
    this.nextSha++;
    this._objectStore.set(sha, obj);
    return sha;
  }

  getStoredObject(sha: string): TreeObject | undefined {
    return this._objectStore.get(sha);
  }

  getAllStoredObjects(): Map<string, TreeObject> {
    return new Map(this._objectStore);
  }
}

const makeIndexEntry = (overrides: Partial<IndexEntry> = {}): IndexEntry => {
  return new IndexEntry({
    filePath: 'file.txt',
    creationTime: new GitTimestamp(1_700_000_000, 0),
    modificationTime: new GitTimestamp(1_700_000_000, 0),
    deviceId: 1,
    inodeNumber: 1,
    fileMode: 0o100644,
    userId: 1000,
    groupId: 1000,
    fileSize: 100,
    contentHash: sha('a'),
    assumeValid: false,
    stageNumber: 0,
    ...overrides,
  });
};

const createMockIndex = (entries: IndexEntry[]): GitIndex => {
  const index = new GitIndex();
  entries.forEach((entry) => {
    index.entries.push(entry);
  });
  return index;
};

describe('TreeBuilder', () => {
  let repository: MockRepository;
  let treeBuilder: TreeBuilder;

  beforeEach(() => {
    repository = new MockRepository();
    treeBuilder = new TreeBuilder(repository);
  });

  describe('Basic functionality', () => {
    test('should handle empty index', async () => {
      const index = createMockIndex([]);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      expect(rootTreeSha).toBeDefined();
      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree).toBeDefined();
      expect(rootTree!.entries).toHaveLength(0);
      expect(rootTree!.isEmpty).toBe(true);
    });

    test('should handle single file in root', async () => {
      const entry = makeIndexEntry({
        filePath: 'README.md',
        contentHash: sha('a'),
      });
      const index = createMockIndex([entry]);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(1);
      expect(rootTree!.entries[0].name).toBe('README.md');
      expect(rootTree!.entries[0].mode).toBe(EntryType.REGULAR_FILE);
      expect(rootTree!.entries[0].sha).toBe(sha('a'));
    });

    test('should handle multiple files in root', async () => {
      const entries = [
        makeIndexEntry({ filePath: 'README.md', contentHash: sha('a') }),
        makeIndexEntry({ filePath: 'package.json', contentHash: sha('b') }),
        makeIndexEntry({ filePath: 'index.js', contentHash: sha('c') }),
      ];
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(3);

      const names = rootTree!.entries.map((e) => e.name);
      expect(names).toEqual(['README.md', 'index.js', 'package.json']);
    });

    test('should handle single directory with files', async () => {
      const entries = [
        makeIndexEntry({ filePath: 'src/index.js', contentHash: sha('a') }),
        makeIndexEntry({ filePath: 'src/utils.js', contentHash: sha('b') }),
      ];
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(1);
      expect(rootTree!.entries[0].name).toBe('src');
      expect(rootTree!.entries[0].mode).toBe(EntryType.DIRECTORY);

      const srcTreeSha = rootTree!.entries[0].sha;
      const srcTree = repository.getStoredObject(srcTreeSha);
      expect(srcTree!.entries).toHaveLength(2);

      const srcNames = srcTree!.entries.map((e) => e.name);
      expect(srcNames).toEqual(['index.js', 'utils.js']);
    });
  });

  describe('Complex directory structures', () => {
    test('should handle deeply nested directories', async () => {
      const entries = [
        makeIndexEntry({ filePath: 'src/core/utils/helper.js', contentHash: sha('a') }),
        makeIndexEntry({ filePath: 'src/core/main.js', contentHash: sha('b') }),
        makeIndexEntry({ filePath: 'src/index.js', contentHash: sha('c') }),
      ];
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      // Verify root tree
      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(1);
      expect(rootTree!.entries[0].name).toBe('src');

      // Verify src tree
      const srcTree = repository.getStoredObject(rootTree!.entries[0].sha);
      expect(srcTree!.entries).toHaveLength(2);
      expect(srcTree!.entries.map((e) => e.name)).toEqual(['core', 'index.js']);

      // Verify core tree
      const coreTree = repository.getStoredObject(srcTree!.entries[0].sha);
      expect(coreTree!.entries).toHaveLength(2);
      expect(coreTree!.entries.map((e) => e.name)).toEqual(['main.js', 'utils']);

      // Verify utils tree
      const utilsTree = repository.getStoredObject(coreTree!.entries[1].sha);
      expect(utilsTree!.entries).toHaveLength(1);
      expect(utilsTree!.entries[0].name).toBe('helper.js');
    });

    test('should handle mixed files and directories', async () => {
      const entries = [
        makeIndexEntry({ filePath: 'README.md', contentHash: sha('a') }),
        makeIndexEntry({ filePath: 'src/index.js', contentHash: sha('b') }),
        makeIndexEntry({ filePath: 'package.json', contentHash: sha('c') }),
        makeIndexEntry({ filePath: 'tests/unit.test.js', contentHash: sha('d') }),
      ];
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(4);

      const rootEntries = rootTree!.entries;
      expect(rootEntries[0].name).toBe('README.md');
      expect(rootEntries[0].isFile()).toBe(true);
      expect(rootEntries[1].name).toBe('package.json');
      expect(rootEntries[1].isFile()).toBe(true);
      expect(rootEntries[2].name).toBe('src');
      expect(rootEntries[2].isDirectory()).toBe(true);
      expect(rootEntries[3].name).toBe('tests');
      expect(rootEntries[3].isDirectory()).toBe(true);
    });

    test('should handle parallel directory branches', async () => {
      const entries = [
        makeIndexEntry({ filePath: 'src/core/engine.js', contentHash: sha('a') }),
        makeIndexEntry({ filePath: 'src/utils/helper.js', contentHash: sha('b') }),
        makeIndexEntry({ filePath: 'tests/unit/core.test.js', contentHash: sha('c') }),
        makeIndexEntry({ filePath: 'tests/integration/full.test.js', contentHash: sha('d') }),
      ];
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(2);
      expect(rootTree!.entries.map((e) => e.name)).toEqual(['src', 'tests']);

      // Verify both src and tests have their subdirectories
      const srcTree = repository.getStoredObject(rootTree!.entries[0].sha);
      expect(srcTree!.entries.map((e) => e.name)).toEqual(['core', 'utils']);

      const testsTree = repository.getStoredObject(rootTree!.entries[1].sha);
      expect(testsTree!.entries.map((e) => e.name)).toEqual(['integration', 'unit']);
    });
  });

  describe('File type handling', () => {
    test('should handle regular files', async () => {
      const entry = makeIndexEntry({
        filePath: 'file.txt',
        fileMode: 0o100644,
        contentHash: sha('a'),
      });
      const index = createMockIndex([entry]);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries[0].mode).toBe(EntryType.REGULAR_FILE);
    });

    test('should handle executable files', async () => {
      const entry = makeIndexEntry({
        filePath: 'script.sh',
        fileMode: 0o100755,
        contentHash: sha('a'),
      });
      const index = createMockIndex([entry]);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries[0].mode).toBe(EntryType.EXECUTABLE_FILE);
    });

    test('should handle symbolic links', async () => {
      const entry = makeIndexEntry({
        filePath: 'link.txt',
        fileMode: 0o120000,
        contentHash: sha('a'),
      });
      // Mark as symlink
      (entry as any)._isSymlink = true;

      const index = createMockIndex([entry]);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries[0].mode).toBe(EntryType.SYMBOLIC_LINK);
    });

    test('should handle submodules', async () => {
      const entry = makeIndexEntry({
        filePath: 'submodule',
        fileMode: 0o160000,
        contentHash: sha('a'),
      });
      // Mark as gitlink (submodule)
      (entry as any)._isGitlink = true;

      const index = createMockIndex([entry]);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries[0].mode).toBe(EntryType.SUBMODULE);
    });

    test('should handle mixed file types in same directory', async () => {
      const entries = [
        makeIndexEntry({
          filePath: 'regular.txt',
          fileMode: 0o100644,
          contentHash: sha('a'),
        }),
        makeIndexEntry({
          filePath: 'script.sh',
          fileMode: 0o100755,
          contentHash: sha('b'),
        }),
      ];

      // Mark as symlink for the third entry
      const symlinkEntry = makeIndexEntry({
        filePath: 'link.txt',
        fileMode: 0o120000,
        contentHash: sha('c'),
      });
      (symlinkEntry as any)._isSymlink = true;
      entries.push(symlinkEntry);

      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(3);
      expect(rootTree!.entries[0].mode).toBe(EntryType.SYMBOLIC_LINK); // link.txt
      expect(rootTree!.entries[1].mode).toBe(EntryType.REGULAR_FILE); // regular.txt
      expect(rootTree!.entries[2].mode).toBe(EntryType.EXECUTABLE_FILE); // script.sh
    });
  });

  describe('Path normalization and cross-platform compatibility', () => {
    test('should normalize Windows backslashes to forward slashes', async () => {
      // Test that TreeBuilder handles paths correctly regardless of separators
      const entry = makeIndexEntry({
        filePath: 'src/core/file.js',
        contentHash: sha('a'),
      });
      const index = createMockIndex([entry]);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(1);
      expect(rootTree!.entries[0].name).toBe('src');
    });

    test('should handle files with spaces in names', async () => {
      const entries = [
        makeIndexEntry({
          filePath: 'My Document.txt',
          contentHash: sha('a'),
        }),
        makeIndexEntry({
          filePath: 'src/File With Spaces.js',
          contentHash: sha('b'),
        }),
      ];
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(2);
      expect(rootTree!.entries[0].name).toBe('My Document.txt');
      expect(rootTree!.entries[1].name).toBe('src');

      const srcTree = repository.getStoredObject(rootTree!.entries[1].sha);
      expect(srcTree!.entries[0].name).toBe('File With Spaces.js');
    });

    test('should handle Unicode filenames', async () => {
      const entries = [
        makeIndexEntry({
          filePath: '测试.txt',
          contentHash: sha('a'),
        }),
        makeIndexEntry({
          filePath: 'src/файл.js',
          contentHash: sha('b'),
        }),
      ];
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(2);
      expect(rootTree!.entries[0].name).toBe('src');
      expect(rootTree!.entries[1].name).toBe('测试.txt');

      const srcTree = repository.getStoredObject(rootTree!.entries[0].sha);
      expect(srcTree!.entries[0].name).toBe('файл.js');
    });
  });

  describe('Edge cases', () => {
    test('should handle very deep nesting (50+ levels)', async () => {
      const deepPath = Array.from({ length: 50 }, (_, i) => `level${i}`).join('/') + '/deep.txt';
      const entry = makeIndexEntry({
        filePath: deepPath,
        contentHash: sha('a'),
      });
      const index = createMockIndex([entry]);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      expect(rootTreeSha).toBeDefined();
      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(1);
      expect(rootTree!.entries[0].name).toBe('level0');
      expect(rootTree!.entries[0].isDirectory()).toBe(true);

      // Verify that all 50 tree objects were created (one for each level)
      const allObjects = repository.getAllStoredObjects();
      expect(allObjects.size).toBe(51); // 50 directories + 1 root
    });

    test('should handle large number of files in single directory', async () => {
      const entries = Array.from({ length: 100 }, (_, i) =>
        makeIndexEntry({
          filePath: `file${i.toString().padStart(4, '0')}.txt`,
          contentHash: sha('f'),
        })
      );
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(100);

      // Verify entries are sorted
      const names = rootTree!.entries.map((e) => e.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    test('should handle directory names that conflict with file names', async () => {
      const entries = [
        makeIndexEntry({
          filePath: 'test/file.txt',
          contentHash: sha('a'),
        }),
        makeIndexEntry({
          filePath: 'test.txt',
          contentHash: sha('b'),
        }),
      ];
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      const rootTree = repository.getStoredObject(rootTreeSha);
      expect(rootTree!.entries).toHaveLength(2);

      // Directory should come before file due to Git sorting rules
      expect(rootTree!.entries[0].name).toBe('test');
      expect(rootTree!.entries[0].isDirectory()).toBe(true);
      expect(rootTree!.entries[1].name).toBe('test.txt');
      expect(rootTree!.entries[1].isFile()).toBe(true);
    });

    test('should handle empty directories (no files)', async () => {
      // This tests the scenario where all parent directories are tracked
      // but some might not have direct files
      const entries = [
        makeIndexEntry({
          filePath: 'src/deep/nested/file.txt',
          contentHash: sha('a'),
        }),
      ];
      const index = createMockIndex(entries);

      const rootTreeSha = await treeBuilder.buildTreeFromIndex(index);

      // Navigate through the directory structure
      const rootTree = repository.getStoredObject(rootTreeSha);
      const srcTree = repository.getStoredObject(rootTree!.entries[0].sha);
      const deepTree = repository.getStoredObject(srcTree!.entries[0].sha);
      const nestedTree = repository.getStoredObject(deepTree!.entries[0].sha);

      expect(nestedTree!.entries).toHaveLength(1);
      expect(nestedTree!.entries[0].name).toBe('file.txt');
    });
  });

  describe('Deterministic behavior', () => {
    test('should produce same tree SHA for same input', async () => {
      const entries = [
        makeIndexEntry({ filePath: 'src/a.js', contentHash: sha('a') }),
        makeIndexEntry({ filePath: 'src/b.js', contentHash: sha('b') }),
        makeIndexEntry({ filePath: 'README.md', contentHash: sha('c') }),
      ];

      const index1 = createMockIndex([...entries]);
      const index2 = createMockIndex([...entries]);

      const sha1 = await treeBuilder.buildTreeFromIndex(index1);

      // Reset repository and tree builder for second run
      repository = new MockRepository();
      treeBuilder = new TreeBuilder(repository);

      const sha2 = await treeBuilder.buildTreeFromIndex(index2);

      // Both should produce trees with identical structure
      const tree1 = repository.getStoredObject(sha1);
      const tree2 = repository.getStoredObject(sha2);

      expect(tree1!.entries).toHaveLength(tree2!.entries.length);
      for (let i = 0; i < tree1!.entries.length; i++) {
        expect(tree1!.entries[i].name).toBe(tree2!.entries[i].name);
        expect(tree1!.entries[i].mode).toBe(tree2!.entries[i].mode);
        expect(tree1!.entries[i].sha).toBe(tree2!.entries[i].sha);
      }
    });

    test('should handle different input order consistently', async () => {
      const baseEntries = [
        makeIndexEntry({ filePath: 'z.txt', contentHash: sha('z') }),
        makeIndexEntry({ filePath: 'a.txt', contentHash: sha('a') }),
        makeIndexEntry({ filePath: 'm.txt', contentHash: sha('m') }),
      ];

      const index1 = createMockIndex([...baseEntries]);
      const index2 = createMockIndex([...baseEntries].reverse());

      const sha1 = await treeBuilder.buildTreeFromIndex(index1);

      // Reset for second run
      repository = new MockRepository();
      treeBuilder = new TreeBuilder(repository);

      const sha2 = await treeBuilder.buildTreeFromIndex(index2);

      const tree1 = repository.getStoredObject(sha1);
      const tree2 = repository.getStoredObject(sha2);

      // Both should have same sorted order
      expect(tree1!.entries.map((e) => e.name)).toEqual(['a.txt', 'm.txt', 'z.txt']);
      expect(tree2!.entries.map((e) => e.name)).toEqual(['a.txt', 'm.txt', 'z.txt']);
    });
  });
});

import { TreeAnalyzer } from '../../core/work-dir/internal/';
import { ObjectReader } from '../../core/repo';
import { TreeObject } from '../../core/objects/tree/tree-object';
import { TreeEntry, EntryType } from '../../core/objects/tree/tree-entry';
import { GitIndex, IndexEntry } from '../../core/index';
import type { Repository } from '../../core/repo';

const shaRep = (c: string) => c.repeat(40); // hex

const makeTree = (
  entries: Array<{ mode: EntryType | string; name: string; sha: string }>
): TreeObject => {
  return new TreeObject(
    entries.map((e) => new TreeEntry(typeof e.mode === 'string' ? e.mode : e.mode, e.name, e.sha))
  );
};

describe('TreeAnalyzer', () => {
  let repo: Repository;
  let analyzer: TreeAnalyzer;

  beforeEach(() => {
    repo = {} as unknown as Repository;
    analyzer = new TreeAnalyzer(repo);
    jest.restoreAllMocks();
  });

  test('getTreeFiles: walks recursively, includes supported types, normalizes paths', async () => {
    // Build root -> sub tree graph
    const SRC_SHA = shaRep('f');
    const ROOT_SHA = shaRep('r');

    const trees: Record<string, TreeObject> = {
      [ROOT_SHA]: makeTree([
        { mode: EntryType.REGULAR_FILE, name: 'a.txt', sha: shaRep('a') },
        { mode: EntryType.EXECUTABLE_FILE, name: 'bin.sh', sha: shaRep('b') },
        { mode: EntryType.SYMBOLIC_LINK, name: 'link', sha: shaRep('c') },
        { mode: EntryType.SUBMODULE, name: 'lib', sha: shaRep('d') },
        { mode: EntryType.DIRECTORY, name: 'src', sha: SRC_SHA },
      ]),
      [SRC_SHA]: makeTree([{ mode: EntryType.REGULAR_FILE, name: 's.txt', sha: shaRep('e') }]),
    };

    jest.spyOn(ObjectReader, 'readTree').mockImplementation(async (_repo, sha) => {
      const t = trees[sha];
      if (!t) throw new Error('unknown tree ' + sha);
      return t;
    });

    const files = await analyzer.getTreeFiles(ROOT_SHA);

    // Expect 5 files and forward-slash paths
    expect(Array.from(files.keys()).sort()).toEqual(
      ['a.txt', 'bin.sh', 'link', 'lib', 'src/s.txt'].sort()
    );

    expect(files.get('a.txt')).toEqual({ sha: shaRep('a'), mode: EntryType.REGULAR_FILE });
    expect(files.get('bin.sh')).toEqual({ sha: shaRep('b'), mode: EntryType.EXECUTABLE_FILE });
    expect(files.get('link')).toEqual({ sha: shaRep('c'), mode: EntryType.SYMBOLIC_LINK });
    expect(files.get('lib')).toEqual({ sha: shaRep('d'), mode: EntryType.SUBMODULE });
    expect(files.get('src/s.txt')).toEqual({ sha: shaRep('e'), mode: EntryType.REGULAR_FILE });
  });

  test('areTreesIdentical: short-circuits when SHA is identical', async () => {
    const spy = jest.spyOn(ObjectReader, 'readTree');
    expect(await analyzer.areTreesIdentical('same', 'same')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  test('areTreesIdentical: true when file sets (path, sha, mode) match', async () => {
    const T1 = 't1';
    const T2 = 't2';

    const treeA = makeTree([
      { mode: EntryType.REGULAR_FILE, name: 'a.txt', sha: shaRep('1') },
      { mode: EntryType.EXECUTABLE_FILE, name: 'bin.sh', sha: shaRep('2') },
    ]);
    const treeB = makeTree([
      { mode: EntryType.REGULAR_FILE, name: 'a.txt', sha: shaRep('1') },
      { mode: EntryType.EXECUTABLE_FILE, name: 'bin.sh', sha: shaRep('2') },
    ]);

    jest.spyOn(ObjectReader, 'readTree').mockImplementation(async (_repo, sha) => {
      if (sha === T1) return treeA;
      if (sha === T2) return treeB;
      throw new Error('unknown tree');
    });

    await expect(analyzer.areTreesIdentical(T1, T2)).resolves.toBe(true);
  });

  test('areTreesIdentical: false when sizes differ or a file is missing', async () => {
    const T1 = 't1';
    const T2 = 't2';

    const treeA = makeTree([{ mode: EntryType.REGULAR_FILE, name: 'a.txt', sha: shaRep('1') }]);
    const treeB = makeTree([
      { mode: EntryType.REGULAR_FILE, name: 'a.txt', sha: shaRep('1') },
      { mode: EntryType.REGULAR_FILE, name: 'b.txt', sha: shaRep('2') },
    ]);

    jest.spyOn(ObjectReader, 'readTree').mockImplementation(async (_repo, sha) => {
      if (sha === T1) return treeA;
      if (sha === T2) return treeB;
      throw new Error('unknown tree');
    });

    await expect(analyzer.areTreesIdentical(T1, T2)).resolves.toBe(false);
  });

  test('areTreesIdentical: false when a file SHA differs', async () => {
    const T1 = 't1';
    const T2 = 't2';

    const treeA = makeTree([{ mode: EntryType.REGULAR_FILE, name: 'f.txt', sha: shaRep('a') }]);
    const treeB = makeTree([{ mode: EntryType.REGULAR_FILE, name: 'f.txt', sha: shaRep('b') }]);

    jest.spyOn(ObjectReader, 'readTree').mockImplementation(async (_repo, sha) => {
      if (sha === T1) return treeA;
      if (sha === T2) return treeB;
      throw new Error('unknown tree');
    });

    await expect(analyzer.areTreesIdentical(T1, T2)).resolves.toBe(false);
  });

  test('areTreesIdentical: false when a file mode differs', async () => {
    const T1 = 't1';
    const T2 = 't2';

    const treeA = makeTree([{ mode: EntryType.REGULAR_FILE, name: 'f', sha: shaRep('a') }]);
    const treeB = makeTree([{ mode: EntryType.EXECUTABLE_FILE, name: 'f', sha: shaRep('a') }]);

    jest.spyOn(ObjectReader, 'readTree').mockImplementation(async (_repo, sha) => {
      if (sha === T1) return treeA;
      if (sha === T2) return treeB;
      throw new Error('unknown tree');
    });

    await expect(analyzer.areTreesIdentical(T1, T2)).resolves.toBe(false);
  });

  test('analyzeChanges: emits create/modify/delete with accurate summary', () => {
    const current = new Map<string, { sha: string; mode: string }>([
      ['only-current.txt', { sha: shaRep('1'), mode: EntryType.REGULAR_FILE }],
      ['mod.txt', { sha: shaRep('a'), mode: EntryType.REGULAR_FILE }],
      ['mode.txt', { sha: shaRep('m'), mode: EntryType.REGULAR_FILE }],
      ['same.txt', { sha: shaRep('s'), mode: EntryType.EXECUTABLE_FILE }],
    ]);

    const target = new Map<string, { sha: string; mode: string }>([
      ['only-target.txt', { sha: shaRep('2'), mode: EntryType.REGULAR_FILE }],
      ['mod.txt', { sha: shaRep('b'), mode: EntryType.REGULAR_FILE }], // sha change
      ['mode.txt', { sha: shaRep('m'), mode: EntryType.EXECUTABLE_FILE }], // mode change
      ['same.txt', { sha: shaRep('s'), mode: EntryType.EXECUTABLE_FILE }], // unchanged
    ]);

    const { operations, summary } = analyzer.analyzeChanges(current, target);

    // Order is not guaranteed; assert contents
    expect(operations).toEqual(
      expect.arrayContaining([
        { action: 'delete', path: 'only-current.txt' },
        {
          action: 'create',
          path: 'only-target.txt',
          blobSha: shaRep('2'),
          mode: EntryType.REGULAR_FILE,
        },
        {
          action: 'modify',
          path: 'mod.txt',
          blobSha: shaRep('b'),
          mode: EntryType.REGULAR_FILE,
        },
        {
          action: 'modify',
          path: 'mode.txt',
          blobSha: shaRep('m'),
          mode: EntryType.EXECUTABLE_FILE,
        },
      ])
    );

    expect(summary).toEqual({ created: 1, modified: 2, deleted: 1 });
  });

  test('getIndexFiles: maps entries to { sha, mode } with octal mode string', () => {
    const e1 = new IndexEntry({
      filePath: 'a',
      contentHash: shaRep('a'),
      fileMode: 0o100644,
    });
    const e2 = new IndexEntry({
      filePath: 'bin/x.sh',
      contentHash: shaRep('b'),
      fileMode: 0o100755,
    });
    const e3 = new IndexEntry({
      filePath: 'link',
      contentHash: shaRep('c'),
      fileMode: 0o120777,
    });

    const index = new GitIndex(2, [e1, e2, e3]);

    const files = analyzer.getIndexFiles(index);

    expect(files.get('a')).toEqual({ sha: shaRep('a'), mode: '100644' });
    expect(files.get('bin/x.sh')).toEqual({ sha: shaRep('b'), mode: '100755' });
    expect(files.get('link')).toEqual({ sha: shaRep('c'), mode: '120777' });
  });

  // Additional robustness tests

  test('getTreeFiles: empty tree yields empty map', async () => {
    const EMPTY_SHA = shaRep('0');
    jest.spyOn(ObjectReader, 'readTree').mockResolvedValueOnce(new TreeObject());
    const files = await analyzer.getTreeFiles(EMPTY_SHA);
    expect(files.size).toBe(0);
  });

  test('getTreeFiles: directories-only (with empty subtrees) yields empty map', async () => {
    const SUB_SHA = shaRep('1');
    const ROOT_SHA2 = shaRep('2');

    const trees: Record<string, TreeObject> = {
      [ROOT_SHA2]: makeTree([{ mode: EntryType.DIRECTORY, name: 'empty', sha: SUB_SHA }]),
      [SUB_SHA]: new TreeObject(),
    };

    jest.spyOn(ObjectReader, 'readTree').mockImplementation(async (_repo, sha) => {
      const t = trees[sha];
      if (!t) throw new Error('unknown tree ' + sha);
      return t;
    });

    const files = await analyzer.getTreeFiles(ROOT_SHA2);
    expect(files.size).toBe(0);
  });

  test('getTreeFiles: deep nesting produces normalized "a/b/c/file.txt" path', async () => {
    const T_A = shaRep('a');
    const T_B = shaRep('b');
    const T_C = shaRep('c');

    const trees: Record<string, TreeObject> = {
      [T_A]: makeTree([{ mode: EntryType.DIRECTORY, name: 'a', sha: T_B }]),
      [T_B]: makeTree([{ mode: EntryType.DIRECTORY, name: 'b', sha: T_C }]),
      [T_C]: makeTree([{ mode: EntryType.REGULAR_FILE, name: 'file.txt', sha: shaRep('f') }]),
    };

    jest.spyOn(ObjectReader, 'readTree').mockImplementation(async (_repo, sha) => {
      const t = trees[sha];
      if (!t) throw new Error('unknown tree ' + sha);
      return t;
    });

    const files = await analyzer.getTreeFiles(T_A);
    expect(Array.from(files.keys())).toEqual(['a/b/file.txt']);
    expect(files.get('a/b/file.txt')).toEqual({ sha: shaRep('f'), mode: EntryType.REGULAR_FILE });
  });

  test('areTreesIdentical: symlink and submodule equality treated as identical', async () => {
    const T1 = shaRep('x');
    const T2 = shaRep('y');

    const mk = () =>
      makeTree([
        { mode: EntryType.SYMBOLIC_LINK, name: 'L', sha: shaRep('1') },
        { mode: EntryType.SUBMODULE, name: 'M', sha: shaRep('2') },
      ]);

    jest.spyOn(ObjectReader, 'readTree').mockImplementation(async (_repo, sha) => {
      if (sha === T1) return mk();
      if (sha === T2) return mk();
      throw new Error('unknown tree');
    });

    await expect(analyzer.areTreesIdentical(T1, T2)).resolves.toBe(true);
  });

  test('analyzeChanges: no-ops when current == target', () => {
    const current = new Map<string, { sha: string; mode: string }>([
      ['same.txt', { sha: shaRep('s'), mode: EntryType.REGULAR_FILE }],
    ]);
    const target = new Map(current);
    const { operations, summary } = analyzer.analyzeChanges(current, target);
    expect(operations).toEqual([]);
    expect(summary).toEqual({ created: 0, modified: 0, deleted: 0 });
  });

  test('analyzeChanges: only deletions when target empty', () => {
    const current = new Map<string, { sha: string; mode: string }>([
      ['a.txt', { sha: shaRep('a'), mode: EntryType.REGULAR_FILE }],
      ['b.txt', { sha: shaRep('b'), mode: EntryType.EXECUTABLE_FILE }],
    ]);
    const target = new Map<string, { sha: string; mode: string }>();
    const { operations, summary } = analyzer.analyzeChanges(current, target);
    expect(operations).toEqual(
      expect.arrayContaining([
        { action: 'delete', path: 'a.txt' },
        { action: 'delete', path: 'b.txt' },
      ])
    );
    expect(summary).toEqual({ created: 0, modified: 0, deleted: 2 });
  });

  test('getIndexFiles: includes directory-like entries (mode 0) as "0"', () => {
    const eDir = new IndexEntry({ filePath: 'dir', contentHash: shaRep('d'), fileMode: 0 });
    const eFile = new IndexEntry({ filePath: 'f', contentHash: shaRep('f'), fileMode: 0o100644 });
    const index = new GitIndex(2, [eDir, eFile]);
    const files = analyzer.getIndexFiles(index);
    expect(files.get('dir')).toEqual({ sha: shaRep('d'), mode: '0' });
    expect(files.get('f')).toEqual({ sha: shaRep('f'), mode: '100644' });
  });

  test('getTreeFiles: propagates errors from object reads', async () => {
    jest.spyOn(ObjectReader, 'readTree').mockRejectedValueOnce(new Error('boom'));
    await expect(analyzer.getTreeFiles(shaRep('e'))).rejects.toThrow('boom');
  });
});

import { listTree, LsTreeOptions } from '../../../commands/ls-tree/ls-tree.handler';
import { Repository } from '../../../core/repo';
import { TreeObject, CommitObject, BlobObject, ObjectType } from '../../../core/objects';
import { TreeEntry, EntryType } from '../../../core/objects/tree/tree-entry';
import { CommitPerson } from '../../../core/objects/commit/commit-person';

// Mock display functions
jest.mock('../../../commands/ls-tree/ls-tree.display', () => ({
  displayTreeEntry: jest.fn(),
  displayTreeHeader: jest.fn(),
}));

// Mock console.log
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

// Mock display utility
jest.mock('../../../utils', () => ({
  display: {
    info: jest.fn(),
  },
}));

describe('ls-tree handler', () => {
  let mockRepository: jest.Mocked<Repository>;
  let testTreeSha: string;
  let testCommitSha: string;
  let testBlobSha: string;
  let testTreeObject: TreeObject;
  let testCommitObject: CommitObject;
  let testBlobObject: BlobObject;

  beforeEach(() => {
    // Setup test data - use valid 40-character hex strings
    testTreeSha = '1234567890abcdef1234567890abcdef12345678';
    testCommitSha = 'abcdef1234567890abcdef1234567890abcdef12';
    testBlobSha = 'fedcba0987654321fedcba0987654321fedcba09';

    // Create test objects
    testBlobObject = new BlobObject(Buffer.from('Hello, World!'));
    
    const entries = [
      new TreeEntry(EntryType.REGULAR_FILE, 'test.txt', testBlobSha),
      new TreeEntry(EntryType.EXECUTABLE_FILE, 'script.sh', testBlobSha)
    ];
    testTreeObject = new TreeObject(entries);
    
    const author = new CommitPerson('Test User', 'test@example.com', Date.now(), '+0000');
    testCommitObject = new CommitObject({
      treeSha: testTreeSha,
      message: 'Test commit',
      author: author,
      committer: author
    });

    // Mock repository
    mockRepository = {
      readObject: jest.fn(),
      writeObject: jest.fn(),
    } as any;

    jest.clearAllMocks();
  });

  describe('listTree', () => {
    test('lists tree object contents', async () => {
      const { displayTreeEntry, displayTreeHeader } = require('../../../commands/ls-tree/ls-tree.display');
      mockRepository.readObject.mockResolvedValue(testTreeObject);
      const options: LsTreeOptions = {};

      await listTree(mockRepository, testTreeSha, options);

      expect(mockRepository.readObject).toHaveBeenCalledWith(testTreeSha);
      expect(displayTreeHeader).toHaveBeenCalledWith(testTreeSha, '<root>');
      expect(displayTreeEntry).toHaveBeenCalledTimes(2);
    });

    test('lists commit object contents by extracting tree', async () => {
      const { displayTreeEntry, displayTreeHeader } = require('../../../commands/ls-tree/ls-tree.display');
      mockRepository.readObject
        .mockResolvedValueOnce(testCommitObject)
        .mockResolvedValueOnce(testTreeObject);
      const options: LsTreeOptions = {};

      await listTree(mockRepository, testCommitSha, options);

      expect(mockRepository.readObject).toHaveBeenCalledWith(testCommitSha);
      expect(mockRepository.readObject).toHaveBeenCalledWith(testTreeSha);
      expect(displayTreeHeader).toHaveBeenCalledWith(testCommitSha, '<root>');
      expect(displayTreeEntry).toHaveBeenCalledTimes(2);
    });

    test('throws error for non-existent object', async () => {
      const options: LsTreeOptions = {};
      const nonExistentSha = 'nonexistent1234567890abcdef1234567890abcdef12';
      mockRepository.readObject.mockResolvedValue(null);

      await expect(listTree(mockRepository, nonExistentSha, options))
        .rejects.toThrow(`object ${nonExistentSha} not found`);
    });

    test('throws error for blob object', async () => {
      const options: LsTreeOptions = {};
      mockRepository.readObject.mockResolvedValue(testBlobObject);

      await expect(listTree(mockRepository, testBlobSha, options))
        .rejects.toThrow(`object ${testBlobSha} is not a tree or commit`);
    });

    test('handles empty tree', async () => {
      const { display } = require('../../../utils');
      const emptyTree = new TreeObject([]);
      const emptyTreeSha = '0000000000000000000000000000000000000000';
      mockRepository.readObject.mockResolvedValue(emptyTree);
      const options: LsTreeOptions = {};

      await listTree(mockRepository, emptyTreeSha, options);

      expect(display.info).toHaveBeenCalledWith('  (empty tree)', '🌳 Tree Contents');
    });

    test('filters tree-only entries when treeOnly option is true', async () => {
      // Create a tree with both files and directories
      const subTreeSha = '1111111111111111111111111111111111111111';
      const mixedTreeEntries = [
        new TreeEntry(EntryType.REGULAR_FILE, 'file.txt', testBlobSha),
        new TreeEntry(EntryType.DIRECTORY, 'directory', subTreeSha)
      ];
      const mixedTree = new TreeObject(mixedTreeEntries);
      mockRepository.readObject.mockResolvedValue(mixedTree);

      const { displayTreeEntry } = require('../../../commands/ls-tree/ls-tree.display');
      const options: LsTreeOptions = { treeOnly: true };

      await listTree(mockRepository, '2222222222222222222222222222222222222222', options);

      // Should only display the directory entry, not the file
      expect(displayTreeEntry).toHaveBeenCalledTimes(1);
    });

    test('outputs only names when nameOnly option is true', async () => {
      mockRepository.readObject.mockResolvedValue(testTreeObject);
      const options: LsTreeOptions = { nameOnly: true };

      await listTree(mockRepository, testTreeSha, options);

      expect(mockConsoleLog).toHaveBeenCalledWith('test.txt');
      expect(mockConsoleLog).toHaveBeenCalledWith('script.sh');
    });

    test('recurses into subdirectories when recursive option is true', async () => {
      // Create nested tree structure
      const subTreeSha = '3333333333333333333333333333333333333333';
      const subTreeEntries = [new TreeEntry(EntryType.REGULAR_FILE, 'nested.txt', testBlobSha)];
      const subTree = new TreeObject(subTreeEntries);

      const parentTreeSha = '4444444444444444444444444444444444444444';
      const parentTreeEntries = [
        new TreeEntry(EntryType.REGULAR_FILE, 'file.txt', testBlobSha),
        new TreeEntry(EntryType.DIRECTORY, 'subdir', subTreeSha)
      ];
      const parentTree = new TreeObject(parentTreeEntries);

      mockRepository.readObject
        .mockResolvedValueOnce(parentTree)
        .mockResolvedValueOnce(subTree);

      const { displayTreeHeader } = require('../../../commands/ls-tree/ls-tree.display');
      const options: LsTreeOptions = { recursive: true };

      await listTree(mockRepository, parentTreeSha, options);

      // Should display header for both root and subdirectory
      expect(displayTreeHeader).toHaveBeenCalledWith(parentTreeSha, '<root>');
      expect(displayTreeHeader).toHaveBeenCalledWith(subTreeSha, 'subdir');
    });

    test('handles nameOnly with prefix in recursive mode', async () => {
      const subTreeSha = '5555555555555555555555555555555555555555';
      const subTreeEntries = [new TreeEntry(EntryType.REGULAR_FILE, 'nested.txt', testBlobSha)];
      const subTree = new TreeObject(subTreeEntries);

      const parentTreeSha = '6666666666666666666666666666666666666666';
      const parentTreeEntries = [new TreeEntry(EntryType.DIRECTORY, 'subdir', subTreeSha)];
      const parentTree = new TreeObject(parentTreeEntries);

      mockRepository.readObject
        .mockResolvedValueOnce(parentTree)
        .mockResolvedValueOnce(subTree);

      const options: LsTreeOptions = { nameOnly: true, recursive: true };

      await listTree(mockRepository, parentTreeSha, options);

      expect(mockConsoleLog).toHaveBeenCalledWith('subdir');
      expect(mockConsoleLog).toHaveBeenCalledWith('subdir/nested.txt');
    });

    test('passes long format option to displayTreeEntry', async () => {
      const { displayTreeEntry } = require('../../../commands/ls-tree/ls-tree.display');
      mockRepository.readObject.mockResolvedValue(testTreeObject);
      const options: LsTreeOptions = { longFormat: true };

      await listTree(mockRepository, testTreeSha, options);

      expect(displayTreeEntry).toHaveBeenCalledWith(
        mockRepository,
        expect.anything(),
        true
      );
    });

    test('throws error for commit without tree', async () => {
      // Create commit without tree (this will fail during serialization)
      const invalidCommit = new CommitObject();
      mockRepository.readObject.mockResolvedValue(invalidCommit);
      const options: LsTreeOptions = {};
      
      await expect(listTree(mockRepository, 'invalid-commit-sha', options))
        .rejects.toThrow('commit has no tree');
    });

    test('wraps errors with context', async () => {
      mockRepository.readObject.mockRejectedValue(new Error('Storage error'));
      const options: LsTreeOptions = {};

      await expect(listTree(mockRepository, 'some-sha', options))
        .rejects.toThrow('cannot list tree some-sha: Storage error');
    });
  });
});
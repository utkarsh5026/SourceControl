import { displayTreeEntry, displayTreeHeader } from '../../../commands/ls-tree/ls-tree.display';
import { Repository } from '../../../core/repo';
import { TreeEntry } from '../../../core/objects/tree/tree-entry';
import { EntryType } from '../../../core/objects/tree/tree-entry';
import { BlobObject } from '../../../core/objects';

// Mock chalk to disable colors in tests
jest.mock('chalk', () => {
  const mockChalk = (str: string) => str;
  mockChalk.bold = mockChalk;
  return {
    yellow: mockChalk,
    blue: mockChalk,
    green: mockChalk,
    gray: mockChalk,
    white: mockChalk,
    cyan: mockChalk,
    bold: {
      blue: mockChalk,
    },
  };
});

// Mock console.log
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

// Mock display utility
jest.mock('../../../utils', () => ({
  display: {
    info: jest.fn(),
  },
}));

describe('ls-tree display', () => {
  let mockRepository: jest.Mocked<Repository>;
  let mockTreeEntry: TreeEntry;

  beforeEach(() => {
    mockRepository = {
      readObject: jest.fn(),
    } as any;

    mockTreeEntry = {
      name: 'test-file.txt',
      sha: '1234567890abcdef1234567890abcdef12345678',
      mode: EntryType.REGULAR_FILE,
      isDirectory: jest.fn().mockReturnValue(false),
      isExecutable: jest.fn().mockReturnValue(false),
      isSymbolicLink: jest.fn().mockReturnValue(false),
    } as any;

    jest.clearAllMocks();
  });

  describe('displayTreeEntry', () => {
    test('displays regular file entry without long format', async () => {
      await displayTreeEntry(mockRepository, mockTreeEntry, false);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('blob')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('1234567890abcdef1234567890abcdef12345678')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('test-file.txt')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('📄')
      );
    });

    test('displays regular file entry with long format and size', async () => {
      const mockBlob = {
        size: jest.fn().mockReturnValue(1234),
      } as any;
      
      mockRepository.readObject.mockResolvedValue(mockBlob);

      await displayTreeEntry(mockRepository, mockTreeEntry, true);

      expect(mockRepository.readObject).toHaveBeenCalledWith('1234567890abcdef1234567890abcdef12345678');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('1234')
      );
    });

    test('displays file entry with size placeholder when object read fails', async () => {
      mockRepository.readObject.mockRejectedValue(new Error('Object not found'));

      await displayTreeEntry(mockRepository, mockTreeEntry, true);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('-')
      );
    });

    test('displays directory entry', async () => {
      const mockDirEntry = {
        ...mockTreeEntry,
        name: 'test-dir',
        mode: EntryType.DIRECTORY,
        isDirectory: jest.fn().mockReturnValue(true),
      } as any;

      await displayTreeEntry(mockRepository, mockDirEntry, false);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('tree')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('test-dir')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('📁')
      );
    });

    test('displays executable file entry', async () => {
      const mockExecEntry = {
        ...mockTreeEntry,
        name: 'script.sh',
        mode: EntryType.EXECUTABLE_FILE,
        isExecutable: jest.fn().mockReturnValue(true),
      } as any;

      await displayTreeEntry(mockRepository, mockExecEntry, false);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('script.sh')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('⚡')
      );
    });

    test('displays symbolic link entry', async () => {
      const mockSymlinkEntry = {
        ...mockTreeEntry,
        name: 'link.txt',
        mode: EntryType.SYMBOLIC_LINK,
        isSymbolicLink: jest.fn().mockReturnValue(true),
      } as any;

      await displayTreeEntry(mockRepository, mockSymlinkEntry, false);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('link.txt')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔗')
      );
    });

    test('does not display size for directories even in long format', async () => {
      const mockDirEntry = {
        ...mockTreeEntry,
        name: 'test-dir',
        mode: EntryType.DIRECTORY,
        sha: 'abcdef0987654321abcdef0987654321abcdef09',
        isDirectory: jest.fn().mockReturnValue(true),
      } as any;

      await displayTreeEntry(mockRepository, mockDirEntry, true);

      expect(mockRepository.readObject).not.toHaveBeenCalled();
      // Check that no size padding is shown (which would be multiple spaces followed by digits)
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.not.stringMatching(/\s{4,}\d+/)
      );
    });
  });

  describe('displayTreeHeader', () => {
    test('displays tree header with treeish and path', () => {
      const { display } = require('../../../utils');
      
      displayTreeHeader('abc123', '/path/to/dir');

      expect(display.info).toHaveBeenCalledWith(
        expect.stringContaining('abc123'),
        expect.stringContaining('🌳 Tree Contents')
      );
      expect(display.info).toHaveBeenCalledWith(
        expect.stringContaining('/path/to/dir'),
        expect.anything()
      );
    });

    test('displays format information in header', () => {
      const { display } = require('../../../utils');
      
      displayTreeHeader('main', '<root>');

      expect(display.info).toHaveBeenCalledWith(
        expect.stringContaining('mode'),
        expect.anything()
      );
      expect(display.info).toHaveBeenCalledWith(
        expect.stringContaining('type'),
        expect.anything()
      );
      expect(display.info).toHaveBeenCalledWith(
        expect.stringContaining('sha'),
        expect.anything()
      );
      expect(display.info).toHaveBeenCalledWith(
        expect.stringContaining('name'),
        expect.anything()
      );
    });
  });
});
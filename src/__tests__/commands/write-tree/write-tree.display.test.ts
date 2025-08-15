import { displayWriteTreeResult } from '../../../commands/write-tree/write-tree.display';
import { display } from '../../../utils';
import chalk from 'chalk';

// Mock the display utilities
jest.mock('../../../utils', () => ({
  display: {
    success: jest.fn(),
    info: jest.fn(),
  },
}));

const mockDisplay = display as jest.Mocked<typeof display>;

describe('write-tree display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('displayWriteTreeResult', () => {
    test('displays result with basic information', () => {
      const treeSha = 'abc123def456789012345678901234567890abcd';
      const dirPath = '/path/to/directory';
      
      displayWriteTreeResult(treeSha, dirPath);
      
      expect(mockDisplay.success).toHaveBeenCalledTimes(1);
      expect(mockDisplay.info).toHaveBeenCalledTimes(1);
      
      // Check success call arguments
      const [successDetails, successTitle] = mockDisplay.success.mock.calls[0]!;
      expect(successTitle).toBe(chalk.bold.green('🌲 Tree Object Created'));
      expect(successDetails).toContain(dirPath);
      expect(successDetails).toContain(treeSha);
      expect(successDetails).toContain('✅ Written to object store');
    });

    test('displays result with prefix information', () => {
      const treeSha = 'def456abc123789012345678901234567890abcd';
      const dirPath = '/path/to/directory/subdir';
      const prefix = 'subdir';
      
      displayWriteTreeResult(treeSha, dirPath, prefix);
      
      expect(mockDisplay.success).toHaveBeenCalledTimes(1);
      
      // Check that prefix is included in the output
      const [successDetails] = mockDisplay.success.mock.calls[0]!;
      expect(successDetails).toContain(chalk.cyan(prefix));
      expect(successDetails).toContain('Prefix:');
    });

    test('displays next steps with correct commands', () => {
      const treeSha = 'abc123def456789012345678901234567890abcd';
      const dirPath = '/path/to/directory';
      
      displayWriteTreeResult(treeSha, dirPath);
      
      expect(mockDisplay.info).toHaveBeenCalledTimes(1);
      
      const [infoDetails, infoTitle] = mockDisplay.info.mock.calls[0]!;
      expect(infoTitle).toBe('🎯 Next Steps');
      
      // Check that all suggested commands include the tree SHA
      expect(infoDetails).toContain(`sc ls-tree ${treeSha}`);
      expect(infoDetails).toContain(`sc cat-file -p ${treeSha}`);
      expect(infoDetails).toContain(`sc checkout-tree ${treeSha}`);
      
      // Check command descriptions
      expect(infoDetails).toContain('List tree contents');
      expect(infoDetails).toContain('Show tree object details');
      expect(infoDetails).toContain('Extract tree to directory');
    });

    test('formats directory path correctly in output', () => {
      const treeSha = 'def456abc123789012345678901234567890abcd';
      const dirPath = '/very/long/path/to/some/nested/directory';
      
      displayWriteTreeResult(treeSha, dirPath);
      
      const [successDetails] = mockDisplay.success.mock.calls[0]!
      expect(successDetails).toContain(chalk.white(dirPath));
      expect(successDetails).toContain('Directory:');
    });

    test('formats tree SHA correctly in output', () => {
      const treeSha = 'abc123def456789012345678901234567890abcd';
      const dirPath = '/path/to/directory';
      
      displayWriteTreeResult(treeSha, dirPath);
      
      const [successDetails] = mockDisplay.success.mock.calls[0]!
      expect(successDetails).toContain(chalk.green.bold(treeSha));
      expect(successDetails).toContain('Tree SHA:');
    });

    test('includes status information in output', () => {
      const treeSha = 'def456abc123789012345678901234567890abcd';
      const dirPath = '/path/to/directory';
      
      displayWriteTreeResult(treeSha, dirPath);
      
      const [successDetails] = mockDisplay.success.mock.calls[0]!
      expect(successDetails).toContain('Status:');
      expect(successDetails).toContain(chalk.green('✅ Written to object store'));
    });

    test('does not include prefix section when prefix is undefined', () => {
      const treeSha = 'abc123def456789012345678901234567890abcd';
      const dirPath = '/path/to/directory';
      
      displayWriteTreeResult(treeSha, dirPath, undefined);
      
      const [successDetails] = mockDisplay.success.mock.calls[0]!
      expect(successDetails).not.toContain('Prefix:');
    });

    test('does not include prefix section when prefix is empty string', () => {
      const treeSha = 'abc123def456789012345678901234567890abcd';
      const dirPath = '/path/to/directory';
      
      displayWriteTreeResult(treeSha, dirPath, '');
      
      const [successDetails] = mockDisplay.success.mock.calls[0]!
      expect(successDetails).not.toContain('Prefix:');
    });
  });
});
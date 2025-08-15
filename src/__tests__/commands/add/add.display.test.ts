import chalk from 'chalk';
import { displayAddResults, handleAddError, performDryRun } from '../../../commands/add/add.display';
import { AddResult, IndexManager } from '../../../core/index';
import { AddCommandOptions } from '../../../commands/add/add.types';

// Mock console methods
jest.mock('@/utils', () => ({
  display: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockDisplay = require('@/utils').display;

describe('add.display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.log and console.error
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('displayAddResults', () => {
    const mockOptions: AddCommandOptions = {
      verbose: false,
      quiet: false,
    };

    test('displays no changes message when nothing to add', () => {
      const result: AddResult = {
        added: [],
        modified: [],
        ignored: [],
        failed: [],
      };

      displayAddResults(result, mockOptions);

      expect(mockDisplay.info).toHaveBeenCalledWith(
        'No changes detected. All files are already up to date in the staging area.',
        chalk.yellow('ℹ️  No Changes')
      );
    });

    test('displays added files correctly', () => {
      const result: AddResult = {
        added: ['file1.txt', 'file2.txt'],
        modified: [],
        ignored: [],
        failed: [],
      };

      displayAddResults(result, mockOptions);

      expect(mockDisplay.info).toHaveBeenCalled();
      const callArgs = mockDisplay.info.mock.calls[0][0];
      expect(callArgs).toContain('New files staged (2)');
      expect(callArgs).toContain('file1.txt');
      expect(callArgs).toContain('file2.txt');
    });

    test('displays modified files correctly', () => {
      const result: AddResult = {
        added: [],
        modified: ['modified1.txt', 'modified2.txt'],
        ignored: [],
        failed: [],
      };

      displayAddResults(result, mockOptions);

      expect(mockDisplay.info).toHaveBeenCalled();
      const callArgs = mockDisplay.info.mock.calls[0][0];
      expect(callArgs).toContain('Modified files updated (2)');
      expect(callArgs).toContain('modified1.txt');
      expect(callArgs).toContain('modified2.txt');
    });

    test('displays ignored files correctly', () => {
      const result: AddResult = {
        added: [],
        modified: [],
        ignored: ['ignored1.txt', 'ignored2.txt'],
        failed: [],
      };

      displayAddResults(result, mockOptions);

      expect(mockDisplay.info).toHaveBeenCalled();
      const callArgs = mockDisplay.info.mock.calls[0][0];
      expect(callArgs).toContain('Ignored files skipped (2)');
      expect(callArgs).toContain('ignored1.txt');
      expect(callArgs).toContain('ignored2.txt');
    });

    test('displays failed files correctly', () => {
      const result: AddResult = {
        added: [],
        modified: [],
        ignored: [],
        failed: [
          { path: 'failed1.txt', reason: 'File not found' },
          { path: 'failed2.txt', reason: 'Permission denied' },
        ],
      };

      displayAddResults(result, mockOptions);

      expect(mockDisplay.info).toHaveBeenCalled();
      const callArgs = mockDisplay.info.mock.calls[0][0];
      expect(callArgs).toContain('Failed to add (2)');
      expect(callArgs).toContain('failed1.txt');
      expect(callArgs).toContain('File not found');
      expect(callArgs).toContain('failed2.txt');
      expect(callArgs).toContain('Permission denied');
    });

    test('truncates long lists when not verbose', () => {
      const result: AddResult = {
        added: Array.from({ length: 15 }, (_, i) => `file${i + 1}.txt`),
        modified: [],
        ignored: [],
        failed: [],
      };

      displayAddResults(result, mockOptions);

      expect(mockDisplay.info).toHaveBeenCalled();
      const callArgs = mockDisplay.info.mock.calls[0][0];
      expect(callArgs).toContain('... and 8 more files');
    });

    test('shows all files when verbose', () => {
      const verboseOptions: AddCommandOptions = { ...mockOptions, verbose: true };
      const result: AddResult = {
        added: Array.from({ length: 15 }, (_, i) => `file${i + 1}.txt`),
        modified: [],
        ignored: [],
        failed: [],
      };

      displayAddResults(result, verboseOptions);

      expect(mockDisplay.info).toHaveBeenCalled();
      const callArgs = mockDisplay.info.mock.calls[0][0];
      expect(callArgs).not.toContain('... and');
      expect(callArgs).toContain('file15.txt');
    });

    test('displays next steps when files are added', () => {
      const result: AddResult = {
        added: ['file1.txt'],
        modified: [],
        ignored: [],
        failed: [],
      };

      displayAddResults(result, mockOptions);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Next steps:')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('sc status')
      );
    });

    test('displays force add suggestions when files are ignored', () => {
      const result: AddResult = {
        added: [],
        modified: [],
        ignored: ['ignored.txt'],
        failed: [],
      };

      displayAddResults(result, mockOptions);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('To add ignored files:')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('sc add -f')
      );
    });
  });

  describe('handleAddError', () => {
    test('displays error details when not quiet', () => {
      const error = new Error('Test error message');
      
      handleAddError(error, false);

      expect(mockDisplay.error).toHaveBeenCalled();
      const [message, title] = mockDisplay.error.mock.calls[0];
      expect(title).toContain('Add Operation Failed');
      expect(message).toContain('Test error message');
      expect(message).toContain('Possible causes:');
      expect(message).toContain('Try:');
    });

    test('only shows error message when quiet', () => {
      const error = new Error('Test error message');
      
      handleAddError(error, true);

      expect(console.error).toHaveBeenCalledWith('Test error message');
      expect(mockDisplay.error).not.toHaveBeenCalled();
    });
  });

  describe('performDryRun', () => {
    let mockIndexManager: jest.Mocked<IndexManager>;

    beforeEach(() => {
      mockIndexManager = {
        add: jest.fn(),
      } as any;
    });

    test('displays dry run message and results', async () => {
      const mockResult: AddResult = {
        added: ['new.txt'],
        modified: ['changed.txt'],
        ignored: ['ignored.txt'],
        failed: [{ path: 'failed.txt', reason: 'Error' }],
      };

      mockIndexManager.add.mockResolvedValue(mockResult);

      await performDryRun(mockIndexManager, ['file.txt']);

      expect(console.log).toHaveBeenCalledWith(
        chalk.yellow('Performing dry run (no files will be added)...\n')
      );
      expect(console.log).toHaveBeenCalledWith(chalk.green.bold('Would add:'));
      expect(console.log).toHaveBeenCalledWith(chalk.blue.bold('Would update:'));
      expect(console.log).toHaveBeenCalledWith(chalk.yellow.bold('Would skip (ignored):'));
      expect(console.log).toHaveBeenCalledWith(chalk.red.bold('Would fail:'));
    });

    test('calls index manager add method', async () => {
      const mockResult: AddResult = {
        added: [],
        modified: [],
        ignored: [],
        failed: [],
      };

      mockIndexManager.add.mockResolvedValue(mockResult);

      await performDryRun(mockIndexManager, ['file1.txt', 'file2.txt']);

      expect(mockIndexManager.add).toHaveBeenCalledWith(['file1.txt', 'file2.txt']);
    });
  });
});
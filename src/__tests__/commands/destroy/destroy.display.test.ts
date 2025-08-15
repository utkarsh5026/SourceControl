import * as destroyDisplay from '../../../commands/destroy/destroy.display';
import { display } from '../../../utils';
import chalk from 'chalk';

jest.mock('../../../utils');
jest.mock('chalk', () => ({
  bold: { green: jest.fn(text => text) },
  gray: jest.fn(text => text),
  white: jest.fn(text => text),
  red: jest.fn(text => text),
  yellow: jest.fn(text => text),
  blue: jest.fn(text => text),
  green: jest.fn(text => text)
}));

describe('destroy display functions', () => {
  let mockDisplayInfo: jest.SpyInstance;
  let mockDisplaySuccess: jest.SpyInstance;
  let mockDisplayWarning: jest.SpyInstance;
  let mockDisplayError: jest.SpyInstance;

  beforeEach(() => {
    mockDisplayInfo = jest.spyOn(display, 'info').mockImplementation();
    mockDisplaySuccess = jest.spyOn(display, 'success').mockImplementation();
    mockDisplayWarning = jest.spyOn(display, 'warning').mockImplementation();
    mockDisplayError = jest.spyOn(display, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('displayHeader', () => {
    test('displays destruction header', () => {
      destroyDisplay.displayHeader();

      expect(mockDisplayInfo).toHaveBeenCalledWith(
        '💥 Source Control Repository Destruction',
        'Source Control Repository Destruction'
      );
    });
  });

  describe('displaySuccessMessage', () => {
    test('displays success message with repository path', () => {
      const repoPath = '/test/repo';
      
      destroyDisplay.displaySuccessMessage(repoPath);

      expect(mockDisplaySuccess).toHaveBeenCalledTimes(1);
      const [details, title] = mockDisplaySuccess.mock.calls[0];
      
      expect(title).toContain('Repository Destroyed Successfully');
      expect(details).toContain(repoPath);
      expect(details).toContain('Source Control Repository Removed');
      expect(details).toContain('Working directory files preserved');
    });
  });

  describe('displayWarningMessage', () => {
    test('displays warning about data loss', () => {
      destroyDisplay.displayWarningMessage();

      expect(mockDisplayWarning).toHaveBeenCalledTimes(1);
      const [warning, title] = mockDisplayWarning.mock.calls[0];
      
      expect(title).toContain('Important Notice');
      expect(warning).toContain('version control history has been permanently deleted');
      expect(warning).toContain('Working directory files have been preserved');
      expect(warning).toContain('sc init');
    });
  });

  describe('displayConfirmationPrompt', () => {
    test('displays confirmation prompt with repository path', async () => {
      const repoPath = '/test/repo';
      
      await destroyDisplay.displayConfirmationPrompt(repoPath);

      expect(mockDisplayWarning).toHaveBeenCalledTimes(1);
      const [warning, title] = mockDisplayWarning.mock.calls[0];
      
      expect(title).toContain('Confirm Repository Destruction');
      expect(warning).toContain('permanently delete');
      expect(warning).toContain(repoPath);
      expect(warning).toContain('Delete all commit history');
      expect(warning).toContain('Delete all branches and tags');
      expect(warning).toContain('Preserve working directory files');
    });
  });

  describe('displayNoRepositoryInfo', () => {
    test('displays no repository found message', () => {
      const targetPath = '/test/path';
      
      destroyDisplay.displayNoRepositoryInfo(targetPath);

      expect(mockDisplayWarning).toHaveBeenCalledTimes(1);
      const [message, title] = mockDisplayWarning.mock.calls[0];
      
      expect(title).toContain('No Repository Found');
      expect(message).toContain('No source control repository found');
      expect(message).toContain(targetPath);
      expect(message).toContain('sc init');
    });
  });

  describe('displayDestroyError', () => {
    test('displays destruction error with troubleshooting steps', () => {
      const error = new Error('Test error message');
      
      destroyDisplay.displayDestroyError(error);

      expect(mockDisplayError).toHaveBeenCalledTimes(1);
      const [errorDetails, title] = mockDisplayError.mock.calls[0];
      
      expect(title).toContain('Destruction Failed');
      expect(errorDetails).toContain('Test error message');
      expect(errorDetails).toContain('Troubleshooting:');
      expect(errorDetails).toContain('write permissions');
      expect(errorDetails).toContain('.source directory');
      expect(errorDetails).toContain('elevated privileges');
    });

    test('handles error with empty message', () => {
      const error = new Error('');
      
      destroyDisplay.displayDestroyError(error);

      expect(mockDisplayError).toHaveBeenCalledTimes(1);
      const [errorDetails, title] = mockDisplayError.mock.calls[0];
      
      expect(title).toContain('Destruction Failed');
      expect(errorDetails).toContain('Troubleshooting:');
    });
  });
});
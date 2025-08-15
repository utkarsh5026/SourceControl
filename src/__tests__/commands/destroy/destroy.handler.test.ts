import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { PathScurry } from 'path-scurry';
import { destroyRepositoryWithFeedback } from '../../../commands/destroy/destroy.handler';
import { SourceRepository } from '../../../core/repo';
import * as destroyDisplay from '../../../commands/destroy/destroy.display';

jest.mock('../../../commands/destroy/destroy.display');

describe('destroyRepositoryWithFeedback', () => {
  let tmp: string;
  let pathScurry: PathScurry;
  let mockDisplayHeader: jest.SpyInstance;
  let mockDisplayNoRepositoryInfo: jest.SpyInstance;
  let mockDisplayConfirmationPrompt: jest.SpyInstance;
  let mockDisplaySuccessMessage: jest.SpyInstance;
  let mockDisplayWarningMessage: jest.SpyInstance;
  let originalFsRemove: typeof fs.remove;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-destroy-test-'));
    pathScurry = new PathScurry(tmp);
    
    mockDisplayHeader = jest.spyOn(destroyDisplay, 'displayHeader').mockImplementation();
    mockDisplayNoRepositoryInfo = jest.spyOn(destroyDisplay, 'displayNoRepositoryInfo').mockImplementation();
    mockDisplayConfirmationPrompt = jest.spyOn(destroyDisplay, 'displayConfirmationPrompt').mockImplementation();
    mockDisplaySuccessMessage = jest.spyOn(destroyDisplay, 'displaySuccessMessage').mockImplementation();
    mockDisplayWarningMessage = jest.spyOn(destroyDisplay, 'displayWarningMessage').mockImplementation();
    
    // Store original fs.remove and mock it
    originalFsRemove = fs.remove;
    fs.remove = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Restore original fs.remove before cleanup
    fs.remove = originalFsRemove;
    await fs.remove(tmp);
    jest.clearAllMocks();
  });

  test('displays no repository info when repository does not exist', async () => {
    jest.spyOn(SourceRepository, 'findRepository').mockResolvedValue(null);
    
    await destroyRepositoryWithFeedback(pathScurry.cwd);

    expect(mockDisplayHeader).toHaveBeenCalledTimes(1);
    expect(mockDisplayNoRepositoryInfo).toHaveBeenCalledWith(pathScurry.cwd.toString());
    expect(mockDisplayConfirmationPrompt).not.toHaveBeenCalled();
    expect(mockDisplaySuccessMessage).not.toHaveBeenCalled();
    expect(mockDisplayWarningMessage).not.toHaveBeenCalled();
    expect(fs.remove).not.toHaveBeenCalled();
  });

  test('successfully destroys existing repository', async () => {
    const testTmp = tmp; // Capture tmp value for this test
    const gitPath = path.join(testTmp, '.source');
    
    const mockRepo = {
      workingDirectory: () => ({ fullpath: () => testTmp }),
      gitDirectory: () => ({ fullpath: () => gitPath })
    } as any;
    
    jest.spyOn(SourceRepository, 'findRepository').mockResolvedValue(mockRepo);
    
    await destroyRepositoryWithFeedback(pathScurry.cwd);

    expect(mockDisplayHeader).toHaveBeenCalledTimes(1);
    expect(mockDisplayNoRepositoryInfo).not.toHaveBeenCalled();
    expect(mockDisplayConfirmationPrompt).toHaveBeenCalledWith(testTmp);
    expect(fs.remove).toHaveBeenCalledWith(gitPath);
    expect(mockDisplaySuccessMessage).toHaveBeenCalledWith(testTmp);
    expect(mockDisplayWarningMessage).toHaveBeenCalledTimes(1);
  });

  test('handles file system errors during repository destruction', async () => {
    const testTmp = tmp; // Capture tmp value for this test
    const gitPath = path.join(testTmp, '.source');
    
    const mockRepo = {
      workingDirectory: () => ({ fullpath: () => testTmp }),
      gitDirectory: () => ({ fullpath: () => gitPath })
    } as any;
    
    const fsError = new Error('Permission denied');
    jest.spyOn(SourceRepository, 'findRepository').mockResolvedValue(mockRepo);
    (fs.remove as jest.Mock).mockRejectedValue(fsError);
    
    await expect(destroyRepositoryWithFeedback(pathScurry.cwd))
      .rejects.toThrow('Permission denied');

    expect(mockDisplayHeader).toHaveBeenCalledTimes(1);
    expect(mockDisplayConfirmationPrompt).toHaveBeenCalledWith(testTmp);
    expect(fs.remove).toHaveBeenCalledWith(gitPath);
    expect(mockDisplaySuccessMessage).not.toHaveBeenCalled();
    expect(mockDisplayWarningMessage).not.toHaveBeenCalled();
  });

  test('handles repository with nested git directory structure', async () => {
    const testTmp = tmp; // Capture tmp value for this test
    const nestedWorkDir = path.join(testTmp, 'nested');
    const gitPath = path.join(nestedWorkDir, '.source');
    
    const mockRepo = {
      workingDirectory: () => ({ fullpath: () => nestedWorkDir }),
      gitDirectory: () => ({ fullpath: () => gitPath })
    } as any;
    
    jest.spyOn(SourceRepository, 'findRepository').mockResolvedValue(mockRepo);
    
    await destroyRepositoryWithFeedback(pathScurry.cwd);

    expect(mockDisplayConfirmationPrompt).toHaveBeenCalledWith(nestedWorkDir);
    expect(fs.remove).toHaveBeenCalledWith(gitPath);
    expect(mockDisplaySuccessMessage).toHaveBeenCalledWith(nestedWorkDir);
  });

  test('handles repository discovery from parent directories', async () => {
    const testTmp = tmp; // Capture tmp value for this test
    const parentRepo = path.join(testTmp, 'parent');
    const childDir = path.join(parentRepo, 'child');
    const gitPath = path.join(parentRepo, '.source');
    
    // Use real fs.ensureDir for setup, then restore mock
    const originalEnsureDir = fs.ensureDir;
    await originalEnsureDir(childDir);
    
    const childPathScurry = new PathScurry(childDir);
    const mockRepo = {
      workingDirectory: () => ({ fullpath: () => parentRepo }),
      gitDirectory: () => ({ fullpath: () => gitPath })
    } as any;
    
    jest.spyOn(SourceRepository, 'findRepository').mockResolvedValue(mockRepo);
    
    await destroyRepositoryWithFeedback(childPathScurry.cwd);

    expect(mockDisplayConfirmationPrompt).toHaveBeenCalledWith(parentRepo);
    expect(fs.remove).toHaveBeenCalledWith(gitPath);
    expect(mockDisplaySuccessMessage).toHaveBeenCalledWith(parentRepo);
  });
});
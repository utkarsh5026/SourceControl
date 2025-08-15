import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { PathScurry } from 'path-scurry';
import { initializeRepositoryWithFeedback } from '../../../commands/init/init.handler';
import { SourceRepository } from '../../../core/repo';
import * as initDisplay from '../../../commands/init/init.display';

jest.mock('../../../commands/init/init.display');

describe('initializeRepositoryWithFeedback', () => {
  let tmp: string;
  let mockDisplayHeader: jest.SpyInstance;
  let mockDisplayReinitializationInfo: jest.SpyInstance;
  let mockDisplaySuccessMessage: jest.SpyInstance;
  let mockDisplayRepositoryStructure: jest.SpyInstance;
  let mockDisplayNextSteps: jest.SpyInstance;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-init-test-'));
    
    mockDisplayHeader = jest.spyOn(initDisplay, 'displayHeader').mockImplementation();
    mockDisplayReinitializationInfo = jest.spyOn(initDisplay, 'displayReinitializationInfo').mockImplementation();
    mockDisplaySuccessMessage = jest.spyOn(initDisplay, 'displaySuccessMessage').mockImplementation();
    mockDisplayRepositoryStructure = jest.spyOn(initDisplay, 'displayRepositoryStructure').mockImplementation();
    mockDisplayNextSteps = jest.spyOn(initDisplay, 'displayNextSteps').mockImplementation();
  });

  afterEach(async () => {
    await fs.remove(tmp);
    jest.clearAllMocks();
  });

  test('initializes repository in new directory', async () => {
    const options = { bare: false, quiet: false };
    
    await initializeRepositoryWithFeedback(tmp, options);

    expect(mockDisplayHeader).toHaveBeenCalledTimes(1);
    expect(mockDisplaySuccessMessage).toHaveBeenCalledWith(tmp, options);
    expect(mockDisplayRepositoryStructure).toHaveBeenCalledTimes(1);
    expect(mockDisplayNextSteps).toHaveBeenCalledTimes(1);
    expect(mockDisplayReinitializationInfo).not.toHaveBeenCalled();

    // Verify repository was actually created
    const gitDir = path.join(tmp, '.source');
    expect(await fs.pathExists(gitDir)).toBe(true);
  });

  test('handles existing repository reinitialization', async () => {
    // Create existing repository
    const repo = new SourceRepository();
    const pathScurry = new PathScurry(tmp);
    await repo.init(pathScurry.cwd);
    
    const options = { bare: false, quiet: false };
    
    await initializeRepositoryWithFeedback(tmp, options);

    expect(mockDisplayHeader).toHaveBeenCalledTimes(1);
    expect(mockDisplayReinitializationInfo).toHaveBeenCalledWith(tmp);
    expect(mockDisplaySuccessMessage).not.toHaveBeenCalled();
    expect(mockDisplayRepositoryStructure).not.toHaveBeenCalled();
    expect(mockDisplayNextSteps).not.toHaveBeenCalled();
  });

  test('handles relative directory paths', async () => {
    const relativeDir = 'test-repo';
    const fullPath = path.resolve(relativeDir);
    
    // Ensure the directory exists
    await fs.ensureDir(fullPath);
    
    const options = { bare: false, quiet: false };
    
    await initializeRepositoryWithFeedback(relativeDir, options);

    expect(mockDisplayHeader).toHaveBeenCalledTimes(1);
    expect(mockDisplaySuccessMessage).toHaveBeenCalledWith(fullPath, options);
    
    // Cleanup
    await fs.remove(fullPath);
  });

  test('propagates errors from repository initialization', async () => {
    const originalInit = SourceRepository.prototype.init;
    const mockInit = jest.spyOn(SourceRepository.prototype, 'init')
      .mockRejectedValue(new Error('Init failed'));
    
    const options = { bare: false, quiet: false };
    
    await expect(initializeRepositoryWithFeedback(tmp, options))
      .rejects.toThrow('Init failed');

    expect(mockDisplayHeader).toHaveBeenCalledTimes(1);
    expect(mockDisplaySuccessMessage).not.toHaveBeenCalled();
    
    mockInit.mockRestore();
  });

  test('works with bare repository option', async () => {
    const options = { bare: true, quiet: false };
    
    await initializeRepositoryWithFeedback(tmp, options);

    expect(mockDisplaySuccessMessage).toHaveBeenCalledWith(tmp, options);
    expect(options.bare).toBe(true);
  });

  test('works with quiet option', async () => {
    const options = { bare: false, quiet: true };
    
    await initializeRepositoryWithFeedback(tmp, options);

    expect(mockDisplaySuccessMessage).toHaveBeenCalledWith(tmp, options);
    expect(options.quiet).toBe(true);
  });
});
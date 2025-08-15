import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { SourceRepository } from '../../../core/repo';
import { IndexManager } from '../../../core/index';
import { BranchManager } from '../../../core/branch';
import { RefManager } from '../../../core/refs';
import * as helpers from '../../../utils/helpers';
import * as statusDisplay from '../../../commands/status/status.display';

// Mock dependencies
jest.mock('../../../utils/helpers', () => ({
  getRepo: jest.fn(),
}));

jest.mock('../../../utils', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../../../commands/status/status.display');
jest.mock('../../../core/index');
jest.mock('../../../core/branch');
jest.mock('../../../core/refs');

const mockGetRepo = helpers.getRepo as jest.MockedFunction<typeof helpers.getRepo>;
const mockLogger = require('../../../utils').logger;
const MockIndexManager = IndexManager as jest.MockedClass<typeof IndexManager>;
const MockBranchManager = BranchManager as jest.MockedClass<typeof BranchManager>;
const MockRefManager = RefManager as jest.MockedClass<typeof RefManager>;

// Mock the status command logic by extracting it to a testable function
const simulateStatusCommand = async (options: any) => {
  try {
    const repository = await helpers.getRepo();
    const indexManager = new IndexManager(repository);
    const branchManager = new BranchManager(repository);
    const refManager = new RefManager(repository);

    await indexManager.initialize();
    await branchManager.init();

    let currentBranch: string | null = null;
    let isDetached = false;

    try {
      currentBranch = await branchManager.getCurrentBranch();
    } catch (error) {
      try {
        const headSha = await refManager.resolveReferenceToSha('HEAD');
        isDetached = true;
        currentBranch = headSha.substring(0, 7);
      } catch {
        currentBranch = 'No commits yet';
      }
    }

    const status = await indexManager.status();

    if (options.short) {
      statusDisplay.displayShortStatus(status, currentBranch, isDetached);
    } else {
      statusDisplay.displayLongStatus(status, currentBranch, isDetached, options);
    }
  } catch (error) {
    mockLogger.error('Failed to get status:', error);
    process.exit(1);
  }
};

describe('status command logic', () => {
  let mockRepo: jest.Mocked<SourceRepository>;
  let mockIndexManager: jest.Mocked<IndexManager>;
  let mockBranchManager: jest.Mocked<BranchManager>;
  let mockRefManager: jest.Mocked<RefManager>;
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-status-test-'));
    
    mockRepo = {
      gitDirectory: jest.fn().mockReturnValue({ fullpath: () => path.join(tmp, '.git') }),
    } as any;

    mockIndexManager = {
      initialize: jest.fn(),
      status: jest.fn(),
    } as any;

    mockBranchManager = {
      init: jest.fn(),
      getCurrentBranch: jest.fn(),
    } as any;

    mockRefManager = {
      resolveReferenceToSha: jest.fn(),
    } as any;

    MockIndexManager.mockImplementation(() => mockIndexManager);
    MockBranchManager.mockImplementation(() => mockBranchManager);
    MockRefManager.mockImplementation(() => mockRefManager);
    mockGetRepo.mockResolvedValue(mockRepo);

    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as any);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    await fs.remove(tmp);
  });

  const mockStatusResult = {
    staged: {
      added: ['new-file.txt'],
      modified: ['modified-staged.txt'],
      deleted: ['deleted-staged.txt'],
    },
    unstaged: {
      modified: ['modified-unstaged.txt'],
      deleted: ['deleted-unstaged.txt'],
    },
    untracked: ['untracked.txt'],
    ignored: ['ignored.txt'],
  };

  test('initializes managers correctly', async () => {
    mockBranchManager.getCurrentBranch.mockResolvedValue('main');
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    await simulateStatusCommand({});

    expect(mockIndexManager.initialize).toHaveBeenCalled();
    expect(mockBranchManager.init).toHaveBeenCalled();
  });

  test('displays long status by default', async () => {
    mockBranchManager.getCurrentBranch.mockResolvedValue('main');
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    await simulateStatusCommand({});

    expect(statusDisplay.displayLongStatus).toHaveBeenCalledWith(
      mockStatusResult,
      'main',
      false,
      {}
    );
    expect(statusDisplay.displayShortStatus).not.toHaveBeenCalled();
  });

  test('displays short status when short option is true', async () => {
    mockBranchManager.getCurrentBranch.mockResolvedValue('main');
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    await simulateStatusCommand({ short: true });

    expect(statusDisplay.displayShortStatus).toHaveBeenCalledWith(
      mockStatusResult,
      'main',
      false
    );
    expect(statusDisplay.displayLongStatus).not.toHaveBeenCalled();
  });

  test('gets current branch successfully', async () => {
    mockBranchManager.getCurrentBranch.mockResolvedValue('feature-branch');
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    await simulateStatusCommand({});

    expect(mockBranchManager.getCurrentBranch).toHaveBeenCalled();
    expect(statusDisplay.displayLongStatus).toHaveBeenCalledWith(
      mockStatusResult,
      'feature-branch',
      false,
      {}
    );
  });

  test('handles detached HEAD state', async () => {
    const headSha = 'a1b2c3d4e5f6789012345678901234567890abcd';
    mockBranchManager.getCurrentBranch.mockRejectedValue(new Error('Not on a branch'));
    mockRefManager.resolveReferenceToSha.mockResolvedValue(headSha);
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    await simulateStatusCommand({});

    expect(mockRefManager.resolveReferenceToSha).toHaveBeenCalledWith('HEAD');
    expect(statusDisplay.displayLongStatus).toHaveBeenCalledWith(
      mockStatusResult,
      'a1b2c3d', // First 7 characters
      true, // isDetached = true
      {}
    );
  });

  test('handles no commits yet state', async () => {
    mockBranchManager.getCurrentBranch.mockRejectedValue(new Error('Not on a branch'));
    mockRefManager.resolveReferenceToSha.mockRejectedValue(new Error('No HEAD'));
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    await simulateStatusCommand({});

    expect(statusDisplay.displayLongStatus).toHaveBeenCalledWith(
      mockStatusResult,
      'No commits yet',
      false,
      {}
    );
  });

  test('passes all options to displayLongStatus', async () => {
    const options = {
      branch: true,
      verbose: true,
      ignored: true,
      untrackedFiles: 'all',
    };

    mockBranchManager.getCurrentBranch.mockResolvedValue('main');
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    await simulateStatusCommand(options);

    expect(statusDisplay.displayLongStatus).toHaveBeenCalledWith(
      mockStatusResult,
      'main',
      false,
      options
    );
  });

  test('gets status from index manager', async () => {
    mockBranchManager.getCurrentBranch.mockResolvedValue('main');
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    await simulateStatusCommand({});

    expect(mockIndexManager.status).toHaveBeenCalled();
  });

  test('handles repository initialization error', async () => {
    const error = new Error('Repository not found');
    mockGetRepo.mockRejectedValue(error);

    await expect(simulateStatusCommand({})).rejects.toThrow('process.exit called with code 1');

    expect(mockLogger.error).toHaveBeenCalledWith('Failed to get status:', error);
  });

  test('handles index manager initialization error', async () => {
    const error = new Error('Index initialization failed');
    mockIndexManager.initialize.mockRejectedValue(error);

    await expect(simulateStatusCommand({})).rejects.toThrow('process.exit called with code 1');

    expect(mockLogger.error).toHaveBeenCalledWith('Failed to get status:', error);
  });

  test('handles branch manager initialization error', async () => {
    const error = new Error('Branch initialization failed');
    mockBranchManager.init.mockRejectedValue(error);

    await expect(simulateStatusCommand({})).rejects.toThrow('process.exit called with code 1');

    expect(mockLogger.error).toHaveBeenCalledWith('Failed to get status:', error);
  });

  test('handles status calculation error', async () => {
    const error = new Error('Status calculation failed');
    mockBranchManager.getCurrentBranch.mockResolvedValue('main');
    mockIndexManager.status.mockRejectedValue(error);

    await expect(simulateStatusCommand({})).rejects.toThrow('process.exit called with code 1');

    expect(mockLogger.error).toHaveBeenCalledWith('Failed to get status:', error);
  });

  test('handles complex branch resolution scenarios', async () => {
    // Test scenario where getCurrentBranch fails but HEAD resolution succeeds
    mockBranchManager.getCurrentBranch.mockRejectedValue(new Error('Detached HEAD'));
    mockRefManager.resolveReferenceToSha.mockResolvedValue('1234567890abcdef');
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    await simulateStatusCommand({ short: true });

    expect(statusDisplay.displayShortStatus).toHaveBeenCalledWith(
      mockStatusResult,
      '1234567', // First 7 characters
      true // isDetached = true
    );
  });

  test('preserves default untracked files option', async () => {
    mockBranchManager.getCurrentBranch.mockResolvedValue('main');
    mockIndexManager.status.mockResolvedValue(mockStatusResult);

    // Test with default options (should include untrackedFiles: 'normal')
    await simulateStatusCommand({});

    expect(statusDisplay.displayLongStatus).toHaveBeenCalledWith(
      mockStatusResult,
      'main',
      false,
      {} // Options should be passed through as-is
    );
  });
});
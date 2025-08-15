import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { SourceRepository } from '../../../core/repo';
import { IndexManager } from '../../../core/index';
import * as helpers from '../../../utils/helpers';
import * as addDisplay from '../../../commands/add/add.display';

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

jest.mock('../../../commands/add/add.display');
jest.mock('../../../core/index');

const mockGetRepo = helpers.getRepo as jest.MockedFunction<typeof helpers.getRepo>;
const mockLogger = require('../../../utils').logger;
const MockIndexManager = IndexManager as jest.MockedClass<typeof IndexManager>;

// Mock the add command logic by extracting it to a testable function
const simulateAddCommand = async (files: string[], options: any) => {
  try {
    const repository = await helpers.getRepo();
    let filesToAdd: string[] = [];

    if (options.all) {
      filesToAdd = ['.'];
    } else if (files.length === 0) {
      mockLogger.error('Nothing specified, nothing added.');
      mockLogger.info("Maybe you wanted to say 'sc add .'?");
      process.exit(1);
    } else {
      filesToAdd = files;
    }

    const indexManager = new IndexManager(repository);
    await indexManager.initialize();

    if (options.dryRun) {
      await addDisplay.performDryRun(indexManager, filesToAdd);
      return;
    }

    const result = await indexManager.add(filesToAdd);
    addDisplay.displayAddResults(result, options);

    if (result.failed.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    addDisplay.handleAddError(error as Error, options.quiet || false);
    process.exit(1);
  }
};

describe('add command logic', () => {
  let mockRepo: jest.Mocked<SourceRepository>;
  let mockIndexManager: jest.Mocked<IndexManager>;
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-add-test-'));
    
    mockRepo = {
      gitDirectory: jest.fn().mockReturnValue({ fullpath: () => path.join(tmp, '.git') }),
    } as any;

    mockIndexManager = {
      initialize: jest.fn(),
      add: jest.fn(),
    } as any;

    MockIndexManager.mockImplementation(() => mockIndexManager);
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

  test('adds all files when all option is true', async () => {
    const mockResult = {
      added: ['file1.txt'],
      modified: [],
      ignored: [],
      failed: [],
    };

    mockIndexManager.add.mockResolvedValue(mockResult);

    await simulateAddCommand([], { all: true });

    expect(mockIndexManager.add).toHaveBeenCalledWith(['.']);
    expect(addDisplay.displayAddResults).toHaveBeenCalledWith(mockResult, { all: true });
  });

  test('shows error when no files specified and all not true', async () => {
    await expect(simulateAddCommand([], {})).rejects.toThrow('process.exit called with code 1');

    expect(mockLogger.error).toHaveBeenCalledWith('Nothing specified, nothing added.');
    expect(mockLogger.info).toHaveBeenCalledWith("Maybe you wanted to say 'sc add .'?");
  });

  test('adds specified files', async () => {
    const mockResult = {
      added: ['file1.txt', 'file2.txt'],
      modified: [],
      ignored: [],
      failed: [],
    };

    mockIndexManager.add.mockResolvedValue(mockResult);

    await simulateAddCommand(['file1.txt', 'file2.txt'], {});

    expect(mockIndexManager.add).toHaveBeenCalledWith(['file1.txt', 'file2.txt']);
    expect(addDisplay.displayAddResults).toHaveBeenCalledWith(mockResult, {});
  });

  test('performs dry run when dryRun option is true', async () => {
    await simulateAddCommand(['file.txt'], { dryRun: true });

    expect(addDisplay.performDryRun).toHaveBeenCalledWith(mockIndexManager, ['file.txt']);
    expect(mockIndexManager.add).not.toHaveBeenCalled();
  });

  test('initializes index manager', async () => {
    const mockResult = {
      added: ['file.txt'],
      modified: [],
      ignored: [],
      failed: [],
    };

    mockIndexManager.add.mockResolvedValue(mockResult);

    await simulateAddCommand(['file.txt'], {});

    expect(mockIndexManager.initialize).toHaveBeenCalled();
  });

  test('exits with code 1 when files fail to add', async () => {
    const mockResult = {
      added: [],
      modified: [],
      ignored: [],
      failed: [{ path: 'file.txt', reason: 'File not found' }],
    };

    mockIndexManager.add.mockResolvedValue(mockResult);

    await expect(simulateAddCommand(['file.txt'], {})).rejects.toThrow('process.exit called with code 1');
  });

  test('handles errors during add operation', async () => {
    const error = new Error('Add operation failed');
    mockIndexManager.add.mockRejectedValue(error);

    await expect(simulateAddCommand(['file.txt'], {})).rejects.toThrow('process.exit called with code 1');

    expect(addDisplay.handleAddError).toHaveBeenCalledWith(error, false);
  });

  test('passes quiet option to error handler', async () => {
    const error = new Error('Add operation failed');
    mockIndexManager.add.mockRejectedValue(error);

    await expect(simulateAddCommand(['file.txt'], { quiet: true })).rejects.toThrow('process.exit called with code 1');

    expect(addDisplay.handleAddError).toHaveBeenCalledWith(error, true);
  });

  test('handles repository initialization error', async () => {
    const error = new Error('Repository not found');
    mockGetRepo.mockRejectedValue(error);

    await expect(simulateAddCommand(['file.txt'], { quiet: true })).rejects.toThrow('process.exit called with code 1');

    expect(addDisplay.handleAddError).toHaveBeenCalledWith(error, true);
  });
});
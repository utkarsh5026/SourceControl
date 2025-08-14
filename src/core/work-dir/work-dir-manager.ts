import { Repository } from '@/core/repo';
import { GitIndex, IndexManager } from '@/core/index';
import { logger } from '@/utils';
import path from 'path';
import {
  FileOperationService,
  TreeAnalyzer,
  WorkingDirectoryValidator,
  AtomicOperationManager,
  IndexUpdater,
} from './internal';
import { IndexUpdateResult, OperationResult, WorkingDirectoryStatus } from './internal/types';

export interface UpdateOptions {
  force?: boolean;
  dryRun?: boolean;
  onProgress?: (completed: number, total: number, currentFile: string) => void;
}

export type UpdateResult = {
  success: boolean;
  filesChanged: number;
  operationResult: OperationResult;
  error: Error | null;
  indexUpdateResult?: IndexUpdateResult;
};

/**
 * WorkingDirectoryManager handles updating the working directory
 * when switching between branches or commits.
 *
 * Fixed version that addresses:
 * - Path normalization issues
 * - File permission preservation
 * - Atomic operations with rollback
 * - Proper error handling
 * - Safety checks for uncommitted changes
 */
export class WorkingDirectoryManager {
  private fileService: FileOperationService;
  private treeAnalyzer: TreeAnalyzer;
  private validator: WorkingDirectoryValidator;
  private atomicManager: AtomicOperationManager;
  private indexUpdater: IndexUpdater;
  private indexPath: string;
  private workingDirectory: string;

  constructor(repository: Repository) {
    this.workingDirectory = repository.workingDirectory().fullpath();
    this.indexPath = path.join(repository.gitDirectory().fullpath(), IndexManager.INDEX_FILE_NAME);

    // Initialize all services
    this.fileService = new FileOperationService(repository, this.workingDirectory);
    this.treeAnalyzer = new TreeAnalyzer(repository);
    this.validator = new WorkingDirectoryValidator(this.workingDirectory);
    this.atomicManager = new AtomicOperationManager(this.fileService);
    this.indexUpdater = new IndexUpdater(this.workingDirectory, this.indexPath);
  }

  public async updateToCommit(
    commitSha: string,
    options: UpdateOptions = {}
  ): Promise<UpdateResult> {
    logger.debug(`Updating working directory to commit ${commitSha}`);

    try {
      if (!options.force) {
        await this.performSafetyChecks();
      }
      const { operations, targetFiles } = await this.analyzeRequiredChanges(commitSha);

      if (operations.length === 0) {
        logger.info('Working directory is already up to date');
        return {
          success: true,
          filesChanged: 0,
          operationResult: { success: true, operationsApplied: 0, totalOperations: 0 },
          error: null,
        };
      }

      // Step 3: Handle dry run
      if (options.dryRun) {
        return await this.performDryRun(operations);
      }

      // Step 4: Execute operations atomically
      const operationResult = await this.atomicManager.executeAtomically(operations);

      if (!operationResult.success) {
        return {
          success: false,
          filesChanged: operationResult.operationsApplied,
          error: operationResult.error ? operationResult.error : null,
          operationResult,
        };
      }

      // Step 5: Update index to match new state
      const indexUpdateResult = await this.indexUpdater.updateToMatch(targetFiles);

      if (!indexUpdateResult.success) {
        logger.error(
          'File operations succeeded but index update failed:',
          indexUpdateResult.errors
        );
        // This is not fatal, but the index is now inconsistent
      }

      logger.info(`Successfully updated ${operationResult.operationsApplied} files`);

      return {
        success: true,
        filesChanged: operationResult.operationsApplied,
        operationResult,
        indexUpdateResult,
        error: null,
      };
    } catch (error) {
      logger.error('Failed to update working directory:', error);
      return {
        success: false,
        filesChanged: 0,
        operationResult: { success: false, operationsApplied: 0, totalOperations: 0 },
        error: error as Error,
      };
    }
  }

  /**
   * Check if the working directory is clean
   */
  public async isClean(): Promise<WorkingDirectoryStatus> {
    const index = await GitIndex.read(this.indexPath);
    return await this.validator.validateCleanState(index);
  }

  private async analyzeRequiredChanges(commitSha: string) {
    const targetFiles = await this.treeAnalyzer.getCommitFiles(commitSha);
    const currentIndex = await GitIndex.read(this.indexPath);
    const indexFiles = this.treeAnalyzer.getIndexFiles(currentIndex);

    const { operations, summary } = this.treeAnalyzer.analyzeChanges(indexFiles, targetFiles);
    return {
      operations,
      targetFiles,
      summary,
    };
  }

  /**
   * Perform safety checks before making changes
   */
  private async performSafetyChecks(): Promise<void> {
    const status = await this.isClean();

    if (!status.clean) {
      const filesList = status.modifiedFiles.slice(0, 10).join('\n  ');
      const moreFiles =
        status.modifiedFiles.length > 10
          ? `\n  ... and ${status.modifiedFiles.length - 10} more files`
          : '';

      throw new Error(
        `error: Your local changes to the following files would be overwritten by checkout:\n` +
          `  ${filesList}${moreFiles}\n` +
          `Please commit your changes or stash them before you switch branches.\n` +
          `Aborting`
      );
    }
  }

  /**
   * Perform a dry run to see what would change
   */
  private async performDryRun(operations: any[]): Promise<UpdateResult> {
    const dryRunResult = await this.atomicManager.dryRun(operations);

    logger.info('Dry run results:');
    logger.info(`  Would create: ${dryRunResult.analysis.willCreate.length} files`);
    logger.info(`  Would modify: ${dryRunResult.analysis.willModify.length} files`);
    logger.info(`  Would delete: ${dryRunResult.analysis.willDelete.length} files`);

    if (dryRunResult.analysis.conflicts.length > 0) {
      logger.warn('  Conflicts:', dryRunResult.analysis.conflicts);
    }

    return {
      success: dryRunResult.valid,
      filesChanged: 0,
      operationResult: {
        success: dryRunResult.valid,
        operationsApplied: 0,
        totalOperations: operations.length,
      },
      error: dryRunResult.valid ? null : new Error(`Conflicts: ${dryRunResult.errors.join(', ')}`),
    };
  }
}

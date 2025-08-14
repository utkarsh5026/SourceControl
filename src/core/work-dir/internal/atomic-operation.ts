import { FileOperationService } from './file-operation';
import type { FileBackup, FileOperation, OperationResult } from './types';
import { logger } from '@/utils';

/**
 * AtomicOperationManager ensures file operations are applied atomically.
 * If any operation fails, all changes are rolled back to maintain consistency.
 */
export class AtomicOperationManager {
  constructor(private fileService: FileOperationService) {}

  /**
   * Execute operations atomically with automatic rollback on failure
   */
  public async executeAtomically(operations: FileOperation[]): Promise<OperationResult> {
    if (operations.length === 0) {
      return {
        success: true,
        operationsApplied: 0,
        totalOperations: 0,
      };
    }

    const backups: FileBackup[] = [];
    let ops = 0;

    try {
      await this.createBackups(operations, backups);
      for (const operation of operations) {
        await this.fileService.applyOperation(operation);
        ops++;

        logger.debug(`Applied ${operation.action} operation for ${operation.path}`);
      }

      logger.info(`Successfully applied ${ops} file operations`);

      return {
        success: true,
        operationsApplied: ops,
        totalOperations: operations.length,
      };
    } catch (error) {
      logger.error('Operation failed, rolling back changes...');

      try {
        await this.rollbackChanges(backups);
        logger.info('Successfully rolled back all changes');
      } catch (rollbackError) {
        logger.error('Critical: Rollback failed!', rollbackError);
      }

      return {
        success: false,
        operationsApplied: ops,
        totalOperations: operations.length,
        error: error as Error,
      };
    }
  }

  /**
   * Validate operations before executing them
   */
  public validateOperations(operations: FileOperation[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [index, operation] of operations.entries()) {
      if (!operation.path || operation.path.trim().length === 0) {
        errors.push(`Operation ${index}: path is required`);
      }

      if (!['create', 'modify', 'delete'].includes(operation.action)) {
        errors.push(`Operation ${index}: invalid action '${operation.action}'`);
      }

      if (operation.action === 'create' || operation.action === 'modify') {
        if (!operation.blobSha) {
          errors.push(`Operation ${index}: blobSha is required for ${operation.action}`);
        }
        if (!operation.mode) {
          errors.push(`Operation ${index}: mode is required for ${operation.action}`);
        }
      }

      const conflictIndex = operations.findIndex(
        (op, i) => i !== index && op.path === operation.path
      );
      if (conflictIndex !== -1) {
        errors.push(
          `Operations ${index} and ${conflictIndex}: conflicting operations on ${operation.path}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Dry run - validate and analyze operations without executing them
   */
  public async dryRun(operations: FileOperation[]): Promise<{
    valid: boolean;
    errors: string[];
    analysis: {
      willCreate: string[];
      willModify: string[];
      willDelete: string[];
      conflicts: string[];
    };
  }> {
    const validation = this.validateOperations(operations);
    const analysis = {
      willCreate: [] as string[],
      willModify: [] as string[],
      willDelete: [] as string[],
      conflicts: [] as string[],
    };

    for (const operation of operations) {
      switch (operation.action) {
        case 'create':
          const exists = await this.fileService.fileExists(operation.path);
          if (exists) {
            analysis.conflicts.push(`${operation.path} (trying to create but file exists)`);
          } else {
            analysis.willCreate.push(operation.path);
          }
          break;
        case 'modify':
          analysis.willModify.push(operation.path);
          break;
        case 'delete':
          analysis.willDelete.push(operation.path);
          break;
      }
    }

    return {
      valid: validation.valid && analysis.conflicts.length === 0,
      errors: [...validation.errors, ...analysis.conflicts],
      analysis,
    };
  }

  /**
   * Create backups for operations that modify existing files
   */
  private async createBackups(operations: FileOperation[], backups: FileBackup[]): Promise<void> {
    for (const operation of operations) {
      if (operation.action === 'modify' || operation.action === 'delete') {
        try {
          const backup = await this.fileService.createBackup(operation.path);
          backups.push(backup);
          logger.debug(`Created backup for ${operation.path}`);
        } catch (error) {
          logger.warn(`Failed to create backup for ${operation.path}:`, error);
        }
      }
    }
  }

  /**
   * Rollback all changes using the backup information
   */
  private async rollbackChanges(backups: FileBackup[]): Promise<void> {
    const reversedBackups = [...backups].reverse();

    for (const backup of reversedBackups) {
      try {
        await this.fileService.restoreFromBackup(backup);
        logger.debug(`Restored ${backup.path} from backup`);
      } catch (error) {
        logger.error(`Failed to restore ${backup.path} from backup:`, error);
      }
    }
  }
}

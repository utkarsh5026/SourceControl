import { Command } from 'commander';
import { IndexManager } from '@/core/index';
import { BranchManager } from '@/core/branch';
import { RefManager } from '@/core/refs';
import { getRepo } from '@/utils/helpers';
import { logger } from '@/utils';
import { displayShortStatus, displayLongStatus } from './status.display';

/**
 * Status command implementation
 *
 * Shows the working tree status including:
 * - Current branch
 * - Staged changes (to be committed)
 * - Unstaged changes
 * - Untracked files
 * - Ignored files (with --ignored flag)
 */
export const statusCommand = new Command('status')
  .description('Show the working tree status')
  .option('-s, --short', 'Give output in short format')
  .option('-b, --branch', 'Show branch information')
  .option('-v, --verbose', 'Be verbose')
  .option('--ignored', 'Show ignored files')
  .option('--untracked-files <mode>', 'Show untracked files (no, normal, all)', 'normal')
  .action(async (options) => {
    try {
      const repository = await getRepo();
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
        displayShortStatus(status, currentBranch, isDetached);
      } else {
        displayLongStatus(status, currentBranch, isDetached, options);
      }
    } catch (error) {
      logger.error('Failed to get status:', error);
      process.exit(1);
    }
  });

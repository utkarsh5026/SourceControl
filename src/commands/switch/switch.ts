import { Command } from 'commander';
import { WorkingDirectoryManager } from '@/core/work-dir';
import { BranchManager } from '@/core/branch';
import { IndexManager } from '@/core/index';
import { getRepo } from '@/utils/helpers';
import { logger } from '@/utils';
import chalk from 'chalk';

/**
 * Switch command implementation (modern alternative to checkout)
 *
 * Switch branches with safety checks:
 * - Only switches between branches (not commits)
 * - Safer than checkout for branch operations
 * - Clear error messages for common mistakes
 */
export const switchCommand = new Command('switch')
  .description('🔀 Switch branches')
  .argument('<branch>', 'Branch to switch to')
  .option('-c, --create <n>', 'Create and switch to a new branch')
  .option('-C, --force-create <n>', 'Force create and switch to a new branch')
  .option('-f, --force', 'Force switch (discard local changes)')
  .option('-m, --merge', 'Merge local changes when switching')
  .option('-q, --quiet', 'Suppress output')
  .option('--discard-changes', 'Discard local changes')
  .action(async (branch, options) => {
    try {
      const repository = await getRepo();
      const branchManager = new BranchManager(repository);
      const indexManager = new IndexManager(repository);
      const workingDirManager = new WorkingDirectoryManager(repository);

      await branchManager.init();
      await indexManager.initialize();

      // Handle branch creation
      if (options.create || options.forceCreate) {
        await handleCreateAndSwitch(
          branchManager,
          options.create || options.forceCreate,
          branch,
          !!options.forceCreate
        );
        return;
      }

      // Check if target branch exists
      try {
        await branchManager.getBranch(branch);
      } catch {
        logger.error(`Branch '${branch}' not found.`);
        logger.info(`Did you mean to create a new branch? Use: switch -c ${branch}`);
        process.exit(1);
      }

      // Check for uncommitted changes
      if (!options.force && !options.discardChanges) {
        const status = await indexManager.status();
        const hasChanges = checkForChanges(status);

        if (hasChanges) {
          logger.error('You have uncommitted changes:');
          displayChangeSummary(status);
          logger.info('\nOptions:');
          logger.info('  1. Commit your changes: sourcecontrol commit -m "message"');
          logger.info('  2. Discard changes: sourcecontrol switch --discard-changes ' + branch);
          logger.info('  3. Stash changes (when implemented): sourcecontrol stash');
          process.exit(1);
        }
      }

      // Get current branch for comparison
      const currentBranch = await branchManager.getCurrentBranch();

      // Perform the switch
      await branchManager.checkout(branch);

      // Update working directory
      await workingDirManager.updateToCommit(await branchManager.getCurrentCommit());

      // Display result
      if (!options.quiet) {
        logger.success(`Switched to branch '${branch}'`);

        // Show branch comparison
        if (currentBranch) {
          await showBranchComparison(branchManager, currentBranch, branch);
        }
      }
    } catch (error) {
      logger.error('Switch failed:', error);
      process.exit(1);
    }
  });

/**
 * Handle create and switch operation
 */
async function handleCreateAndSwitch(
  branchManager: BranchManager,
  newBranch: string,
  startPoint: string,
  force: boolean
): Promise<void> {
  try {
    await branchManager.createBranch(newBranch, {
      startPoint,
      checkout: true,
      force,
    });

    logger.success(`Switched to a new branch '${newBranch}'`);
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      logger.error(`Branch '${newBranch}' already exists.`);
      logger.info(`Use -C to force create and switch.`);
    } else {
      throw error;
    }
  }
}

/**
 * Check for uncommitted changes
 */
function checkForChanges(status: any): boolean {
  return (
    status.staged.added.length > 0 ||
    status.staged.modified.length > 0 ||
    status.staged.deleted.length > 0 ||
    status.unstaged.modified.length > 0 ||
    status.unstaged.deleted.length > 0
  );
}

/**
 * Display a summary of changes
 */
function displayChangeSummary(status: any): void {
  const changes: string[] = [];

  if (status.staged.added.length > 0) {
    changes.push(chalk.green(`  ${status.staged.added.length} new files staged`));
  }
  if (status.staged.modified.length > 0) {
    changes.push(chalk.yellow(`  ${status.staged.modified.length} files modified (staged)`));
  }
  if (status.staged.deleted.length > 0) {
    changes.push(chalk.red(`  ${status.staged.deleted.length} files deleted (staged)`));
  }
  if (status.unstaged.modified.length > 0) {
    changes.push(chalk.yellow(`  ${status.unstaged.modified.length} files modified (unstaged)`));
  }
  if (status.unstaged.deleted.length > 0) {
    changes.push(chalk.red(`  ${status.unstaged.deleted.length} files deleted (unstaged)`));
  }

  changes.forEach((change) => logger.info(change));
}

/**
 * Show comparison between branches
 */
async function showBranchComparison(
  branchManager: BranchManager,
  fromBranch: string,
  toBranch: string
): Promise<void> {
  try {
    const fromInfo = await branchManager.getBranch(fromBranch);
    const toInfo = await branchManager.getBranch(toBranch);

    if (fromInfo.lastCommitDate && toInfo.lastCommitDate) {
      const diff = toInfo.lastCommitDate.getTime() - fromInfo.lastCommitDate.getTime();

      if (diff > 0) {
        logger.log(chalk.gray(`'${toBranch}' is ahead of '${fromBranch}'`));
      } else if (diff < 0) {
        logger.log(chalk.gray(`'${toBranch}' is behind '${fromBranch}'`));
      }
    }

    if (toInfo.lastCommitMessage) {
      logger.log(chalk.gray(`Latest commit: ${toInfo.lastCommitMessage}`));
    }
  } catch {
    // Branch comparison failed, not critical
  }
}

import { Command } from 'commander';
import { BranchManager, WorkingDirectoryManager } from '@/core/branch';
import { IndexManager } from '@/core/index';
import { getRepo } from '@/utils/helpers';
import { logger } from '@/utils';
import chalk from 'chalk';

/**
 * Checkout command implementation
 *
 * Switch branches or restore working tree files:
 * - Switch to existing branch
 * - Create and switch to new branch
 * - Checkout specific commit (detached HEAD)
 * - Restore files from a commit
 */
export const checkoutCommand = new Command('checkout')
  .description('Switch branches or restore working tree files')
  .argument('<branch-or-commit>', 'Branch name or commit SHA to checkout')
  .option('-b, --branch <name>', 'Create and checkout a new branch')
  .option('-B, --force-branch <name>', 'Create/reset and checkout a branch')
  .option('-f, --force', 'Force checkout (discard local changes)')
  .option('-d, --detach', 'Detach HEAD at the specified commit')
  .option('-q, --quiet', 'Suppress output')
  .option('--orphan <name>', 'Create an orphan branch')
  .action(async (target, options) => {
    try {
      const repository = await getRepo();
      const branchManager = new BranchManager(repository);
      const indexManager = new IndexManager(repository);
      const workingDirManager = new WorkingDirectoryManager(repository);

      await branchManager.init();
      await indexManager.initialize();

      // Check for uncommitted changes
      if (!options.force) {
        const hasChanges = await checkForUncommittedChanges(indexManager);
        if (hasChanges) {
          logger.error(
            'You have uncommitted changes. Commit or stash them before switching branches.'
          );
          logger.info('Use --force to discard changes');
          process.exit(1);
        }
      }

      // Handle branch creation
      if (options.branch || options.forceBranch) {
        const branchName = options.branch || options.forceBranch;
        const force = !!options.forceBranch;

        await branchManager.createBranch(branchName, {
          startPoint: target,
          checkout: true,
          force,
        });

        logger.success(`Switched to a new branch '${branchName}'`);
        await updateWorkingDirectory(workingDirManager, branchManager);
        return;
      }

      // Handle orphan branch
      if (options.orphan) {
        await createOrphanBranch(branchManager, options.orphan);
        return;
      }

      // Regular checkout
      await branchManager.checkout(target, {
        force: options.force,
        detach: options.detach,
      });

      // Update working directory
      await updateWorkingDirectory(workingDirManager, branchManager);

      // Display status
      if (!options.quiet) {
        await displayCheckoutStatus(branchManager);
      }
    } catch (error) {
      logger.error('Checkout failed:', error);
      process.exit(1);
    }
  });

/**
 * Check for uncommitted changes
 */
async function checkForUncommittedChanges(indexManager: IndexManager): Promise<boolean> {
  const status = await indexManager.status();

  const hasStaged =
    status.staged.added.length > 0 ||
    status.staged.modified.length > 0 ||
    status.staged.deleted.length > 0;

  const hasUnstaged = status.unstaged.modified.length > 0 || status.unstaged.deleted.length > 0;

  return hasStaged || hasUnstaged;
}

/**
 * Update working directory to match the checked out commit
 */
async function updateWorkingDirectory(
  workingDirManager: WorkingDirectoryManager,
  branchManager: BranchManager
): Promise<void> {
  try {
    const commitSha = await branchManager.getCurrentCommit();
    await workingDirManager.updateToCommit(commitSha);
  } catch (error) {
    logger.warn('Failed to update working directory:', error);
  }
}

/**
 * Display checkout status
 */
async function displayCheckoutStatus(branchManager: BranchManager): Promise<void> {
  const currentBranch = await branchManager.getCurrentBranch();
  const isDetached = await branchManager.isDetached();

  if (isDetached) {
    const currentCommit = await branchManager.getCurrentCommit();
    logger.log(chalk.yellow(`HEAD is now at ${currentCommit.substring(0, 7)}`));
    logger.log(chalk.gray('You are in detached HEAD state.'));
  } else if (currentBranch) {
    logger.success(`Switched to branch '${currentBranch}'`);

    // Show branch status
    try {
      const branch = await branchManager.getBranch(currentBranch);
      if (branch.lastCommitMessage) {
        logger.log(`Latest commit: ${branch.lastCommitMessage}`);
      }
    } catch {
      // Branch might be new
    }
  }
}

/**
 * Create an orphan branch (branch with no history)
 */
async function createOrphanBranch(branchManager: BranchManager, branchName: string): Promise<void> {
  // For now, just create a regular branch
  // In a full implementation, this would clear the index and working directory
  logger.warn('Orphan branch support is not fully implemented');
  logger.info('Creating a regular branch instead');

  await branchManager.createBranch(branchName, {
    checkout: true,
  });
}

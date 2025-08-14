import { ObjectReader, Repository } from '@/core/repo';
import { BranchCreator } from './branch-creation';
import { BranchRefService } from './branch-ref';
import { WorkingDirectoryManager } from '@/core/work-dir';
import { CheckoutOptions } from '../types';
import { logger } from '@/utils';

export class BranchCheckout {
  constructor(
    private repository: Repository,
    private refService: BranchRefService,
    private branchCreator: BranchCreator,
    private workdirManager: WorkingDirectoryManager
  ) {}

  /**
   * Switches to a branch or commit
   */
  public async checkout(target: string, options: CheckoutOptions = {}): Promise<void> {
    await this.validateTarget(target, options);
    await this.checkWorkingDirectoryStatus(options.force || false);
    if (options.create) {
      await this.branchCreator.createBranch(target);
    }

    const isBranch = await this.refService.exists(target);
    if (isBranch && !options.detach) {
      await this.checkoutBranch(target, options.force || false);
    } else {
      await this.checkoutCommit(target, options.force || false);
    }
  }

  /**
   * Validate that the target is valid for checkout
   */
  private async validateTarget(target: string, options: CheckoutOptions): Promise<void> {
    const branchExists = await this.refService.exists(target);

    if (branchExists) {
      return; // Valid branch
    }

    if (options.create) {
      return; // Will create the branch
    }

    // Check if it's a valid commit SHA
    try {
      await ObjectReader.readCommit(this.repository, target);
    } catch {
      // Not a valid commit
    }

    // Try partial SHA matching (if target is short SHA)
    if (target.length >= 4 && target.length < 40 && /^[0-9a-f]+$/i.test(target)) {
      // TODO: Implement partial SHA resolution
      logger.warn(`Partial SHA matching not yet implemented for: ${target}`);
    }

    throw new Error(
      `pathspec '${target}' did not match any file(s) known to git.\n` +
        `Did you forget to 'git add'?`
    );
  }

  /**
   * Checkout a branch (attached HEAD)
   */
  private async checkoutBranch(branchName: string, force: boolean): Promise<void> {
    const commitSha = await this.refService.getBranchSha(branchName);

    const currentBranch = await this.refService.getCurrentBranch();
    if (currentBranch === branchName) {
      logger.info(`Already on '${branchName}'`);
      return;
    }

    const changes = await this.workdirManager.updateToCommit(commitSha, { force: force });
    await this.refService.setCurrentBranch(branchName);

    this.logCheckoutResult(branchName, commitSha, changes.filesChanged, false);
  }

  /**
   * Checkout a commit (detached HEAD)
   */
  private async checkoutCommit(commitSha: string, force: boolean): Promise<void> {
    await ObjectReader.readCommit(this.repository, commitSha);

    const { filesChanged } = await this.workdirManager.updateToCommit(commitSha, { force });
    await this.refService.setDetachedHead(commitSha);
    this.logCheckoutResult(commitSha, commitSha, filesChanged, true);
  }

  /**
   * Log the checkout result with appropriate messaging
   */
  private logCheckoutResult(
    target: string,
    commitSha: string,
    fileChangeCount: number,
    isDetached: boolean
  ): void {
    const shortSha = commitSha.substring(0, 7);

    if (isDetached) {
      logger.info(`Note: switching to '${target}'.`);
      logger.info('');
      logger.info("You are in 'detached HEAD' state. You can look around, make experimental");
      logger.info('changes and commit them, and you can discard any commits you make in this');
      logger.info('state without impacting any branches by switching back to a branch.');
      logger.info('');
      logger.info(`HEAD is now at ${shortSha}`);
    } else {
      logger.info(`Switched to branch '${target}'`);
    }

    if (fileChangeCount > 0) {
      logger.debug(`Updated ${fileChangeCount} file(s) in working directory`);
    }
  }

  /**
   * Check working directory status and handle uncommitted changes
   */
  private async checkWorkingDirectoryStatus(force: boolean): Promise<void> {
    if (force) {
      logger.warn('Force checkout: local changes will be discarded');
      return;
    }

    const status = await this.workdirManager.isClean();

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
}

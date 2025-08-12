import { Repository } from '@/core/repo';
import { BranchCreator } from './branch-creation';
import { BranchRefService } from './branch-ref';
import { WorkingDirectoryManager } from '../workdir-manager';
import { CheckoutOptions } from '../types';
import { ObjectValidator } from '@/core/objects';

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
  async checkout(target: string, options: CheckoutOptions = {}): Promise<void> {
    if (options.create) {
      await this.branchCreator.createBranch(target);
    }

    const isBranch = await this.refService.exists(target);

    if (isBranch && !options.detach) {
      await this.checkoutBranch(target);
    } else {
      await this.checkoutCommit(target);
    }
  }

  /**
   * Checkout a branch (attached HEAD)
   */
  private async checkoutBranch(branchName: string): Promise<void> {
    const commitSha = await this.refService.getBranchSha(branchName);
    await this.workdirManager.updateToCommit(commitSha);
    await this.refService.setCurrentBranch(branchName);
  }

  /**
   * Checkout a commit (detached HEAD)
   */
  private async checkoutCommit(commitSha: string): Promise<void> {
    const commit = await this.repository.readObject(commitSha);
    if (!ObjectValidator.isCommit(commit)) {
      throw new Error(`Invalid commit: ${commitSha}`);
    }

    await this.workdirManager.updateToCommit(commitSha);
    await this.refService.setDetachedHead(commitSha);
  }
}

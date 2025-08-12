import { BranchRefService } from './branch-ref';

export class BranchDelete {
  constructor(private refService: BranchRefService) {}

  public async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    const currentBranch = await this.refService.getCurrentBranch();
    if (currentBranch === branchName) {
      throw new Error(`Cannot delete branch '${branchName}': currently checked out`);
    }

    // Check if branch exists
    if (!(await this.refService.exists(branchName))) {
      throw new Error(`Branch '${branchName}' not found`);
    }

    // TODO: Check if branch is fully merged (unless force)
    if (!force) {
      // Placeholder for merge checking
    }

    // Delete the branch
    await this.refService.deleteBranch(branchName);
  }
}

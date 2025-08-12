import { BranchValidator } from './branch-validator';
import { BranchRefService } from './branch-ref';

export class BranchRename {
  constructor(private refService: BranchRefService) {}

  /**
   * Rename a branch
   */
  public async renameBranch(
    oldName: string,
    newName: string,
    force: boolean = false
  ): Promise<void> {
    BranchValidator.validateAndThrow(newName);

    if (!(await this.refService.exists(oldName))) {
      throw new Error(`Branch '${oldName}' not found`);
    }

    if (!force && (await this.refService.exists(newName))) {
      throw new Error(`Branch '${newName}' already exists`);
    }

    const sha = await this.refService.getBranchSha(oldName);
    await this.refService.updateBranch(newName, sha);

    const currentBranch = await this.refService.getCurrentBranch();
    if (currentBranch === oldName) {
      await this.refService.setCurrentBranch(newName);
    }

    await this.refService.deleteBranch(oldName);
  }
}

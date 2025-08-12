import { RefManager } from '@/core/refs';
import path from 'path';

/**
 * BranchRefService is a service for managing branch references.
 */
export class BranchRefService {
  public static readonly BRANCH_DIR_NAME = 'heads' as const;
  public static readonly HEAD_FILE = 'HEAD' as const;
  public static readonly HEAD_PREFIX = 'ref: refs/heads/' as const;

  constructor(private refManager: RefManager) {}

  /**
   * Converts branch name to reference path
   * for branch like
   */
  public toBranchRefPath(branchName: string): string {
    return path.join(BranchRefService.BRANCH_DIR_NAME, branchName);
  }

  /**
   * Checks if a branch exists
   */
  public async exists(branchName: string): Promise<boolean> {
    const refPath = this.toBranchRefPath(branchName);
    return await this.refManager.exists(refPath);
  }

  /**
   * Gets the SHA for a branch
   */
  public async getBranchSha(branchName: string): Promise<string> {
    const refPath = this.toBranchRefPath(branchName);
    return await this.refManager.resolveReferenceToSha(refPath);
  }

  /**
   * Creates or updates a branch reference
   */
  public async updateBranch(branchName: string, sha: string): Promise<void> {
    const refPath = this.toBranchRefPath(branchName);
    await this.refManager.updateRef(refPath, sha);
  }

  /**
   * Deletes a branch reference
   */
  public async deleteBranch(branchName: string): Promise<boolean> {
    const refPath = this.toBranchRefPath(branchName);
    return await this.refManager.deleteRef(refPath);
  }

  /**
   * Gets the current branch name (null if detached)
   */
  public async getCurrentBranch(): Promise<string | null> {
    try {
      const headContent = await this.refManager.readRef(BranchRefService.HEAD_FILE);
      const isDetached = !headContent?.startsWith(BranchRefService.HEAD_PREFIX);

      if (isDetached) return null;

      return headContent.substring(BranchRefService.HEAD_PREFIX.length);
    } catch {
      return null;
    }
  }

  /**
   * Checks if HEAD is detached
   */
  public async isDetached(): Promise<boolean> {
    const headContent = await this.refManager.readRef(BranchRefService.HEAD_FILE);
    return !headContent?.startsWith(BranchRefService.HEAD_PREFIX);
  }

  /**
   * Updates HEAD to point to a branch
   */
  public async setCurrentBranch(branchName: string): Promise<void> {
    const headRef = `${BranchRefService.HEAD_PREFIX}${branchName}`;
    await this.refManager.updateRef(BranchRefService.HEAD_FILE, headRef);
  }

  /**
   * Updates HEAD to point directly to a commit (detached)
   */
  public async setDetachedHead(commitSha: string): Promise<void> {
    await this.refManager.updateRef(BranchRefService.HEAD_FILE, commitSha);
  }
}

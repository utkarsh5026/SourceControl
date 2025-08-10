import { RefManager } from './ref-manager';
import fs from 'fs-extra';
import path from 'path';
import { FileUtils } from '@/utils';

export type BranchInfo = {
  name: string;
  sha: string;
  isCurrentBranch: boolean;
  commitCount?: number;
  lastCommitDate?: Date;
};

/**
 * BranchManager provides high-level branch operations built on RefManager
 */
export class BranchManager {
  private refManager: RefManager;

  public static readonly BRANCH_DIR_NAME = 'heads' as const;
  public static readonly HEAD_FILE = 'HEAD' as const;
  public static readonly HEAD_FILE_PREFIX = 'ref: refs/heads/' as const;

  constructor(refManager: RefManager) {
    this.refManager = refManager;
  }

  /**
   * Initialize the branch manager
   */
  public async init() {
    await this.refManager.init();
    await FileUtils.createDirectories(
      path.join(this.refManager.getRefsPath(), BranchManager.BRANCH_DIR_NAME)
    );
  }

  /**
   * Get detailed information about a branch
   */
  public async getBranch(branchName: string): Promise<BranchInfo> {
    try {
      const sha = await this.refManager.resolveReferenceToSha(this.toBranchRefPath(branchName));

      const currentBranch = await this.getCurrentBranch();
      const isCurrentBranch = currentBranch === branchName;

      return {
        name: branchName,
        sha,
        isCurrentBranch,
      };
    } catch {
      throw new Error(`Branch ${branchName} not found`);
    }
  }

  /**
   * Create a new branch with advanced options
   */
  public async createBranch(branchName: string, startPoint?: string): Promise<void> {
    if (!this.isValidBranchName(branchName)) {
      throw new Error(`Invalid branch name: ${branchName}`);
    }

    const branchPath = this.toBranchRefPath(branchName);
    if (await this.refManager.exists(branchPath)) {
      throw new Error(`Branch ${branchName} already exists`);
    }

    try {
      const sha = startPoint
        ? await this.refManager.resolveReferenceToSha(startPoint)
        : await this.refManager.resolveReferenceToSha(BranchManager.HEAD_FILE);

      await this.refManager.updateRef(branchPath, sha);
    } catch (error) {
      throw new Error(`Error creating branch ${branchName}: ${error}`);
    }
  }

  /**
   * List all branch names
   */
  public async listBranches(): Promise<string[]> {
    const branchDirName = BranchManager.BRANCH_DIR_NAME;
    if (!(await this.refManager.exists(branchDirName))) {
      throw new Error(`Branches directory ${branchDirName} not found`);
    }

    try {
      const branches = await fs.readdir(path.join(this.refManager.getRefsPath(), branchDirName));
      return branches.filter((name) => !name.startsWith('.'));
    } catch (error) {
      throw new Error(`Error listing branches: ${error}`);
    }
  }

  /**
   * Switch to a branch (checkout)
   */
  public async switchToBranch(branchName: string): Promise<void> {
    const branch = await this.getBranch(branchName);
    if (!branch) {
      throw new Error(`Branch '${branchName}' does not exist`);
    }
    await this.refManager.updateRef(BranchManager.HEAD_FILE, `ref: refs/heads/${branchName}`);
  }

  /**
   * Delete a branch
   */
  public async deleteBranch(branchName: string): Promise<void> {
    const currentBranch = await this.getCurrentBranch();
    if (currentBranch === branchName) {
      throw new Error(`Cannot delete branch ${branchName}: currently checked out`);
    }

    const branchPath = this.toBranchRefPath(branchName);
    const exists = await this.refManager.deleteRef(branchPath);

    if (!exists) {
      throw new Error(`Branch ${branchName} does not exist`);
    }
  }

  /**
   * Get the current branch name
   */
  public async getCurrentBranch(): Promise<string> {
    const headContent = await this.refManager.readRef(BranchManager.HEAD_FILE);

    if (!headContent) {
      throw new Error('HEAD file not found');
    }

    const prefix = BranchManager.HEAD_FILE_PREFIX;
    if (headContent.startsWith(prefix)) {
      return headContent.substring(prefix.length);
    }

    throw new Error('HEAD file is not a symbolic ref');
  }

  /**
   * Get the Relative path for a branch reference
   */
  private toBranchRefPath(branchName: string): string {
    return path.join(BranchManager.BRANCH_DIR_NAME, branchName);
  }

  /**
   * Validate branch name
   */
  private isValidBranchName(name: string): boolean {
    if (!name || name.length === 0) return false;
    if (name === BranchManager.HEAD_FILE) return false;
    if (name.startsWith('.') || name.endsWith('.') || name.endsWith('/')) return false;
    if (name.includes('..') || name.includes('//')) return false;
    if (/[\x00-\x1f\x7f ~^:?*\[]/.test(name)) return false;

    return true;
  }
}

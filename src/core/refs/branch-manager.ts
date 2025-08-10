import { RefManager } from './ref-manager';
import { FileUtils } from '@/utils';
import fs from 'fs-extra';
import { posix } from 'path';

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
  private headPath: string;

  public static readonly BRANCH_DIR_NAME = 'heads' as const;
  public static readonly HEAD_FILE = 'HEAD' as const;
  private static readonly HEAD_FILE_PREFIX = 'ref: refs/heads/' as const;

  constructor(refManager: RefManager) {
    this.refManager = refManager;
    this.headPath = posix.join(this.refManager.getRefsPath(), BranchManager.HEAD_FILE);
  }

  /**
   * Initialize the branch manager
   */
  public async init() {
    await FileUtils.createDirectories(this.branchPath);
    await fs.writeFile(this.headPath, 'ref: refs/heads/master\n', 'utf8');
  }

  /**
   * Get detailed information about a branch
   */
  public async getBranch(branchName: string): Promise<BranchInfo> {
    try {
      const sha = await this.refManager.resolveReferenceToSha(this.branchNamePath(branchName));

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

    const branchPath = this.branchNamePath(branchName);
    if (await FileUtils.exists(branchPath)) {
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
    if (!(await FileUtils.exists(this.branchPath))) {
      throw new Error(`Branches directory ${this.branchPath} not found`);
    }

    try {
      const branches = await fs.readdir(this.branchPath);
      return branches.filter((name) => !name.startsWith('.'));
    } catch (error) {
      throw new Error(`Error listing branches: ${error}`);
    }
  }

  /**
   * Delete a branch
   */
  public async deleteBranch(branchName: string): Promise<void> {
    const currentBranch = await this.getCurrentBranch();
    if (currentBranch === branchName) {
      throw new Error(`Cannot delete branch ${branchName}: currently checked out`);
    }

    const branchPath = this.branchNamePath(branchName);
    const exists = await this.refManager.deleteRef(branchPath);

    if (!exists) {
      throw new Error(`Branch ${branchName} does not exist`);
    }
  }

  /**
   * Get the current branch name
   */
  public async getCurrentBranch(): Promise<string> {
    const headContent = await this.refManager.readRef(this.headPath);

    if (!headContent) {
      throw new Error('HEAD file not found');
    }

    const prefix = BranchManager.HEAD_FILE_PREFIX;
    if (headContent.startsWith(prefix)) {
      return headContent.substring(prefix.length);
    }

    throw new Error('HEAD file is not a symbolic ref');
  }

  public get branchPath(): string {
    return posix.join(this.refManager.getRefsPath(), BranchManager.BRANCH_DIR_NAME);
  }

  /**
   * Get the full path for a branch reference
   */
  private branchNamePath(branchName: string): string {
    return posix.join(this.branchPath, branchName);
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

import { RefManager } from '@/core/refs';
import { Repository } from '@/core/repo';
import { CommitObject, ObjectType } from '@/core/objects';
import fs from 'fs-extra';
import path from 'path';
import { FileUtils, logger } from '@/utils';
import { BranchInfo, CreateBranchOptions, CheckoutOptions } from './types';

/**
 * Enhanced BranchManager for comprehensive branch operations
 *
 * This manager handles:
 * - Branch creation, deletion, and renaming
 * - Branch switching (checkout)
 * - Branch listing with detailed information
 * - HEAD management (attached/detached states)
 * - Branch tracking and comparison
 */
export class BranchManager {
  private refManager: RefManager;
  private repository: Repository;

  public static readonly BRANCH_DIR_NAME = 'heads' as const;
  public static readonly HEAD_FILE = 'HEAD' as const;
  public static readonly HEAD_PREFIX = 'ref: refs/heads/' as const;
  public static readonly REFS_PREFIX = 'refs/' as const;
  public static readonly DEFAULT_BRANCH = 'master' as const;

  constructor(repository: Repository) {
    this.repository = repository;
    this.refManager = new RefManager(repository);
  }

  /**
   * Initialize the branch manager
   */
  public async init(): Promise<void> {
    await this.refManager.init();
    await FileUtils.createDirectories(
      path.join(this.refManager.getRefsPath(), BranchManager.BRANCH_DIR_NAME)
    );
  }

  /**
   * Create a new branch with advanced options
   */
  public async createBranch(
    branchName: string,
    options: CreateBranchOptions = {}
  ): Promise<BranchInfo> {
    // Validate branch name
    if (!this.isValidBranchName(branchName)) {
      throw new Error(`Invalid branch name: ${branchName}`);
    }

    const branchPath = this.toBranchRefPath(branchName);

    // Check if branch exists
    if (!options.force && (await this.refManager.exists(branchPath))) {
      throw new Error(`Branch '${branchName}' already exists`);
    }

    // Determine starting commit
    let startSha: string;
    if (options.startPoint) {
      try {
        // Try to resolve as a reference first (branch/tag)
        startSha = await this.refManager.resolveReferenceToSha(options.startPoint);
      } catch {
        // If not a reference, assume it's a commit SHA
        startSha = options.startPoint;
        // Validate it exists
        const commit = await this.repository.readObject(startSha);
        if (!commit || commit.type() !== ObjectType.COMMIT) {
          throw new Error(`Invalid start point: ${options.startPoint}`);
        }
      }
    } else {
      // Use current HEAD
      try {
        startSha = await this.refManager.resolveReferenceToSha(BranchManager.HEAD_FILE);
      } catch {
        throw new Error('Cannot create branch: no commits yet');
      }
    }

    // Create the branch
    await this.refManager.updateRef(branchPath, startSha);
    logger.info(`Created branch '${branchName}' at ${startSha.substring(0, 7)}`);

    // Set up tracking if specified
    if (options.track) {
      await this.setUpstream(branchName, options.track);
    }

    // Checkout if requested
    if (options.checkout) {
      await this.checkout(branchName);
    }

    return await this.getBranch(branchName);
  }

  /**
   * Switch to a branch or commit (checkout)
   */
  public async checkout(target: string, options: CheckoutOptions = {}): Promise<void> {
    // Create branch if requested
    if (options.create) {
      await this.createBranch(target, { checkout: false });
    }

    // Check if target is a branch
    const branchPath = this.toBranchRefPath(target);
    const isBranch = await this.refManager.exists(branchPath);

    if (isBranch && !options.detach) {
      // Checkout branch (attached HEAD)
      await this.refManager.updateRef(
        BranchManager.HEAD_FILE,
        `${BranchManager.HEAD_PREFIX}${target}`
      );
      logger.info(`Switched to branch '${target}'`);
    } else {
      // Checkout commit (detached HEAD)
      let commitSha: string;
      try {
        commitSha = await this.refManager.resolveReferenceToSha(target);
      } catch {
        // Assume it's a direct SHA
        commitSha = target;
      }

      // Validate commit exists
      const commit = await this.repository.readObject(commitSha);
      if (!commit || commit.type() !== ObjectType.COMMIT) {
        throw new Error(`Invalid commit: ${target}`);
      }

      // Update HEAD to point directly to commit
      await this.refManager.updateRef(BranchManager.HEAD_FILE, commitSha);
      logger.info(`HEAD is now at ${commitSha.substring(0, 7)}`);
      logger.warn('You are in detached HEAD state');
    }

    // TODO: Update working directory to match the target commit's tree
    // This would involve reading the commit's tree and updating files
    // For now, we just update HEAD
  }

  /**
   * Delete a branch
   */
  public async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    // Cannot delete current branch
    const currentBranch = await this.getCurrentBranch();
    if (currentBranch === branchName) {
      throw new Error(`Cannot delete branch '${branchName}': currently checked out`);
    }

    const branchPath = this.toBranchRefPath(branchName);

    // Check if branch exists
    if (!(await this.refManager.exists(branchPath))) {
      throw new Error(`Branch '${branchName}' not found`);
    }

    // Check if branch is fully merged (unless force)
    if (!force) {
      const isFullyMerged = await this.isBranchFullyMerged(branchName);
      if (!isFullyMerged) {
        throw new Error(
          `Branch '${branchName}' is not fully merged.\n` + `Use --force to delete it anyway.`
        );
      }
    }

    // Delete the branch
    await this.refManager.deleteRef(branchPath);
    logger.info(`Deleted branch ${branchName}`);
  }

  /**
   * Rename a branch
   */
  public async renameBranch(
    oldName: string,
    newName: string,
    force: boolean = false
  ): Promise<void> {
    if (!this.isValidBranchName(newName)) {
      throw new Error(`Invalid branch name: ${newName}`);
    }

    const oldPath = this.toBranchRefPath(oldName);
    if (!(await this.refManager.exists(oldPath))) {
      throw new Error(`Branch '${oldName}' not found`);
    }

    const newPath = this.toBranchRefPath(newName);
    if (!force && (await this.refManager.exists(newPath))) {
      throw new Error(`Branch '${newName}' already exists`);
    }

    const sha = await this.refManager.resolveReferenceToSha(oldPath);

    await this.refManager.updateRef(newPath, sha);

    const currentBranch = await this.getCurrentBranch();
    if (currentBranch === oldName) {
      await this.refManager.updateRef(
        BranchManager.HEAD_FILE,
        `${BranchManager.HEAD_PREFIX}${newName}`
      );
    }

    // Delete old branch
    await this.refManager.deleteRef(oldPath);

    logger.info(`Branch '${oldName}' renamed to '${newName}'`);
  }

  /**
   * Get detailed information about a branch
   */
  public async getBranch(branchName: string): Promise<BranchInfo> {
    const branchPath = this.toBranchRefPath(branchName);

    if (!(await this.refManager.exists(branchPath))) {
      throw new Error(`Branch '${branchName}' not found`);
    }

    const sha = await this.refManager.resolveReferenceToSha(branchPath);
    const currentBranch = await this.getCurrentBranch();
    const isCurrentBranch = currentBranch === branchName;

    // Get commit details
    const commit = await this.repository.readObject(sha);
    let lastCommitMessage: string | undefined;
    let lastCommitDate: Date | undefined;

    if (commit && commit.type() === ObjectType.COMMIT) {
      const commitObj = commit as CommitObject;
      lastCommitMessage = commitObj.message?.split('\n')[0];
      if (commitObj.author) {
        lastCommitDate = new Date(commitObj.author.timestamp * 1000);
      }
    }

    // Count commits in branch
    const commitCount = await this.countCommits(sha);

    const result: BranchInfo = {
      name: branchName,
      sha,
      isCurrentBranch,
      commitCount,
      ...(lastCommitDate ? { lastCommitDate } : {}),
      ...(lastCommitMessage ? { lastCommitMessage } : {}),
    };

    return result;
  }

  /**
   * List all branches with optional filtering
   */
  public async listBranches(
    options: {
      all?: boolean; // include remote branches
      verbose?: boolean; // include detailed info
      merged?: string; // only branches merged into target
      noMerged?: string; // only branches not merged into target
    } = {}
  ): Promise<BranchInfo[]> {
    const branchDir = path.join(this.refManager.getRefsPath(), BranchManager.BRANCH_DIR_NAME);

    if (!(await FileUtils.exists(branchDir))) {
      return [];
    }

    const branchNames = await fs.readdir(branchDir);
    const branches: BranchInfo[] = [];

    for (const name of branchNames) {
      if (name.startsWith('.')) continue;

      try {
        const info = await this.getBranch(name);

        // Apply filters
        if (options.merged && !(await this.isMergedInto(name, options.merged))) {
          continue;
        }

        if (options.noMerged && (await this.isMergedInto(name, options.noMerged))) {
          continue;
        }

        branches.push(info);
      } catch (error) {
        logger.warn(`Failed to get info for branch '${name}':`, error);
      }
    }

    // Sort by name, with current branch first
    branches.sort((a, b) => {
      if (a.isCurrentBranch) return -1;
      if (b.isCurrentBranch) return 1;
      return a.name.localeCompare(b.name);
    });

    return branches;
  }

  /**
   * Get the current branch name or null if HEAD is detached
   */
  public async getCurrentBranch(): Promise<string | null> {
    const headContent = await this.refManager.readRef(BranchManager.HEAD_FILE);

    if (!headContent) {
      return null;
    }

    // Check if HEAD points to a branch
    if (headContent.startsWith(BranchManager.HEAD_PREFIX)) {
      return headContent.substring(BranchManager.HEAD_PREFIX.length);
    }

    // HEAD is detached
    return null;
  }

  /**
   * Check if HEAD is detached
   */
  public async isDetached(): Promise<boolean> {
    const branch = await this.getCurrentBranch();
    return branch === null;
  }

  /**
   * Get the current HEAD commit SHA
   */
  public async getCurrentCommit(): Promise<string> {
    return await this.refManager.resolveReferenceToSha(BranchManager.HEAD_FILE);
  }

  /**
   * Set the upstream (tracking) branch
   */
  public async setUpstream(localBranch: string, remoteBranch: string): Promise<void> {
    // This would typically update the config file
    // For now, we'll just log it
    logger.info(`Branch '${localBranch}' set up to track '${remoteBranch}'`);
  }

  /**
   * Count commits reachable from a given SHA
   */
  private async countCommits(startSha: string): Promise<number> {
    const visited = new Set<string>();
    const queue = [startSha];

    while (queue.length > 0) {
      const sha = queue.shift()!;
      if (visited.has(sha)) continue;
      visited.add(sha);

      const commit = await this.repository.readObject(sha);
      if (commit && commit.type() === ObjectType.COMMIT) {
        const commitObj = commit as CommitObject;
        queue.push(...commitObj.parentShas);
      }
    }

    return visited.size;
  }

  /**
   * Check if a branch is fully merged into HEAD
   */
  private async isBranchFullyMerged(branchName: string): Promise<boolean> {
    // For now, we'll implement a simple check
    // In a real implementation, this would check if all commits
    // from the branch are reachable from HEAD
    try {
      const branchSha = await this.refManager.resolveReferenceToSha(
        this.toBranchRefPath(branchName)
      );
      const headSha = await this.getCurrentCommit();

      // If they're the same, it's merged
      if (branchSha === headSha) return true;

      // TODO: Implement proper reachability check
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if source branch is merged into target
   */
  private async isMergedInto(source: string, target: string): Promise<boolean> {
    // TODO: Implement proper merge checking
    logger.warn(`Not implemented: isMergedInto ${source} into ${target}`);
    return false;
  }

  /**
   * Get the relative path for a branch reference
   */
  private toBranchRefPath(branchName: string): string {
    return path.join(BranchManager.BRANCH_DIR_NAME, branchName);
  }

  /**
   * Validate branch name according to Git rules
   */
  private isValidBranchName(name: string): boolean {
    if (!name || name.length === 0) return false;
    if (name === BranchManager.HEAD_FILE) return false;
    if (name.startsWith('.') || name.endsWith('.')) return false;
    if (name.endsWith('/')) return false;
    if (name.includes('..') || name.includes('//')) return false;
    if (name.includes('@{') || name.includes('\\')) return false;
    if (/[\x00-\x1f\x7f ~^:?*\[]/.test(name)) return false;

    return true;
  }
}

import path from 'path';
import fs from 'fs-extra';

import { Repository } from '@/core/repo';
import { ObjectValidator } from '@/core/objects';
import { FileUtils, Queue } from '@/utils';
import { BranchRefService } from './branch-ref';
import { BranchInfo } from '../types';
import { RefManager } from '@/core/refs';

/**
 * BranchInfoService is a service for getting detailed information about a branch.
 */
export class BranchInfoService {
  constructor(
    private repository: Repository,
    private refManager: RefManager,
    private refService: BranchRefService
  ) {}

  /**
   * Lists all branches with detailed information
   */
  public async listBranches(): Promise<BranchInfo[]> {
    const branchDir = path.join(this.refManager.getRefsPath(), BranchRefService.BRANCH_DIR_NAME);

    if (!(await FileUtils.exists(branchDir))) {
      return [];
    }

    const branchNames = await fs.readdir(branchDir);
    const branches: BranchInfo[] = [];

    for (const name of branchNames) {
      if (name.startsWith('.')) continue;

      try {
        const info = await this.getBranchInfo(name);
        branches.push(info);
      } catch (error) {
        // Skip invalid branches
      }
    }

    return branches.sort((a, b) => {
      if (a.isCurrentBranch) return -1;
      if (b.isCurrentBranch) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Gets detailed information about a branch
   */
  public async getBranchInfo(branchName: string): Promise<BranchInfo> {
    const sha = await this.refService.getBranchSha(branchName);
    const currentBranch = await this.refService.getCurrentBranch();
    const isCurrentBranch = currentBranch === branchName;

    const commitDetails = await this.getCommitDetails(sha);
    const commitCount = await this.countCommits(sha);

    return {
      name: branchName,
      sha,
      isCurrentBranch,
      ...commitDetails,
      commitCount,
    };
  }

  /**
   * Gets commit details for display
   */
  private async getCommitDetails(sha: string): Promise<{
    lastCommitMessage?: string;
    lastCommitDate?: Date;
  }> {
    try {
      const commit = await this.repository.readObject(sha);
      if (!ObjectValidator.isCommit(commit)) {
        return {};
      }

      const details: { lastCommitMessage?: string; lastCommitDate?: Date } = {};
      const msg = commit.message?.split('\n')[0];
      if (msg !== undefined) details.lastCommitMessage = msg;
      if (commit.author) details.lastCommitDate = new Date(commit.author.timestamp * 1000);
      return details;
    } catch {
      return {};
    }
  }

  /**
   * Counts commits reachable from a SHA
   */
  private async countCommits(startSha: string): Promise<number> {
    const visited = new Set<string>();
    const queue = new Queue([startSha]);

    while (queue.length > 0) {
      const sha = queue.shift()!;
      if (visited.has(sha)) continue;

      visited.add(sha);

      try {
        const commit = await this.repository.readObject(sha);
        if (ObjectValidator.isCommit(commit)) {
          queue.push(...commit.parentShas);
        }
      } catch {
        continue;
      }
    }

    return visited.size;
  }
}

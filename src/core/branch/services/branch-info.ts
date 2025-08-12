import { Repository } from '@/core/repo';
import { ObjectValidator } from '@/core/objects';
import { BranchRefService } from './branch-ref';
import { BranchInfo } from '../types';
export class BranchInfoService {
  constructor(
    private repository: Repository,
    private refService: BranchRefService
  ) {}

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
    const queue = [startSha];

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

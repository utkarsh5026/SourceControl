import { Repository } from '@/core/repo';
import { BranchRefService } from './branch-ref';
import { BranchInfoService } from './branch-info';
import { BranchValidator } from './branch-validator';
import { BranchInfo, CreateBranchOptions } from '../types';
import { logger } from '@/utils';
import { ObjectValidator } from '@/core/objects';

/**
 * BranchCreator is a service for creating new branches.
 */
export class BranchCreator {
  constructor(
    private repository: Repository,
    private refService: BranchRefService,
    private infoService: BranchInfoService
  ) {}

  /**
   * Creates a new branch with the specified options
   */
  public async createBranch(
    branchName: string,
    options: CreateBranchOptions = {}
  ): Promise<BranchInfo> {
    BranchValidator.validateAndThrow(branchName);

    if (!options.force && (await this.refService.exists(branchName))) {
      throw new Error(`Branch '${branchName}' already exists`);
    }

    const startSha = await this.resolveStartPoint(options.startPoint);
    await this.refService.updateBranch(branchName, startSha);
    logger.info(`Created branch '${branchName}' at ${startSha.substring(0, 7)}`);

    if (options.track) {
      await this.setUpstream(branchName, options.track);
    }

    return await this.infoService.getBranchInfo(branchName);
  }

  /**
   * Resolves the start point for the new branch
   * If no start point is provided, uses the current branch
   */
  private async resolveStartPoint(startPoint: string | undefined): Promise<string> {
    if (!startPoint) {
      try {
        const currentBranch = await this.refService.getCurrentBranch();
        if (!currentBranch) {
          throw new Error('Cannot create branch: no commits yet');
        }
        return await this.refService.getBranchSha(currentBranch);
      } catch {
        throw new Error('Cannot create branch: no commits yet');
      }
    }

    try {
      return await this.refService.getBranchSha(startPoint);
    } catch {
      const commit = await this.repository.readObject(startPoint);
      if (!ObjectValidator.isCommit(commit)) {
        throw new Error(`Invalid start point: ${startPoint}`);
      }
      return startPoint;
    }
  }

  /**
   * Sets up upstream tracking (placeholder for now)
   */
  private async setUpstream(localBranch: string, remoteBranch: string): Promise<void> {
    logger.info(`Branch '${localBranch}' set up to track '${remoteBranch}'`);
    // TODO: Implement config-based upstream tracking
  }
}

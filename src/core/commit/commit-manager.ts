import path from 'path';
import { GitConfigManager } from '@/core/config/config-manager';
import { Repository } from '@/core/repo';
import { RefManager, BranchManager } from '@/core/refs';
import { TreeBuilder } from '@/core/tree';
import { TypedConfig } from '@/core/config';
import { CommitOptions, CommitResult } from './types';
import { GitIndex } from '@/core/index';
import { CommitObject, ObjectType, CommitPerson } from '@/core/objects/';
import { logger } from '@/utils/cli/logger';

/**
 * CommitManager handles the creation and management of Git commits.
 *
 * The commit creation process:
 * 1. Read the index to get staged changes
 * 2. Build a tree object from the index
 * 3. Get the current HEAD commit (parent)
 * 4. Create a new commit object
 * 5. Update the current branch reference
 *
 * This class ensures that commits are properly linked in the Git DAG (Directed Acyclic Graph)
 * and that references are updated atomically.
 */
export class CommitManager {
  private repository: Repository;
  private treeBuilder: TreeBuilder;
  private refManager: RefManager;
  private branchManager: BranchManager;
  private configManager: GitConfigManager;
  private config: TypedConfig;

  constructor(repository: Repository) {
    this.repository = repository;
    this.treeBuilder = new TreeBuilder(repository);
    this.refManager = new RefManager(repository);
    this.branchManager = new BranchManager(this.refManager);
    this.configManager = new GitConfigManager(repository);
    this.config = new TypedConfig(this.configManager);
  }

  /**
   * Initialize the commit manager
   */
  public async initialize(): Promise<void> {
    await Promise.all([
      this.configManager.load(),
      this.refManager.init(),
      this.branchManager.init(),
    ]);
  }

  /**
   * Create a new commit from the current index
   */
  public async createCommit(options: CommitOptions): Promise<CommitResult> {
    if (!options.message || options.message.trim().length === 0) {
      throw new Error('Commit message cannot be empty');
    }

    const indexPath = path.join(this.repository.gitDirectory().fullpath(), 'index');
    const index = await GitIndex.read(indexPath);

    if (index.entries.length === 0 && !options.allowEmpty) {
      throw new Error('No changes staged for commit');
    }

    const treeSha = await this.treeBuilder.buildTreeFromIndex(index);
    const parentShas = await this.getParentCommits(options.amend);

    if (!options.allowEmpty && parentShas.length > 0) {
      const parentCommit = await this.repository.readObject(parentShas[0]!);
      if (parentCommit && parentCommit.type() === ObjectType.COMMIT) {
        const parent = parentCommit as CommitObject;
        if (parent.treeSha === treeSha)
          throw new Error('No changes to commit (tree is identical to parent)');
      }
    }

    const author = options.author || (await this.getCurrentUser());
    const committer = options.committer || author;

    const commit = new CommitObject({
      treeSha,
      parentShas,
      author,
      committer,
      message: options.message,
    });
    const commitSha = await this.repository.writeObject(commit);
    await this.updateCurrentRef(commitSha);

    return {
      sha: commitSha,
      treeSha,
      parentShas,
      message: commit.message!,
      author,
      committer,
    };
  }

  /**
   * Get commit information
   */
  public async getCommit(sha: string): Promise<CommitResult | null> {
    const commitObject = await this.repository.readObject(sha);

    if (!commitObject || commitObject.type() !== ObjectType.COMMIT) {
      return null;
    }

    const commit = commitObject as CommitObject;

    return {
      sha: await commit.sha(),
      treeSha: commit.treeSha!,
      parentShas: commit.parentShas,
      message: commit.message!,
      author: commit.author!,
      committer: commit.committer!,
    };
  }

  /**
   * Get the commit history starting from a given commit
   */
  public async getHistory(startSha?: string, limit: number = 50): Promise<CommitResult[]> {
    const history: CommitResult[] = [];
    const visited = new Set<string>();

    let currentSha: string;
    try {
      currentSha = startSha || (await this.refManager.resolveReferenceToSha(RefManager.HEAD_FILE));
    } catch (error) {
      return [];
    }

    const queue: string[] = [currentSha];

    while (queue.length > 0 && history.length < limit) {
      const sha = queue.shift()!;

      if (visited.has(sha)) continue;

      visited.add(sha);

      const commit = await this.getCommit(sha);
      if (!commit) continue;

      history.push(commit);
      commit.parentShas?.forEach((parentSha) => {
        if (!visited.has(parentSha)) queue.push(parentSha);
      });
    }

    return history;
  }

  /**
   * Get the parent commits for a new commit
   */
  private async getParentCommits(amend?: boolean): Promise<string[]> {
    try {
      const headSha = await this.refManager.resolveReferenceToSha(RefManager.HEAD_FILE);

      if (amend) {
        const headCommit = await this.repository.readObject(headSha);
        if (headCommit && headCommit.type() === ObjectType.COMMIT) {
          return (headCommit as CommitObject).parentShas;
        }
      }

      return [headSha];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get the current user information from config
   */
  private async getCurrentUser(): Promise<CommitPerson> {
    const name = this.config.userName || process.env['GIT_AUTHOR_NAME'] || 'Unknown User';
    const email = this.config.userEmail || process.env['GIT_AUTHOR_EMAIL'] || 'unknown@example.com';

    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    const timezoneOffset = now.getTimezoneOffset() * -60;

    return new CommitPerson(name, email, timestamp, timezoneOffset.toString());
  }

  /**
   * Update the current branch reference or HEAD
   */
  private async updateCurrentRef(commitSha: string): Promise<void> {
    try {
      const currentBranch = await this.branchManager.getCurrentBranch();
      await this.refManager.updateRef(`heads/${currentBranch}`, commitSha);

      logger.debug(`Updated branch ${currentBranch} to ${commitSha}`);
    } catch (error) {
      const defaultBranch = this.config.defaultBranch || BranchManager.DEFAULT_BRANCH;

      await this.refManager.updateRef(`heads/${defaultBranch}`, commitSha);
      await this.refManager.updateRef('HEAD', `ref: refs/heads/${defaultBranch}`);

      logger.debug(`Created initial branch ${defaultBranch} at ${commitSha}`);
    }
  }
}

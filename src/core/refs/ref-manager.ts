import { Repository } from '@/core/repo';
import { FileUtils } from '@/utils';
import path from 'path';
import fs from 'fs-extra';

/**
 * RefManager handles Git references (refs) - the human-readable names for commits.
 *
 * Git References Overview:
 * - Refs are pointers to commits (SHA-1 hashes)
 * - Stored as simple text files containing commit SHAs
 * - Located in .git/refs/ directory
 *
 * Reference Types:
 * 1. **HEAD**: Points to the current branch or commit
 * 2. **Branches**: refs/heads/<branch-name>
 * 3. **Tags**: refs/tags/<tag-name>
 * 4. **Remote branches**: refs/remotes/<remote>/<branch>
 *
 * Reference Resolution:
 * - Symbolic refs: "ref: refs/heads/master" (HEAD pointing to a branch)
 * - Direct refs: "abc123..." (direct SHA-1 hash)
 *
 * File Structure:
 * .git/
 * ├── HEAD                    # Current branch/commit
 * ├── refs/
 * │   ├── heads/             # Local branches
 * │   │   ├── master         # Contains SHA of master's tip
 * │   │   └── feature-x      # Contains SHA of feature-x's tip
 * │   └── tags/              # Tags
 * │       └── v1.0.0         # Contains SHA of tagged commit
 */
export class RefManager {
  private repository: Repository;
  private refsPath: string;
  private headPath: string;

  private static readonly HEAD_REF = 'HEAD';
  private static readonly REF_PREFIX = 'refs';

  constructor(repository: Repository) {
    this.repository = repository;
    const gitDir = repository.gitDirectory().fullpath();
    this.refsPath = path.join(gitDir, RefManager.REF_PREFIX);
    this.headPath = path.join(gitDir, RefManager.HEAD_REF);
  }

  /**
   * Read a reference and return its content
   */
  public async readRef(refPath: string): Promise<string | null> {
    const fullPath = this.getRefPath(refPath);

    if (!(await FileUtils.exists(fullPath))) {
      return null;
    }

    try {
      const content = await fs.readFile(fullPath, 'utf8');
      return content.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Update a reference with a new SHA-1 hash
   */
  public async updateRef(refPath: string, sha: string): Promise<void> {
    const fullPath = this.getRefPath(refPath);
    await FileUtils.createDirectories(path.dirname(fullPath));
    await fs.writeFile(fullPath, sha + '\n', 'utf8');
  }

  /**
   * Resolve a reference to its final SHA-1 hash
   */
  public async resolveRef(refPath: string): Promise<string | null> {
    const maxDepth = 10;
    let currentRef = refPath;

    for (let depth = 0; depth < maxDepth; depth++) {
      const content = await this.readRef(currentRef);

      if (!content) {
        return null;
      }

      if (content.startsWith('ref: ')) {
        currentRef = content.substring(5);
        continue;
      }

      if (this.isValidSha(content)) {
        return content;
      }

      return null;
    }

    throw new Error(`Reference depth exceeded for ${refPath}`);
  }

  /**
   * Initialize default references for a new repository
   */
  public async initializeRefs(): Promise<void> {
    await FileUtils.createDirectories(path.join(this.refsPath, 'heads'));
    await FileUtils.createDirectories(path.join(this.refsPath, 'tags'));

    await fs.writeFile(this.headPath, 'ref: refs/heads/master\n', 'utf8');
  }

  /**
   * Delete a reference
   */
  public async deleteRef(refPath: string): Promise<boolean> {
    const fullPath = this.getRefPath(refPath);

    if (!(await FileUtils.exists(fullPath))) {
      return false;
    }

    try {
      await fs.unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current branch name
   */
  public async getCurrentBranch(): Promise<string | null> {
    const headContent = await this.readRef(RefManager.HEAD_REF);

    if (!headContent) {
      return null;
    }

    if (headContent.startsWith('ref: refs/heads/')) {
      return headContent.substring(16);
    }

    return null;
  }

  /**
   * List all branch names
   */
  public async listBranches(): Promise<string[]> {
    const headsPath = path.join(this.refsPath, 'heads');

    if (!(await FileUtils.exists(headsPath))) {
      return [];
    }

    try {
      const branches = await fs.readdir(headsPath);
      return branches.filter((name) => !name.startsWith('.'));
    } catch {
      return [];
    }
  }

  /**
   * Create a new branch
   */
  public async createBranch(branchName: string, startPoint?: string): Promise<void> {
    if (!this.isValidBranchName(branchName)) {
      throw new Error(`Invalid branch name: ${branchName}`);
    }

    const refPath = this.refPath(branchName);
    if (await this.readRef(refPath)) {
      throw new Error(`Branch ${branchName} already exists`);
    }

    let sha: string;
    if (startPoint) {
      sha = (await this.resolveRef(startPoint)) || startPoint;
    } else {
      const head = await this.resolveRef(RefManager.HEAD_REF);
      if (!head) {
        throw new Error('Cannot create branch: no commits yet');
      }
      sha = head;
    }

    await this.updateRef(refPath, sha);
  }

  /**
   * Delete a branch
   */
  public async deleteBranch(branchName: string): Promise<void> {
    const currentBranch = await this.getCurrentBranch();
    if (currentBranch === branchName) {
      throw new Error(`Cannot delete branch ${branchName}: currently checked out`);
    }

    const refPath = this.refPath(branchName);
    const exists = await this.deleteRef(refPath);

    if (!exists) {
      throw new Error(`Branch ${branchName} does not exist`);
    }
  }

  /**
   * Get the full path for a reference
   */
  private getRefPath(refPath: string): string {
    if (refPath === RefManager.HEAD_REF) {
      return this.headPath;
    }

    if (refPath.startsWith(`${RefManager.REF_PREFIX}/`)) {
      return path.join(this.repository.gitDirectory().fullpath(), refPath);
    }

    return path.join(this.refsPath, 'heads', refPath);
  }

  /**
   * Check if a string is a valid SHA-1 hash
   */
  private isValidSha(str: string): boolean {
    return /^[0-9a-f]{40}$/i.test(str);
  }

  /**
   * Validate branch name
   */
  private isValidBranchName(name: string): boolean {
    if (!name || name.length === 0) return false;
    if (name === RefManager.HEAD_REF) return false;
    if (name.startsWith('.') || name.endsWith('.') || name.endsWith('/')) return false;
    if (name.includes('..') || name.includes('//')) return false;
    if (/[\x00-\x1f\x7f ~^:?*\[]/.test(name)) return false;

    return true;
  }

  /**
   * Get the full path for a branch reference
   */
  private refPath(branchName: string): string {
    return path.join(RefManager.REF_PREFIX, 'heads', branchName);
  }
}

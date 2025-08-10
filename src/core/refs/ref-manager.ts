import { Repository } from '@/core/repo';
import { FileUtils, logger } from '@/utils';
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
  private refsPath: string;
  private headPath: string;

  public static readonly REFS_DIRNAME = 'refs' as const;
  public static readonly SYMBOLIC_REF_PREFIX = 'ref: ' as const;
  public static readonly HEAD_FILE = 'HEAD' as const;

  constructor(repository: Repository) {
    const gitDir = repository.gitDirectory().fullpath();
    this.refsPath = path.join(gitDir, RefManager.REFS_DIRNAME);
    this.headPath = path.join(gitDir, RefManager.HEAD_FILE);
  }

  /**
   * Get the full path for the refs directory
   */
  public getRefsPath(): string {
    return this.refsPath;
  }

  /**
   * Initialize the ref manager
   */
  public async init() {
    await FileUtils.createDirectories(this.refsPath);
    await fs.writeFile(this.headPath, 'ref: refs/heads/master\n', 'utf8');
  }

  /**
   * Read a reference and return its content
   */
  public async readRef(ref: string): Promise<string> {
    try {
      const fullPath = this.resolveReferencePath(ref);

      if (!(await FileUtils.exists(fullPath))) {
        throw new Error(`Ref ${ref} not found`);
      }

      const content = await fs.readFile(fullPath, 'utf8');
      return content.trim();
    } catch (error) {
      throw new Error(`Error reading ref ${ref}: ${error}`);
    }
  }

  /**
   * Update a reference with a new SHA-1 hash
   */
  public async updateRef(refPath: string, sha: string): Promise<void> {
    const fullPath = this.resolveReferencePath(refPath);
    await FileUtils.createDirectories(path.dirname(fullPath));
    await fs.writeFile(fullPath, sha + '\n', 'utf8');
    logger.info(`Updated ref ${refPath} to ${sha}`);
  }

  /**
   * Resolve a reference to its final SHA-1 hash
   */
  public async resolveReferenceToSha(refPath: string): Promise<string> {
    const maxDepth = 10;
    let currentRef = refPath;

    for (let depth = 0; depth < maxDepth; depth++) {
      let content: string;
      try {
        content = await this.readRef(currentRef);
      } catch (error) {
        throw new Error(`Error reading ref ${currentRef}: ${error}`);
      }

      if (content.startsWith(RefManager.SYMBOLIC_REF_PREFIX)) {
        currentRef = content.substring(RefManager.SYMBOLIC_REF_PREFIX.length);
        continue;
      }

      if (this.isSha1(content)) return content;
    }

    throw new Error(`Reference depth exceeded for ${refPath}`);
  }

  /**
   * Delete a reference
   */
  public async deleteRef(ref: string): Promise<boolean> {
    const fullPath = this.resolveReferencePath(ref);

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
   * Get the full path for a HEAD reference
   */
  public getHeadPath(): string {
    return this.headPath;
  }

  /**
   * Check if a reference exists
   */
  public async exists(ref: string): Promise<boolean> {
    return await FileUtils.exists(this.resolveReferencePath(ref));
  }

  /**
   * Get the full path for a reference
   */
  private resolveReferencePath(refInput: string): string {
    const ref = refInput.trim();

    if (ref === RefManager.HEAD_FILE) {
      return this.headPath;
    }

    // If ref starts with "refs/", don't duplicate the refs root
    if (ref.startsWith(`${RefManager.REFS_DIRNAME}/`)) {
      return path.join(this.refsPath, ref.slice(RefManager.REFS_DIRNAME.length + 1));
    }

    return path.join(this.refsPath, ref);
  }

  /**
   * Check if a string is a valid SHA-1 hash
   */
  private isSha1(str: string): boolean {
    return /^[0-9a-f]{40}$/i.test(str);
  }
}

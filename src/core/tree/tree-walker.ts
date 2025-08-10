import { Repository } from '@/core/repo';
import { RefManager } from '@/core/refs';
import { CommitObject, ObjectType, TreeObject } from '@/core/objects';
import { logger } from '@/utils';
import path from 'path';

/**
 * TreeWalker handles reading and traversing Git tree objects to extract file information.
 *
 * Git stores directory structures as tree objects, where each tree contains:
 * - Entries for files (pointing to blob objects)
 * - Entries for subdirectories (pointing to other tree objects)
 *
 * This class recursively walks these trees to build a complete map of all files
 * in a commit, which is essential for comparing different states (HEAD vs Index vs Working Directory).
 */
export class TreeWalker {
  private repository: Repository;
  private refManager: RefManager;

  constructor(repository: Repository) {
    this.repository = repository;
    this.refManager = new RefManager(repository);
  }

  /**
   * Get all files from the HEAD commit
   *
   * Process:
   * 1. Resolve HEAD reference to get commit SHA
   * 2. Read the commit object
   * 3. Get the root tree SHA from the commit
   * 4. Recursively walk the tree to collect all files
   */
  public async headFiles(): Promise<Map<string, string>> {
    try {
      const headSha = await this.refManager.resolveReferenceToSha(RefManager.HEAD_FILE);
      return await this.getCommitFiles(headSha);
    } catch (error) {
      throw new Error(`Failed to read HEAD commit: ${error}`);
    }
  }

  /**
   * Get all files from a specific commit
   *
   * @param commitSha - SHA-1 hash of the commit
   * @returns Map of file paths to their SHA-1 hashes
   */
  public async getCommitFiles(commitSha: string): Promise<Map<string, string>> {
    const commitObject = await this.repository.readObject(commitSha);
    if (!commitObject || commitObject.type() !== ObjectType.COMMIT) {
      throw new Error(`Invalid commit: ${commitSha}`);
    }

    const treeSha = (commitObject as CommitObject).treeSha;
    if (!treeSha) {
      throw new Error('Commit has no tree');
    }

    return await this.walkTree(treeSha);
  }

  /**
   * Recursively walk a tree object to collect all files
   *
   * Git trees are recursive structures:
   * - Each tree can contain files (blob entries)
   * - Each tree can contain subdirectories (other tree entries)
   *
   * We need to traverse this structure depth-first to collect all files
   * with their full paths.
   */
  public async walkTree(treeSha: string, basePath: string = ''): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    try {
      const tree = await this.repository.readObject(treeSha);
      if (!tree || tree.type() !== ObjectType.TREE) {
        throw new Error('Failed to read tree object');
      }

      const { entries } = tree as TreeObject;
      await Promise.all(
        entries.map(async (entry) => {
          const fullPath = basePath ? path.join(basePath, entry.name) : entry.name;

          if (entry.isDirectory()) {
            const subFiles = await this.walkTree(entry.sha, fullPath);
            subFiles.forEach((sha, p) => files.set(p, sha));
            return;
          }

          if (entry.isFile()) {
            files.set(fullPath, entry.sha);
          }
        })
      );
    } catch (error) {
      logger.error('Failed to walk tree', error);
    }

    return files;
  }
}

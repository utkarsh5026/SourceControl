import { TreeWalker } from '@/core/tree';
import { StatusResult } from './types';
import { GitIndex } from './git-index';
import { IndexEntry } from './index-entry';
import { FileUtils } from '@/utils';
import { IgnoreManager } from '@/core/ignore';
import { BlobObject } from '@/core/objects';
import path from 'path';
import fs from 'fs-extra';
import { glob } from 'glob';

/**
 * Calculates repository status by comparing working directory, index, and HEAD.
 *
 * Git's "Three Trees":
 * 1. HEAD - Last commit
 * 2. Index - Staged changes (what will be committed)
 * 3. Working Directory - Current file states
 */
export class StatusCalculator {
  constructor(
    private repoRoot: string,
    private treeWalker: TreeWalker,
    private ignoreManager: IgnoreManager
  ) {}

  /**
   * Calculate comprehensive repository status
   */
  async calculateStatus(index: GitIndex): Promise<StatusResult> {
    const status: StatusResult = {
      staged: { added: [], modified: [], deleted: [] },
      unstaged: { modified: [], deleted: [] },
      untracked: [],
      ignored: [],
    };

    const indexFiles = new Set(index.entryNames());
    const headFiles = await this.treeWalker.headFiles();

    this.compareStagedChanges(index, headFiles, status);
    await this.compareUnstagedChanges(index, status);
    await this.findUntrackedFiles(indexFiles, status);

    return status;
  }

  /**
   * Compare HEAD commit with index to find staged changes
   */
  private compareStagedChanges(
    index: GitIndex,
    headFiles: Map<string, string>,
    status: StatusResult
  ): void {
    const findAddedAndModifiedFiles = () => {
      index.entries.forEach(({ filePath, contentHash }) => {
        if (!headFiles.has(filePath)) {
          status.staged.added.push(filePath);
          return;
        }

        const headSha = headFiles.get(filePath)!;
        if (headSha !== contentHash) status.staged.modified.push(filePath);
      });
    };

    const findDeletedFiles = () => {
      headFiles.forEach((_, headPath) => {
        if (!index.hasEntry(headPath)) {
          status.staged.deleted.push(headPath);
        }
      });
    };

    findAddedAndModifiedFiles();
    findDeletedFiles();
  }

  /**
   * Compare index with working directory to find unstaged changes
   */
  private async compareUnstagedChanges(index: GitIndex, status: StatusResult): Promise<void> {
    for (const entry of index.entries) {
      const absolutePath = path.join(this.repoRoot, entry.filePath);

      if (!(await FileUtils.exists(absolutePath))) {
        status.unstaged.deleted.push(entry.filePath);
        continue;
      }

      const isModified = await this.isFileModified(entry, absolutePath);
      if (isModified) {
        status.unstaged.modified.push(entry.filePath);
      }
    }
  }

  /**
   * Check if a file has been modified compared to its index entry
   */
  private async isFileModified(entry: IndexEntry, absolutePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(absolutePath);

      if (entry.fileSize !== stats.size) return true;

      const mtimeSeconds = Math.floor(stats.mtimeMs / 1000);
      if (entry.modificationTime.seconds !== mtimeSeconds) {
        return true;
      }

      if (entry.assumeValid) {
        return false;
      }

      const content = await FileUtils.readFile(absolutePath);
      const blob = new BlobObject(new Uint8Array(content));
      const currentSha = await blob.sha();

      return currentSha !== entry.contentHash;
    } catch (error) {
      return true;
    }
  }

  /**
   * Find untracked and ignored files in working directory
   */
  private async findUntrackedFiles(indexFiles: Set<string>, status: StatusResult): Promise<void> {
    const workingFiles = await this.getAllWorkingFiles();

    workingFiles.forEach((workingFile) => {
      const relativePath = path.relative(this.repoRoot, workingFile).replace(/\\/g, '/');

      if (indexFiles.has(relativePath)) return;

      const isIgnored = this.ignoreManager.isIgnored(relativePath, false);

      if (isIgnored) status.ignored.push(relativePath);
      else status.untracked.push(relativePath);
    });
  }

  /**
   * Get all files in the working directory
   */
  private async getAllWorkingFiles(): Promise<string[]> {
    const pattern = '**/*';
    const files = await glob(pattern, {
      cwd: this.repoRoot,
      nodir: true,
      dot: true,
      ignore: ['.source/**', '**/.sourceignore'],
    });

    return files.map((f) => path.join(this.repoRoot, f));
  }
}

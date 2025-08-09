import path from 'path';
import { glob } from 'glob';
import fs from 'fs-extra';
import { IgnoreManager } from '@/core/ignore';
import { Repository } from '@/core/repo';
import { GitIndex } from './git-index';
import type { StatusResult } from './types';
import { FileUtils } from '@/utils/file';
import { BlobObject } from '@/core/objects/';

/**
 * IndexManager orchestrates all operations between the working directory,
 * the index (staging area), and the repository's object database.
 *
 * Now with full .sourceignore support:
 * - Ignored files are never added to the index
 * - Ignored files don't appear as untracked
 * - Supports hierarchical .sourceignore files
 * - Handles negation patterns
 */
export class IndexManager {
  private repository: Repository;
  private index: GitIndex;
  private indexPath: string;
  private ignoreManager: IgnoreManager;

  private static readonly INDEX_FILE_NAME = 'index';

  constructor(repository: Repository) {
    this.repository = repository;
    this.indexPath = path.join(repository.gitDirectory().fullpath(), IndexManager.INDEX_FILE_NAME);
    this.index = new GitIndex();
    this.ignoreManager = new IgnoreManager(repository);
  }

  /**
   * Initialize the index manager
   */
  public async initialize(): Promise<void> {
    await this.loadIndex();
    await this.ignoreManager.initialize();
  }

  /**
   * Get the status of the repository (git status)
   * Now filters out ignored files from untracked
   */
  public async status(): Promise<StatusResult> {
    await this.loadIndex();
    await this.ignoreManager.initialize();

    const status: StatusResult = {
      staged: {
        added: [],
        modified: [],
        deleted: [],
      },
      unstaged: {
        modified: [],
        deleted: [],
      },
      untracked: [],
      ignored: [],
    };

    const repoRoot = this.repository.gitDirectory().fullpath();

    const indexFiles = new Set(this.index.entryNames());

    const headFiles = new Map<string, string>();

    const checkHead = async () => {
      for (const [headPath, _] of headFiles) {
        if (!indexFiles.has(headPath)) {
          status.staged.deleted.push(headPath);
        }
      }
    };

    const checkUntracked = async () => {
      const workingFiles = await this.getAllWorkingFiles(repoRoot);
      workingFiles.forEach((workingFile) => {
        const relativePath = path.relative(repoRoot, workingFile).replace(/\\/g, '/');
        if (indexFiles.has(relativePath)) return;

        const isIgnored = this.ignoreManager.isIgnored(relativePath, false);

        if (isIgnored) status.ignored.push(relativePath);
        else status.untracked.push(relativePath);
      });
    };

    const checkStaged = async () => {
      this.index.entries.forEach(async (entry) => {
        const absolutePath = path.join(repoRoot, entry.name);

        if (await FileUtils.exists(absolutePath)) {
          const stats = await fs.stat(absolutePath);
          const isModified = this.index.isEntryModified(entry, {
            mtimeMs: stats.mtimeMs,
            size: stats.size,
          });

          if (isModified) {
            const content = await FileUtils.readFile(absolutePath);
            const blob = new BlobObject(new Uint8Array(content));
            const currentSha = await blob.sha();

            if (currentSha !== entry.sha) {
              status.unstaged.modified.push(entry.name);
            }
          }
        } else {
          status.unstaged.deleted.push(entry.name);
        }

        if (headFiles.has(entry.name)) {
          const headSha = headFiles.get(entry.name)!;
          if (headSha !== entry.sha) status.staged.modified.push(entry.name);
        } else {
          status.staged.added.push(entry.name);
        }
      });
    };

    await checkStaged();
    await checkHead();
    await checkUntracked();
    return status;
  }

  /**
   * Clear the index (remove all entries)
   */
  async clearIndex(): Promise<void> {
    this.index.clear();
    await this.saveIndex();
  }

  /**
   * Load the index from disk
   */
  private async loadIndex(): Promise<void> {
    this.index = await GitIndex.read(this.indexPath);
  }

  /**
   * Save the index to disk
   */
  async saveIndex(): Promise<void> {
    await this.index.write(this.indexPath);
  }

  /**
   * Get all files in the working directory
   */
  private async getAllWorkingFiles(repoRoot: string): Promise<string[]> {
    const pattern = '**/*';
    const files = await glob(pattern, {
      cwd: repoRoot,
      nodir: true,
      dot: true,
      ignore: ['.source/**'],
    });

    return files.map((f) => path.join(repoRoot, f));
  }

  /**
   * Get all files in a directory recursively
   * Now checks ignore patterns
   */
  private async getFilesInDirectory(dirPath: string, repoRoot: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    entries.forEach(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(repoRoot, fullPath).replace(/\\/g, '/');
      const isIgnored = this.ignoreManager.isIgnored(relativePath, entry.isDirectory());

      if (isIgnored) return;

      if (entry.isDirectory()) {
        if (entry.name === '.source') return;

        const subFiles = await this.getFilesInDirectory(fullPath, repoRoot);
        files.push(...subFiles);
        return;
      }

      if (entry.isFile()) files.push(fullPath);
    });

    return files;
  }
}

import path from 'path';
import { glob } from 'glob';
import fs from 'fs-extra';
import { IgnoreManager } from '@/core/ignore';
import { Repository } from '@/core/repo';
import { FileUtils } from '@/utils';
import { BlobObject } from '@/core/objects';
import { TreeWalker } from '@/core/tree';
import { GitIndex } from './git-index';
import type { AddResult, RemoveResult, StatusResult } from './types';
import { IndexEntry } from './index-entry';

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
  private treeWalker: TreeWalker;

  private static readonly INDEX_FILE_NAME = 'index';

  constructor(repository: Repository) {
    this.repository = repository;
    this.indexPath = path.join(repository.gitDirectory().fullpath(), IndexManager.INDEX_FILE_NAME);
    this.index = new GitIndex();
    this.ignoreManager = new IgnoreManager(repository);
    this.treeWalker = new TreeWalker(repository);
  }

  /**
   * Initialize the index manager
   */
  public async initialize(): Promise<void> {
    await this.loadIndex();
    await this.ignoreManager.initialize();
  }

  /**
   * Add files to the index (git add)
   *
   * This operation:
   * 1. Reads the file content from the working directory
   * 2. Creates a blob object and stores it in the repository
   * 3. Updates the index entry with the file's metadata and blob SHA
   */
  public async add(filePaths: string[]): Promise<AddResult> {
    const result: AddResult = {
      added: [],
      modified: [],
      failed: [],
      ignored: [],
    };

    const pushFailed = (path: string, reason: string) => {
      result.failed.push({
        path,
        reason,
      });
    };

    const createEntryForFile = async (absolutePath: string, relativePath: string) => {
      const content = await FileUtils.readFile(absolutePath);
      const blob = new BlobObject(new Uint8Array(content));
      const sha = await this.repository.writeObject(blob);

      const stats = await fs.stat(absolutePath);
      const { ctimeMs, mtimeMs, dev, ino, mode, uid, gid, size } = stats;

      return IndexEntry.fromFileStats(
        relativePath,
        {
          ctimeMs,
          mtimeMs,
          dev,
          ino,
          mode,
          uid,
          gid,
          size,
        },
        sha
      );
    };

    const addFilesInDirectory = async (absolutePath: string) => {
      const files = await this.getFilesInDirectory(absolutePath, repoRoot);
      const { added, modified, failed } = await this.add(files);
      result.added.push(...added);
      result.modified.push(...modified);
      result.failed.push(...failed);
    };

    await this.loadIndex();
    const repoRoot = this.repoRoot();

    filePaths.forEach(async (filePath) => {
      try {
        const { absolutePath, relativePath } = this.createAbsAndRelPaths(filePath);

        if (!(await FileUtils.exists(absolutePath))) {
          pushFailed(relativePath, 'File does not exist');
          return;
        }

        if (!(await FileUtils.isFile(absolutePath))) {
          if (await FileUtils.isDirectory(absolutePath)) {
            await addFilesInDirectory(absolutePath);
            return;
          }

          pushFailed(relativePath, 'Not a regular file');
          return;
        }

        const entry = await createEntryForFile(absolutePath, relativePath);
        const existingEntry = this.index.getEntry(entry.filePath);
        const isModified = existingEntry !== undefined;

        this.index.add(entry);
        if (isModified) result.modified.push(relativePath);
        else result.added.push(relativePath);
      } catch (error) {
        pushFailed(filePath, (error as Error).message);
      }
    });

    await this.saveIndex();
    return result;
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

    const repoRoot = this.repoRoot();
    const indexFiles = new Set(this.index.entryNames());
    const headFiles = await this.treeWalker.headFiles();

    const checkHead = () => {
      for (const [headPath, _] of headFiles) {
        if (!indexFiles.has(headPath)) {
          status.staged.deleted.push(headPath);
        }
      }
    };

    const checkUntracked = async () => {
      const workingFiles = await this.getAllWorkingFiles(repoRoot);
      workingFiles.forEach((workingFile) => {
        const { relativePath } = this.createAbsAndRelPaths(workingFile);
        if (indexFiles.has(relativePath)) return;

        const isIgnored = this.ignoreManager.isIgnored(relativePath, false);

        if (isIgnored) status.ignored.push(relativePath);
        else status.untracked.push(relativePath);
      });
    };

    const checkStaged = async () => {
      await Promise.all(
        this.index.entries.map(async (entry) => {
          const { absolutePath } = this.createAbsAndRelPaths(entry.filePath);

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

              if (currentSha !== entry.contentHash) {
                status.unstaged.modified.push(entry.filePath);
              }
            }
          } else {
            status.unstaged.deleted.push(entry.filePath);
          }

          if (headFiles.has(entry.filePath)) {
            const headSha = headFiles.get(entry.filePath)!;
            if (headSha !== entry.contentHash) status.staged.modified.push(entry.filePath);
          } else {
            status.staged.added.push(entry.filePath);
          }
        })
      );
    };

    await checkStaged();
    checkHead();
    await checkUntracked();
    return status;
  }

  /**
   * Remove files from the index and optionally from the working directory
   */
  public async remove(filePaths: string[], deleteFromDisk: boolean = false): Promise<RemoveResult> {
    const result: RemoveResult = {
      removed: [],
      failed: [],
    };

    const pushFailed = (path: string, reason: string) => {
      result.failed.push({
        path,
        reason,
      });
    };

    await this.loadIndex();

    filePaths.forEach(async (filePath) => {
      try {
        const { absolutePath, relativePath } = this.createAbsAndRelPaths(filePath);

        if (!this.index.hasEntry(relativePath)) {
          pushFailed(relativePath, 'File not in index');
          return;
        }

        this.index.removeEntry(relativePath);
        result.removed.push(relativePath);

        if (deleteFromDisk && (await FileUtils.exists(absolutePath))) {
          await fs.unlink(absolutePath);
        }
      } catch (error) {
        pushFailed(filePath, (error as Error).message);
      }
    });

    await this.saveIndex();
    return result;
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
      ignore: ['.source/**', '**/.sourceignore'],
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
      const { relativePath } = this.createAbsAndRelPaths(fullPath);
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

  private repoRoot(): string {
    return this.repository.workingDirectory().fullpath();
  }

  private createAbsAndRelPaths(filePath: string): { absolutePath: string; relativePath: string } {
    const repoRoot = this.repoRoot();
    const absolutePath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.join(repoRoot, filePath);
    const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
    return { absolutePath, relativePath };
  }
}

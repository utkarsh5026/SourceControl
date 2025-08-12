import path from 'path';
import fs from 'fs-extra';
import { IgnoreManager } from '@/core/ignore';
import { Repository } from '@/core/repo';
import { FileUtils } from '@/utils';
import { TreeWalker } from '@/core/tree';
import { GitIndex } from './git-index';
import type { AddResult, RemoveResult, StatusResult } from './types';
import { StatusCalculator } from './status-calculator';
import { IndexFileAdder } from './index-file-adder';

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

  public static readonly INDEX_FILE_NAME = 'index';

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
    const indexFileAdder = new IndexFileAdder(this.repository, this.repoRoot());
    return await indexFileAdder.addFiles(filePaths, this.index);
  }

  /**
   * Get the status of the repository (git status)
   * Now filters out ignored files from untracked
   */
  public async status(): Promise<StatusResult> {
    await this.loadIndex();
    await this.ignoreManager.initialize();

    const statusCalculator = new StatusCalculator(
      this.repoRoot(),
      this.treeWalker,
      this.ignoreManager
    );
    return await statusCalculator.calculateStatus(this.index);
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

    for (const filePath of filePaths) {
      try {
        const { absolutePath, relativePath } = this.createAbsAndRelPaths(filePath);

        if (!this.index.hasEntry(relativePath)) {
          pushFailed(relativePath, 'File not in index');
          continue;
        }

        this.index.removeEntry(relativePath);
        result.removed.push(relativePath);

        if (deleteFromDisk && (await FileUtils.exists(absolutePath))) {
          await fs.unlink(absolutePath);
        }
      } catch (error) {
        pushFailed(filePath, (error as Error).message);
      }
    }

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

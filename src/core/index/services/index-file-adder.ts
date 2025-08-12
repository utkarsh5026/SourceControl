import { Repository, SourceRepository } from '@/core/repo';
import { AddResult } from '../types';
import { GitIndex } from '../git-index';
import { FileUtils } from '@/utils';
import fs from 'fs-extra';
import path from 'path';
import { IndexEntry } from '../index-entry';
import { BlobObject } from '@/core/objects';
/**
 * Handles adding files to the Git index.
 * Focuses solely on the file addition logic.
 */
export class IndexFileAdder {
  constructor(
    private repository: Repository,
    private repoRoot: string
  ) {}

  /**
   * Add multiple files to the index
   */
  async addFiles(filePaths: string[], index: GitIndex): Promise<AddResult> {
    const result: AddResult = {
      added: [],
      modified: [],
      failed: [],
      ignored: [],
    };

    for (const filePath of filePaths) {
      try {
        await this.addSingleFile(filePath, index, result);
      } catch (error) {
        result.failed.push({
          path: filePath,
          reason: (error as Error).message,
        });
      }
    }

    return result;
  }

  /**
   * Add a single file or directory to the index
   */
  private async addSingleFile(filePath: string, index: GitIndex, result: AddResult): Promise<void> {
    const { absolutePath, relativePath } = this.resolvePaths(filePath);

    if (!(await FileUtils.exists(absolutePath))) {
      throw new Error('File does not exist');
    }

    const stats = await fs.stat(absolutePath);

    if (stats.isDirectory()) {
      await this.addDirectory(absolutePath, index, result);
      return;
    }

    if (!stats.isFile()) throw new Error('Not a regular file');

    await this.addRegularFile(absolutePath, relativePath, index, result);
  }

  /**
   * Add all files in a directory recursively
   */
  private async addDirectory(
    absolutePath: string,
    index: GitIndex,
    result: AddResult
  ): Promise<void> {
    const files = await this.getFilesInDirectory(absolutePath);

    for (const file of files) {
      try {
        const { relativePath } = this.resolvePaths(file);
        await this.addRegularFile(file, relativePath, index, result);
      } catch (error) {
        result.failed.push({
          path: file,
          reason: (error as Error).message,
        });
      }
    }
  }

  /**
   * Add a regular file to the index
   */
  private async addRegularFile(
    absolutePath: string,
    relativePath: string,
    index: GitIndex,
    result: AddResult
  ): Promise<void> {
    const content = await FileUtils.readFile(absolutePath);
    const blob = new BlobObject(new Uint8Array(content));
    const sha = await this.repository.writeObject(blob);

    const stats = await fs.stat(absolutePath);
    const entry = IndexEntry.fromFileStats(
      relativePath,
      {
        ...stats,
      },
      sha
    );

    const existingEntry = index.getEntry(entry.filePath);
    const isModified = existingEntry !== undefined;

    index.add(entry);

    if (isModified) {
      result.modified.push(relativePath);
    } else {
      result.added.push(relativePath);
    }
  }

  /**
   * Resolve file paths to absolute and relative forms
   */
  private resolvePaths(filePath: string): { absolutePath: string; relativePath: string } {
    const absolutePath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.join(this.repoRoot, filePath);

    const relativePath = path.relative(this.repoRoot, absolutePath).replace(/\\/g, '/');

    return { absolutePath, relativePath };
  }

  /**
   * Get all files in a directory recursively
   */
  private async getFilesInDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.name === SourceRepository.DEFAULT_GIT_DIR) continue;

      if (entry.isDirectory()) {
        const subFiles = await this.getFilesInDirectory(fullPath);
        files.push(...subFiles);
        continue;
      }

      if (entry.isFile()) files.push(fullPath);
    }

    return files;
  }
}

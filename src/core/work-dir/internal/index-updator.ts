import { GitIndex } from '@/core/index/git-index';
import { IndexEntry } from '@/core/index/index-entry';
import { IndexUpdateResult, TreeFileInfo } from './types';
import { FileUtils, logger } from '@/utils';
import path from 'path';
import fs from 'fs-extra';

/**
 * IndexUpdater handles updating the Git index after file operations.
 * Focused on maintaining index consistency with the working directory.
 */
export class IndexUpdater {
  constructor(
    private workingDirectory: string,
    private indexPath: string
  ) {}

  /**
   * Update the index to match a target set of files
   */
  public async updateToMatch(targetFiles: Map<string, TreeFileInfo>): Promise<IndexUpdateResult> {
    const result: IndexUpdateResult = {
      success: true,
      entriesAdded: 0,
      entriesUpdated: 0,
      entriesRemoved: 0,
      errors: [],
    };

    const newIndex = new GitIndex();
    try {
      for (const [filePath, fileInfo] of targetFiles) {
        try {
          const entry = await this.createIndexEntry(filePath, fileInfo);
          newIndex.add(entry);
          result.entriesAdded++;
        } catch (error) {
          const errorMsg = `Failed to create index entry for ${filePath}: ${(error as Error).message}`;
          result.errors.push(errorMsg);
          result.success = false;
        }
      }

      if (result.success) {
        await newIndex.write(this.indexPath);
        logger.debug(`Updated index with ${targetFiles.size} entries`);
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to update index: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Update the index incrementally (add/modify/remove specific entries)
   */
  public async updateIncremental(changes: {
    add?: Map<string, TreeFileInfo>;
    remove?: string[];
  }): Promise<IndexUpdateResult> {
    const result: IndexUpdateResult = {
      success: true,
      entriesAdded: 0,
      entriesUpdated: 0,
      entriesRemoved: 0,
      errors: [],
    };

    const removeFilesFromIndex = (index: GitIndex) => {
      if (changes.remove) {
        for (const filePath of changes.remove) {
          if (!index.hasEntry(filePath)) continue;

          index.removeEntry(filePath);
          result.entriesRemoved++;
        }
      }
    };

    try {
      const index = await GitIndex.read(this.indexPath);
      removeFilesFromIndex(index);

      // Add or update entries
      if (changes.add) {
        for (const [filePath, fileInfo] of changes.add) {
          try {
            const wasExisting = index.hasEntry(filePath);
            const entry = await this.createIndexEntry(filePath, fileInfo);

            if (wasExisting) {
              index.removeEntry(filePath); // Remove old entry
              result.entriesUpdated++;
            } else {
              result.entriesAdded++;
            }

            index.add(entry);
          } catch (error) {
            const errorMsg = `Failed to process ${filePath}: ${(error as Error).message}`;
            result.errors.push(errorMsg);
            result.success = false;
          }
        }
      }

      if (result.success) {
        await index.write(this.indexPath);
        logger.debug(
          `Incrementally updated index: +${result.entriesAdded} ~${result.entriesUpdated} -${result.entriesRemoved}`
        );
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to update index incrementally: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Get index statistics
   */
  public async getStatistics(): Promise<{
    entryCount: number;
    totalSize: number;
    oldestEntry?: string;
    newestEntry?: string;
  }> {
    try {
      const index = await GitIndex.read(this.indexPath);

      let totalSize = 0;
      let oldestTime = Number.MAX_SAFE_INTEGER;
      let newestTime = 0;
      let oldestEntry = '';
      let newestEntry = '';

      for (const entry of index.entries) {
        totalSize += entry.fileSize;

        if (entry.modificationTime.seconds < oldestTime) {
          oldestTime = entry.modificationTime.seconds;
          oldestEntry = entry.filePath;
        }

        if (entry.modificationTime.seconds > newestTime) {
          newestTime = entry.modificationTime.seconds;
          newestEntry = entry.filePath;
        }
      }

      return {
        entryCount: index.entries.length,
        totalSize,
        ...(oldestEntry ? { oldestEntry } : {}),
        ...(newestEntry ? { newestEntry } : {}),
      };
    } catch (error) {
      return {
        entryCount: 0,
        totalSize: 0,
      };
    }
  }

  /**
   * Validate index consistency with working directory
   */
  public async validateConsistency(): Promise<{
    consistent: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      const index = await GitIndex.read(this.indexPath);
      for (const entry of index.entries) {
        const absolutePath = path.join(this.workingDirectory, entry.filePath);

        try {
          const stats = await fs.stat(absolutePath);
          if (entry.fileSize !== stats.size) {
            issues.push(
              `${entry.filePath}: size mismatch (index: ${entry.fileSize}, disk: ${stats.size})`
            );
          }

          const mtimeSeconds = Math.floor(stats.mtimeMs / 1000);
          if (entry.modificationTime.seconds !== mtimeSeconds) {
            issues.push(`${entry.filePath}: modification time differs`);
          }
        } catch (error) {
          issues.push(`${entry.filePath}: file missing from working directory`);
        }
      }
    } catch (error) {
      issues.push(`Cannot read index: ${(error as Error).message}`);
    }

    return {
      consistent: issues.length === 0,
      issues,
    };
  }

  /**
   * Repair index by updating entries that are inconsistent
   */
  public async repairIndex(): Promise<IndexUpdateResult> {
    const result: IndexUpdateResult = {
      success: true,
      entriesAdded: 0,
      entriesUpdated: 0,
      entriesRemoved: 0,
      errors: [],
    };

    try {
      const index = await GitIndex.read(this.indexPath);
      const entriesToRemove: string[] = [];

      for (const entry of index.entries) {
        const absolutePath = path.join(this.workingDirectory, entry.filePath);

        try {
          const stats = await fs.stat(absolutePath);
          const mtimeSeconds = Math.floor(stats.mtimeMs / 1000);
          if (entry.modificationTime.seconds !== mtimeSeconds) {
            const updatedEntry = IndexEntry.fromFileStats(
              entry.filePath,
              {
                ...stats,
              },
              entry.contentHash
            );

            index.removeEntry(entry.filePath);
            index.add(updatedEntry);
            result.entriesUpdated++;
          }
        } catch (error) {
          entriesToRemove.push(entry.filePath);
        }
      }

      for (const filePath of entriesToRemove) {
        index.removeEntry(filePath);
        result.entriesRemoved++;
      }

      await index.write(this.indexPath);
      logger.info(`Index repaired: ~${result.entriesUpdated} -${result.entriesRemoved}`);
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to repair index: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Create an index entry for a file
   */
  private async createIndexEntry(filePath: string, fileInfo: TreeFileInfo): Promise<IndexEntry> {
    const absolutePath = path.join(this.workingDirectory, filePath);
    await FileUtils.throwIfNotExists(absolutePath);
    return IndexEntry.fromFileStats(
      filePath,
      {
        ...(await fs.stat(absolutePath)),
        mode: parseInt(fileInfo.mode, 8), // Convert from octal string
      },
      fileInfo.sha
    );
  }
}

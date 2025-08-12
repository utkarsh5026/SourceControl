import { IndexEntry } from '@/core/index/index-entry';
import { BlobObject } from '@/core/objects';
import { FileUtils } from '@/utils';
import fs from 'fs-extra';
import path from 'path';

export enum ChangeType {
  UNCHANGED = 'unchanged',
  SIZE_CHANGED = 'size-changed',
  TIME_CHANGED = 'time-changed',
  CONTENT_CHANGED = 'content-changed',
  MODE_CHANGED = 'mode-changed',
  FILE_MISSING = 'file-missing',
  MULTIPLE_CHANGES = 'multiple-changes',
}

export interface ComparisonResult {
  hasChanged: boolean;
  changeType: ChangeType;
  details: ComparisonDetails;
  quickCheck: boolean; // Whether this was a quick check or deep check
}

export interface ComparisonDetails {
  size?: {
    index: number;
    workingDir: number;
  };
  modificationTime?: {
    index: number;
    workingDir: number;
  };
  mode?: {
    index: number;
    workingDir: number;
  };
  contentHash?: {
    index: string;
    workingDir: string;
  };
  exists: boolean;
  reason: string;
}

export interface ComparisonOptions {
  /**
   * If true, only check size and mtime (fast)
   * If false, also verify content hash if time differs (slower but accurate)
   */
  quickCheck?: boolean;

  /**
   * Working directory root path
   */
  workingDirectory: string;
}

/**
 * IndexEntryComparator provides centralized logic for comparing index entries
 * with their working directory counterparts.
 *
 * This eliminates duplicate comparison logic scattered across the codebase
 * and provides consistent, testable comparison behavior.
 */
export class IndexEntryComparator {
  /**
   * Compare an index entry with its working directory file
   */
  public static async compare(
    entry: IndexEntry,
    options: ComparisonOptions
  ): Promise<ComparisonResult> {
    const absolutePath = path.join(options.workingDirectory, entry.filePath);
    if (!(await FileUtils.exists(absolutePath))) {
      return {
        hasChanged: true,
        changeType: ChangeType.FILE_MISSING,
        details: {
          exists: false,
          reason: 'File deleted from working directory',
        },
        quickCheck: true,
      };
    }

    try {
      const stats = await fs.stat(absolutePath);
      return await this.compareWithStats(entry, stats, options);
    } catch (error) {
      return {
        hasChanged: true,
        changeType: ChangeType.FILE_MISSING,
        details: {
          exists: false,
          reason: `Cannot stat file: ${(error as Error).message}`,
        },
        quickCheck: true,
      };
    }
  }

  /**
   * Compare index entry with file stats (when you already have stats)
   */
  public static async compareWithStats(
    entry: IndexEntry,
    stats: fs.Stats,
    options: ComparisonOptions
  ): Promise<ComparisonResult> {
    const changes: string[] = [];
    const details: ComparisonDetails = {
      exists: true,
      reason: 'File exists',
    };

    if (entry.fileSize !== stats.size) {
      changes.push('size');
      details.size = {
        index: entry.fileSize,
        workingDir: stats.size,
      };
    }

    if (entry.fileMode !== stats.mode) {
      changes.push('mode');
      details.mode = {
        index: entry.fileMode,
        workingDir: stats.mode,
      };
    }

    const mtimeSeconds = Math.floor(stats.mtimeMs / 1000);
    const timeChanged = entry.modificationTime.seconds !== mtimeSeconds;

    if (timeChanged) {
      details.modificationTime = {
        index: entry.modificationTime.seconds,
        workingDir: mtimeSeconds,
      };
    }

    // If we have size or mode changes, file is definitely changed
    if (changes.length > 0) {
      return {
        hasChanged: true,
        changeType:
          changes.length > 1 ? ChangeType.MULTIPLE_CHANGES : this.getChangeType(changes[0]!),
        details: {
          ...details,
          reason: `Changed: ${changes.join(', ')}`,
        },
        quickCheck: true,
      };
    }

    if (timeChanged) {
      if (!options.quickCheck) {
        const contentChanged = await this.isContentChanged(entry, options.workingDirectory);

        if (contentChanged.changed) {
          return {
            hasChanged: true,
            changeType: ChangeType.CONTENT_CHANGED,
            details: {
              ...details,
              ...(contentChanged.hashes ? { contentHash: contentChanged.hashes } : {}),
              reason: 'File content has been modified',
            },
            quickCheck: false,
          };
        }
      }

      return {
        hasChanged: true,
        changeType: ChangeType.TIME_CHANGED,
        details: {
          ...details,
          reason: 'Modification time changed',
        },
        quickCheck: options.quickCheck || false,
      };
    } else {
      const contentChanged = await this.isContentChanged(entry, options.workingDirectory);
      if (contentChanged.changed) {
        return {
          hasChanged: true,
          changeType: ChangeType.CONTENT_CHANGED,
          details: {
            ...details,
            ...(contentChanged.hashes ? { contentHash: contentChanged.hashes } : {}),
            reason: 'File content has been modified',
          },
          quickCheck: false,
        };
      }
    }
    return {
      hasChanged: false,
      changeType: ChangeType.UNCHANGED,
      details: {
        ...details,
        reason: 'File unchanged',
      },
      quickCheck: options.quickCheck || false,
    };
  }

  /**
   * Check if file content has actually changed by comparing SHA hashes
   */
  private static async isContentChanged(
    entry: IndexEntry,
    workingDirectory: string
  ): Promise<{ changed: boolean; hashes?: { index: string; workingDir: string } }> {
    try {
      const absolutePath = path.join(workingDirectory, entry.filePath);
      const content = await FileUtils.readFile(absolutePath);
      const blob = new BlobObject(new Uint8Array(content));
      const currentSha = await blob.sha();

      return {
        changed: currentSha !== entry.contentHash,
        hashes: {
          index: entry.contentHash,
          workingDir: currentSha,
        },
      };
    } catch (error) {
      return {
        changed: true,
        hashes: {
          index: entry.contentHash,
          workingDir: '<unreadable>',
        },
      };
    }
  }

  /**
   * Convert change string to ChangeType enum
   */
  private static getChangeType(change: string): ChangeType {
    switch (change) {
      case 'size':
        return ChangeType.SIZE_CHANGED;
      case 'mode':
        return ChangeType.MODE_CHANGED;
      default:
        return ChangeType.MULTIPLE_CHANGES;
    }
  }

  /**
   * Create comparison options with sensible defaults
   */
  static createOptions(
    workingDirectory: string,
    overrides: Partial<Omit<ComparisonOptions, 'workingDirectory'>> = {}
  ): ComparisonOptions {
    return {
      workingDirectory,
      quickCheck: false,
      ...overrides,
    };
  }
}

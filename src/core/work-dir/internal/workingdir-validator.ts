import type { FileStatusDetail, WorkingDirectoryStatus } from './types';
import { GitIndex, type IndexEntry } from '@/core/index';
import { BlobObject } from '@/core/objects';
import { FileUtils, logger } from '@/utils';
import fs from 'fs-extra';
import path from 'path';

/**
 * WorkingDirectoryValidator checks the status of the working directory.
 * Focused on determining if files have been modified since the last index update.
 */
export class WorkingDirectoryValidator {
  constructor(private workingDirectory: string) {}

  /**
   * Check if the working directory is clean (no uncommitted changes)
   */
  public async validateCleanState(index: GitIndex): Promise<WorkingDirectoryStatus> {
    const status: WorkingDirectoryStatus = {
      clean: true,
      modifiedFiles: [],
      deletedFiles: [],
      details: [],
    };

    for (const entry of index.entries) {
      const fileStatus = await this.checkFileStatus(entry);

      if (fileStatus) {
        status.clean = false;
        status.details.push(fileStatus);

        if (fileStatus.status === 'deleted') {
          status.deletedFiles.push(fileStatus.path);
        } else {
          status.modifiedFiles.push(fileStatus.path);
        }
      }
    }

    return status;
  }

  /**
   * Get a summary of changes for display
   */
  public formatStatusSummary(status: WorkingDirectoryStatus): string {
    if (status.clean) {
      return 'Working directory is clean';
    }

    const parts: string[] = [];

    if (status.modifiedFiles.length > 0) {
      parts.push(`${status.modifiedFiles.length} modified`);
    }

    if (status.deletedFiles.length > 0) {
      parts.push(`${status.deletedFiles.length} deleted`);
    }

    return `Changes: ${parts.join(', ')}`;
  }

  /**
   * Quick check - just returns boolean for backward compatibility
   */
  public async isClean(index: GitIndex): Promise<boolean> {
    const status = await this.validateCleanState(index);
    return status.clean;
  }

  /**
   * Get detailed status for specific files
   */
  public getFileDetails(status: WorkingDirectoryStatus, maxFiles: number = 10): string[] {
    return status.details.slice(0, maxFiles).map((detail) => `  ${detail.path} (${detail.status})`);
  }

  /**
   * Validate that files can be safely overwritten
   */
  public async validateSafeOverwrite(
    index: GitIndex,
    filesToOverwrite: string[]
  ): Promise<{ safe: boolean; conflicts: string[] }> {
    const conflicts: string[] = [];

    for (const filePath of filesToOverwrite) {
      const entry = index.getEntry(filePath);
      if (!entry) continue;

      const fileStatus = await this.checkFileStatus(entry);
      if (fileStatus && fileStatus.status !== 'time-changed') {
        conflicts.push(filePath);
      }
    }

    return {
      safe: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Check the status of a specific file against its index entry
   */
  private async checkFileStatus(entry: IndexEntry): Promise<FileStatusDetail | null> {
    const absolutePath = path.join(this.workingDirectory, entry.filePath);

    try {
      const stats = await fs.stat(absolutePath);
      return await this.compareWithIndex(entry, stats);
    } catch (error) {
      return {
        path: entry.filePath,
        status: 'deleted',
        reason: 'File deleted from working directory',
      };
    }
  }

  private async compareWithIndex(
    entry: IndexEntry,
    stats: fs.Stats
  ): Promise<FileStatusDetail | null> {
    if (entry.fileSize !== stats.size) {
      return {
        path: entry.filePath,
        status: 'size-changed',
        reason: `Size changed: ${entry.fileSize} → ${stats.size} bytes`,
      };
    }

    const mtimeSeconds = Math.floor(stats.mtimeMs / 1000);

    if (entry.modificationTime.seconds !== mtimeSeconds) {
      const contentChanged = await this.isContentModified(entry);
      return {
        path: entry.filePath,
        status: contentChanged ? 'content-changed' : 'time-changed',
        reason: contentChanged
          ? 'File content has been modified'
          : 'Modification time changed but content is identical',
      };
    }

    // mtime seconds are equal — still verify content to catch fast same-second edits
    const contentChanged = await this.isContentModified(entry);
    if (contentChanged) {
      return {
        path: entry.filePath,
        status: 'content-changed',
        reason: 'File content has been modified',
      };
    }

    return null;
  }

  /**
   * Check if file content has actually been modified by comparing SHA
   */
  private async isContentModified(entry: IndexEntry): Promise<boolean> {
    try {
      const absolutePath = path.join(this.workingDirectory, entry.filePath);
      const content = await FileUtils.readFile(absolutePath);
      const blob = new BlobObject(new Uint8Array(content));
      const currentSha = await blob.sha();
      return currentSha !== entry.contentHash;
    } catch (error) {
      logger.debug(`Failed to check content for ${entry.filePath}:`, error);
      return true; // If we can't read the file, consider it modified
    }
  }
}

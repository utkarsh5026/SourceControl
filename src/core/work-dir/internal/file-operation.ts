import { ObjectReader, Repository } from '@/core/repo';
import { FileUtils, logger } from '@/utils';
import path from 'path';
import fs from 'fs-extra';
import { FileBackup, FileOperation } from './types';

/**
 * FileOperationService handles individual file system operations.
 * Focused solely on creating, modifying, and deleting files with proper permissions.
 */
export class FileOperationService {
  constructor(
    private repository: Repository,
    private workingDirectory: string
  ) {}

  /**
   * Apply a single file operation
   */
  async applyOperation(operation: FileOperation): Promise<void> {
    const absolutePath = path.join(this.workingDirectory, operation.path);

    switch (operation.action) {
      case 'create':
      case 'modify':
        if (!operation.blobSha || !operation.mode) {
          throw new Error(`Missing blob SHA or mode for ${operation.action} operation`);
        }
        await this.writeFileFromBlob(absolutePath, operation.blobSha, operation.mode);
        break;

      case 'delete':
        await this.deleteFile(absolutePath);
        break;

      default:
        throw new Error(`Unknown operation: ${(operation as any).action}`);
    }
  }

  /**
   * Create a backup of a file before modifying it
   */
  public async createBackup(filePath: string): Promise<FileBackup> {
    const absolutePath = path.join(this.workingDirectory, filePath);
    const backup: FileBackup = {
      path: filePath,
      existed: await FileUtils.exists(absolutePath),
    };

    if (backup.existed) {
      backup.content = await fs.readFile(absolutePath);
      const stats = await fs.stat(absolutePath);
      backup.mode = stats.mode;
    }

    return backup;
  }

  /**
   * Restore a file from backup
   */
  public async restoreFromBackup(backup: FileBackup): Promise<void> {
    const absolutePath = path.join(this.workingDirectory, backup.path);

    if (backup.existed && backup.content) {
      await FileUtils.createDirectories(path.dirname(absolutePath));
      await fs.writeFile(absolutePath, backup.content);

      if (backup.mode) {
        try {
          await fs.chmod(absolutePath, backup.mode);
        } catch (error) {
          logger.warn(`Failed to restore permissions on ${backup.path}:`, error);
        }
      }
    } else if (!backup.existed && (await FileUtils.exists(absolutePath))) {
      await fs.unlink(absolutePath);
      await this.cleanEmptyDirectories(path.dirname(absolutePath));
    }
  }

  /**
   * Get file stats
   */
  public async getFileStats(relativePath: string): Promise<fs.Stats> {
    const absolutePath = path.join(this.workingDirectory, relativePath);
    return await fs.stat(absolutePath);
  }

  /**
   * Check if a file exists
   */
  public async fileExists(relativePath: string): Promise<boolean> {
    const absolutePath = path.join(this.workingDirectory, relativePath);
    return await FileUtils.exists(absolutePath);
  }

  /**
   * Clean up empty directories recursively
   */
  private async cleanEmptyDirectories(dirPath: string): Promise<void> {
    if (dirPath === this.workingDirectory || dirPath === path.dirname(this.workingDirectory)) {
      return;
    }

    try {
      const entries = await fs.readdir(dirPath);
      if (entries.length === 0) {
        await fs.rmdir(dirPath);
        await this.cleanEmptyDirectories(path.dirname(dirPath));
      }
    } catch {
      // Directory might not exist or not be empty - that's fine
    }
  }

  /**
   * Write a file from a blob with proper mode/permissions
   */
  private async writeFileFromBlob(filePath: string, blobSha: string, mode: string): Promise<void> {
    const blob = await ObjectReader.reabBlobOrThrow(this.repository, blobSha);
    const content = blob.content();

    await FileUtils.createDirectories(path.dirname(filePath));

    const fileMode = parseInt(mode, 8);
    const fileType = (fileMode >> 12) & 0xf;

    if (fileType === 0xa) {
      // Symbolic link (120000)
      await this.createSymlink(filePath, content);
    } else {
      await fs.writeFile(filePath, content);
      if (fileType === 0x8 && fileMode & 0o111) {
        try {
          await fs.chmod(filePath, fileMode & 0o777);
        } catch (error) {
          logger.warn(`Failed to set permissions on ${filePath}:`, error);
        }
      }
    }
  }

  /**
   * Create a symbolic link
   */
  private async createSymlink(linkPath: string, targetBuffer: Uint8Array): Promise<void> {
    const target = new TextDecoder().decode(targetBuffer);

    try {
      // Remove existing file/link if present
      if (await FileUtils.exists(linkPath)) {
        await fs.unlink(linkPath);
      }

      await fs.symlink(target, linkPath);
    } catch (error) {
      logger.warn(`Failed to create symlink ${linkPath} -> ${target}:`, error);
      // Fall back to writing target as regular file
      await fs.writeFile(linkPath, targetBuffer);
    }
  }

  /**
   * Delete a file and clean up empty directories
   */
  private async deleteFile(filePath: string): Promise<void> {
    if (await FileUtils.exists(filePath)) {
      await fs.unlink(filePath);
      await this.cleanEmptyDirectories(path.dirname(filePath));
    }
  }
}

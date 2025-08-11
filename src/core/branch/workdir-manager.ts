import { Repository } from '@/core/repo';
import { CommitObject, TreeObject, BlobObject, ObjectType } from '@/core/objects';
import { FileUtils, logger } from '@/utils';
import { GitIndex } from '@/core/index/git-index';
import { IndexEntry } from '@/core/index/index-entry';
import path from 'path';
import fs from 'fs-extra';

export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  oldSha?: string;
  newSha?: string;
}

/**
 * WorkingDirectoryManager handles updating the working directory
 * when switching between branches or commits.
 *
 * Key responsibilities:
 * - Update working directory files to match a commit's tree
 * - Track which files need to be created, modified, or deleted
 * - Update the index to match the new state
 * - Handle file conflicts and permissions
 */
export class WorkingDirectoryManager {
  private repository: Repository;
  private indexPath: string;

  constructor(repository: Repository) {
    this.repository = repository;
    this.indexPath = path.join(repository.gitDirectory().fullpath(), 'index');
  }

  /**
   * Update the working directory to match a specific commit
   */
  public async updateToCommit(commitSha: string): Promise<FileChange[]> {
    // Read the commit
    const commitObj = await this.repository.readObject(commitSha);
    if (!commitObj || commitObj.type() !== ObjectType.COMMIT) {
      throw new Error(`Invalid commit: ${commitSha}`);
    }

    const commit = commitObj as CommitObject;
    if (!commit.treeSha) {
      throw new Error('Commit has no tree');
    }

    // Get the target tree
    const targetTree = await this.getTreeFiles(commit.treeSha);

    // Get current working directory state from index
    const currentIndex = await GitIndex.read(this.indexPath);
    const currentFiles = this.indexToFileMap(currentIndex);

    // Calculate changes needed
    const changes = this.calculateChanges(currentFiles, targetTree);

    // Apply changes to working directory
    await this.applyChanges(changes);

    // Update index to match new tree
    await this.updateIndex(targetTree);

    return changes;
  }

  /**
   * Get all files from a tree recursively
   */
  private async getTreeFiles(treeSha: string, basePath: string = ''): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    const treeObj = await this.repository.readObject(treeSha);
    if (!treeObj || treeObj.type() !== ObjectType.TREE) {
      throw new Error(`Invalid tree: ${treeSha}`);
    }

    const tree = treeObj as TreeObject;

    for (const entry of tree.entries) {
      const fullPath = basePath ? path.join(basePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        // Recursively process subdirectory
        const subFiles = await this.getTreeFiles(entry.sha, fullPath);
        subFiles.forEach((sha, path) => files.set(path, sha));
      } else if (entry.isFile() || entry.isExecutable()) {
        // Add file entry
        files.set(fullPath.replace(/\\/g, '/'), entry.sha);
      }
      // Skip symlinks and submodules for now
    }

    return files;
  }

  /**
   * Convert index to file map
   */
  private indexToFileMap(index: GitIndex): Map<string, string> {
    const files = new Map<string, string>();

    for (const entry of index.entries) {
      files.set(entry.filePath, entry.contentHash);
    }

    return files;
  }

  /**
   * Calculate what changes need to be made
   */
  private calculateChanges(
    currentFiles: Map<string, string>,
    targetFiles: Map<string, string>
  ): FileChange[] {
    const changes: FileChange[] = [];

    // Files to delete (in current but not in target)
    for (const [path, sha] of currentFiles) {
      if (!targetFiles.has(path)) {
        changes.push({
          path,
          action: 'delete',
          oldSha: sha,
        });
      }
    }

    // Files to create or modify
    for (const [path, sha] of targetFiles) {
      if (!currentFiles.has(path)) {
        // New file
        changes.push({
          path,
          action: 'create',
          newSha: sha,
        });
      } else if (currentFiles.get(path) !== sha) {
        // Modified file
        changes.push({
          path,
          action: 'modify',
          oldSha: currentFiles.get(path) ?? '',
          newSha: sha,
        });
      }
      // If SHAs match, file is unchanged
    }

    return changes;
  }

  /**
   * Apply changes to the working directory
   */
  private async applyChanges(changes: FileChange[]): Promise<void> {
    const workDir = this.repository.workingDirectory().fullpath();

    for (const change of changes) {
      const filePath = path.join(workDir, change.path);

      try {
        switch (change.action) {
          case 'delete':
            await this.deleteFile(filePath);
            logger.debug(`Deleted: ${change.path}`);
            break;

          case 'create':
          case 'modify':
            if (change.newSha) {
              await this.writeFile(filePath, change.newSha);
              logger.debug(
                `${change.action === 'create' ? 'Created' : 'Modified'}: ${change.path}`
              );
            }
            break;
        }
      } catch (error) {
        logger.error(`Failed to ${change.action} ${change.path}:`, error);
        throw error;
      }
    }
  }

  /**
   * Write a file from a blob SHA
   */
  private async writeFile(filePath: string, blobSha: string): Promise<void> {
    // Read the blob
    const blobObj = await this.repository.readObject(blobSha);
    if (!blobObj || blobObj.type() !== ObjectType.BLOB) {
      throw new Error(`Invalid blob: ${blobSha}`);
    }

    const blob = blobObj as BlobObject;
    const content = blob.content();

    // Ensure directory exists
    await FileUtils.createDirectories(path.dirname(filePath));

    // Write file
    await fs.writeFile(filePath, content);
  }

  /**
   * Delete a file
   */
  private async deleteFile(filePath: string): Promise<void> {
    if (await FileUtils.exists(filePath)) {
      await fs.unlink(filePath);

      // Clean up empty directories
      await this.cleanEmptyDirectories(path.dirname(filePath));
    }
  }

  /**
   * Clean up empty directories
   */
  private async cleanEmptyDirectories(dirPath: string): Promise<void> {
    const workDir = this.repository.workingDirectory().fullpath();

    // Don't delete the working directory itself
    if (dirPath === workDir) return;

    try {
      const entries = await fs.readdir(dirPath);
      if (entries.length === 0) {
        await fs.rmdir(dirPath);
        // Recursively clean parent
        await this.cleanEmptyDirectories(path.dirname(dirPath));
      }
    } catch {
      // Directory might not exist or not be empty
    }
  }

  /**
   * Update the index to match the new tree
   */
  private async updateIndex(targetFiles: Map<string, string>): Promise<void> {
    const workDir = this.repository.workingDirectory().fullpath();
    const newIndex = new GitIndex();

    for (const [filePath, sha] of targetFiles) {
      const absolutePath = path.join(workDir, filePath);

      try {
        const stats = await fs.stat(absolutePath);

        const entry = IndexEntry.fromFileStats(
          filePath,
          {
            ctimeMs: stats.ctimeMs,
            mtimeMs: stats.mtimeMs,
            dev: stats.dev,
            ino: stats.ino,
            mode: stats.mode,
            uid: stats.uid,
            gid: stats.gid,
            size: stats.size,
          },
          sha
        );

        newIndex.add(entry);
      } catch (error) {
        logger.warn(`Failed to add ${filePath} to index:`, error);
      }
    }

    // Write the new index
    await newIndex.write(this.indexPath);
  }

  /**
   * Check if working directory is clean (no uncommitted changes)
   */
  public async isClean(): Promise<boolean> {
    const index = await GitIndex.read(this.indexPath);
    const workDir = this.repository.workingDirectory().fullpath();

    for (const entry of index.entries) {
      const filePath = path.join(workDir, entry.filePath);

      try {
        const stats = await fs.stat(filePath);

        // Quick check: size and mtime
        if (entry.fileSize !== stats.size) {
          return false;
        }

        const mtimeSeconds = Math.floor(stats.mtimeMs / 1000);
        if (entry.modificationTime.seconds !== mtimeSeconds) {
          return false;
        }
      } catch {
        // File doesn't exist
        return false;
      }
    }

    return true;
  }
}

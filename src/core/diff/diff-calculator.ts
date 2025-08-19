import { Repository, ObjectReader } from '@/core/repo';
import { TreeWalker } from '@/core/tree';
import { TextDiff } from './text-diff';
import { BinaryDiff } from './binary-diff';
import { FileDiff, FileChangeType, DiffOptions, DiffStatistics } from './types';
import { logger } from '@/utils';

/**
 * DiffCalculator is the main interface for computing diffs in the repository.
 * It integrates with the existing repository structure and provides comprehensive
 * diff functionality for commits, trees, and individual files.
 */
export class DiffCalculator {
  private treeWalker: TreeWalker;

  constructor(private repository: Repository) {
    this.treeWalker = new TreeWalker(repository);
  }

  /**
   * Compute diff between two commits
   */
  public async diffCommits(
    oldCommitSha: string,
    newCommitSha: string,
    options: DiffOptions = {}
  ): Promise<FileDiff[]> {
    logger.debug(`Computing diff between ${oldCommitSha} and ${newCommitSha}`);

    const [oldFiles, newFiles] = await Promise.all([
      this.treeWalker.getCommitFiles(oldCommitSha),
      this.treeWalker.getCommitFiles(newCommitSha),
    ]);

    return await this.diffFileMaps(oldFiles, newFiles, options);
  }

  /**
   * Compute diff between two trees
   */
  public async diffTrees(
    oldTreeSha: string,
    newTreeSha: string,
    options: DiffOptions = {}
  ): Promise<FileDiff[]> {
    const [oldFiles, newFiles] = await Promise.all([
      this.treeWalker.walkTree(oldTreeSha),
      this.treeWalker.walkTree(newTreeSha),
    ]);

    return await this.diffFileMaps(oldFiles, newFiles, options);
  }

  /**
   * Compute diff for a single file between two commits
   */
  public async diffFile(
    filePath: string,
    oldCommitSha: string,
    newCommitSha: string,
    options: DiffOptions = {}
  ): Promise<FileDiff | null> {
    const [oldFiles, newFiles] = await Promise.all([
      this.treeWalker.getCommitFiles(oldCommitSha),
      this.treeWalker.getCommitFiles(newCommitSha),
    ]);

    const oldSha = oldFiles.get(filePath);
    const newSha = newFiles.get(filePath);

    if (!oldSha && !newSha) {
      return null; // File doesn't exist in either commit
    }

    return await this.diffSingleFile(filePath, oldSha, newSha, options);
  }

  /**
   * Compute statistics for a set of file diffs
   */
  public computeStatistics(fileDiffs: FileDiff[]): DiffStatistics {
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    let totalLines = 0;

    for (const fileDiff of fileDiffs) {
      if (fileDiff.type !== FileChangeType.RENAMED || fileDiff.hunks.length > 0) {
        filesChanged++;
      }

      for (const hunk of fileDiff.hunks) {
        hunk.lines.forEach((line) => {
          totalLines++;

          switch (line.type) {
            case 'addition':
              insertions++;
              break;
            case 'deletion':
              deletions++;
              break;
          }
        });
      }
    }

    return {
      filesChanged,
      insertions,
      deletions,
      totalLines,
    };
  }

  /**
   * Diff two file maps (path -> SHA mappings)
   */
  private async diffFileMaps(
    oldFiles: Map<string, string>,
    newFiles: Map<string, string>,
    options: DiffOptions
  ): Promise<FileDiff[]> {
    const fileDiffs: FileDiff[] = [];
    const processedPaths = new Set<string>();

    const allPaths = new Set([...oldFiles.keys(), ...newFiles.keys()]);

    for (const filePath of allPaths) {
      if (processedPaths.has(filePath)) continue;

      const oldSha = oldFiles.get(filePath);
      const newSha = newFiles.get(filePath);

      const fileDiff = await this.diffSingleFile(filePath, oldSha, newSha, options);
      if (fileDiff) {
        fileDiffs.push(fileDiff);
        processedPaths.add(filePath);
      }
    }

    return fileDiffs;
  }

  /**
   * Diff a single file
   */
  private async diffSingleFile(
    filePath: string,
    oldSha: string | undefined,
    newSha: string | undefined,
    options: DiffOptions
  ): Promise<FileDiff | null> {
    const changeType = this.determineChangeType(oldSha, newSha);

    if (changeType === FileChangeType.MODE_CHANGED && oldSha === newSha) {
      return {
        oldPath: filePath,
        newPath: filePath,
        oldSha,
        newSha,
        type: changeType,
        hunks: [],
        isBinary: false,
      };
    }

    const [oldContent, newContent] = await Promise.all([
      oldSha ? this.getFileContent(oldSha) : null,
      newSha ? this.getFileContent(newSha) : null,
    ]);

    const isBinary = this.isBinaryFile(oldContent, newContent);

    if (isBinary) {
      // Binary files - no content diff
      return {
        oldPath: filePath,
        newPath: filePath,
        oldSha,
        newSha,
        type: changeType,
        hunks: [],
        isBinary: true,
      };
    }

    const oldText = oldContent ? new TextDecoder().decode(oldContent) : '';
    const newText = newContent ? new TextDecoder().decode(newContent) : '';

    if (options.maxFileSize) {
      const totalSize = oldText.length + newText.length;
      if (totalSize > options.maxFileSize) {
        return {
          oldPath: filePath,
          newPath: filePath,
          oldSha,
          newSha,
          type: changeType,
          hunks: [],
          isBinary: false,
        };
      }
    }

    const edits = TextDiff.computeLineDiff(oldText, newText, options);
    const hunks = TextDiff.createHunks(edits, options.contextLines);

    return {
      oldPath: filePath,
      newPath: filePath,
      oldSha,
      newSha,
      type: changeType,
      hunks,
      isBinary: false,
    };
  }

  /**
   * Get file content from blob SHA
   */
  private async getFileContent(blobSha: string): Promise<Uint8Array> {
    const blob = await ObjectReader.reabBlobOrThrow(this.repository, blobSha);
    return blob.content();
  }

  private determineChangeType(oldSha: string | undefined, newSha: string | undefined) {
    if (!oldSha && newSha) {
      return FileChangeType.ADDED;
    }

    if (oldSha && !newSha) {
      return FileChangeType.DELETED;
    }

    if (oldSha && newSha) {
      return oldSha === newSha ? FileChangeType.MODE_CHANGED : FileChangeType.MODIFIED;
    }

    throw new Error('error in determining change type');
  }

  /**
   * Check if file is binary
   */
  private isBinaryFile(oldContent: Uint8Array | null, newContent: Uint8Array | null): boolean {
    if (oldContent && BinaryDiff.isBinary(oldContent)) return true;
    if (newContent && BinaryDiff.isBinary(newContent)) return true;
    return false;
  }
}

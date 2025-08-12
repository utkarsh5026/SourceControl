import { ObjectReader, Repository } from '@/core/repo';
import { ChangeAnalysis, FileOperation, TreeFileInfo } from './types';
import { TreeEntry } from '@/core/objects/tree/tree-entry';
import { PathUtils } from '@/utils';
import { GitIndex } from '@/core/index';

/**
 * TreeAnalyzer handles tree walking and change analysis.
 * Focused on understanding what files exist and what changes are needed.
 */
export class TreeAnalyzer {
  constructor(private repository: Repository) {}

  /**
   * Check if two trees are identical
   */
  public async areTreesIdentical(treeSha1: string, treeSha2: string): Promise<boolean> {
    if (treeSha1 === treeSha2) return true;

    const [tree1Files, tree2Files] = await Promise.all([
      this.getTreeFiles(treeSha1),
      this.getTreeFiles(treeSha2),
    ]);

    if (tree1Files.size !== tree2Files.size) return false;

    for (const [path, info1] of tree1Files) {
      const info2 = tree2Files.get(path);
      if (!info2 || this.hasChanged(info1, info2)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all files from a tree recursively with proper path normalization
   */
  public async getTreeFiles(
    treeSha: string,
    basePath: string = ''
  ): Promise<Map<string, TreeFileInfo>> {
    const files = new Map<string, TreeFileInfo>();

    const tree = await ObjectReader.readTree(this.repository, treeSha);

    for (const entry of tree.entries) {
      const fullPath = PathUtils.normalizePath(basePath, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.getTreeFiles(entry.sha, fullPath);
        subFiles.forEach((info, path) => files.set(path, info));
        continue;
      }

      if (this.isSupportedFileType(entry)) {
        files.set(fullPath, {
          sha: entry.sha,
          mode: entry.mode,
        });
      }
    }

    return files;
  }

  /**
   * Analyze what changes are needed to transform current state to target state
   */
  public analyzeChanges(
    currentFiles: Map<string, TreeFileInfo>,
    targetFiles: Map<string, TreeFileInfo>
  ): ChangeAnalysis {
    const operations: FileOperation[] = [];
    const summary = { created: 0, modified: 0, deleted: 0 };

    const registerDeleted = (filePath: string) => {
      operations.push({
        path: filePath,
        action: 'delete',
      });
      summary.deleted++;
    };

    const registerCreated = (filePath: string, targetInfo: TreeFileInfo) => {
      operations.push({
        path: filePath,
        action: 'create',
        blobSha: targetInfo.sha,
        mode: targetInfo.mode,
      });
      summary.created++;
    };

    const registerModified = (filePath: string, targetInfo: TreeFileInfo) => {
      operations.push({
        path: filePath,
        action: 'modify',
        blobSha: targetInfo.sha,
        mode: targetInfo.mode,
      });
      summary.modified++;
    };

    for (const filePath of currentFiles.keys()) {
      if (!targetFiles.has(filePath)) {
        registerDeleted(filePath);
      }
    }

    for (const [filePath, targetInfo] of targetFiles) {
      const currentInfo = currentFiles.get(filePath);

      if (!currentInfo) registerCreated(filePath, targetInfo);
      else if (this.hasChanged(currentInfo, targetInfo)) {
        registerModified(filePath, targetInfo);
      }
    }

    return { operations, summary };
  }

  /**
   * Get files from the current index
   */
  public getIndexFiles(index: GitIndex): Map<string, TreeFileInfo> {
    const files = new Map<string, TreeFileInfo>();

    for (const entry of index.entries) {
      files.set(entry.filePath, {
        sha: entry.contentHash,
        mode: entry.fileMode.toString(8), // Convert to octal string
      });
    }

    return files;
  }

  /**
   * Check if the entry type is supported
   */
  private isSupportedFileType(entry: TreeEntry): boolean {
    return entry.isFile() || entry.isExecutable() || entry.isSymbolicLink() || entry.isSubmodule();
  }

  /**
   * Check if a file has changed (content or mode)
   */
  private hasChanged(current: TreeFileInfo, target: TreeFileInfo): boolean {
    return current.sha !== target.sha || current.mode !== target.mode;
  }
}

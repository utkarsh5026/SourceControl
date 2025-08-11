import { Repository } from '@/core/repo';
import { GitIndex, IndexEntry } from '@/core/index';
import { EntryType, TreeEntry } from '@/core/objects/tree/tree-entry';
import path from 'path';
import { TreeObject } from '@/core/objects';

/**
 * TreeBuilder creates Git tree objects from the index using a bottom-up approach.
 *
 * Think of it like building a house: start with individual rooms (files),
 * group them into floors (directories), then combine into the complete house (root tree).
 */
export class TreeBuilder {
  private repository: Repository;

  constructor(repository: Repository) {
    this.repository = repository;
  }

  /**
   * Build a tree from the current index
   * Returns the SHA of the root tree
   */
  public async buildTreeFromIndex(index: GitIndex): Promise<string> {
    const { filesByDirectory, allDirectories } = this.analyzeDirectoryStructure(index.entries);

    return await this.buildTreesBottomUp(filesByDirectory, allDirectories);
  }

  /**
   * Analyze the directory structure and group files by their containing directory
   * Also identifies all directories that need tree objects
   */
  private analyzeDirectoryStructure(entries: IndexEntry[]) {
    const filesByDirectory = new Map<string, IndexEntry[]>();
    const allDirectories = new Set<string>();

    filesByDirectory.set('', []);
    allDirectories.add('');

    for (const entry of entries) {
      const directoryPath = this.getDirectoryPath(entry.filePath);

      if (!filesByDirectory.has(directoryPath)) {
        filesByDirectory.set(directoryPath, []);
      }
      filesByDirectory.get(directoryPath)!.push(entry);

      this.ensureAllParentDirectoriesTracked(directoryPath, allDirectories);
    }

    return {
      filesByDirectory,
      allDirectories: Array.from(allDirectories),
    };
  }

  /**
   * Build tree objects from deepest directories to root
   * This ensures child trees exist before we reference them in parent trees
   */
  private async buildTreesBottomUp(
    filesByDirectory: Map<string, IndexEntry[]>,
    allDirectories: string[]
  ): Promise<string> {
    const directoriesByDepth = this.sortDirectoriesByDepth(allDirectories);
    const treeShaBydirectory = new Map<string, string>();

    for (const directoryPath of directoriesByDepth) {
      const treeEntries: TreeEntry[] = [];

      const filesInDirectory = filesByDirectory.get(directoryPath) || [];
      filesInDirectory.forEach((file) => {
        treeEntries.push(this.createFileTreeEntry(file));
      });

      const immediateSubdirectories = this.getImmediateSubdirectories(
        directoryPath,
        allDirectories
      );

      immediateSubdirectories.forEach((subdirName) => {
        const subdirFullPath = directoryPath ? `${directoryPath}/${subdirName}` : subdirName;
        const subdirTreeSha = treeShaBydirectory.get(subdirFullPath)!;
        treeEntries.push(new TreeEntry(EntryType.DIRECTORY, subdirName, subdirTreeSha));
      });

      const tree = new TreeObject(treeEntries);
      const treeSha = await this.repository.writeObject(tree);
      treeShaBydirectory.set(directoryPath, treeSha);
    }

    return treeShaBydirectory.get('')!;
  }

  /**
   * Sort directories by depth (deepest first)
   * Example: ["src/core/nested", "src/core", "src", ""]
   */
  private sortDirectoriesByDepth(directories: string[]): string[] {
    return directories.sort((a, b) => {
      const aDepth = a === '' ? 0 : a.split('/').length;
      const bDepth = b === '' ? 0 : b.split('/').length;
      return bDepth - aDepth;
    });
  }

  /**
   * Get the immediate subdirectories of a given directory
   * For "src", this would return ["core", "utils"] but not ["core/nested"]
   */
  private getImmediateSubdirectories(parentPath: string, allDirectories: string[]): string[] {
    const immediateChildren = new Set<string>();

    for (const dir of allDirectories) {
      if (dir === parentPath) continue;

      const isChild =
        parentPath === ''
          ? !dir.includes('/') && dir !== ''
          : dir.startsWith(parentPath + '/') && !dir.substring(parentPath.length + 1).includes('/');

      if (isChild) {
        const childName = parentPath === '' ? dir : dir.substring(parentPath.length + 1);
        immediateChildren.add(childName);
      }
    }

    return Array.from(immediateChildren);
  }

  /**
   * Get the directory path for a file
   * "src/core/file.ts" → "src/core"
   * "README.md" → ""
   */
  private getDirectoryPath(filePath: string): string {
    const dir = path.dirname(filePath);
    return dir === '.' ? '' : dir.replace(/\\/g, '/');
  }

  /**
   * Ensure all parent directories are tracked
   * For "src/core/nested", this ensures "src", "src/core", and "src/core/nested" are all tracked
   */
  private ensureAllParentDirectoriesTracked(dirPath: string, allDirectories: Set<string>): void {
    let currentPath = dirPath;

    while (currentPath && currentPath !== '.') {
      allDirectories.add(currentPath);
      const parentPath = this.getDirectoryPath(currentPath);
      currentPath = parentPath;
    }
  }

  /**
   * Create a tree entry for a file (converts IndexEntry to TreeEntry)
   */
  private createFileTreeEntry(indexEntry: IndexEntry): TreeEntry {
    const fileName = path.basename(indexEntry.filePath);

    let gitMode: string;
    if (indexEntry.isSymlink) {
      gitMode = EntryType.SYMBOLIC_LINK;
    } else if (indexEntry.isGitlink) {
      gitMode = EntryType.SUBMODULE;
    } else if ((indexEntry.fileMode & 0o111) !== 0) {
      gitMode = EntryType.EXECUTABLE_FILE;
    } else {
      gitMode = EntryType.REGULAR_FILE;
    }

    return new TreeEntry(gitMode, fileName, indexEntry.contentHash);
  }
}

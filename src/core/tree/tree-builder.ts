import { Repository } from '@/core/repo';
import { GitIndex, IndexEntry } from '@/core/index';
import { EntryType, TreeEntry } from '@/core/objects/tree/tree-entry';
import path from 'path';
import { TreeObject } from '@/core/objects';

type DirectoryMap = Map<string, IndexEntry[]>;

/**
 * TreeBuilder creates Git tree objects from the index.
 *
 * The index is a flat list of files, but Git stores them as a hierarchy of trees.
 * This class converts the flat structure into the hierarchical tree structure.
 *
 * Example transformation:
 * Index entries:
 *   - src/core/file1.ts
 *   - src/core/file2.ts
 *   - src/utils/helper.ts
 *   - README.md
 *
 * Becomes tree structure:
 *   root tree
 *   ├── README.md (blob)
 *   └── src/ (tree)
 *       ├── core/ (tree)
 *       │   ├── file1.ts (blob)
 *       │   └── file2.ts (blob)
 *       └── utils/ (tree)
 *           └── helper.ts (blob)
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
  public async buildFromIndex(index: GitIndex): Promise<string> {
    const directoryMap = this.groupEntriesByDirectory(index.entries);

    return await this.buildTreeRecursive(directoryMap, '');
  }

  /**
   * Group index entries by their directory paths
   */
  private groupEntriesByDirectory(entries: IndexEntry[]): DirectoryMap {
    const directoryMap = new Map<string, IndexEntry[]>();
    directoryMap.set('', []);

    /**
     * Get the parent directory of a given directory
     */
    const getParentDir = (dir: string) => {
      const parentDir = path.dirname(dir);
      return parentDir === '.' ? '' : parentDir.replace(/\\/g, '/');
    };

    /**
     * Add a directory to the map if not exists
     */
    const addIfNotExists = (dir: string) => {
      if (!directoryMap.has(dir)) {
        directoryMap.set(dir, []);
      }
    };

    /**
     * Add all parent directories to the map if not addded
     */
    const addAllParents = (dir: string) => {
      let currentDir = dir;
      while (currentDir && currentDir !== '.') {
        const parentDir = getParentDir(currentDir);
        addIfNotExists(parentDir);
        currentDir = parentDir;
      }
    };

    entries.forEach((entry) => {
      const dir = getParentDir(entry.name);
      addIfNotExists(dir);
      directoryMap.get(dir)!.push(entry);
      addAllParents(dir);
    });

    return directoryMap;
  }

  /**
   * Recursively build tree objects from bottom to top and get the SHA
   */
  private async buildTreeRecursive(
    directoryMap: DirectoryMap,
    currentPath: string
  ): Promise<string> {
    const entries: TreeEntry[] = [];
    const processedSubdirs = new Set<string>();
    const indexEntries = directoryMap.get(currentPath) || [];

    indexEntries.forEach((entry) => {
      entries.push(this.createTreeEntryFromIndexEntry(entry));
    });

    for (const [dirPath] of directoryMap) {
      if (dirPath === currentPath) continue;

      const relativePath = currentPath
        ? dirPath.startsWith(currentPath + '/')
          ? dirPath.substring(currentPath.length + 1)
          : null
        : dirPath;

      if (!relativePath) continue;

      if (!relativePath.includes('/')) {
        if (processedSubdirs.has(relativePath)) continue;
        processedSubdirs.add(relativePath);

        const fullSubdirPath = currentPath ? `${currentPath}/${relativePath}` : relativePath;
        const subTreeSha = await this.buildTreeRecursive(directoryMap, fullSubdirPath);

        entries.push(new TreeEntry(EntryType.DIRECTORY, relativePath, subTreeSha));
      }
    }

    const tree = new TreeObject(entries);
    const sha = await this.repository.writeObject(tree);
    return sha;
  }

  /**
   * Create a tree entry from an index entry
   */
  private createTreeEntryFromIndexEntry(entry: IndexEntry) {
    const { name, isSymlink, isGitlink, sha, mode: entryMode } = entry;
    const basename = path.basename(name);

    let mode: string;
    if (isSymlink) mode = EntryType.SYMBOLIC_LINK;
    else if (isGitlink) mode = EntryType.SUBMODULE;
    else if ((entryMode & 0o111) !== 0) mode = EntryType.EXECUTABLE_FILE;
    else mode = EntryType.REGULAR_FILE;

    return new TreeEntry(mode, basename, sha);
  }
}

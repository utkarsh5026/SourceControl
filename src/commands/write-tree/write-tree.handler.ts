import { BlobObject, TreeObject } from '@/core/objects';
import { TreeEntry, EntryType } from '@/core/objects/tree/tree-entry';
import { Repository, SourceRepository } from '@/core/repo';
import { FileUtils } from '@/utils';
import path from 'path';
import fs from 'fs-extra';
import { IgnorePattern } from '@/core/ignore';

export const createTreeFromDirectory = async (
  repository: Repository,
  dirPath: string,
  excludeGitDir: boolean
): Promise<string> => {
  const entries: TreeEntry[] = [];

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      if (excludeGitDir && (item.name === '.git' || item.name === SourceRepository.DEFAULT_GIT_DIR))
        continue;
      if (item.name.startsWith('.') && item.name !== IgnorePattern.DEFAULT_SOURCE) continue;

      const entry = await createTreeEntry(repository, dirPath, item, excludeGitDir);
      entries.push(entry);
    }

    const tree = new TreeObject(entries);
    const treeSha = await repository.writeObject(tree);
    return treeSha;
  } catch (error) {
    throw new Error(`failed to create tree from directory ${dirPath}: ${(error as Error).message}`);
  }
};

const handleFile = async (
  repository: Repository,
  dirPath: string,
  item: fs.Dirent
): Promise<TreeEntry> => {
  const itemPath = path.join(dirPath, item.name);
  const fileContent = await FileUtils.readFile(itemPath);
  const blob = new BlobObject(new Uint8Array(fileContent));
  const blobSha = await repository.writeObject(blob);

  const stats = await fs.stat(itemPath);
  const isExecutable = !!(stats.mode & parseInt('100', 8));
  const mode = isExecutable ? EntryType.EXECUTABLE_FILE : EntryType.REGULAR_FILE;

  const blobEntry = new TreeEntry(mode, item.name, blobSha);
  return blobEntry;
};

const handleDirectory = async (
  repository: Repository,
  dirPath: string,
  item: fs.Dirent,
  excludeGitDir: boolean
): Promise<TreeEntry> => {
  const itemPath = path.join(dirPath, item.name);
  const subTreeSha = await createTreeFromDirectory(repository, itemPath, excludeGitDir);
  const treeEntry = new TreeEntry(EntryType.DIRECTORY, item.name, subTreeSha);
  return treeEntry;
};

const handleSymbolicLink = async (
  repository: Repository,
  dirPath: string,
  item: fs.Dirent
): Promise<TreeEntry> => {
  const itemPath = path.join(dirPath, item.name);
  const linkTarget = await fs.readlink(itemPath);
  const linkBlob = new BlobObject(new TextEncoder().encode(linkTarget));
  const linkSha = await repository.writeObject(linkBlob);
  const linkEntry = new TreeEntry(EntryType.SYMBOLIC_LINK, item.name, linkSha);
  return linkEntry;
};

const createTreeEntry = async (
  repository: Repository,
  dirPath: string,
  item: fs.Dirent,
  excludeGitDir: boolean
): Promise<TreeEntry> => {
  if (item.isDirectory()) return await handleDirectory(repository, dirPath, item, excludeGitDir);

  if (item.isFile()) return await handleFile(repository, dirPath, item);

  if (item.isSymbolicLink()) return await handleSymbolicLink(repository, dirPath, item);

  throw new Error(`unknown item type: ${item.name}`);
};

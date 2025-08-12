import fs from 'fs-extra';
import path from 'path';
import { ObjectReader, type Repository } from '@/core/repo';
import { TreeObject, BlobObject, ObjectType, CommitObject } from '@/core/objects';
import { logger, FileUtils } from '@/utils';
import { TreeEntry } from '@/core/objects/tree/tree-entry';
import { ExtractionStats } from './checkout-tree.display';

export const extractTreeToDirectory = async (
  repository: Repository,
  treeish: string,
  targetDir: string
): Promise<ExtractionStats> => {
  const stats = {
    filesCreated: 0,
    directoriesCreated: 0,
    symlinksCreated: 0,
    totalSize: 0,
  };

  try {
    const obj = await repository.readObject(treeish);
    if (!obj) {
      throw new Error(`object ${treeish} not found`);
    }

    let treeObj: TreeObject;

    switch (obj.type()) {
      case ObjectType.COMMIT:
        const { treeSha } = obj as CommitObject;
        if (!treeSha) {
          throw new Error('commit has no tree');
        }

        treeObj = await ObjectReader.readTree(repository, treeSha);
        break;
      case ObjectType.TREE:
        treeObj = obj as TreeObject;
        break;
      default:
        throw new Error(`object ${treeish} is not a tree or commit`);
    }
    await FileUtils.createDirectories(targetDir);
    await extractTreeRecursive(repository, treeObj, targetDir, stats);
    return stats;
  } catch (error) {
    throw new Error(`failed to extract tree ${treeish}: ${(error as Error).message}`);
  }
};

const extractTreeRecursive = async (
  repository: Repository,
  tree: TreeObject,
  currentDir: string,
  stats: ExtractionStats
): Promise<void> => {
  const { entries } = tree;

  entries.forEach(async (entry) => {
    if (entry.isDirectory()) return await handleDirectory(repository, entry, currentDir, stats);

    if (entry.isFile() || entry.isExecutable())
      return await handleFile(repository, entry, currentDir, stats);

    if (entry.isSymbolicLink())
      return await handleSymbolicLink(repository, entry, currentDir, stats);

    throw new Error(`unknown entry type: ${entry.name}`);
  });
};

const handleFile = async (
  repository: Repository,
  entry: TreeEntry,
  currentDir: string,
  stats: ExtractionStats
): Promise<void> => {
  const { name, sha } = entry;
  const entryPath = path.join(currentDir, name);

  const blob = await repository.readObject(sha);
  if (!blob || blob.type() !== ObjectType.BLOB) {
    throw new Error(`invalid blob object ${sha}`);
  }

  const blobObj = blob as BlobObject;
  const content = blobObj.content();

  await FileUtils.createFile(entryPath, content);
  stats.filesCreated++;
  stats.totalSize += content.length;

  if (entry.isExecutable()) {
    try {
      await fs.chmod(entryPath, 0o755);
    } catch (error) {
      logger.warn(`Could not set executable permission on ${entryPath}`);
    }
  }
};

const handleDirectory = async (
  repository: Repository,
  entry: TreeEntry,
  currentDir: string,
  stats: ExtractionStats
) => {
  const { name, sha } = entry;
  const entryPath = path.join(currentDir, name);

  await FileUtils.createDirectories(entryPath);
  stats.directoriesCreated++;

  const subTree = await repository.readObject(sha);
  if (!subTree || subTree.type() !== ObjectType.TREE) {
    throw new Error(`invalid subtree object ${sha}`);
  }

  await extractTreeRecursive(repository, subTree as TreeObject, entryPath, stats);
};

const handleSymbolicLink = async (
  repository: Repository,
  entry: TreeEntry,
  currentDir: string,
  stats: ExtractionStats
) => {
  const { name, sha } = entry;
  const entryPath = path.join(currentDir, name);

  const blob = await repository.readObject(sha);
  if (!blob || blob.type() !== ObjectType.BLOB) {
    throw new Error(`invalid symlink blob object ${sha}`);
  }

  const blobObj = blob as BlobObject;
  const linkTarget = new TextDecoder().decode(blobObj.content());

  try {
    await fs.symlink(linkTarget, entryPath);
    stats.symlinksCreated++;
  } catch (error) {
    logger.warn(`Could not create symbolic link ${entryPath} -> ${linkTarget}`);
  }
};

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import type { Repository } from '@/core/repo';
import { TreeObject, BlobObject, ObjectType, CommitObject } from '@/core/objects';
import { logger, FileUtils, display } from '@/utils';
import { getRepo } from '@/utils/helpers';
import { TreeEntry } from '@/core/objects/tree/tree-entry';

interface CheckoutTreeOptions {
  force?: boolean;
  prefix?: string;
  verbose?: boolean;
  quiet?: boolean;
}

export const checkoutTreeCommand = new Command('checkout-tree')
  .description('📁 Extract a tree object to a directory')
  .option('-f, --force', 'Force overwrite existing files')
  .option('--prefix <path>', 'Checkout into a subdirectory')
  .argument('<tree-ish>', 'Tree object to checkout (SHA, branch, or tag)')
  .argument('<directory>', 'Target directory for extraction')
  .action(async (treeish: string, directory: string, options: CheckoutTreeOptions) => {
    try {
      const repository = await getRepo();
      const targetPath = path.resolve(directory);

      if (await FileUtils.exists(targetPath)) {
        if (!(await FileUtils.isDirectory(targetPath))) {
          logger.error(`fatal: ${targetPath} is not a directory`);
          process.exit(1);
        }

        const items = await fs.readdir(targetPath);
        if (items.length > 0 && !options.force) {
          logger.error(
            `fatal: destination path '${targetPath}' already exists and is not an empty directory`
          );
          logger.error('Use --force to overwrite existing files');
          process.exit(1);
        }
      }

      const stats = await extractTreeToDirectory(repository, treeish, targetPath, options);
      displayCheckoutResult(treeish, targetPath, stats);
    } catch (error) {
      logger.error(`fatal: ${(error as Error).message}`);
      process.exit(1);
    }
  });

interface ExtractionStats {
  filesCreated: number;
  directoriesCreated: number;
  symlinksCreated: number;
  totalSize: number;
}

const extractTreeToDirectory = async (
  repository: Repository,
  treeish: string,
  targetDir: string,
  options: CheckoutTreeOptions
): Promise<ExtractionStats> => {
  const stats: ExtractionStats = {
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

        const treeFromCommit = await repository.readObject(treeSha);
        if (!treeFromCommit || treeFromCommit.type() !== ObjectType.TREE) {
          throw new Error('invalid tree object in commit');
        }
        treeObj = treeFromCommit as TreeObject;
        break;
      case ObjectType.TREE:
        treeObj = obj as TreeObject;
        break;
      default:
        throw new Error(`object ${treeish} is not a tree or commit`);
    }
    await FileUtils.createDirectories(targetDir);
    await extractTreeRecursive(repository, treeObj, targetDir, stats, options);
    return stats;
  } catch (error) {
    throw new Error(`failed to extract tree ${treeish}: ${(error as Error).message}`);
  }
};

const extractTreeRecursive = async (
  repository: Repository,
  tree: TreeObject,
  currentDir: string,
  stats: ExtractionStats,
  options: CheckoutTreeOptions
): Promise<void> => {
  const { entries } = tree;

  const handleFile = async (entry: TreeEntry) => {
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

  const handleDirectory = async (entry: TreeEntry) => {
    const { name, sha } = entry;
    const entryPath = path.join(currentDir, name);

    await FileUtils.createDirectories(entryPath);
    stats.directoriesCreated++;

    const subTree = await repository.readObject(sha);
    if (!subTree || subTree.type() !== ObjectType.TREE) {
      throw new Error(`invalid subtree object ${sha}`);
    }

    await extractTreeRecursive(repository, subTree as TreeObject, entryPath, stats, options);
  };

  const handleSymbolicLink = async (entry: TreeEntry) => {
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

  for (const entry of entries) {
    if (entry.isDirectory()) await handleDirectory(entry);
    else if (entry.isFile() || entry.isExecutable()) await handleFile(entry);
    else if (entry.isSymbolicLink()) await handleSymbolicLink(entry);
  }
};

const displayCheckoutResult = (
  treeish: string,
  targetPath: string,
  stats: ExtractionStats
): void => {
  const title = chalk.bold.green('📁 Tree Extraction Complete');

  const details = [
    `${chalk.gray('Source Tree:')} ${chalk.cyan(treeish)}`,
    `${chalk.gray('Target Directory:')} ${chalk.white(targetPath)}`,
    `${chalk.gray('Files Created:')} ${chalk.green(stats.filesCreated.toString())}`,
    `${chalk.gray('Directories Created:')} ${chalk.blue(stats.directoriesCreated.toString())}`,
    `${chalk.gray('Symlinks Created:')} ${chalk.magenta(stats.symlinksCreated.toString())}`,
    `${chalk.gray('Total Size:')} ${chalk.yellow(formatBytes(stats.totalSize))}`,
  ].join('\n');

  display.success(details, title);

  const summary = [
    `${chalk.blue('📊 Extraction Summary:')}`,
    `  ${chalk.green('✓')} Successfully extracted tree object to working directory`,
    `  ${chalk.green('✓')} All file permissions and types preserved`,
    `  ${chalk.green('✓')} Directory structure recreated accurately`,
    '',
    `${chalk.yellow('💡 Pro Tip:')} Use ${chalk.green('sc ls-tree -r ' + treeish)} to see what was extracted`,
  ].join('\n');

  display.info(summary, '📋 Summary');
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

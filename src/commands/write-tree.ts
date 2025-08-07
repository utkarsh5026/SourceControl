import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import type { Repository } from '@/core/repo';
import { TreeObject, BlobObject } from '@/core/objects';
import { TreeEntry, EntryType } from '@/core/objects/tree/tree-entry';
import { logger, FileUtils, display } from '@/utils';
import { getRepo } from '@/utils/helpers';

interface WriteTreeOptions {
  prefix?: string;
  excludeGitDir?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export const writeTreeCommand = new Command('write-tree')
  .description('🌲 Create a tree object from the current working directory')
  .option('--prefix <path>', 'Write tree for subdirectory only')
  .option('--exclude-git-dir', 'Exclude .git/.source directories', true)
  .action(async (options: WriteTreeOptions) => {
    try {
      const repository = await getRepo();
      const workingDir = repository.workingDirectory().toString();
      const targetDir = options.prefix ? path.resolve(workingDir, options.prefix) : workingDir;

      if (!(await FileUtils.isDirectory(targetDir)))
        throw new Error(`${targetDir} is not a directory`);

      const treeSha = await createTreeFromDirectory(repository, targetDir, options);
      displayWriteTreeResult(treeSha, targetDir, options.prefix);
    } catch (error) {
      logger.error(`error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

const createTreeFromDirectory = async (
  repository: Repository,
  dirPath: string,
  options: WriteTreeOptions
): Promise<string> => {
  const entries: TreeEntry[] = [];

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    const handleFile = async (item: fs.Dirent) => {
      const itemPath = path.join(dirPath, item.name);
      const fileContent = await FileUtils.readFile(itemPath);
      const blob = new BlobObject(new Uint8Array(fileContent));
      const blobSha = await repository.writeObject(blob);

      // Determine file mode
      const stats = await fs.stat(itemPath);
      const isExecutable = !!(stats.mode & parseInt('100', 8));
      const mode = isExecutable ? EntryType.EXECUTABLE_FILE : EntryType.REGULAR_FILE;

      const blobEntry = new TreeEntry(mode, item.name, blobSha);
      entries.push(blobEntry);
      logger.debug(`Created blob ${blobSha} for file ${item.name}`);
    };

    const handleDirectory = async (item: fs.Dirent) => {
      const itemPath = path.join(dirPath, item.name);
      const subTreeSha = await createTreeFromDirectory(repository, itemPath, options);
      const treeEntry = new TreeEntry(EntryType.DIRECTORY, item.name, subTreeSha);
      entries.push(treeEntry);
      logger.debug(`Created subtree ${subTreeSha} for directory ${item.name}`);
    };

    const handleSymbolicLink = async (item: fs.Dirent) => {
      const itemPath = path.join(dirPath, item.name);
      const linkTarget = await fs.readlink(itemPath);
      const linkBlob = new BlobObject(new TextEncoder().encode(linkTarget));
      const linkSha = await repository.writeObject(linkBlob);
      const linkEntry = new TreeEntry(EntryType.SYMBOLIC_LINK, item.name, linkSha);
      entries.push(linkEntry);
      logger.debug(`Created symlink blob ${linkSha} for ${item.name} -> ${linkTarget}`);
    };

    for (const item of items) {
      if (options.excludeGitDir && (item.name === '.git' || item.name === '.source')) continue;
      if (item.name.startsWith('.') && item.name !== '.gitignore') continue;

      if (item.isDirectory()) await handleDirectory(item);
      else if (item.isFile()) await handleFile(item);
      else if (item.isSymbolicLink()) await handleSymbolicLink(item);
    }

    const tree = new TreeObject(entries);
    const treeSha = await repository.writeObject(tree);

    logger.debug(`Created tree ${treeSha} with ${entries.length} entries`);

    return treeSha;
  } catch (error) {
    throw new Error(`failed to create tree from directory ${dirPath}: ${(error as Error).message}`);
  }
};

const displayWriteTreeResult = (treeSha: string, dirPath: string, prefix?: string): void => {
  const title = chalk.bold.green('🌲 Tree Object Created');

  const details = [
    `${chalk.gray('Directory:')} ${chalk.white(dirPath)}`,
    ...(prefix ? [`${chalk.gray('Prefix:')} ${chalk.cyan(prefix)}`] : []),
    `${chalk.gray('Tree SHA:')} ${chalk.green.bold(treeSha)}`,
    `${chalk.gray('Status:')} ${chalk.green('✅ Written to object store')}`,
  ].join('\n');

  display.success(details, title);

  const nextSteps = [
    `${chalk.blue('💡 What you can do next:')}`,
    `  ${chalk.green('sc ls-tree ' + treeSha)}        ${chalk.gray('List tree contents')}`,
    `  ${chalk.green('sc cat-file -p ' + treeSha)}    ${chalk.gray('Show tree object details')}`,
    `  ${chalk.green('sc checkout-tree ' + treeSha)}  ${chalk.gray('Extract tree to directory')}`,
  ].join('\n');

  display.info(nextSteps, '🎯 Next Steps');
};

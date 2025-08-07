import { Command } from 'commander';
import chalk from 'chalk';
import type { Repository } from '@/core/repo';
import { TreeObject, ObjectType, CommitObject } from '@/core/objects';
import { display, logger } from '@/utils';
import { getRepo } from '@/utils/helpers';
import type { TreeEntry } from '@/core/objects/tree/tree-entry';

interface LsTreeOptions {
  recursive?: boolean;
  nameOnly?: boolean;
  longFormat?: boolean;
  treeOnly?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export const lsTreeCommand = new Command('ls-tree')
  .description('🌳 List the contents of a tree object')
  .option('-r, --recursive', 'Recurse into subdirectories')
  .option('--name-only', 'List only filenames')
  .option('-l, --long', 'Show object size (only for blobs)')
  .option('-d, --tree-only', 'Show only trees, not blobs')
  .argument('<tree-ish>', 'Tree object to list (SHA, branch, or tag)')
  .action(async (treeish: string, options: LsTreeOptions) => {
    try {
      const repository = await getRepo();
      await listTree(repository, treeish, options);
    } catch (error) {
      logger.error(`fatal: ${(error as Error).message}`);
      process.exit(1);
    }
  });

const listTree = async (
  repository: Repository,
  treeish: string,
  options: LsTreeOptions,
  prefix: string = ''
): Promise<void> => {
  try {
    const obj = await repository.readObject(treeish);

    if (!obj) {
      throw new Error(`object ${treeish} not found`);
    }

    let treeObj: TreeObject;

    switch (obj.type()) {
      case ObjectType.COMMIT: {
        const { treeSha } = obj as CommitObject;
        if (!treeSha) throw new Error('commit has no tree');

        const treeFromCommit = await repository.readObject(treeSha);
        if (!treeFromCommit || treeFromCommit.type() !== ObjectType.TREE)
          throw new Error('invalid tree object in commit');

        treeObj = treeFromCommit as TreeObject;
        break;
      }

      case ObjectType.TREE: {
        treeObj = obj as TreeObject;
        break;
      }

      default: {
        throw new Error(`object ${treeish} is not a tree or commit`);
      }
    }

    displayTreeHeader(treeish, prefix || '<root>');
    const entries = treeObj.entries;

    if (entries.length === 0) {
      display.info('  (empty tree)', '🌳 Tree Contents');
      return;
    }

    for (const entry of entries) {
      const isTree = entry.isDirectory();

      if (options.treeOnly && !isTree) {
        continue;
      }

      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (options.nameOnly) console.log(fullPath);
      else await displayTreeEntry(repository, entry, options);

      if (options.recursive && isTree) {
        await listTree(repository, entry.sha, options, fullPath);
      }
    }
  } catch (error) {
    throw new Error(`cannot list tree ${treeish}: ${(error as Error).message}`);
  }
};

const displayTreeEntry = async (
  repository: Repository,
  entry: TreeEntry,
  options: LsTreeOptions
): Promise<void> => {
  const mode = entry.mode;
  const type = entry.isDirectory() ? 'tree' : 'blob';
  const sha = entry.sha;
  const name = entry.name;

  let sizeInfo = '';
  if (options.longFormat && !entry.isDirectory()) {
    try {
      const obj = await repository.readObject(sha);
      if (obj) {
        sizeInfo = ` ${obj.size().toString().padStart(8)}`;
      }
    } catch {
      sizeInfo = '        -';
    }
  }

  const modeColor = chalk.yellow(mode);
  const typeColor = entry.isDirectory() ? chalk.blue(type) : chalk.green(type);
  const shaColor = chalk.gray(sha);
  const nameColor = entry.isDirectory()
    ? chalk.blue.bold(name)
    : entry.isExecutable()
      ? chalk.green.bold(name)
      : chalk.white(name);

  const icon = entry.isDirectory()
    ? '📁'
    : entry.isExecutable()
      ? '⚡'
      : entry.isSymbolicLink()
        ? '🔗'
        : '📄';

  console.log(`${modeColor} ${typeColor} ${shaColor}${sizeInfo}\t${icon} ${nameColor}`);
};

const displayTreeHeader = (treeish: string, path: string): void => {
  const title = chalk.bold.blue('🌳 Tree Contents');

  const details = [
    `${chalk.gray('Tree-ish:')} ${chalk.cyan(treeish)}`,
    `${chalk.gray('Path:')} ${chalk.white(path)}`,
    `${chalk.gray('Format:')} ${chalk.yellow('mode')} ${chalk.green('type')} ${chalk.gray('sha')} ${chalk.blue('name')}`,
  ].join('\n');

  display.info(details, title);
};

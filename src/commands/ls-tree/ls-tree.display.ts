import type { Repository } from '@/core/repo';
import type { TreeEntry } from '@/core/objects/tree/tree-entry';
import chalk from 'chalk';
import { display } from '@/utils';

export const displayTreeEntry = async (
  repository: Repository,
  entry: TreeEntry,
  longFormat: boolean
): Promise<void> => {
  const mode = entry.mode;
  const type = entry.isDirectory() ? 'tree' : 'blob';
  const sha = entry.sha;
  const name = entry.name;

  let sizeInfo = '';
  if (longFormat && !entry.isDirectory()) {
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

export const displayTreeHeader = (treeish: string, path: string): void => {
  const title = chalk.bold.blue('🌳 Tree Contents');

  const details = [
    `${chalk.gray('Tree-ish:')} ${chalk.cyan(treeish)}`,
    `${chalk.gray('Path:')} ${chalk.white(path)}`,
    `${chalk.gray('Format:')} ${chalk.yellow('mode')} ${chalk.green('type')} ${chalk.gray('sha')} ${chalk.blue('name')}`,
  ].join('\n');

  display.info(details, title);
};

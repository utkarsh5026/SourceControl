import chalk from 'chalk';
import { GitObject, ObjectType, BlobObject, TreeObject, CommitObject } from '@/core/objects';
import { display, logger } from '@/utils';

export const prettyPrintObject = async (obj: GitObject, objectId: string): Promise<void> => {
  switch (obj.type()) {
    case ObjectType.BLOB:
      const blob = obj as BlobObject;
      const content = blob.content();
      const contentStr = new TextDecoder('utf-8', { fatal: false }).decode(content);

      printPrettyContent(objectId, obj.type(), contentStr);
      break;

    case ObjectType.TREE:
      const tree = obj as TreeObject;
      printPrettyTree(objectId, tree);
      break;

    case ObjectType.COMMIT:
      const commit = obj as CommitObject;
      printPrettyCommit(objectId, commit);
      break;

    case ObjectType.TAG:
      logger.error('fatal: tag objects not yet supported');
      process.exit(1);

    default:
      logger.error(`fatal: unknown object type: ${obj.type()}`);
      process.exit(1);
  }
};

export const printPrettyType = (objectId: string, type: ObjectType): void => {
  const title = chalk.bold.blue('🏷️  Object Type');

  const objectLabel = chalk.gray('Object:');
  const objectValue = chalk.cyan(objectId);

  const typeLabel = chalk.gray('Type:');
  const typeValue = chalk.green.bold(type);

  const content = [`${objectLabel} ${objectValue}`, `${typeLabel} ${typeValue}`].join('\n');
  display.info(content, title);
};

export const printPrettySize = (objectId: string, size: number): void => {
  const title = chalk.bold.blue('📏 Object Size');

  const objectLabel = chalk.gray('Object:');
  const objectValue = chalk.cyan(objectId);

  const sizeLabel = chalk.gray('Size:');
  const sizeValue = chalk.magenta(`${size} bytes`);

  const content = [`${objectLabel} ${objectValue}`, `${sizeLabel} ${sizeValue}`].join('\n');
  display.info(content, title);
};

const printPrettyContent = (objectId: string, type: ObjectType, content: string): void => {
  const title = chalk.bold.blue('📄 Object Content');

  const objectLabel = chalk.gray('Object:');
  const objectValue = chalk.cyan(objectId);

  const typeLabel = chalk.gray('Type:');
  const typeValue = chalk.green.bold(type);

  const sizeLabel = chalk.gray('Size:');
  const sizeValue = chalk.magenta(`${content.length} bytes`);

  const contentLabel = chalk.gray('Content:');

  const header = [
    `${objectLabel} ${objectValue}`,
    `${typeLabel} ${typeValue}`,
    `${sizeLabel} ${sizeValue}`,
    `${contentLabel}`,
    chalk.gray('─'.repeat(50)),
  ].join('\n');

  display.info(header + '\n' + content, title);
};

const printPrettyTree = (objectId: string, tree: TreeObject): void => {
  const title = chalk.bold.blue('🌳 Tree Object');

  const objectLabel = chalk.gray('Object:');
  const objectValue = chalk.cyan(objectId);

  const typeLabel = chalk.gray('Type:');
  const typeValue = chalk.green.bold('tree');

  const sizeLabel = chalk.gray('Size:');
  const sizeValue = chalk.magenta(`${tree.size()} bytes`);

  const entriesLabel = chalk.gray('Entries:');
  const entriesValue = chalk.yellow(`${tree.entries.length} items`);

  const header = [
    `${objectLabel} ${objectValue}`,
    `${typeLabel} ${typeValue}`,
    `${sizeLabel} ${sizeValue}`,
    `${entriesLabel} ${entriesValue}`,
    chalk.gray('─'.repeat(50)),
  ].join('\n');

  const entries = tree.entries.map(entry => {
    const modeColor = entry.isDirectory() ? chalk.blue : 
                     entry.isExecutable() ? chalk.green : chalk.white;
    const nameColor = entry.isDirectory() ? chalk.blue.bold : chalk.white;
    const typeIcon = entry.isDirectory() ? '📁' : 
                    entry.isExecutable() ? '⚡' : 
                    entry.isSymbolicLink() ? '🔗' : 
                    entry.isSubmodule() ? '📦' : '📄';
    
    return `${typeIcon} ${modeColor(entry.mode)} ${nameColor(entry.name)} ${chalk.gray(entry.sha)}`;
  }).join('\n');

  display.info(header + '\n' + entries, title);
};

const printPrettyCommit = (objectId: string, commit: CommitObject): void => {
  const title = chalk.bold.blue('📝 Commit Object');

  const objectLabel = chalk.gray('Object:');
  const objectValue = chalk.cyan(objectId);

  const typeLabel = chalk.gray('Type:');
  const typeValue = chalk.green.bold('commit');

  const sizeLabel = chalk.gray('Size:');
  const sizeValue = chalk.magenta(`${commit.size()} bytes`);

  const treeLabel = chalk.gray('Tree:');
  const treeValue = chalk.yellow(commit.treeSha || 'N/A');

  const parentLabel = chalk.gray('Parents:');
  const parentValue = commit.parentShas.length > 0 ? 
    commit.parentShas.map(sha => chalk.yellow(sha)).join(', ') : 
    chalk.gray('none (initial commit)');

  const authorLabel = chalk.gray('Author:');
  const authorValue = commit.author ? 
    `${chalk.white(commit.author.name)} <${chalk.cyan(commit.author.email)}> ${chalk.gray(new Date(commit.author.timestamp * 1000).toISOString())}` : 
    chalk.gray('N/A');

  const committerLabel = chalk.gray('Committer:');
  const committerValue = commit.committer ? 
    `${chalk.white(commit.committer.name)} <${chalk.cyan(commit.committer.email)}> ${chalk.gray(new Date(commit.committer.timestamp * 1000).toISOString())}` : 
    chalk.gray('N/A');

  const messageLabel = chalk.gray('Message:');

  const header = [
    `${objectLabel} ${objectValue}`,
    `${typeLabel} ${typeValue}`,
    `${sizeLabel} ${sizeValue}`,
    `${treeLabel} ${treeValue}`,
    `${parentLabel} ${parentValue}`,
    `${authorLabel} ${authorValue}`,
    `${committerLabel} ${committerValue}`,
    `${messageLabel}`,
    chalk.gray('─'.repeat(50)),
  ].join('\n');

  const message = commit.message || chalk.gray('(no message)');

  display.info(header + '\n' + message, title);
};

import chalk from 'chalk';
import { GitObject, ObjectType, BlobObject } from '@/core/objects';
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
      logger.error('fatal: tree objects not yet supported');
      process.exit(1);

    case ObjectType.COMMIT:
      logger.error('fatal: commit objects not yet supported');
      process.exit(1);

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

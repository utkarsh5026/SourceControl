import { Command } from 'commander';
import { PathScurry } from 'path-scurry';
import chalk from 'chalk';
import { GitObject, ObjectType, BlobObject } from '@/core/objects';
import { Repository, SourceRepository } from '@/core/repo';
import { display, logger } from '@/utils';

interface CatFileOptions {
  prettyPrint?: boolean;
  type?: boolean;
  size?: boolean;
  exists?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export const catFileCommand = new Command('cat-file')
  .description('Provide content or type and size information for repository objects')
  .option('-p, --pretty-print', 'Pretty-print the contents of the object', true)
  .option('-t, --type', 'Show the object type', true)
  .option('-s, --size', 'Show the object size', true)
  .option('-e, --exists', 'Suppress output; exit with zero status if object exists', true)
  .argument('<object>', 'The object to display')
  .action(async (objectId: string, options: CatFileOptions) => {
    try {
      const globalOptions = options as any;
      if (globalOptions.verbose) {
        logger.level = 'debug';
      } else if (globalOptions.quiet) {
        logger.level = 'silent';
      }

      const actionCount = [options.prettyPrint, options.type, options.size, options.exists].filter(
        Boolean
      ).length;

      if (actionCount !== 1) {
        logger.error('fatal: exactly one of -p, -t, -s, or -e must be specified');
        process.exit(1);
      }

      let repository: Repository | null = null;
      try {
        const pathScurry = new PathScurry(process.cwd());
        repository = await SourceRepository.findRepository(pathScurry.cwd);
      } catch (error) {
        logger.error(`fatal: ${(error as Error).message}`);
        process.exit(1);
      }

      const obj = await repository?.readObject(objectId);
      if (!obj) {
        if (!options.exists) logger.error(`fatal: Not a valid object name ${objectId}`);
        process.exit(1);
      }

      // Handle the different actions
      if (options.exists) {
        process.exit(0);
      } else if (options.type) {
        if (options.quiet) console.log(obj.type());
        else printPrettyType(objectId, obj.type());
      } else if (options.size) {
        if (options.quiet) console.log(obj.size());
        else printPrettySize(objectId, obj.size());
      } else if (options.prettyPrint)
        await prettyPrintObject(obj, objectId, options.quiet || false);
    } catch (error) {
      logger.error(`fatal: ${(error as Error).message}`);
      if (logger.level === 'debug') {
        console.error((error as Error).stack);
      }
      process.exit(1);
    }
  });

const prettyPrintObject = async (
  obj: GitObject,
  objectId: string,
  isQuiet: boolean
): Promise<void> => {
  switch (obj.type()) {
    case ObjectType.BLOB:
      const blob = obj as BlobObject;
      const content = blob.content();
      const contentStr = new TextDecoder('utf-8', { fatal: false }).decode(content);

      if (isQuiet) {
        process.stdout.write(contentStr);
      } else {
        printPrettyContent(objectId, obj.type(), contentStr);
      }
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

const printPrettyType = (objectId: string, type: ObjectType): void => {
  const title = chalk.bold.blue('🏷️  Object Type');

  const objectLabel = chalk.gray('Object:');
  const objectValue = chalk.cyan(objectId);

  const typeLabel = chalk.gray('Type:');
  const typeValue = chalk.green.bold(type);

  const content = [`${objectLabel} ${objectValue}`, `${typeLabel} ${typeValue}`].join('\n');
  display.info(content, title);
};

const printPrettySize = (objectId: string, size: number): void => {
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

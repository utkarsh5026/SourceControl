import { Command } from 'commander';
import { getRepo } from '@/utils/helpers';
import { logger } from '@/utils';
import { prettyPrintObject, printPrettyType, printPrettySize } from './cat-file.display';

interface CatFileOptions {
  prettyPrint?: boolean;
  type?: boolean;
  size?: boolean;
  exists?: boolean;
}

export const catFileCommand = new Command('cat-file')
  .description('📄 Provide content or type and size information for repository objects')
  .option('-p, --pretty-print', 'Pretty-print the contents of the object', true)
  .option('-t, --type', 'Show the object type', true)
  .option('-s, --size', 'Show the object size', true)
  .option('-e, --exists', 'Suppress output; exit with zero status if object exists', true)
  .argument('<object>', 'The object to display')
  .action(async (objectId: string, options: CatFileOptions) => {
    try {
      const actionCount = [options.prettyPrint, options.type, options.size, options.exists].filter(
        Boolean
      ).length;

      if (actionCount !== 1) {
        logger.error('fatal: exactly one of -p, -t, -s, or -e must be specified');
        process.exit(1);
      }

      const repository = await getRepo();
      const obj = await repository.readObject(objectId);
      if (!obj) {
        if (!options.exists) logger.error(`fatal: Not a valid object name ${objectId}`);
        process.exit(1);
      }

      if (options.exists) process.exit(0);
      else if (options.type) printPrettyType(objectId, obj.type());
      else if (options.size) printPrettySize(objectId, obj.size());
      else if (options.prettyPrint) await prettyPrintObject(obj, objectId);
    } catch (error) {
      logger.error(`fatal: ${(error as Error).message}`);
      process.exit(1);
    }
  });

import { Command } from 'commander';
import { logger } from '@/utils';
import { getRepo } from '@/utils/helpers';
import { hashStdin, hashFiles } from './hash-object.handler';

interface HashObjectOptions {
  write?: boolean;
  type?: string;
  stdin?: boolean;
  literally?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export const hashObjectCommand = new Command('hash-object')
  .description('🔍 Compute object ID and optionally creates a blob from a file')
  .option('-w, --write', 'Actually write the object into the database')
  .option('-t, --type <type>', 'Specify the type of object', 'blob')
  .option('--stdin', 'Read object from standard input')
  .option('--literally', 'Allow potentially corrupt objects')
  .argument('[files...]', 'Files to hash')
  .action(async (files: string[], options: HashObjectOptions) => {
    try {
      const noInput = !options.stdin && (!files || files.length === 0);
      if (noInput) {
        logger.error('You must specify at least one file or use --stdin');
        process.exit(1);
      }

      if (options.type !== 'blob') {
        logger.error("Currently only 'blob' type is supported");
        process.exit(1);
      }

      const repository = await getRepo();
      if (options.stdin) return await hashStdin(repository);
      await hashFiles(files, repository, options.write || false);
    } catch (error) {
      logger.error(`error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

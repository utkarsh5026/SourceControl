import { Command } from 'commander';
import { PathScurry } from 'path-scurry';
import chalk from 'chalk';
import { BlobObject } from '@/core/objects';
import { Repository, SourceRepository } from '@/core/repo';
import { display, FileUtils, logger } from '@/utils';

interface HashObjectOptions {
  write?: boolean;
  type?: string;
  stdin?: boolean;
  literally?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export const hashObjectCommand = new Command('hash-object')
  .description('Compute object ID and optionally creates a blob from a file')
  .option('-w, --write', 'Actually write the object into the database')
  .option('-t, --type <type>', 'Specify the type of object', 'blob')
  .option('--stdin', 'Read object from standard input')
  .option('--literally', 'Allow potentially corrupt objects')
  .argument('[files...]', 'Files to hash')
  .action(async (files: string[], options: HashObjectOptions) => {
    try {
      const globalOptions = options as any;
      if (globalOptions.verbose) {
        logger.level = 'debug';
      } else if (globalOptions.quiet) {
        logger.level = 'silent';
      }

      const noInput = !options.stdin && (!files || files.length === 0);
      if (noInput) {
        logger.error('You must specify at least one file or use --stdin');
        process.exit(1);
      }

      if (options.type !== 'blob') {
        logger.error("Currently only 'blob' type is supported");
        process.exit(1);
      }

      // Get repository if writing
      let repository: Repository | null = null;
      if (options.write) {
        try {
          const pathScurry = new PathScurry(process.cwd());
          repository = await SourceRepository.findRepository(pathScurry.cwd);
        } catch (error) {
          logger.error(`fatal: ${(error as Error).message}`);
          process.exit(1);
        }
      }

      // Process input
      if (options.stdin) {
        await hashStdin(repository, options);
      } else {
        await hashFiles(files, repository, options);
      }
    } catch (error) {
      logger.error(`error: ${(error as Error).message}`);
      if (logger.level === 'debug') {
        console.error((error as Error).stack);
      }
      process.exit(1);
    }
  });

async function hashStdin(repository: Repository | null, options: HashObjectOptions): Promise<void> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    process.stdin.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', async () => {
      try {
        const content = Buffer.concat(chunks);
        await hashContent(new Uint8Array(content), repository, options, '<stdin>');
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    process.stdin.on('error', reject);
  });
}

async function hashFiles(
  fileList: string[],
  repository: Repository | null,
  options: HashObjectOptions
): Promise<void> {
  for (const fileName of fileList) {
    try {
      const content = await FileUtils.readFile(fileName);
      await hashContent(new Uint8Array(content), repository, options, fileName);
    } catch (error) {
      logger.error(`cannot read '${fileName}': ${(error as Error).message}`);
      process.exit(1);
    }
  }
}

async function hashContent(
  content: Uint8Array,
  repository: Repository | null,
  options: HashObjectOptions,
  source: string
): Promise<void> {
  const blob = new BlobObject(content);
  const hash = await blob.sha();

  if (options.write && repository) {
    await repository.writeObject(blob);
    if (logger.level === 'debug') {
      logger.debug(`Stored object ${hash}`);
    }
  }

  if (options.quiet) console.log(hash);
  else printPrettyResult(hash, source, content.length, options.write || false);
}

const printPrettyResult = (hash: string, source: string, size: number, wasWritten: boolean) => {
  const title = chalk.bold.blue('🔍 Object Hash Result');

  const sourceLabel = chalk.gray('Source:');
  const sourceValue = source === '<stdin>' ? chalk.yellow('📥 stdin') : chalk.cyan(`📄 ${source}`);

  const hashLabel = chalk.gray('SHA-1 Hash:');
  const hashValue = chalk.green.bold(hash);

  const sizeLabel = chalk.gray('Size:');
  const sizeValue = chalk.magenta(`${size} bytes`);

  const statusLabel = chalk.gray('Status:');
  const statusValue = wasWritten
    ? chalk.green('✅ Written to object store')
    : chalk.yellow('📋 Hash computed only');

  const content = [
    `${sourceLabel} ${sourceValue}`,
    `${hashLabel} ${hashValue}`,
    `${sizeLabel} ${sizeValue}`,
    `${statusLabel} ${statusValue}`,
  ].join('\n');

  display.info(content, title);
};

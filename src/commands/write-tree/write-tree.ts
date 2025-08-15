import { Command } from 'commander';
import path from 'path';
import { logger, FileUtils } from '@/utils';
import { getRepo } from '@/utils/helpers';
import { createTreeFromDirectory } from './write-tree.handler';
import { displayWriteTreeResult } from './write-tree.display';

interface WriteTreeOptions {
  prefix?: string;
  excludeGitDir?: boolean;
}

export const writeTreeCommand = new Command('write-tree')
  .description('🌲 Create a tree object from the current working directory')
  .option('--prefix <path>', 'Write tree for subdirectory only')
  .option('--exclude-git-dir', 'Exclude .git/.source directories', true)
  .action(async (options: WriteTreeOptions) => {
    try {
      const repository = await getRepo();
      const workingDir = repository.workingDirectory().fullpath();
      const targetDir = options.prefix ? path.resolve(workingDir, options.prefix) : workingDir;

      if (!(await FileUtils.isDirectory(targetDir)))
        throw new Error(`${targetDir} is not a directory`);

      const treeSha = await createTreeFromDirectory(
        repository,
        targetDir,
        options.excludeGitDir ?? true
      );
      displayWriteTreeResult(treeSha, targetDir, options.prefix);
    } catch (error) {
      logger.error(`error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

import { Command } from 'commander';
import { logger } from '@/utils';
import { getRepo } from '@/utils/helpers';
import { listTree, LsTreeOptions } from './ls-tree.handler';

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

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { logger, FileUtils } from '@/utils';
import { getRepo } from '@/utils/helpers';
import { displayCheckoutResult } from './checkout-tree.display';
import { extractTreeToDirectory } from './checkout-tree.handler';

interface CheckoutTreeOptions {
  force?: boolean;
  prefix?: string;
  verbose?: boolean;
  quiet?: boolean;
}

export const checkoutTreeCommand = new Command('checkout-tree')
  .description('📁 Extract a tree object to a directory')
  .option('-f, --force', 'Force overwrite existing files')
  .option('--prefix <path>', 'Checkout into a subdirectory')
  .argument('<tree-ish>', 'Tree object to checkout (SHA, branch, or tag)')
  .argument('<directory>', 'Target directory for extraction')
  .action(async (treeish: string, directory: string, options: CheckoutTreeOptions) => {
    try {
      const repository = await getRepo();
      const targetPath = path.resolve(directory);

      if (await FileUtils.exists(targetPath)) {
        if (!(await FileUtils.isDirectory(targetPath))) {
          logger.error(`fatal: ${targetPath} is not a directory`);
          process.exit(1);
        }

        const items = await fs.readdir(targetPath);
        if (items.length > 0 && !options.force) {
          logger.error(
            `fatal: destination path '${targetPath}' already exists and is not an empty directory`
          );
          logger.error('Use --force to overwrite existing files');
          process.exit(1);
        }
      }

      const stats = await extractTreeToDirectory(repository, treeish, targetPath);
      displayCheckoutResult(treeish, targetPath, stats);
    } catch (error) {
      logger.error(`fatal: ${(error as Error).message}`);
      process.exit(1);
    }
  });

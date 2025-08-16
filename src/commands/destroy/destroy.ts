import { Command } from 'commander';
import { PathScurry } from 'path-scurry';
import path from 'path';
import { destroyRepositoryWithFeedback } from './destroy.handler';
import { displayDestroyError } from './destroy.display';

export const destroyCommand = new Command('destroy')
  .description('🗑️ Remove a Git repository completely')
  .option('-f, --force', 'Force removal without confirmation')
  .option('-q, --quiet', 'Only print error and warning messages')
  .argument(
    '[directory]',
    'Directory to destroy repository in (defaults to current directory)',
    '.'
  )
  .action(async (directory: string) => {
    try {
      const targetPath = path.resolve(directory);
      const pathScurry = new PathScurry(targetPath);

      await destroyRepositoryWithFeedback(pathScurry.cwd);
    } catch (error) {
      displayDestroyError(error as Error);
      process.exit(1);
    }
  });

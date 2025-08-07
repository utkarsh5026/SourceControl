import { Command } from 'commander';
import { type InitOptions, displayInitError } from './init.display';
import { initializeRepositoryWithFeedback } from './init.handler';

export const initCommand = new Command('init')
  .description('Create an empty Git repository or reinitialize an existing one')
  .option('--bare', 'Create a bare repository')
  .option('--template <template>', 'Directory from which templates will be used')
  .option('--shared[=<permissions>]', 'Specify that the Git repository is to be shared', false)
  .option('-q, --quiet', 'Only print error and warning messages')
  .argument('[directory]', 'Directory to initialize (defaults to current directory)', '.')
  .action(async (directory: string, options: InitOptions) => {
    try {
      await initializeRepositoryWithFeedback(directory, options);
    } catch (error) {
      displayInitError(error as Error);
      process.exit(1);
    }
  });

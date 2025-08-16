import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { IndexManager } from '@/core/index';
import { logger } from '@/utils';
import { getRepo } from '@/utils/helpers';
import { displayAddResults, handleAddError, performDryRun } from './add.display';
import { AddCommandOptions } from './add.types';

export const addCommand = new Command('add')
  .description('➕ Add file contents to the staging area')
  .option('-A, --all', 'Add all files (new, modified, and deleted)')
  .option('-u, --update', 'Update already tracked files only')
  .option('-f, --force', 'Allow adding otherwise ignored files')
  .option('-i, --interactive', 'Interactive mode (not yet implemented)')
  .option('-p, --patch', 'Interactively choose hunks of patch (not yet implemented)')
  .option('-v, --verbose', 'Be verbose')
  .option('-q, --quiet', 'Suppress output')
  .option('-n, --dry-run', 'Show what would be added without actually adding')
  .argument('[files...]', 'Files to add to the staging area')
  .action(async (files: string[], options: AddCommandOptions) => {
    try {
      const repository = await getRepo();
      let filesToAdd: string[] = [];

      if (options.all) {
        filesToAdd = ['.'];
      } else if (files.length === 0) {
        logger.error('Nothing specified, nothing added.');
        logger.info("Maybe you wanted to say 'sc add .'?");
        process.exit(1);
      } else {
        filesToAdd = files;
      }

      const indexManager = new IndexManager(repository);
      await indexManager.initialize();

      if (options.dryRun) {
        await performDryRun(indexManager, filesToAdd);
        return;
      }

      let spinner: any = null;
      if (!options.quiet) {
        spinner = ora({
          text: chalk.blue('Adding files to staging area...'),
          color: 'blue',
          spinner: 'dots',
        }).start();
      }

      const result = await indexManager.add(filesToAdd);
      const { added, modified, ignored, failed } = result;

      if (spinner) {
        if (failed.length > 0) {
          spinner.fail(chalk.red('Some files could not be added'));
        } else if (added.length > 0 || modified.length > 0) {
          spinner.succeed(chalk.green('Files successfully added to staging area'));
        } else if (ignored.length > 0) {
          spinner.warn(chalk.yellow('All specified files are ignored'));
        } else {
          spinner.info(chalk.yellow('No changes detected'));
        }
      }

      displayAddResults(result, options);

      if (failed.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      handleAddError(error as Error, options.quiet || false);
      process.exit(1);
    }
  });

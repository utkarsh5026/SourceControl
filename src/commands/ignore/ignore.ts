import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { SourceRepository } from '@/core/repo';
import { IgnoreManager } from '@/core/ignore/ignore-manager';
import { displayIgnoreStats, displayIgnoreHelp, handleIgnoreError } from './ignore.display';
import {
  createDefaultIgnoreFile,
  addPatternsToIgnore,
  listIgnorePatterns,
  editIgnoreFile,
  checkIgnoreStatus,
} from './ignore.handler';
import { getRepo } from '@/utils/helpers';

interface IgnoreOptions {
  add?: string[];
  list?: boolean;
  check?: string[];
  create?: boolean;
  edit?: boolean;
  stats?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export const ignoreCommand = new Command('ignore')
  .description('Manage ignored file patterns')
  .option('-a, --add <patterns...>', 'Add patterns to .sourceignore')
  .option('-l, --list', 'List all ignore patterns')
  .option('-c, --check <files...>', 'Check if files are ignored')
  .option('--create', 'Create default .sourceignore file')
  .option('-e, --edit', 'Open .sourceignore in editor')
  .option('-s, --stats', 'Show ignore statistics')
  .option('-v, --verbose', 'Verbose output')
  .option('-q, --quiet', 'Suppress output')
  .action(async (options: IgnoreOptions) => {
    try {
      const repo = await getRepo();
      const ignoreManager = new IgnoreManager(repo);
      await ignoreManager.initialize();

      if (options.create) {
        await createDefaultIgnoreFile(repo);
      } else if (options.add && options.add.length > 0) {
        await addPatternsToIgnore(repo, ignoreManager, options.add);
      } else if (options.list) {
        await listIgnorePatterns(repo);
      } else if (options.check && options.check.length > 0) {
        await checkIgnoreStatus(ignoreManager, options.check);
      } else if (options.stats) {
        await showIgnoreStats(ignoreManager);
      } else if (options.edit) {
        await editIgnoreFile(repo);
      } else {
        await showIgnoreHelp(repo);
      }
    } catch (error) {
      handleIgnoreError(error as Error, options.quiet || false);
      process.exit(1);
    }
  });

/**
 * Show ignore statistics
 */
async function showIgnoreStats(ignoreManager: IgnoreManager): Promise<void> {
  const stats = ignoreManager.getStats();
  displayIgnoreStats(stats);
}

/**
 * Show ignore help
 */
async function showIgnoreHelp(repository: SourceRepository): Promise<void> {
  const ignorePath = path.join(repository.workingDirectory().toString(), '.sourceignore');
  const exists = await fs.pathExists(ignorePath);

  displayIgnoreHelp(exists);
}

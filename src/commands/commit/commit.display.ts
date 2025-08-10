import { logger } from '@/utils';
import chalk from 'chalk';
import { StatusResult } from '@/core/index';
import { CommitResult } from '@/core/commit';

/**
 * Display staged changes
 */
export const displayStagedChanges = (status: StatusResult): void => {
  logger.info('\nChanges to be committed:');

  if (status.staged.added.length > 0) {
    console.log(chalk.green('\n  New files:'));
    status.staged.added.forEach((file: string) => {
      console.log(`    ${chalk.green('+')} ${file}`);
    });
  }

  if (status.staged.modified.length > 0) {
    console.log(chalk.yellow('\n  Modified:'));
    status.staged.modified.forEach((file: string) => {
      console.log(`    ${chalk.yellow('M')} ${file}`);
    });
  }

  if (status.staged.deleted.length > 0) {
    console.log(chalk.red('\n  Deleted:'));
    status.staged.deleted.forEach((file: string) => {
      console.log(`    ${chalk.red('-')} ${file}`);
    });
  }

  console.log();
};

/**
 * Display commit result
 */
export const displayCommitResult = (result: CommitResult, amend: boolean): void => {
  const action = amend ? 'Amended' : 'Created';
  const shortSha = result.sha.substring(0, 7);
  const firstLine = result.message.split('\n')[0];

  logger.success(`\n${action} commit ${chalk.yellow(shortSha)}`);
  logger.info(`Author: ${result.author.name} <${result.author.email}>`);
  logger.info(`Date: ${new Date(result.author.timestamp * 1000).toLocaleString()}`);
  logger.info(`\n    ${firstLine}`);

  if (result.parentShas.length === 0) {
    console.log(chalk.gray('\n(root commit)'));
  } else if (result.parentShas.length > 1) {
    console.log(chalk.gray(`\n(merge commit with ${result.parentShas.length} parents)`));
  }
};

import { Command } from 'commander';
import { CommitManager } from '@/core/commit';
import { IndexManager } from '@/core/index';
import { getRepo } from '@/utils/helpers';
import { logger } from '@/utils';
import inquirer from 'inquirer';
import { displayStagedChanges, displayCommitResult } from './commit.display';

/**
 * Commit command implementation
 *
 * This command creates a new commit from staged changes in the index.
 * It supports:
 * - Commit messages via -m flag
 * - Interactive message editing
 * - Amending the previous commit
 * - Author/committer override
 * - Empty commits
 */
export const commitCommand = new Command('commit')
  .description('Record changes to the repository')
  .option('-m, --message <message>', 'Commit message')
  .option('-a, --all', 'Automatically stage all modified files')
  .option('--amend', 'Amend the previous commit')
  .option('--allow-empty', 'Allow empty commits')
  .option('--author <author>', 'Override the commit author')
  .option('-v, --verbose', 'Show diff of changes being committed')
  .option('-n, --no-verify', 'Bypass pre-commit hooks')
  .action(async (options) => {
    try {
      const repository = await getRepo();
      const commitManager = new CommitManager(repository);
      const indexManager = new IndexManager(repository);

      await commitManager.initialize();
      await indexManager.initialize();

      // Auto-stage modified files if -a flag is used
      if (options.all) {
        await autoStageModified(indexManager);
      }

      // Check if there are staged changes
      const status = await indexManager.status();
      const hasStaged =
        status.staged.added.length > 0 ||
        status.staged.modified.length > 0 ||
        status.staged.deleted.length > 0;

      if (!hasStaged && !options.allowEmpty) {
        logger.error('No changes staged for commit');
        logger.info('Use "sourcecontrol add <files>" to stage changes');
        process.exit(1);
      }

      // Get commit message
      let message = options.message;
      if (!message) {
        message = await getCommitMessage(options.amend);
        if (!message) {
          logger.error('Aborting commit due to empty message');
          process.exit(1);
        }
      }

      // Show what will be committed if verbose
      if (options.verbose) {
        displayStagedChanges(status);
      }

      // Parse author if provided
      let author;
      if (options.author) {
        author = parseAuthor(options.author);
      }

      // Create the commit
      const result = await commitManager.createCommit({
        message,
        author,
        amend: options.amend,
        allowEmpty: options.allowEmpty,
        noVerify: options.noVerify,
      });

      // Display success message
      displayCommitResult(result, options.amend);
    } catch (error) {
      logger.error('Failed to create commit:', error);
      process.exit(1);
    }
  });

/**
 * Auto-stage all modified tracked files
 */
async function autoStageModified(indexManager: IndexManager): Promise<void> {
  const status = await indexManager.status();
  const toStage = [...status.unstaged.modified];

  if (toStage.length > 0) {
    const result = await indexManager.add(toStage);
    logger.info(`Auto-staged ${result.modified.length} modified files`);
  }
}

/**
 * Get commit message interactively
 */
async function getCommitMessage(amend: boolean): Promise<string> {
  const action = amend ? 'Amend commit' : 'Commit';

  try {
    const { message } = await inquirer.prompt<{ message: string }>([
      {
        type: 'editor',
        name: 'message',
        message: `Enter ${action} message:`,
        default: getCommitTemplate(),
        validate: (input: string) => {
          const lines = input.split('\n').filter((l: string) => !l.startsWith('#'));
          const hasContent = lines.some((l: string) => l.trim().length > 0);
          return hasContent || 'Commit message cannot be empty';
        },
      },
    ]);

    return message
      .split('\n')
      .filter((line: string) => !line.startsWith('#'))
      .join('\n')
      .trim();
  } catch {
    const { message } = await inquirer.prompt<{ message: string }>([
      {
        type: 'input',
        name: 'message',
        message: `${action} message:`,
        validate: (input: string) => input.trim().length > 0 || 'Commit message cannot be empty',
      },
    ]);

    return message.trim();
  }
}

/**
 * Get commit message template
 */
function getCommitTemplate(): string {
  return `
# Please enter the commit message for your changes.
# Lines starting with '#' will be ignored.
#
# On branch: <branch-name>
# Changes to be committed:
#   <list of files>
#
`.trim();
}

/**
 * Parse author string (format: "Name <email>")
 */
function parseAuthor(authorStr: string): any {
  const match = authorStr.match(/^(.+?)\s*<(.+?)>$/);
  if (!match) {
    throw new Error('Invalid author format. Use: "Name <email>"');
  }

  const [, name, email] = match;
  const timestamp = Math.floor(Date.now() / 1000);
  const timezone = new Date().getTimezoneOffset() * -60;

  return {
    name: name?.trim(),
    email: email?.trim(),
    timestamp,
    timezone: timezone.toString(),
  };
}

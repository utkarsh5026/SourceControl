import { Command } from 'commander';
import { PathScurry } from 'path-scurry';
import chalk from 'chalk';
import fs from 'fs-extra';
import { SourceRepository } from '@/core/repo';
import { display, logger } from '@/utils';
import path from 'path';

interface DestroyOptions {
  force?: boolean;
  verbose?: boolean;
}

export const destroyCommand = new Command('destroy')
  .description('Remove a Git repository completely')
  .option('-f, --force', 'Force removal without confirmation')
  .option('-q, --quiet', 'Only print error and warning messages')
  .argument(
    '[directory]',
    'Directory to destroy repository in (defaults to current directory)',
    '.'
  )
  .action(async (directory: string, options: DestroyOptions) => {
    try {
      const globalOptions = options as any;
      if (globalOptions.verbose) {
        logger.level = 'debug';
      }

      const targetPath = path.resolve(directory);
      const pathScurry = new PathScurry(targetPath);

      await destroyRepositoryWithFeedback(pathScurry.cwd);
    } catch (error) {
      handleDestroyError(error as Error);
      process.exit(1);
    }
  });

/**
 * Destroy a repository with rich feedback using chalk, boxen, and ora
 */
const destroyRepositoryWithFeedback = async (targetPath: PathScurry['cwd']) => {
  displayHeader();

  const existingRepo = await SourceRepository.findRepository(targetPath);
  if (!existingRepo) {
    displayNoRepositoryInfo(targetPath.toString());
    return;
  }

  const repoPath = existingRepo.workingDirectory().toString();
  const gitPath = existingRepo.gitDirectory().toString();

  await displayConfirmationPrompt(repoPath);

  try {
    // Remove the .source directory
    await fs.remove(gitPath);
    displaySuccessMessage(repoPath);
    displayWarningMessage();
  } catch (error) {
    throw error;
  }
};

/**
 * Display destruction header
 */
const displayHeader = () => {
  display.info('💥 Source Control Repository Destruction', 'Source Control Repository Destruction');
};

/**
 * Display success message with repository information
 */
const displaySuccessMessage = (repoPath: string) => {
  const title = chalk.bold.green('✅ Repository Destroyed Successfully!');

  const details = [
    `${chalk.gray('📍 Location:')} ${chalk.white(repoPath)}`,
    `${chalk.gray('🗑️  Action:')} ${chalk.white('Source Control Repository Removed')}`,
    `${chalk.gray('📁 Directory:')} ${chalk.white('.source/ (removed)')}`,
    `${chalk.gray('📄 Files:')} ${chalk.white('Working directory files preserved')}`,
  ].join('\n');

  display.success(details, title);
};

/**
 * Display warning message about data loss
 */
const displayWarningMessage = () => {
  const title = chalk.yellow('⚠️  Important Notice');

  const warning = [
    `${chalk.red('🔥')} ${chalk.white('All version control history has been permanently deleted')}`,
    `${chalk.yellow('📄')} ${chalk.white('Working directory files have been preserved')}`,
    `${chalk.blue('💡')} ${chalk.white('To restore version control, run:')} ${chalk.green('sc init')}`,
  ].join('\n');

  display.warning(warning, title);
};

/**
 * Display confirmation prompt for repository destruction
 */
const displayConfirmationPrompt = async (repoPath: string): Promise<void> => {
  const title = chalk.red('⚠️  Confirm Repository Destruction');

  const warning = [
    `You are about to ${chalk.red('permanently delete')} the source control repository in:`,
    `${chalk.white(repoPath)}`,
    '',
    `${chalk.yellow('This action will:')}`,
    `${chalk.red('✗')} Delete all commit history`,
    `${chalk.red('✗')} Delete all branches and tags`,
    `${chalk.red('✗')} Delete all repository metadata`,
    `${chalk.green('✓')} Preserve working directory files`,
    '',
    `${chalk.blue('To proceed, use the --force flag:')}`,
    `${chalk.green('sc destroy --force')}`,
  ].join('\n');

  display.warning(warning, title);
  process.exit(0);
};

/**
 * Display no repository information when repository doesn't exist
 */
const displayNoRepositoryInfo = (targetPath: string) => {
  const title = chalk.yellow('ℹ️  No Repository Found');

  const message = [
    `No source control repository found in ${chalk.white(targetPath)} or any parent directories.`,
    '',
    `${chalk.blue('💡')} To initialize a new repository, run: ${chalk.green('sc init')}`,
  ].join('\n');

  display.warning(message, title);
};

/**
 * Handle destruction errors with styled output
 */
const handleDestroyError = (error: Error) => {
  const title = chalk.red('❌ Destruction Failed');

  const errorDetails = [
    `${chalk.red('📋 Error Details:')}`,
    `   └─ ${chalk.white(error.message)}`,
    '',
    `${chalk.yellow('🔧 Troubleshooting:')}`,
    `   ${chalk.gray('1.')} Check if you have write permissions to the directory`,
    `   ${chalk.gray('2.')} Ensure no processes are using files in the .source directory`,
    `   ${chalk.gray('3.')} Try running the command with elevated privileges if needed`,
    `   ${chalk.gray('4.')} Verify that the repository exists and is accessible`,
  ];

  display.error(errorDetails.join('\n'), title);
};

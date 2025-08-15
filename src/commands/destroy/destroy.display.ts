import { SourceRepository } from '@/core/repo';
import { display } from '@/utils';
import chalk from 'chalk';

/**
 * Display destruction header
 */
export const displayHeader = () => {
  display.info('💥 Source Control Repository Destruction', 'Source Control Repository Destruction');
};

/**
 * Display success message with repository information
 */
export const displaySuccessMessage = (repoPath: string) => {
  const title = chalk.bold.green('✅ Repository Destroyed Successfully!');

  const details = [
    `${chalk.gray('📍 Location:')} ${chalk.white(repoPath)}`,
    `${chalk.gray('🗑️  Action:')} ${chalk.white('Source Control Repository Removed')}`,
    `${chalk.gray('📁 Directory:')} ${chalk.white(`${SourceRepository.DEFAULT_GIT_DIR} ${chalk.red('removed')}`)}`,
    `${chalk.gray('📄 Files:')} ${chalk.white('Working directory files preserved')}`,
  ].join('\n');

  display.success(details, title);
};

/**
 * Display warning message about data loss
 */
export const displayWarningMessage = () => {
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
export const displayConfirmationPrompt = async (repoPath: string): Promise<void> => {
  const title = chalk.red('⚠️  Confirm Repository Destruction');

  const warning = [
    `We are going to ${chalk.red('permanently delete')} the source control repository in:`,
    `${chalk.white(repoPath)}`,
    '',
    `${chalk.yellow('This action will:')}`,
    `${chalk.red('✗')} Delete all commit history`,
    `${chalk.red('✗')} Delete all branches and tags`,
    `${chalk.red('✗')} Delete all repository metadata`,
    `${chalk.green('✓')} Preserve working directory files`,
    '',
  ].join('\n');

  display.warning(warning, title);
};

/**
 * Display no repository information when repository doesn't exist
 */
export const displayNoRepositoryInfo = (targetPath: string) => {
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
export const displayDestroyError = (error: Error) => {
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

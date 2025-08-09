import chalk from 'chalk';
import { display } from '@/utils';
import { AddResult, IndexManager } from '@/core/index';
import { AddCommandOptions } from './add.types';

/**
 * Display the results of the add operation
 */
export const displayAddResults = (result: AddResult, options: AddCommandOptions) => {
  const hasChanges = result.added.length > 0 || result.modified.length > 0;
  const hasIgnored = result.ignored.length > 0;
  const hasFailed = result.failed.length > 0;

  if (!hasChanges && !hasIgnored && !hasFailed) {
    display.info(
      'No changes detected. All files are already up to date in the staging area.',
      chalk.yellow('ℹ️  No Changes')
    );
    return;
  }

  const lines: string[] = [];
  const { added, modified, ignored, failed } = result;

  if (added.length > 0) {
    lines.push(chalk.green.bold(`✅ New files staged (${added.length}):`));
    if (options.verbose || added.length <= 10) {
      added.forEach((file: string) => {
        lines.push(`   ${chalk.green('+')} ${file}`);
      });
    } else {
      added.slice(0, 5).forEach((file: string) => {
        lines.push(`   ${chalk.green('+')} ${file}`);
      });
      lines.push(`   ${chalk.gray(`... and ${added.length - 7} more files`)}`);
      added.slice(-2).forEach((file: string) => {
        lines.push(`   ${chalk.green('+')} ${file}`);
      });
    }
    lines.push('');
  }

  // Show modified files
  if (modified.length > 0) {
    lines.push(chalk.blue.bold(`📝 Modified files updated (${modified.length}):`));
    if (options.verbose || modified.length <= 10) {
      modified.forEach((file: string) => {
        lines.push(`   ${chalk.blue('M')} ${file}`);
      });
    } else {
      modified.slice(0, 5).forEach((file: string) => {
        lines.push(`   ${chalk.blue('M')} ${file}`);
      });
      lines.push(`   ${chalk.gray(`... and ${modified.length - 7} more files`)}`);
      modified.slice(-2).forEach((file: string) => {
        lines.push(`   ${chalk.blue('M')} ${file}`);
      });
    }
    lines.push('');
  }

  // Show ignored files
  if (ignored.length > 0) {
    lines.push(chalk.yellow.bold(`⚠️  Ignored files skipped (${ignored.length}):`));
    if (options.verbose || ignored.length <= 5) {
      ignored.forEach((file: string) => {
        lines.push(`   ${chalk.yellow('!')} ${file}`);
      });
    } else {
      ignored.slice(0, 3).forEach((file: string) => {
        lines.push(`   ${chalk.yellow('!')} ${file}`);
      });
      lines.push(`   ${chalk.gray(`... and ${ignored.length - 3} more files`)}`);
    }

    if (options.force) {
      lines.push(chalk.gray('   (Use -f to force add ignored files)'));
    } else {
      lines.push(chalk.gray('   These files match patterns in .sourceignore'));
      lines.push(chalk.gray('   Use -f to force add them anyway'));
    }
    lines.push('');
  }

  // Show failed files
  if (failed.length > 0) {
    lines.push(chalk.red.bold(`❌ Failed to add (${failed.length}):`));
    failed.forEach((failure: any) => {
      lines.push(`   ${chalk.red('✗')} ${failure.path}`);
      lines.push(`     ${chalk.gray(failure.reason)}`);
    });
    lines.push('');
  }

  const total = added.length + modified.length;
  lines.push(chalk.gray('─'.repeat(50)));
  lines.push(chalk.bold('Summary:'));
  lines.push(`  ${chalk.green('Added:')} ${added.length} files`);
  lines.push(`  ${chalk.blue('Modified:')} ${modified.length} files`);
  if (ignored.length > 0) {
    lines.push(`  ${chalk.yellow('Ignored:')} ${ignored.length} files`);
  }
  if (failed.length > 0) {
    lines.push(`  ${chalk.red('Failed:')} ${failed.length} files`);
  }
  lines.push(`  ${chalk.magenta('Total staged:')} ${total} changes`);

  const title = hasChanges
    ? chalk.green('✨ Staging Area Updated')
    : hasIgnored
      ? chalk.yellow('⚠️  Files Ignored')
      : chalk.red('⚠️  Staging Partially Failed');

  display.info(lines.join('\n'), title);

  if (hasChanges) {
    const nextSteps = [
      '',
      chalk.yellow('💡 Next steps:'),
      `  ${chalk.gray('•')} Review changes: ${chalk.green('sc status')}`,
      `  ${chalk.gray('•')} Commit changes: ${chalk.green('sc commit -m "Your message"')}`,
      `  ${chalk.gray('•')} Unstage files: ${chalk.green('sc rm --cached <file>')}`,
    ].join('\n');

    console.log(nextSteps);
  } else if (hasIgnored && !options.force) {
    const nextSteps = [
      '',
      chalk.yellow('💡 To add ignored files:'),
      `  ${chalk.gray('•')} Force add: ${chalk.green('sc add -f <files>')}`,
      `  ${chalk.gray('•')} Edit ignore patterns: ${chalk.green('sc ignore -e')}`,
      `  ${chalk.gray('•')} Check ignore status: ${chalk.green('sc ignore -c <file>')}`,
    ].join('\n');

    console.log(nextSteps);
  }
};

/**
 * Handle errors from the add operation
 */
export const handleAddError = (error: Error, quiet: boolean) => {
  if (quiet) {
    console.error(error.message);
    return;
  }

  const title = chalk.red('❌ Add Operation Failed');

  const errorDetails = [
    `${chalk.red('Error:')} ${error.message}`,
    '',
    chalk.yellow('Possible causes:'),
    `  ${chalk.gray('•')} File or directory does not exist`,
    `  ${chalk.gray('•')} No read permissions for the file`,
    `  ${chalk.gray('•')} Repository index is corrupted`,
    `  ${chalk.gray('•')} Disk is full`,
    '',
    chalk.blue('Try:'),
    `  ${chalk.gray('•')} Check if files exist: ${chalk.green('ls -la <file>')}`,
    `  ${chalk.gray('•')} Check repository status: ${chalk.green('sc status')}`,
    `  ${chalk.gray('•')} Check ignore patterns: ${chalk.green('sc ignore -c <file>')}`,
    `  ${chalk.gray('•')} Use verbose mode for details: ${chalk.green('sc add -v <file>')}`,
  ];

  display.error(errorDetails.join('\n'), title);
};

/**
 * Perform a dry run to show what would be added
 */
export const performDryRun = async (indexManager: IndexManager, files: string[]): Promise<void> => {
  console.log(chalk.yellow('Performing dry run (no files will be added)...\n'));

  const result = await indexManager.add(files);

  if (result.added.length > 0) {
    console.log(chalk.green.bold('Would add:'));
    result.added.forEach((file) => console.log(`  ${chalk.green('+')} ${file}`));
  }

  if (result.modified.length > 0) {
    console.log(chalk.blue.bold('Would update:'));
    result.modified.forEach((file) => console.log(`  ${chalk.blue('M')} ${file}`));
  }

  if (result.ignored.length > 0) {
    console.log(chalk.yellow.bold('Would skip (ignored):'));
    result.ignored.forEach((file) => console.log(`  ${chalk.yellow('!')} ${file}`));
  }

  if (result.failed.length > 0) {
    console.log(chalk.red.bold('Would fail:'));
    result.failed.forEach((failure) => {
      console.log(`  ${chalk.red('✗')} ${failure.path}`);
      console.log(`    ${chalk.gray(failure.reason)}`);
    });
  }
};

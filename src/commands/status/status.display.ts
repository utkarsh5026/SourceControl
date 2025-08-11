import chalk from 'chalk';
import type { StatusResult } from '@/core/index';
import { display, createSeparator } from '@/utils/cli/display';

/**
 * Display status in short format (similar to git status -s)
 */
export const displayShortStatus = (
  status: StatusResult,
  branch: string | null,
  isDetached: boolean
): void => {
  const entries: Array<{ status: string; file: string }> = [];

  status.staged.added.forEach((file: string) => {
    entries.push({ status: 'A ', file });
  });

  status.staged.modified.forEach((file: string) => {
    entries.push({ status: 'M ', file });
  });

  status.staged.deleted.forEach((file: string) => {
    entries.push({ status: 'D ', file });
  });

  // Unstaged changes
  status.unstaged.modified.forEach((file: string) => {
    const existing = entries.find((e) => e.file === file);
    if (existing) {
      existing.status = existing.status[0] + 'M';
    } else {
      entries.push({ status: ' M', file });
    }
  });

  status.unstaged.deleted.forEach((file: string) => {
    const existing = entries.find((e) => e.file === file);
    if (existing) {
      existing.status = existing.status[0] + 'D';
    } else {
      entries.push({ status: ' D', file });
    }
  });

  // Untracked files
  status.untracked.forEach((file: string) => {
    entries.push({ status: '??', file });
  });

  const lines: string[] = [];

  // Branch info
  if (branch) {
    const prefix = isDetached ? chalk.red('HEAD detached at') : chalk.gray('On branch');
    const branchText = isDetached ? chalk.yellow(branch) : chalk.green(branch);
    lines.push(`${prefix} ${branchText}`);
    lines.push(createSeparator(40));
  }

  // Entries
  entries.forEach(({ status, file }) => {
    const color = getStatusColor(status);
    const code = color(status);
    lines.push(`${code}  ${chalk.white(file)}`);
  });

  if (entries.length === 0) {
    lines.push(chalk.green('✓ Working tree clean'));
  }

  const content = lines.join('\n');
  display.info(content, '📦 Status (short)');
};

/**
 * Display status in long format (similar to git status)
 */
export const displayLongStatus = (
  status: StatusResult,
  branch: string | null,
  isDetached: boolean,
  options: { untrackedFiles: string; ignored: boolean }
): void => {
  const lines: string[] = [];

  // Branch information
  if (branch) {
    if (isDetached) {
      lines.push(`${chalk.red('HEAD detached at')} ${chalk.yellow(branch)}`);
    } else {
      lines.push(`${chalk.gray('On branch')} ${chalk.green(branch)}`);
    }
  } else {
    lines.push(chalk.yellow('No commits yet'));
  }

  lines.push('');

  const hasStaged =
    status.staged.added.length > 0 ||
    status.staged.modified.length > 0 ||
    status.staged.deleted.length > 0;

  const hasUnstaged = status.unstaged.modified.length > 0 || status.unstaged.deleted.length > 0;

  // Staged changes
  if (hasStaged) {
    lines.push(chalk.green.bold('✓ Changes to be committed:'));
    lines.push(chalk.gray('  (use "sourcecontrol restore --staged <file>..." to unstage)'));
    lines.push('');

    status.staged.added.forEach((file: string) => {
      lines.push(`    ${chalk.green('new file:')}   ${chalk.white(file)}`);
    });

    status.staged.modified.forEach((file: string) => {
      lines.push(`    ${chalk.green('modified:')}   ${chalk.white(file)}`);
    });

    status.staged.deleted.forEach((file: string) => {
      lines.push(`    ${chalk.green('deleted:')}    ${chalk.white(file)}`);
    });

    lines.push('');
  }

  // Unstaged changes
  if (hasUnstaged) {
    lines.push(chalk.red.bold('✗ Changes not staged for commit:'));
    lines.push(
      chalk.gray('  (use "sourcecontrol add <file>..." to update what will be committed)')
    );
    lines.push(
      chalk.gray(
        '  (use "sourcecontrol restore <file>..." to discard changes in working directory)'
      )
    );
    lines.push('');

    status.unstaged.modified.forEach((file: string) => {
      lines.push(`    ${chalk.red('modified:')}   ${chalk.white(file)}`);
    });

    status.unstaged.deleted.forEach((file: string) => {
      lines.push(`    ${chalk.red('deleted:')}    ${chalk.white(file)}`);
    });

    lines.push('');
  }

  // Untracked files
  if (status.untracked.length > 0 && options.untrackedFiles !== 'no') {
    lines.push(chalk.yellow.bold('… Untracked files:'));
    lines.push(
      chalk.gray('  (use "sourcecontrol add <file>..." to include in what will be committed)')
    );
    lines.push('');

    status.untracked.forEach((file: string) => {
      lines.push(`    ${chalk.white(file)}`);
    });

    lines.push('');
  }

  // Ignored files (if requested)
  if (options.ignored && status.ignored.length > 0) {
    lines.push(chalk.gray.bold('○ Ignored files:'));
    lines.push(chalk.gray('  (use "sourcecontrol add -f <file>..." to add anyway)'));
    lines.push('');

    status.ignored.forEach((file: string) => {
      lines.push(chalk.gray(`    ${file}`));
    });

    lines.push('');
  }

  // Summary message
  const nothingToCommit = !hasStaged && !hasUnstaged && status.untracked.length === 0;
  if (nothingToCommit) {
    lines.push(chalk.green('✓ Nothing to commit, working tree clean'));
  } else if (!hasStaged && hasUnstaged) {
    lines.push(
      chalk.yellow('… No changes added to commit (use "sourcecontrol add" to stage changes)')
    );
  } else if (!hasStaged && status.untracked.length > 0) {
    lines.push(
      chalk.yellow(
        '… Nothing added to commit but untracked files present (use "sourcecontrol add" to track)'
      )
    );
  }

  const content = lines.join('\n');
  const title = nothingToCommit ? '✅ Repository Status' : '📦 Repository Status';
  const show = nothingToCommit ? display.success : display.highlight;
  show(content, title);
};

/**
 * Get color for status code
 */
const getStatusColor = (status: string): ((text: string) => string) => {
  const firstChar = status[0];
  const secondChar = status[1];

  if (firstChar !== ' ' && firstChar !== '?') {
    return chalk.green; // Staged
  } else if (secondChar !== ' ' && secondChar !== '?') {
    return chalk.red; // Unstaged
  } else if (status === '??') {
    return chalk.red; // Untracked
  }

  return (text: string) => text;
};

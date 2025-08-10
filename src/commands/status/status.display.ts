import chalk from 'chalk';
import type { StatusResult } from '@/core/index';

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

  // Display branch info
  if (branch) {
    const prefix = isDetached ? 'HEAD detached at' : 'On branch';
    console.info(`## ${prefix} ${branch}`);
  }

  // Display entries
  entries.forEach(({ status, file }) => {
    const color = getStatusColor(status);
    console.info(`${color(status)} ${file}`);
  });
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
  // Branch information
  if (branch) {
    if (isDetached) {
      console.log(chalk.red(`HEAD detached at ${branch}`));
    } else {
      console.log(`On branch ${chalk.green(branch)}`);
    }
  } else {
    console.log(chalk.yellow('No commits yet'));
  }

  console.log('');

  const hasStaged =
    status.staged.added.length > 0 ||
    status.staged.modified.length > 0 ||
    status.staged.deleted.length > 0;

  const hasUnstaged = status.unstaged.modified.length > 0 || status.unstaged.deleted.length > 0;

  // Staged changes
  if (hasStaged) {
    console.log(chalk.green('Changes to be committed:'));
    console.log(chalk.gray('  (use "sourcecontrol restore --staged <file>..." to unstage)'));
    console.log('');

    status.staged.added.forEach((file: string) => {
      console.log(`        ${chalk.green('new file:')}   ${file}`);
    });

    status.staged.modified.forEach((file: string) => {
      console.log(`        ${chalk.green('modified:')}   ${file}`);
    });

    status.staged.deleted.forEach((file: string) => {
      console.log(`        ${chalk.green('deleted:')}    ${file}`);
    });

    console.log();
  }

  // Unstaged changes
  if (hasUnstaged) {
    console.log(chalk.red('Changes not staged for commit:'));
    console.log(
      chalk.gray('  (use "sourcecontrol add <file>..." to update what will be committed)')
    );
    console.log(
      chalk.gray(
        '  (use "sourcecontrol restore <file>..." to discard changes in working directory)'
      )
    );
    console.log();

    status.unstaged.modified.forEach((file: string) => {
      console.log(`        ${chalk.red('modified:')}   ${file}`);
    });

    status.unstaged.deleted.forEach((file: string) => {
      console.log(`        ${chalk.red('deleted:')}    ${file}`);
    });

    console.log();
  }

  // Untracked files
  if (status.untracked.length > 0 && options.untrackedFiles !== 'no') {
    console.log(chalk.red('Untracked files:'));
    console.log(
      chalk.gray('  (use "sourcecontrol add <file>..." to include in what will be committed)')
    );
    console.log();

    status.untracked.forEach((file: string) => {
      console.log(`        ${file}`);
    });

    console.log();
  }

  // Ignored files (if requested)
  if (options.ignored && status.ignored.length > 0) {
    console.log(chalk.gray('Ignored files:'));
    console.log(chalk.gray('  (use "sourcecontrol add -f <file>..." to add anyway)'));
    console.log();

    status.ignored.forEach((file: string) => {
      console.log(chalk.gray(`        ${file}`));
    });

    console.log();
  }

  // Summary message
  if (!hasStaged && !hasUnstaged && status.untracked.length === 0) {
    console.log('nothing to commit, working tree clean');
  } else if (!hasStaged && hasUnstaged) {
    console.log('no changes added to commit (use "sourcecontrol add" to stage changes)');
  } else if (!hasStaged && status.untracked.length > 0) {
    console.log(
      'nothing added to commit but untracked files present (use "sourcecontrol add" to track)'
    );
  }
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

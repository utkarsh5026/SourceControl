import { IgnoreStats } from '@/core/ignore/ignore-manager';
import { display } from '@/utils/cli/display';
import chalk from 'chalk';

export const displayIgnoreFileCreated = (): void => {
  const content = [
    `${chalk.green('✓')} Created default .sourceignore file`,
    '',
    'Common patterns have been added:',
    `  ${chalk.gray('•')} Dependencies (node_modules, vendor)`,
    `  ${chalk.gray('•')} Build outputs (dist, build)`,
    `  ${chalk.gray('•')} IDE files (.vscode, .idea)`,
    `  ${chalk.gray('•')} OS files (.DS_Store, Thumbs.db)`,
    `  ${chalk.gray('•')} Temporary files (*.tmp, *.swp)`,
    `  ${chalk.gray('•')} Environment files (.env)`,
  ].join('\n');

  display.success(content, '✨ .sourceignore Created');
};

export const displayIgnorePatterns = (files: Array<{ path: string; patterns: string[] }>): void => {
  if (files.length === 0) {
    display.info('No .sourceignore files found', '📋 Ignore Patterns');
    return;
  }

  const lines: string[] = [];

  files.forEach((file) => {
    lines.push(chalk.cyan.bold(file.path));

    file.patterns.forEach((pattern) => {
      lines.push(`  ${pattern}`);
    });

    lines.push('');
  });

  const title = `📋 Ignore Files (${files.length} found)`;
  display.info(lines.join('\n').trim(), title);
};

export const displayIgnoreCheckResults = (
  results: Array<{ path: string; ignored: boolean }>
): void => {
  const lines: string[] = [];

  for (const result of results) {
    const icon = result.ignored ? chalk.red('✗') : chalk.green('✓');
    const status = result.ignored ? chalk.red('ignored') : chalk.green('tracked');

    lines.push(`${icon} ${result.path} - ${status}`);
  }

  display.info(lines.join('\n'), '🔍 Ignore Check Results');
};

export const displayIgnoreStats = (stats: IgnoreStats): void => {
  const lines = [
    `${chalk.gray('Global patterns:')} ${stats.globalPatterns}`,
    `${chalk.gray('Root patterns:')} ${stats.rootPatterns}`,
    `${chalk.gray('Directory patterns:')} ${stats.directoryPatterns}`,
    `${chalk.gray('Total patterns:')} ${chalk.bold(stats.totalPatterns)}`,
    `${chalk.gray('Cache size:')} ${stats.cacheSize} entries`,
  ];

  display.info(lines.join('\n'), '📊 Ignore Statistics');
};

export const displayIgnoreHelp = (hasIgnoreFile: boolean): void => {
  const lines = [
    chalk.bold('Ignore Pattern Syntax:'),
    '',
    `  ${chalk.green('*.ext')}     Match files with extension`,
    `  ${chalk.green('name.*')}    Match files with name`,
    `  ${chalk.green('dir/')}      Match directory and contents`,
    `  ${chalk.green('/path')}     Match from repository root`,
    `  ${chalk.green('**/dir')}    Match dir in any location`,
    `  ${chalk.green('!pattern')}  Negate (un-ignore) pattern`,
    '',
    chalk.bold('Common Commands:'),
    '',
    `  ${chalk.cyan('sc ignore --create')}         Create default .sourceignore`,
    `  ${chalk.cyan('sc ignore -a "*.log"')}       Add pattern`,
    `  ${chalk.cyan('sc ignore -c file.txt')}      Check if file is ignored`,
    `  ${chalk.cyan('sc ignore -l')}               List all patterns`,
    `  ${chalk.cyan('sc ignore -e')}               Edit .sourceignore`,
    '',
  ];

  if (!hasIgnoreFile) {
    lines.push(
      chalk.yellow('💡 No .sourceignore file found.'),
      `   Run ${chalk.green('sc ignore --create')} to create one.`
    );
  }

  display.info(lines.join('\n'), '❓ Ignore Pattern Help');
};

export const handleIgnoreError = (error: Error, quiet: boolean): void => {
  if (quiet) {
    console.error(error.message);
    return;
  }

  display.error(`${chalk.red('Error:')} ${error.message}`, '❌ Ignore Operation Failed');
};

export const displayPatternsAdded = (patterns: string[]): void => {
  display.success(
    `${chalk.green('✓')} Added patterns: ${patterns.join(', ')}`,
    '📋 Ignore Patterns'
  );
};

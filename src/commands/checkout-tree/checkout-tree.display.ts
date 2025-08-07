import chalk from 'chalk';
import { display } from '@/utils';

export interface ExtractionStats {
  filesCreated: number;
  directoriesCreated: number;
  symlinksCreated: number;
  totalSize: number;
}

export const displayCheckoutResult = (
  treeish: string,
  targetPath: string,
  stats: ExtractionStats
): void => {
  const title = chalk.bold.green('📁 Tree Extraction Complete');

  const details = [
    `${chalk.gray('Source Tree:')} ${chalk.cyan(treeish)}`,
    `${chalk.gray('Target Directory:')} ${chalk.white(targetPath)}`,
    `${chalk.gray('Files Created:')} ${chalk.green(stats.filesCreated.toString())}`,
    `${chalk.gray('Directories Created:')} ${chalk.blue(stats.directoriesCreated.toString())}`,
    `${chalk.gray('Symlinks Created:')} ${chalk.magenta(stats.symlinksCreated.toString())}`,
    `${chalk.gray('Total Size:')} ${chalk.yellow(formatBytes(stats.totalSize))}`,
  ].join('\n');

  display.success(details, title);

  const summary = [
    `${chalk.blue('📊 Extraction Summary:')}`,
    `  ${chalk.green('✓')} Successfully extracted tree object to working directory`,
    `  ${chalk.green('✓')} All file permissions and types preserved`,
    `  ${chalk.green('✓')} Directory structure recreated accurately`,
    '',
    `${chalk.yellow('💡 Pro Tip:')} Use ${chalk.green('sc ls-tree -r ' + treeish)} to see what was extracted`,
  ].join('\n');

  display.info(summary, '📋 Summary');
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

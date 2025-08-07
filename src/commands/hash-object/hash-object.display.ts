import chalk from 'chalk';
import { display } from '@/utils';

export const printPrettyResult = (
  hash: string,
  source: string,
  size: number,
  wasWritten: boolean
) => {
  const title = chalk.bold.blue('🔍 Object Hash Result');

  const sourceLabel = chalk.gray('Source:');
  const sourceValue = source === '<stdin>' ? chalk.yellow('📥 stdin') : chalk.cyan(`📄 ${source}`);

  const hashLabel = chalk.gray('SHA-1 Hash:');
  const hashValue = chalk.green.bold(hash);

  const sizeLabel = chalk.gray('Size:');
  const sizeValue = chalk.magenta(`${size} bytes`);

  const statusLabel = chalk.gray('Status:');
  const statusValue = wasWritten
    ? chalk.green('✅ Written to object store')
    : chalk.yellow('📋 Hash computed only');

  const content = [
    `${sourceLabel} ${sourceValue}`,
    `${hashLabel} ${hashValue}`,
    `${sizeLabel} ${sizeValue}`,
    `${statusLabel} ${statusValue}`,
  ].join('\n');

  display.info(content, title);
};

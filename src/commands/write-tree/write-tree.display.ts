import { display } from '@/utils';
import chalk from 'chalk';

export const displayWriteTreeResult = (treeSha: string, dirPath: string, prefix?: string): void => {
  const title = chalk.bold.green('🌲 Tree Object Created');

  const details = [
    `${chalk.gray('Directory:')} ${chalk.white(dirPath)}`,
    ...(prefix ? [`${chalk.gray('Prefix:')} ${chalk.cyan(prefix)}`] : []),
    `${chalk.gray('Tree SHA:')} ${chalk.green.bold(treeSha)}`,
    `${chalk.gray('Status:')} ${chalk.green('✅ Written to object store')}`,
  ].join('\n');

  display.success(details, title);

  const nextSteps = [
    `${chalk.blue('💡 What you can do next:')}`,
    `  ${chalk.green('sc ls-tree ' + treeSha)}        ${chalk.gray('List tree contents')}`,
    `  ${chalk.green('sc cat-file -p ' + treeSha)}    ${chalk.gray('Show tree object details')}`,
    `  ${chalk.green('sc checkout-tree ' + treeSha)}  ${chalk.gray('Extract tree to directory')}`,
  ].join('\n');

  display.info(nextSteps, '🎯 Next Steps');
};

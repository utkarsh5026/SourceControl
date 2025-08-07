#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger';
import { ConfigManager } from './utils/config';
import { hashObjectCommand, catFileCommand, initCommand } from './commands';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name('sourcecontrol')
  .description('A modern source control CLI application')
  .version(pkg.version, '-v, --version', 'display version number')
  .option('-V, --verbose', 'enable verbose logging')
  .option('-q, --quiet', 'suppress output')
  .option('--config <path>', 'specify config file path')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();

    if (options['quiet']) {
      logger.level = 'silent';
    } else if (options['verbose']) {
      logger.level = 'debug';
    }

    if (options['config']) {
      ConfigManager.setConfigPath(options['config']);
    }
  });

program.addCommand(hashObjectCommand);
program.addCommand(catFileCommand);
program.addCommand(initCommand);

program.exitOverride();

try {
  program.parse();
} catch (err: any) {
  if (err.code === 'commander.version') {
    process.exit(0);
  }
  if (err.code === 'commander.help') {
    process.exit(0);
  }

  logger.error('CLI Error:', err.message);
  process.exit(1);
}

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

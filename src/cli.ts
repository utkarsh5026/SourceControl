#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils';
import { ConfigManager } from './utils/config';
import {
  hashObjectCommand,
  catFileCommand,
  initCommand,
  destroyCommand,
  lsTreeCommand,
  writeTreeCommand,
  checkoutTreeCommand,
} from './commands';
import { formatHelp, displayVersion, displayError, displayWelcome } from './utils/cli';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const program = new Command();
program

  .name('sourcecontrol')
  .description('🎯 A modern, beautiful source control CLI application')
  .version(pkg.version, '-v, --version', '📋 Display version information')
  .option('-V, --verbose', '🔍 Enable verbose logging')
  .option('-q, --quiet', '🔇 Suppress output')
  .option('--config <path>', '⚙️  Specify config file path')
  .configureHelp({
    formatHelp: (cmd) => formatHelp(cmd),
  })
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
program.addCommand(destroyCommand);
program.addCommand(lsTreeCommand);
program.addCommand(writeTreeCommand);
program.addCommand(checkoutTreeCommand);
program.exitOverride();

try {
  program.parse();
} catch (err: any) {
  if (err.code === 'commander.version') {
    displayVersion();
    process.exit(0);
  }
  if (err.code === 'commander.help') {
    process.exit(0);
  }

  displayError(err);
  process.exit(1);
}

if (!process.argv.slice(2).length) {
  displayWelcome();
  console.log('\n' + formatHelp(program));
}

#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import { logger } from './utils/logger';
import { ConfigManager } from './utils/config';
import { hashObjectCommand, catFileCommand, initCommand, destroyCommand } from './commands';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const program = new Command();

/**
 * Creates a beautiful ASCII art banner for the CLI
 */
const createBanner = (): string => {
  // Create a colorful banner using multiple colors
  const line1 = chalk.cyan(
    ' ███████╗ ██████╗ ██╗   ██╗██████╗  ██████╗███████╗     ██████╗████████╗██████╗ ██╗     '
  );
  const line2 = chalk.blue(
    ' ██╔════╝██╔═══██╗██║   ██║██╔══██╗██╔════╝██╔════╝    ██╔════╝╚══██╔══╝██╔══██╗██║     '
  );
  const line3 = chalk.magenta(
    ' ███████╗██║   ██║██║   ██║██████╔╝██║     █████╗      ██║        ██║   ██████╔╝██║     '
  );
  const line4 = chalk.yellow(
    ' ╚════██║██║   ██║██║   ██║██╔══██╗██║     ██╔══╝      ██║        ██║   ██╔══██╗██║     '
  );
  const line5 = chalk.green(
    ' ███████║╚██████╔╝╚██████╔╝██║  ██║╚██████╗███████╗    ╚██████╗   ██║   ██║  ██║███████╗'
  );
  const line6 = chalk.red(
    ' ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚══════╝     ╚═════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝'
  );

  const banner = [line1, line2, line3, line4, line5, line6].join('\n');

  // Add sparkle effects around the banner
  const sparkles = chalk.yellow('✨ ') + chalk.cyan('✨ ') + chalk.magenta('✨');
  const subtitle = chalk.gray.italic('A modern, beautiful source control CLI');
  const version = chalk.blue(`v${pkg.version}`);
  const author = chalk.gray(`by ${pkg.author}`);

  return [
    sparkles + chalk.white(' '.repeat(70)) + sparkles,
    banner,
    sparkles + chalk.white(' '.repeat(70)) + sparkles,
    '',
    chalk.white(' '.repeat(25)) + subtitle,
    chalk.white(' '.repeat(30)) + `${version} ${author}`,
    '',
  ].join('\n');
};

/**
 * Custom help formatter with enhanced styling
 */
const formatHelp = (cmd: Command): string => {
  const commandName = chalk.cyan.bold(cmd.name());
  const description = chalk.gray(cmd.description());

  let help = `${commandName} - ${description}\n\n`;

  // Usage section with fancy header
  help += `${chalk.yellow.bold('📋 Usage:')}\n`;
  help += `  ${chalk.green('$')} ${commandName} ${chalk.gray('[options]')} ${chalk.gray('[command]')}\n\n`;

  // Options section
  const options = cmd.options;
  if (options.length > 0) {
    help += `${chalk.yellow.bold('⚙️  Options:')}\n`;
    const maxLength = Math.max(...options.map((opt) => opt.flags.length));

    options.forEach((option) => {
      const flags = option.flags.padEnd(maxLength);
      const desc = option.description || '';
      help += `  ${chalk.green(flags)}  ${chalk.gray(desc)}\n`;
    });
    help += '\n';
  }

  // Commands section
  const commands = cmd.commands;
  if (commands.length > 0) {
    help += `${chalk.yellow.bold('🚀 Commands:')}\n`;
    const maxLength = Math.max(...commands.map((cmd) => cmd.name().length));

    commands.forEach((command) => {
      const name = command.name().padEnd(maxLength);
      const desc = command.description() || '';
      const icon = getCommandIcon(command.name());
      help += `  ${icon} ${chalk.green(name)}  ${chalk.gray(desc)}\n`;
    });
    help += '\n';
  }

  // Examples section with fancy styling
  help += chalk.yellow.bold('💡 Examples:') + '\n';
  help += `  ${chalk.green('$')} ${commandName} init ${chalk.gray('# Initialize a new repository')}\n`;
  help += `  ${chalk.green('$')} ${commandName} hash-object file.txt ${chalk.gray('# Hash a file')}\n`;
  help += `  ${chalk.green('$')} ${commandName} cat-file -p <hash> ${chalk.gray('# Display object content')}\n\n`;

  // Footer
  help +=
    chalk.gray('For more information on a command, run: ') +
    chalk.green(`${commandName} help <command>`) +
    '\n';
  help +=
    chalk.gray('Visit our documentation: ') +
    chalk.blue.underline('https://docs.sourcecontrol.dev') +
    '\n';

  return help;
};

/**
 * Get appropriate icon for each command
 */
const getCommandIcon = (commandName: string): string => {
  const icons: Record<string, string> = {
    init: '🚀',
    destroy: '💥',
    'hash-object': '🔍',
    'cat-file': '📄',
    help: '❓',
  };
  return icons[commandName] || '⚡';
};

/**
 * Custom version display with enhanced styling
 */
const displayVersion = (): void => {
  const systemInfo = [
    `${chalk.bold.blue('SourceControl CLI')} ${chalk.green(`v${pkg.version}`)}`,
    '',
    `${chalk.gray('Runtime Information:')}`,
    `  ${chalk.gray('Node.js:')} ${chalk.cyan(process.version)}`,
    `  ${chalk.gray('Platform:')} ${chalk.cyan(process.platform)} ${chalk.cyan(process.arch)}`,
    `  ${chalk.gray('Memory:')} ${chalk.cyan((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB')}`,
    '',
    `${chalk.gray('Project Information:')}`,
    `  ${chalk.gray('Author:')} ${chalk.magenta(pkg.author)}`,
    `  ${chalk.gray('License:')} ${chalk.yellow(pkg.license)}`,
    `  ${chalk.gray('Description:')} ${chalk.white(pkg.description)}`,
    '',
    `${chalk.gray('Links:')}`,
    `  ${chalk.blue('🔗 Repository:')} ${chalk.underline('https://github.com/utkarsh5026/SourceControl.git')}`,
    `  ${chalk.blue('📝 Documentation:')} ${chalk.underline('https://docs.sourcecontrol.dev')}`,
    `  ${chalk.blue('🐛 Report Issues:')} ${chalk.underline('https://github.com/utkarsh5026/SourceControl/issues')}`,
  ].join('\n');

  const box = boxen(systemInfo, {
    title: chalk.bold.magenta('🎯 Version Information'),
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 1, bottom: 1, left: 1, right: 1 },
    borderStyle: 'round',
    borderColor: 'magenta',
    backgroundColor: 'black',
  });

  console.log(box);
};

/**
 * Enhanced error display
 */
const displayError = (error: Error): void => {
  const errorContent = [
    `${chalk.red.bold('❌ An error occurred:')}`,
    '',
    `${chalk.gray('Error Type:')} ${chalk.red(error.name || 'Unknown Error')}`,
    `${chalk.gray('Message:')} ${chalk.red(error.message)}`,
    '',
    chalk.yellow.bold('🔧 Troubleshooting:'),
    `  ${chalk.blue('💡 Tip:')} Use ${chalk.green('--verbose')} flag for detailed logs`,
    `  ${chalk.blue('📚 Help:')} Run ${chalk.green('sourcecontrol help')} for available commands`,
    `  ${chalk.blue('🐛 Bug?')} Report at ${chalk.underline('https://github.com/your-repo/sourcecontrol/issues')}`,
  ].join('\n');

  const box = boxen(errorContent, {
    title: chalk.bold.red('🚨 Error'),
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 1, bottom: 1, left: 1, right: 1 },
    borderStyle: 'round',
    borderColor: 'red',
    backgroundColor: 'black',
  });

  console.error(box);
};

/**
 * Welcome message for when no command is provided
 */
const displayWelcome = (): void => {
  console.log(createBanner());

  const welcomeContent = [
    `${chalk.blue('👋 Welcome to SourceControl!')}`,
    '',
    `${chalk.gray('This is a modern, beautiful CLI for source control operations.')}`,
    `${chalk.gray('Built with TypeScript and designed for developer happiness.')}`,
    '',
    chalk.yellow.bold('🚀 Quick Start:'),
    `  ${chalk.green('sourcecontrol init')}        ${chalk.gray('Initialize a new repository')}`,
    `  ${chalk.green('sourcecontrol help')}        ${chalk.gray('Show detailed help')}`,
    `  ${chalk.green('sourcecontrol --version')}   ${chalk.gray('Show version information')}`,
    '',
    chalk.blue.bold('💡 Pro Tips:'),
    `  ${chalk.gray('•')} Use ${chalk.green('sc')} as a shorthand for ${chalk.green('sourcecontrol')}`,
    `  ${chalk.gray('•')} Add ${chalk.green('--verbose')} to any command for detailed output`,
    `  ${chalk.gray('•')} Use ${chalk.green('--quiet')} to suppress non-essential output`,
    `  ${chalk.gray('•')} Commands support both long and short flags (${chalk.green('-v')} or ${chalk.green('--version')})`,
    '',
    chalk.magenta.bold('🎯 Features:'),
    `  ${chalk.gray('•')} Beautiful, colorized output with rich formatting`,
    `  ${chalk.gray('•')} Progress indicators and spinners for long operations`,
    `  ${chalk.gray('•')} Smart error handling with helpful suggestions`,
    `  ${chalk.gray('•')} Auto-completion support (coming soon)`,
  ].join('\n');

  const box = boxen(welcomeContent, {
    title: chalk.bold.cyan('🎯 Getting Started'),
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 0, bottom: 1, left: 1, right: 1 },
    borderStyle: 'round',
    borderColor: 'cyan',
    backgroundColor: 'black',
  });

  console.log(box);
};

// Configure the program with enhanced styling
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

// Update command descriptions with emojis (they'll inherit these)
hashObjectCommand.description('🔍 Compute hash for file objects and optionally store them');
catFileCommand.description('📄 Display content, type, or size of repository objects');
initCommand.description('🚀 Create an empty repository or reinitialize an existing one');
destroyCommand.description('💥 Remove a repository completely (use with caution)');

program.addCommand(hashObjectCommand);
program.addCommand(catFileCommand);
program.addCommand(initCommand);
program.addCommand(destroyCommand);

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

// Show welcome message when no command is provided
if (!process.argv.slice(2).length) {
  displayWelcome();
  console.log('\n' + formatHelp(program));
}

import chalk from 'chalk';
import { display } from './display';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));

/**
 * Creates a beautiful ASCII art banner for the CLI
 */
const createBanner = (): string => {
  const line1 = chalk.cyan(
    ' ███████╗ ██████╗ ██╗   ██╗██████╗  ██████╗███████╗      ██████╗ ██████╗ ███╗   ██╗████████╗██████╗  ██████╗ ██╗     '
  );
  const line2 = chalk.blue(
    ' ██╔════╝██╔═══██╗██║   ██║██╔══██╗██╔════╝██╔════╝     ██╔════╝██╔═══██╗████╗  ██║╚══██╔══╝██╔══██╗██╔═══██╗██║     '
  );
  const line3 = chalk.magenta(
    ' ███████╗██║   ██║██║   ██║██████╔╝██║     █████╗       ██║     ██║   ██║██╔██╗ ██║   ██║   ██████╔╝██║   ██║██║     '
  );
  const line4 = chalk.yellow(
    ' ╚════██║██║   ██║██║   ██║██╔══██╗██║     ██╔══╝       ██║     ██║   ██║██║╚██╗██║   ██║   ██╔══██╗██║   ██║██║     '
  );
  const line5 = chalk.green(
    ' ███████║╚██████╔╝╚██████╔╝██║  ██║╚██████╗███████╗     ╚██████╗╚██████╔╝██║ ╚████║   ██║   ██║  ██║╚██████╔╝███████╗'
  );
  const line6 = chalk.red(
    ' ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚══════╝      ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝'
  );

  const banner = [line1, line2, line3, line4, line5, line6].join('\n');
  const subtitle = chalk.gray.italic('A modern, beautiful source control CLI');
  const version = chalk.blue(`v${pkg.version}`);
  const author = chalk.gray(`by ${pkg.author}`);

  return [
    banner,
    chalk.white(' '.repeat(35)) + subtitle,
    chalk.white(' '.repeat(40)) + `${version} ${author}`,
    '',
  ].join('\n');
};

/**
 * Custom help formatter with enhanced styling
 */
const formatHelp = (cmd: Command): string => {
  const commandName = chalk.cyan.bold(cmd.name());
  const description = chalk.gray(cmd.description());

  let help = '';

  if (cmd.name() === 'sourcecontrol') {
    help += createBanner() + '\n';
  }

  help += `${commandName} - ${description}\n\n`;

  help += `${chalk.yellow.bold('📋 Usage:')}\n`;
  help += `  ${chalk.green('$')} ${commandName} ${chalk.gray('[options]')} ${chalk.gray('[command]')}\n\n`;

  const commands = cmd.commands;
  if (commands.length > 0) {
    help += `${chalk.yellow.bold('🚀 Commands:')}\n`;
    const maxLength = Math.max(...commands.map((cmd) => cmd.name().length));

    commands.forEach((command) => {
      const name = command.name().padEnd(maxLength);
      const desc = command.description() || '';
      help += `  ${chalk.green(name)}  ${chalk.gray(desc)}\n`;
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

  display.highlight(systemInfo, '🎯 Version Information');
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

  display.error(errorContent, '🚨 Error');
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
  display.highlight(welcomeContent, '🎯 Getting Started');
};

export { createBanner, formatHelp, displayVersion, displayError, displayWelcome };

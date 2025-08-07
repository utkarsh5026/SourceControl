import { display } from '@/utils';
import chalk from 'chalk';

export interface InitOptions {
  bare?: boolean;
  template?: string;
  shared?: boolean | string;
  verbose?: boolean;
}

/**
 * Display initialization header
 */
export const displayHeader = () => {
  display.info(
    '🚀 Source Control Repository Initialization',
    'Source Control Repository Initialization'
  );
};

/**
 * Display success message with repository information
 */
export const displaySuccessMessage = (repoPath: string, options: InitOptions) => {
  const title = chalk.bold.green('✅ Repository Created Successfully!');

  const details = [
    `${chalk.gray('📍 Location:')} ${chalk.white(repoPath)}`,
    `${chalk.gray('🏷️  Type:')} ${chalk.white(options.bare ? 'Bare Repository' : 'Standard Repository')}`,
    `${chalk.gray('⚙️  Format:')} ${chalk.white('Source Control Repository Format v0')}`,
    `${chalk.gray('📁 Directory:')} ${chalk.white('.source/')}`,
  ].join('\n');

  display.success(details, title);
};

/**
 * Display the created repository structure
 */
export const displayRepositoryStructure = () => {
  const title = chalk.yellow('📂 Repository Structure Created');

  const structure = [
    `${chalk.cyan('📁')} ${chalk.white('.source/')}              ${chalk.gray('Source control metadata directory')}`,
    `${chalk.cyan('📦')} ${chalk.white('├── objects/')}          ${chalk.gray('Object storage (blobs, trees, commits)')}`,
    `${chalk.cyan('🏷️')} ${chalk.white('├── refs/')}             ${chalk.gray('References (branches, tags)')}`,
    `${chalk.cyan('📄')} ${chalk.white('│   ├── heads/')}        ${chalk.gray('Branch references')}`,
    `${chalk.cyan('📄')} ${chalk.white('│   └── tags/')}         ${chalk.gray('Tag references')}`,
    `${chalk.cyan('📋')} ${chalk.white('├── HEAD')}              ${chalk.gray('Current branch pointer')}`,
    `${chalk.cyan('⚙️')} ${chalk.white('├── config')}            ${chalk.gray('Repository configuration')}`,
    `${chalk.cyan('📝')} ${chalk.white('└── description')}       ${chalk.gray('Repository description')}`,
  ].join('\n');

  display.highlight(structure, title);
};

/**
 * Display next steps for the user
 */
export const displayNextSteps = () => {
  const title = chalk.magenta('🎯 Next Steps');

  const steps = [
    `${chalk.gray('1.')} ${chalk.green('sc add <file>')}           ${chalk.gray('Add files to staging area')}`,
    `${chalk.gray('2.')} ${chalk.green('sc commit -m "message"')}  ${chalk.gray('Create your first commit')}`,
    `${chalk.gray('3.')} ${chalk.green('sc status')}               ${chalk.gray('Check repository status')}`,
    `${chalk.gray('4.')} ${chalk.green('sc log')}                  ${chalk.gray('View commit history')}`,
  ].join('\n');

  const tip = `${chalk.blue('💡 Tip:')} Use ${chalk.green('sc help <command>')} for more information about any command.`;

  display.highlight(steps + '\n\n' + tip, title);
};

/**
 * Display reinitialization information when repository already exists
 */
export const displayReinitializationInfo = (repoPath: string) => {
  const message = [
    `The directory ${chalk.white(repoPath)} already contains a source control repository.`,
    '',
    `${chalk.green('✓')} Reinitialized existing repository in ${chalk.white(repoPath + '/.source/')}`,
    '',
    `${chalk.blue('ℹ️')} No changes were made to the existing repository structure.`,
  ].join('\n');

  display.warning(message, chalk.yellow('⚠️  Repository Already Exists'));
};

/**
 * Handle initialization errors with styled output
 */
export const displayInitError = (error: Error) => {
  const title = chalk.red('❌ Initialization Failed');

  const errorDetails = [
    `${chalk.red('📋 Error Details:')}`,
    `   └─ ${chalk.white(error.message)}`,
    '',
    `${chalk.yellow('🔧 Troubleshooting:')}`,
    `   ${chalk.gray('1.')} Check if you have write permissions to the directory`,
    `   ${chalk.gray('2.')} Ensure the directory path is valid`,
    `   ${chalk.gray('3.')} Verify that the disk has sufficient space`,
    `   ${chalk.gray('4.')} Try running the command with elevated privileges if needed`,
  ];

  display.error(errorDetails.join('\n'), title);
};

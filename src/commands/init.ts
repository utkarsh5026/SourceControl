import { Command } from 'commander';
import { PathScurry } from 'path-scurry';
import chalk from 'chalk';
import { SourceRepository } from '@/core/repo';
import { display, logger } from '@/utils';
import path from 'path';

interface InitOptions {
  bare?: boolean;
  template?: string;
  shared?: boolean | string;
  verbose?: boolean;
}

export const initCommand = new Command('init')
  .description('Create an empty Git repository or reinitialize an existing one')
  .option('--bare', 'Create a bare repository')
  .option('--template <template>', 'Directory from which templates will be used')
  .option('--shared[=<permissions>]', 'Specify that the Git repository is to be shared', false)
  .option('-q, --quiet', 'Only print error and warning messages')
  .argument('[directory]', 'Directory to initialize (defaults to current directory)', '.')
  .action(async (directory: string, options: InitOptions) => {
    try {
      const globalOptions = options as any;
      if (globalOptions.verbose) {
        logger.level = 'debug';
      }

      const targetPath = path.resolve(directory);
      const pathScurry = new PathScurry(targetPath);

      await initializeRepositoryWithFeedback(pathScurry.cwd, options);
    } catch (error) {
      handleInitError(error as Error);
      process.exit(1);
    }
  });

/**
 * Initialize a repository with rich feedback using chalk, boxen, and ora
 */
const initializeRepositoryWithFeedback = async (
  targetPath: PathScurry['cwd'],
  options: InitOptions
) => {
  displayHeader();
  const existingRepo = await SourceRepository.findRepository(targetPath);
  if (existingRepo) {
    displayReinitializationInfo(existingRepo.workingDirectory().toString());
    return;
  }

  try {
    const repository = new SourceRepository();
    await repository.init(targetPath);

    displaySuccessMessage(targetPath.fullpath(), options);
    displayRepositoryStructure();
    displayNextSteps();
  } catch (error) {
    throw error;
  }
};

/**
 * Display initialization header
 */
const displayHeader = () => {
  display.info(
    '🚀 Source Control Repository Initialization',
    'Source Control Repository Initialization'
  );
};

/**
 * Display success message with repository information
 */
const displaySuccessMessage = (repoPath: string, options: InitOptions) => {
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
const displayRepositoryStructure = () => {
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
const displayNextSteps = () => {
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
const displayReinitializationInfo = (repoPath: string) => {
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
const handleInitError = (error: Error) => {
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

import { Command } from 'commander';
import { PathScurry } from 'path-scurry';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { SourceRepository } from '@/core/repo';
import { display, logger } from '@/utils';
import path from 'path';

interface InitOptions {
  bare?: boolean;
  template?: string;
  shared?: boolean | string;
  quiet?: boolean;
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
      // Set logger level based on options
      const globalOptions = options as any;
      if (globalOptions.verbose) {
        logger.level = 'debug';
      } else if (options.quiet) {
        logger.level = 'error';
      }

      const targetPath = path.resolve(directory);
      const pathScurry = new PathScurry(targetPath);

      await initializeRepositoryWithFeedback(pathScurry.cwd, options);
    } catch (error) {
      handleInitError(error as Error, options.quiet || false);
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
  if (!options.quiet) {
    console.log();
    displayHeader();
  }

  const existingRepo = await SourceRepository.findRepository(targetPath);
  if (existingRepo) {
    if (!options.quiet) {
      displayReinitializationInfo(existingRepo.workingDirectory().toString());
    }
    return;
  }

  let spinner: any = null;
  if (!options.quiet) {
    spinner = ora({
      text: chalk.cyan('Creating repository structure...'),
      color: 'cyan',
      spinner: 'dots',
    }).start();
  }

  try {
    const repository = new SourceRepository();

    if (spinner) {
      spinner.text = chalk.cyan('Setting up .source directory...');
      await sleep(200);
    }

    await repository.init(targetPath);

    if (spinner) {
      spinner.text = chalk.cyan('Creating initial files...');
      await sleep(200);
    }

    if (spinner) {
      spinner.succeed(chalk.green('Repository initialized successfully!'));
    }

    if (!options.quiet) {
      console.log();
      displaySuccessMessage(targetPath.fullpath(), options);
      displayRepositoryStructure();
      displayNextSteps();
    }
  } catch (error) {
    if (spinner) {
      spinner.fail(chalk.red('Repository initialization failed'));
    }
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

  console.log(
    boxen(`${title}\n\n${details}`, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'green',
      backgroundColor: 'black',
    })
  );
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

  console.log(
    boxen(`${title}\n\n${structure}`, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'yellow',
      backgroundColor: 'black',
    })
  );
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

  console.log(
    boxen(`${title}\n\n${steps}\n\n${tip}`, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'magenta',
      backgroundColor: 'black',
    })
  );
};

/**
 * Display reinitialization information when repository already exists
 */
const displayReinitializationInfo = (repoPath: string) => {
  const title = chalk.yellow('⚠️  Repository Already Exists');

  const message = [
    `The directory ${chalk.white(repoPath)} already contains a source control repository.`,
    '',
    `${chalk.green('✓')} Reinitialized existing repository in ${chalk.white(repoPath + '/.source/')}`,
    '',
    `${chalk.blue('ℹ️')} No changes were made to the existing repository structure.`,
  ].join('\n');

  console.log(
    boxen(`${title}\n\n${message}`, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'yellow',
      backgroundColor: 'black',
    })
  );
};

/**
 * Handle initialization errors with styled output
 */
const handleInitError = (error: Error, quiet: boolean) => {
  if (quiet) {
    console.error(error.message);
    return;
  }

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

  if (logger.level === 'debug') {
    errorDetails.push(
      '',
      `${chalk.red('🐛 Debug Information:')}`,
      chalk.gray(error.stack || 'No stack trace available')
    );
  }

  console.log(
    boxen(`${title}\n\n${errorDetails.join('\n')}`, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'red',
      backgroundColor: 'black',
    })
  );
};

/**
 * Simple sleep utility for progress animation
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

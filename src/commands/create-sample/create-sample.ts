import { Command } from 'commander';
import path from 'path';
import { FileUtils, logger, display } from '@/utils';
import { SampleOptions } from './create-sample.types';
import { SampleGenerator } from './create-sample.handler';
import { formatGenerationSummary } from './create-sample.display';
/**
 * Main command handler for create-sample
 */
async function createSampleHandler(projectName: string, options: SampleOptions): Promise<void> {
  try {
    const maxDirs = parseInt(options.dirs || '3');
    const maxFiles = parseInt(options.files || '5');
    const maxDepth = parseInt(options.depth || '3');

    if (maxDirs < 1 || maxDirs > 20) {
      throw new Error('Number of directories must be between 1 and 20');
    }

    if (maxFiles < 1 || maxFiles > 50) {
      throw new Error('Number of files must be between 1 and 50');
    }

    if (maxDepth < 1 || maxDepth > 10) {
      throw new Error('Directory depth must be between 1 and 10');
    }

    const outputPath = options.output
      ? path.resolve(options.output, projectName)
      : path.resolve(process.cwd(), projectName);

    logger.info(`🚀 Creating sample project: ${projectName}`);
    logger.info(`📍 Output directory: ${outputPath}`);
    logger.debug(`Configuration: dirs=${maxDirs}, files=${maxFiles}, depth=${maxDepth}`);

    if (await FileUtils.exists(outputPath)) {
      throw new Error(
        `Directory '${outputPath}' already exists. Please choose a different name or remove the existing directory.`
      );
    }

    const generator = new SampleGenerator(maxDirs, maxFiles, maxDepth);
    const stats = await generator.generateSample(outputPath);

    const summary = formatGenerationSummary(stats, outputPath);
    display.success(summary, '✅ Sample Project Created Successfully');

    const nextSteps = [
      `cd ${projectName}`,
      `sourcecontrol init`,
      `sourcecontrol add .`,
      `sourcecontrol commit -m "Initial commit"`,
    ].join('\n');

    display.info(nextSteps, '🔄 Next Steps');
  } catch (error) {
    logger.error('Failed to create sample project:', error);
    display.error((error as Error).message, '❌ Error');
    process.exit(1);
  }
}

export const createSampleCommand = new Command('create-sample')
  .description('🎯 Create a sample project structure with random files and directories for testing')
  .argument('<project-name>', 'Name of the sample project to create')
  .option('-d, --dirs <number>', 'Maximum number of directories per level (1-20)', '3')
  .option('-f, --files <number>', 'Maximum number of files per directory (1-50)', '5')
  .option('--depth <number>', 'Maximum directory depth (1-10)', '3')
  .option('-s, --size <bytes>', 'Maximum file size in bytes', '10240')
  .option('-o, --output <path>', 'Output directory (default: current directory)')
  .action(createSampleHandler);

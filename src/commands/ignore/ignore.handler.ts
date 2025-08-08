import { SourceRepository } from '@/core/repo/source-repo';
import inquirer from 'inquirer';
import path from 'path';
import { IgnoreManager, IgnorePattern } from '@/core/ignore';
import {
  displayIgnoreFileCreated,
  displayPatternsAdded,
  displayIgnorePatterns,
  displayIgnoreCheckResults,
} from './ignore.display';
import fs from 'fs-extra';
import chalk from 'chalk';
import { spawn } from 'child_process';

/**
 * Create default .sourceignore file
 */
export const createDefaultIgnoreFile = async (repository: SourceRepository): Promise<void> => {
  const ignorePath = path.join(
    repository.workingDirectory().toString(),
    IgnorePattern.DEFAULT_SOURCE
  );

  if (await fs.pathExists(ignorePath)) {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: chalk.yellow('.sourceignore already exists. Overwrite?'),
        default: false,
      },
    ]);

    if (!answer.overwrite) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }
  }

  await IgnoreManager.createDefaultIgnoreFile(repository.workingDirectory().toString());
  displayIgnoreFileCreated();
};

/**
 * Add patterns to .sourceignore
 */
export const addPatternsToIgnore = async (
  repository: SourceRepository,
  ignoreManager: IgnoreManager,
  patterns: string[]
): Promise<void> => {
  const ignorePath = path.join(
    repository.workingDirectory().toString(),
    IgnorePattern.DEFAULT_SOURCE
  );

  if (!(await fs.pathExists(ignorePath))) {
    await fs.writeFile(ignorePath, '# Source Control Ignore File\n\n', 'utf8');
  }

  for (const pattern of patterns) {
    await ignoreManager.addPattern(pattern);
  }

  displayPatternsAdded(patterns);
};

/**
 * List all ignore patterns
 */
export const listIgnorePatterns = async (repository: SourceRepository): Promise<void> => {
  const repoRoot = repository.workingDirectory().fullpath();
  const files: Array<{ path: string; patterns: string[] }> = [];

  const rootIgnore = path.join(repoRoot, IgnorePattern.DEFAULT_SOURCE);
  if (await fs.pathExists(rootIgnore)) {
    const content = await fs.readFile(rootIgnore, 'utf8');
    const patterns = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

    if (patterns.length > 0) {
      files.push({ path: IgnorePattern.DEFAULT_SOURCE, patterns });
    }
  }

  const findIgnoreFiles = async (dir: string, prefix: string = ''): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.name === '.source' || entry.name === '.git') continue;

        const ignorePath = path.join(fullPath, IgnorePattern.DEFAULT_SOURCE);
        if (await fs.pathExists(ignorePath)) {
          const content = await fs.readFile(ignorePath, 'utf8');
          const patterns = content
            .split('\n')
            .filter((line) => line.trim() && !line.startsWith('#'));

          if (patterns.length > 0) {
            files.push({
              path: path.join(relativePath, IgnorePattern.DEFAULT_SOURCE),
              patterns,
            });
          }
        }

        await findIgnoreFiles(fullPath, relativePath);
      }
    }
  };

  await findIgnoreFiles(repoRoot);
  displayIgnorePatterns(files);
};

/**
 * Edit .sourceignore file
 */
export const editIgnoreFile = async (repository: SourceRepository): Promise<void> => {
  const ignorePath = path.join(
    repository.workingDirectory().toString(),
    IgnorePattern.DEFAULT_SOURCE
  );

  if (!(await fs.pathExists(ignorePath))) {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'create',
        message: chalk.yellow('.sourceignore does not exist. Create it?'),
        default: true,
      },
    ]);

    if (answer.create) {
      await IgnoreManager.createDefaultIgnoreFile(repository.workingDirectory().toString());
    } else {
      return;
    }
  }

  const editor = process.env['EDITOR'] || 'nano';
  console.log(chalk.blue(`Opening ${ignorePath} in ${editor}...`));

  const child = spawn(editor, [ignorePath], {
    stdio: 'inherit',
  });

  child.on('exit', (code: number) => {
    if (code === 0) {
      console.log(chalk.green('✓ File saved'));
    }
  });
};

/**
 * Check if files are ignored
 */
export const checkIgnoreStatus = async (
  ignoreManager: IgnoreManager,
  filePaths: string[]
): Promise<void> => {
  const results: Array<{ path: string; ignored: boolean }> = [];

  filePaths.forEach(async (filePath) => {
    const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
    const isDir = (await fs.pathExists(filePath)) && (await fs.stat(filePath)).isDirectory();
    const ignored = ignoreManager.isIgnored(normalizedPath, isDir);
    results.push({ path: filePath, ignored });
  });

  displayIgnoreCheckResults(results);
};

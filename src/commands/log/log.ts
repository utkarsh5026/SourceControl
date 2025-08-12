import { Command } from 'commander';
import { CommitManager } from '@/core/commit';
import { BranchManager } from '@/core/branch';
import { Repository } from '@/core/repo';
import { CommitObject, ObjectValidator } from '@/core/objects';
import { getRepo } from '@/utils/helpers';
import { logger } from '@/utils';
import chalk from 'chalk';

/**
 * Log command implementation
 *
 * Shows commit history with various formatting options:
 * - Full commit details
 * - Oneline format
 * - Graph visualization
 * - Branch decorations
 * - Author/date filtering
 */
export const logCommand = new Command('log')
  .description('Show commit logs')
  .argument('[branch]', 'Branch or commit to start from')
  .option('-n, --max-count <n>', 'Limit number of commits', '50')
  .option('--oneline', 'Show each commit on one line')
  .option('--graph', 'Draw ASCII graph of branch structure')
  .option('--all', 'Show all branches')
  .option('--decorate', 'Show branch names and tags')
  .option('--author <pattern>', 'Show commits by author')
  .option('--since <date>', 'Show commits since date')
  .option('--until <date>', 'Show commits until date')
  .option('--grep <pattern>', 'Search commit messages')
  .option('-p, --patch', 'Show patches (diffs)')
  .option('--stat', 'Show file statistics')
  .option('--pretty <format>', 'Pretty print format')
  .action(async (startBranch, options) => {
    try {
      const repository = await getRepo();
      const commitManager = new CommitManager(repository);
      const branchManager = new BranchManager(repository);

      await commitManager.initialize();
      await branchManager.init();

      // Determine starting point
      let startSha: string;
      if (startBranch) {
        try {
          // Try as branch first
          const branch = await branchManager.getBranch(startBranch);
          startSha = branch.sha;
        } catch {
          // Might be a commit SHA
          startSha = startBranch;
        }
      } else {
        // Use current HEAD
        try {
          startSha = await branchManager.getCurrentCommit();
        } catch {
          logger.error('No commits yet');
          return;
        }
      }

      // Get commit history
      const limit = parseInt(options.maxCount) || 50;
      const commits = await getCommitHistory(repository, startSha, limit, options);

      if (commits.length === 0) {
        logger.info('No commits found');
        return;
      }

      // Get branch decorations if needed
      const decorations =
        options.decorate || options.oneline ? await getBranchDecorations(branchManager) : null;

      // Display commits
      if (options.oneline) {
        await displayOneline(commits, decorations);
      } else if (options.graph) {
        await displayGraph(commits, decorations);
      } else {
        await displayFull(commits, decorations, options);
      }
    } catch (error) {
      logger.error('Failed to show log:', error);
      process.exit(1);
    }
  });

/**
 * Get commit history with filtering
 */
async function getCommitHistory(
  repository: Repository,
  startSha: string,
  limit: number,
  options: any
): Promise<CommitObject[]> {
  const commits: CommitObject[] = [];
  const visited = new Set<string>();
  const queue = [startSha];

  while (queue.length > 0 && commits.length < limit) {
    const sha = queue.shift()!;

    if (visited.has(sha)) continue;
    visited.add(sha);

    const obj = await repository.readObject(sha);
    if (!ObjectValidator.isCommit(obj)) continue;

    const commit = obj as CommitObject;

    // Apply filters
    if (options.author && !matchesAuthor(commit, options.author)) {
      queue.push(...commit.parentShas);
      continue;
    }

    if (options.since && !isAfterDate(commit, options.since)) {
      continue;
    }

    if (options.until && !isBeforeDate(commit, options.until)) {
      queue.push(...commit.parentShas);
      continue;
    }

    if (options.grep && !matchesMessage(commit, options.grep)) {
      queue.push(...commit.parentShas);
      continue;
    }

    commits.push(commit);
    queue.push(...commit.parentShas);
  }

  return commits;
}

/**
 * Get branch decorations (which branches point to which commits)
 */
async function getBranchDecorations(branchManager: BranchManager): Promise<Map<string, string[]>> {
  const decorations = new Map<string, string[]>();
  const branches = await branchManager.listBranches();

  for (const branch of branches) {
    if (!decorations.has(branch.sha)) {
      decorations.set(branch.sha, []);
    }
    decorations.get(branch.sha)!.push(branch.name);
  }

  return decorations;
}

/**
 * Display commits in oneline format
 */
async function displayOneline(
  commits: CommitObject[],
  decorations: Map<string, string[]> | null
): Promise<void> {
  for (const commit of commits) {
    const sha = await commit.sha();
    const shortSha = chalk.yellow(sha.substring(0, 7));
    const message = commit.message?.split('\n')[0] || '';

    let line = `${shortSha}`;

    // Add decorations
    if (decorations?.has(sha)) {
      const branches = decorations.get(sha)!;
      const decoration = branches.map((b) => chalk.green(b)).join(', ');
      line += chalk.cyan(` (${decoration})`);
    }

    line += ` ${message}`;
    logger.info(line);
  }
}

/**
 * Display full commit information
 */
async function displayFull(
  commits: CommitObject[],
  decorations: Map<string, string[]> | null,
  options: any
): Promise<void> {
  for (const [index, commit] of commits.entries()) {
    const sha = await commit.sha();

    // Commit header
    logger.log(chalk.yellow(`commit ${sha}`));

    // Decorations
    if (decorations?.has(sha)) {
      const branches = decorations.get(sha)!;
      const decoration = branches.map((b) => chalk.green(b)).join(', ');
      logger.log(chalk.cyan(`(${decoration})`));
    }

    // Parent commits
    if (commit.parentShas.length > 1) {
      logger.log(`Merge: ${commit.parentShas.map((s) => s.substring(0, 7)).join(' ')}`);
    }

    // Author
    if (commit.author) {
      const date = new Date(commit.author.timestamp * 1000);
      logger.log(`Author: ${commit.author.name} <${commit.author.email}>`);
      logger.log(`Date:   ${date.toLocaleString()}`);
    }

    // Message
    logger.log('');
    const messageLines = commit.message?.split('\n') || [];
    messageLines.forEach((line) => {
      logger.log(`    ${line}`);
    });

    // Stats if requested
    if (options.stat) {
      // TODO: Implement file statistics
      logger.log(chalk.gray('\n    (file statistics not yet implemented)'));
    }

    // Patch if requested
    if (options.patch) {
      // TODO: Implement diff generation
      logger.log(chalk.gray('\n    (patch generation not yet implemented)'));
    }

    // Separator between commits
    if (index < commits.length - 1) {
      logger.log('');
    }
  }
}

/**
 * Display commits with ASCII graph
 */
async function displayGraph(
  commits: CommitObject[],
  decorations: Map<string, string[]> | null
): Promise<void> {
  // Simple graph visualization
  const graphChars = {
    commit: '*',
    vertical: '|',
    branch: '\\',
    merge: '/',
  };

  for (const commit of commits) {
    const sha = await commit.sha();
    const shortSha = chalk.yellow(sha.substring(0, 7));
    const message = commit.message?.split('\n')[0] || '';

    let line = `${graphChars.commit} ${shortSha}`;

    // Add decorations
    if (decorations?.has(sha)) {
      const branches = decorations.get(sha)!;
      const decoration = branches.map((b) => chalk.green(b)).join(', ');
      line += chalk.cyan(` (${decoration})`);
    }

    line += ` ${message}`;

    // Show graph lines for parents
    if (commit.parentShas.length > 1) {
      logger.log(`${graphChars.vertical}${graphChars.merge} ${line}`);
    } else if (commit.parentShas.length === 1) {
      logger.log(`${graphChars.vertical} ${line}`);
    } else {
      logger.log(`  ${line}`);
    }
  }
}

/**
 * Filter helpers
 */
function matchesAuthor(commit: CommitObject, pattern: string): boolean {
  if (!commit.author) return false;
  const authorStr = `${commit.author.name} ${commit.author.email}`;
  return authorStr.toLowerCase().includes(pattern.toLowerCase());
}

function isAfterDate(commit: CommitObject, dateStr: string): boolean {
  if (!commit.author) return false;
  const commitDate = new Date(commit.author.timestamp * 1000);
  const targetDate = new Date(dateStr);
  return commitDate >= targetDate;
}

function isBeforeDate(commit: CommitObject, dateStr: string): boolean {
  if (!commit.author) return false;
  const commitDate = new Date(commit.author.timestamp * 1000);
  const targetDate = new Date(dateStr);
  return commitDate <= targetDate;
}

function matchesMessage(commit: CommitObject, pattern: string): boolean {
  if (!commit.message) return false;
  return commit.message.toLowerCase().includes(pattern.toLowerCase());
}

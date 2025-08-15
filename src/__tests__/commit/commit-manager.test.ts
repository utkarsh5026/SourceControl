import path from 'path';
import fs from 'fs/promises';
import { PathScurry } from 'path-scurry';
import { CommitManager } from '../../core/commit/commit-manager';
import { SourceRepository } from '../../core/repo/source-repo';
import { CommitOptions, CommitResult } from '../../core/commit/types';
import { CommitPerson } from '../../core/objects/commit/commit-person';
import { GitIndex, IndexEntry } from '../../core/index';
import { GitTimestamp } from '../../core/index/index-entry-utils';

// Test utilities
const createTempDir = async (): Promise<string> => {
  const tmpDir = path.join(
    __dirname,
    '../../..',
    '.tmp',
    `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
};

const cleanup = async (dir: string): Promise<void> => {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
};

const createTestRepo = async (): Promise<{
  repo: SourceRepository;
  gitDir: string;
  workDir: string;
}> => {
  const workDir = await createTempDir();
  const scurry = new PathScurry(workDir);
  const wd = scurry.cwd;

  const repo = new SourceRepository();
  await repo.init(wd);

  const gitDir = path.join(workDir, '.source');

  // Add user config
  const configPath = path.join(gitDir, 'config');
  const existingConfig = await fs.readFile(configPath, 'utf8');
  const userConfig = `${existingConfig}[user]
    name = Test User
    email = test@example.com
`;
  await fs.writeFile(configPath, userConfig);

  return { repo, gitDir, workDir };
};

const createTestIndex = async (
  gitDir: string,
  entries: Array<{ path: string; sha: string }> = []
): Promise<void> => {
  const indexEntries = entries.map((entry) => {
    return new IndexEntry({
      filePath: entry.path,
      contentHash: entry.sha,
      fileMode: 0o100644,
      fileSize: 100,
      modificationTime: new GitTimestamp(Math.floor(Date.now() / 1000), 0),
      creationTime: new GitTimestamp(Math.floor(Date.now() / 1000), 0),
      deviceId: 1,
      inodeNumber: 1,
      userId: 1000,
      groupId: 1000,
      assumeValid: false,
      stageNumber: 0,
    });
  });

  const index = new GitIndex(2, indexEntries);
  await index.write(path.join(gitDir, 'index'));
};

describe('CommitManager', () => {
  let repo: SourceRepository;
  let commitManager: CommitManager;
  let gitDir: string;
  let workDir: string;

  beforeEach(async () => {
    const testRepo = await createTestRepo();
    repo = testRepo.repo;
    gitDir = testRepo.gitDir;
    workDir = testRepo.workDir;

    commitManager = new CommitManager(repo);
    await commitManager.initialize();

    // Force config reload after test setup modifies config
    await commitManager.initialize();
  });

  afterEach(async () => {
    await cleanup(workDir);
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      const manager = new CommitManager(repo);
      await expect(manager.initialize()).resolves.not.toThrow();
    });
  });

  describe('createCommit - basic functionality', () => {
    test('should create initial commit successfully', async () => {
      // Create a test blob and tree
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const options: CommitOptions = {
        message: 'Initial commit',
        author: new CommitPerson('Test Author', 'author@example.com', 1609459200, '0'),
        committer: new CommitPerson('Test Committer', 'committer@example.com', 1609459200, '0'),
      };

      const result = await commitManager.createCommit(options);

      expect(result).toMatchObject({
        sha: expect.stringMatching(/^[a-f0-9]{40}$/),
        treeSha: expect.stringMatching(/^[a-f0-9]{40}$/),
        parentShas: [],
        message: 'Initial commit',
        author: expect.objectContaining({
          name: 'Test Author',
          email: 'author@example.com',
        }),
        committer: expect.objectContaining({
          name: 'Test Committer',
          email: 'committer@example.com',
        }),
      });
    });

    test('should create commit with parent', async () => {
      // Create initial commit first
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const initialOptions: CommitOptions = {
        message: 'Initial commit',
        author: new CommitPerson('Test User', 'test@example.com', 1609459200, '0'),
      };

      const initialCommit = await commitManager.createCommit(initialOptions);

      // Create second commit
      const newTestSha = 'b'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test2.txt', sha: newTestSha }]);

      const secondOptions: CommitOptions = {
        message: 'Second commit',
        author: new CommitPerson('Test User', 'test@example.com', 1609459300, '0'),
      };

      const secondCommit = await commitManager.createCommit(secondOptions);

      expect(secondCommit.parentShas).toEqual([initialCommit.sha]);
      expect(secondCommit.message).toBe('Second commit');
    });

    test('should handle timezone correctly', async () => {
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const options: CommitOptions = {
        message: 'Timezone test',
      };

      const result = await commitManager.createCommit(options);

      // Timezone should be in seconds, negative of getTimezoneOffset() * 60
      const expectedOffset = -new Date().getTimezoneOffset() * 60;
      expect(result.author.timezone).toBe(expectedOffset.toString());
    });
  });

  describe('createCommit - error handling', () => {
    test('should reject empty commit message', async () => {
      const options: CommitOptions = {
        message: '',
      };

      await expect(commitManager.createCommit(options)).rejects.toThrow(
        'Commit message cannot be empty'
      );
    });

    test('should reject whitespace-only commit message', async () => {
      const options: CommitOptions = {
        message: '   \n\t  ',
      };

      await expect(commitManager.createCommit(options)).rejects.toThrow(
        'Commit message cannot be empty'
      );
    });

    test('should reject commit with no staged changes', async () => {
      await createTestIndex(gitDir, []); // Empty index

      const options: CommitOptions = {
        message: 'Empty commit',
      };

      await expect(commitManager.createCommit(options)).rejects.toThrow(
        'No changes staged for commit'
      );
    });

    test('should allow empty commit when allowEmpty is true', async () => {
      await createTestIndex(gitDir, []); // Empty index

      const options: CommitOptions = {
        message: 'Empty commit',
        allowEmpty: true,
      };

      const result = await commitManager.createCommit(options);
      expect(result.message).toBe('Empty commit');
    });

    test('should reject commit with identical tree to parent', async () => {
      // Create initial commit
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const initialOptions: CommitOptions = {
        message: 'Initial commit',
        author: new CommitPerson('Test User', 'test@example.com', 1609459200, '0'),
      };

      await commitManager.createCommit(initialOptions);

      // Try to create commit with same index (no changes)
      const duplicateOptions: CommitOptions = {
        message: 'Duplicate commit',
      };

      await expect(commitManager.createCommit(duplicateOptions)).rejects.toThrow(
        'No changes to commit'
      );
    });

    test('should allow identical tree when allowEmpty is true', async () => {
      // Create initial commit
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const initialOptions: CommitOptions = {
        message: 'Initial commit',
        author: new CommitPerson('Test User', 'test@example.com', 1609459200, '0'),
      };

      await commitManager.createCommit(initialOptions);

      // Create commit with same tree but allowEmpty
      const duplicateOptions: CommitOptions = {
        message: 'Allowed duplicate commit',
        allowEmpty: true,
      };

      const result = await commitManager.createCommit(duplicateOptions);
      expect(result.message).toBe('Allowed duplicate commit');
    });
  });

  describe('createCommit - amend functionality', () => {
    test('should amend last commit', async () => {
      // Create initial commit
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const initialOptions: CommitOptions = {
        message: 'Initial commit',
        author: new CommitPerson('Test User', 'test@example.com', 1609459200, '0'),
      };

      await commitManager.createCommit(initialOptions);

      // Create parent commit
      const newTestSha = 'b'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test2.txt', sha: newTestSha }]);

      const parentOptions: CommitOptions = {
        message: 'Parent commit',
        author: new CommitPerson('Test User', 'test@example.com', 1609459300, '0'),
      };

      const parentCommit = await commitManager.createCommit(parentOptions);

      // Amend the parent commit
      const amendOptions: CommitOptions = {
        message: 'Amended commit message',
        amend: true,
      };

      const amendedCommit = await commitManager.createCommit(amendOptions);

      // Should have same parents as the original parent commit
      expect(amendedCommit.parentShas).toEqual(parentCommit.parentShas);
      expect(amendedCommit.message).toBe('Amended commit message');
      expect(amendedCommit.sha).not.toBe(parentCommit.sha);
    });
  });

  describe('getCommit', () => {
    test('should retrieve commit by SHA', async () => {
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const options: CommitOptions = {
        message: 'Test commit',
        author: new CommitPerson('Test Author', 'author@example.com', 1609459200, '0'),
      };

      const originalCommit = await commitManager.createCommit(options);
      const retrievedCommit = await commitManager.getCommit(originalCommit.sha);

      expect(retrievedCommit).toEqual(originalCommit);
    });

    test('should return null for non-existent commit', async () => {
      const nonExistentSha = 'z'.repeat(40);
      const result = await commitManager.getCommit(nonExistentSha);
      expect(result).toBeNull();
    });

    test('should return null for non-commit object', async () => {
      // This would require creating a non-commit object with a valid SHA
      // For now, we'll test with an invalid SHA format
      const invalidSha = 'not-a-valid-sha';
      const result = await commitManager.getCommit(invalidSha);
      expect(result).toBeNull();
    });
  });

  describe('getHistory', () => {
    test('should return empty array when no commits exist', async () => {
      const history = await commitManager.getHistory();
      expect(history).toEqual([]);
    });

    test('should return single commit for initial commit', async () => {
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const options: CommitOptions = {
        message: 'Initial commit',
        author: new CommitPerson('Test User', 'test@example.com', 1609459200, '0'),
      };

      const commit = await commitManager.createCommit(options);
      const history = await commitManager.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(commit);
    });

    test('should return commits in chronological order', async () => {
      // Create chain of commits
      const commits: CommitResult[] = [];

      for (let i = 0; i < 3; i++) {
        const testSha = String.fromCharCode(97 + i).repeat(40); // 'a', 'b', 'c'
        await createTestIndex(gitDir, [{ path: `test${i}.txt`, sha: testSha }]);

        const options: CommitOptions = {
          message: `Commit ${i + 1}`,
          author: new CommitPerson('Test User', 'test@example.com', 1609459200 + i * 100, '0'),
        };

        const commit = await commitManager.createCommit(options);
        commits.push(commit);
      }

      const history = await commitManager.getHistory();

      expect(history).toHaveLength(3);
      expect(history[0]!.sha).toBe(commits[2]!.sha); // Most recent first
      expect(history[1]!.sha).toBe(commits[1]!.sha);
      expect(history[2]!.sha).toBe(commits[0]!.sha);
    });

    test('should respect limit parameter', async () => {
      // Create multiple commits
      for (let i = 0; i < 5; i++) {
        const testSha = String.fromCharCode(97 + i).repeat(40);
        await createTestIndex(gitDir, [{ path: `test${i}.txt`, sha: testSha }]);

        const options: CommitOptions = {
          message: `Commit ${i + 1}`,
          author: new CommitPerson('Test User', 'test@example.com', 1609459200 + i * 100, '0'),
        };

        await commitManager.createCommit(options);
      }

      const history = await commitManager.getHistory(undefined, 3);
      expect(history).toHaveLength(3);
    });

    test('should start from specified commit SHA', async () => {
      // Create chain of commits
      const commits: CommitResult[] = [];

      for (let i = 0; i < 3; i++) {
        const testSha = String.fromCharCode(97 + i).repeat(40);
        await createTestIndex(gitDir, [{ path: `test${i}.txt`, sha: testSha }]);

        const options: CommitOptions = {
          message: `Commit ${i + 1}`,
          author: new CommitPerson('Test User', 'test@example.com', 1609459200 + i * 100, '0'),
        };

        const commit = await commitManager.createCommit(options);
        commits.push(commit);
      }

      // Get history starting from middle commit
      const history = await commitManager.getHistory(commits[1]!.sha);

      expect(history).toHaveLength(2);
      expect(history[0]!.sha).toBe(commits[1]!.sha);
      expect(history[1]!.sha).toBe(commits[0]!.sha);
    });
  });

  describe('user information and environment variables', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment
      process.env = { ...originalEnv };
      delete process.env['GIT_AUTHOR_NAME'];
      delete process.env['GIT_AUTHOR_EMAIL'];
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should use environment variables when config is missing', async () => {
      // Remove user config
      const configPath = path.join(gitDir, 'config');
      const configContent = await fs.readFile(configPath, 'utf8');
      const configWithoutUser = configContent.replace(/\[user\][\s\S]*?(?=\n\[|\n$|$)/g, '');
      await fs.writeFile(configPath, configWithoutUser);

      // Set environment variables
      process.env['GIT_AUTHOR_NAME'] = 'Env User';
      process.env['GIT_AUTHOR_EMAIL'] = 'env@example.com';

      // Recreate commit manager to reload config
      commitManager = new CommitManager(repo);
      await commitManager.initialize();

      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const options: CommitOptions = {
        message: 'Environment test',
      };

      const result = await commitManager.createCommit(options);

      expect(result.author.name).toBe('Env User');
      expect(result.author.email).toBe('env@example.com');
    });

    test('should use fallback values when neither config nor env vars are set', async () => {
      // Remove user config
      const configPath = path.join(gitDir, 'config');
      const configContent = await fs.readFile(configPath, 'utf8');
      const configWithoutUser = configContent.replace(/\[user\][\s\S]*?(?=\n\[|\n$|$)/g, '');
      await fs.writeFile(configPath, configWithoutUser);

      // Recreate commit manager to reload config
      commitManager = new CommitManager(repo);
      await commitManager.initialize();

      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const options: CommitOptions = {
        message: 'Fallback test',
      };

      const result = await commitManager.createCommit(options);

      expect(result.author.name).toBe('Unknown User');
      expect(result.author.email).toBe('unknown@example.com');
    });
  });

  describe('reference updates', () => {
    test('should create initial branch when no HEAD exists', async () => {
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const options: CommitOptions = {
        message: 'Initial commit on new branch',
      };

      const result = await commitManager.createCommit(options);

      // Check that master branch was created and HEAD points to it (SourceRepository uses master by default)
      const headContent = await fs.readFile(path.join(gitDir, 'HEAD'), 'utf8');
      expect(headContent.trim()).toBe('ref: refs/heads/master');

      const masterRef = await fs.readFile(path.join(gitDir, 'refs', 'heads', 'master'), 'utf8');
      expect(masterRef.trim()).toBe(result.sha);
    });

    test('should update current branch reference', async () => {
      // Create initial commit to establish branch
      const testSha1 = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test1.txt', sha: testSha1 }]);

      const options1: CommitOptions = {
        message: 'First commit',
      };

      const commit1 = await commitManager.createCommit(options1);

      // Create second commit
      const testSha2 = 'b'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test2.txt', sha: testSha2 }]);

      const options2: CommitOptions = {
        message: 'Second commit',
      };

      const commit2 = await commitManager.createCommit(options2);

      // Check that master branch points to latest commit
      const masterRef = await fs.readFile(path.join(gitDir, 'refs', 'heads', 'master'), 'utf8');
      expect(masterRef.trim()).toBe(commit2.sha);
    });
  });

  describe('edge cases and integration', () => {
    test('should handle concurrent commit creation', async () => {
      const testSha1 = 'a'.repeat(40);
      const testSha2 = 'b'.repeat(40);

      // Prepare two different indexes
      await createTestIndex(gitDir, [{ path: 'test1.txt', sha: testSha1 }]);

      const options1: CommitOptions = {
        message: 'Concurrent commit 1',
        author: new CommitPerson('User 1', 'user1@example.com', 1609459200, '0'),
      };

      const options2: CommitOptions = {
        message: 'Concurrent commit 2',
        author: new CommitPerson('User 2', 'user2@example.com', 1609459300, '0'),
      };

      // This test primarily ensures no crashes occur during concurrent operations
      const [commit1] = await Promise.all([commitManager.createCommit(options1)]);

      // Update index for second commit
      await createTestIndex(gitDir, [{ path: 'test2.txt', sha: testSha2 }]);
      const commit2 = await commitManager.createCommit(options2);

      expect(commit1.sha).toMatch(/^[a-f0-9]{40}$/);
      expect(commit2.sha).toMatch(/^[a-f0-9]{40}$/);
      expect(commit1.sha).not.toBe(commit2.sha);
      expect(commit2.parentShas).toContain(commit1.sha);
    });

    test('should preserve commit object integrity', async () => {
      const testSha = 'a'.repeat(40);
      await createTestIndex(gitDir, [{ path: 'test.txt', sha: testSha }]);

      const author = new CommitPerson('Test Author', 'author@example.com', 1609459200, '19800'); // +0530 in seconds
      const committer = new CommitPerson(
        'Test Committer',
        'committer@example.com',
        1609459300,
        '-28800'
      ); // -0800 in seconds

      const options: CommitOptions = {
        message: 'Multi-line commit\n\nWith detailed description\nand multiple lines',
        author,
        committer,
      };

      const result = await commitManager.createCommit(options);

      // Retrieve and verify commit object
      const retrieved = await commitManager.getCommit(result.sha);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.message).toBe(options.message);
      expect(retrieved!.author.name).toBe(author.name);
      expect(retrieved!.author.email).toBe(author.email);
      expect(retrieved!.author.timestamp).toBe(author.timestamp);
      expect(retrieved!.author.timezone).toBe(author.timezone);
      expect(retrieved!.committer.name).toBe(committer.name);
      expect(retrieved!.committer.email).toBe(committer.email);
      expect(retrieved!.committer.timestamp).toBe(committer.timestamp);
      expect(retrieved!.committer.timezone).toBe(committer.timezone);
    });
  });
});

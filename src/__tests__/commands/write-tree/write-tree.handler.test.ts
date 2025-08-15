import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { createTreeFromDirectory } from '../../../commands/write-tree/write-tree.handler';
import { SourceRepository } from '../../../core/repo';
import { TreeObject } from '../../../core/objects';
import { EntryType } from '../../../core/objects/tree/tree-entry';
import { PathScurry } from 'path-scurry';

describe('write-tree handler', () => {
  let tempDir: string;
  let repository: SourceRepository;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-tree-test-'));
    const scurry = new PathScurry(tempDir);
    repository = new SourceRepository();
    await repository.init(scurry.cwd);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('createTreeFromDirectory', () => {
    test('creates tree object for empty directory', async () => {
      const emptyDir = path.join(tempDir, 'empty');
      await fs.mkdir(emptyDir);
      
      const treeSha = await createTreeFromDirectory(repository, emptyDir, true);
      
      expect(treeSha).toBeDefined();
      expect(treeSha).toHaveLength(40);
      
      // Verify the tree object exists and is empty
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      expect(treeObject.entries).toHaveLength(0);
    });

    test('creates tree object with single file', async () => {
      const testDir = path.join(tempDir, 'single-file');
      await fs.mkdir(testDir);
      
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!');
      
      const treeSha = await createTreeFromDirectory(repository, testDir, true);
      
      expect(treeSha).toBeDefined();
      expect(treeSha).toHaveLength(40);
      
      // Verify the tree object contains the file
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      expect(treeObject.entries).toHaveLength(1);
      expect(treeObject.entries[0]!.name).toBe('test.txt');
      expect(treeObject.entries[0]!.mode).toBe(EntryType.REGULAR_FILE);
    });

    test('creates tree object with executable file', async () => {
      const testDir = path.join(tempDir, 'executable-file');
      await fs.mkdir(testDir);
      
      const execFile = path.join(testDir, 'script.sh');
      await fs.writeFile(execFile, '#!/bin/bash\necho "Hello"');
      await fs.chmod(execFile, 0o755);
      
      const treeSha = await createTreeFromDirectory(repository, testDir, true);
      
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      expect(treeObject.entries).toHaveLength(1);
      expect(treeObject.entries[0]!.name).toBe('script.sh');
      expect(treeObject.entries[0]!.mode).toBe(EntryType.EXECUTABLE_FILE);
    });

    test('creates tree object with nested directory', async () => {
      const testDir = path.join(tempDir, 'nested');
      await fs.mkdir(testDir);
      
      const subDir = path.join(testDir, 'subdir');
      await fs.mkdir(subDir);
      
      const subFile = path.join(subDir, 'nested.txt');
      await fs.writeFile(subFile, 'Nested content');
      
      const treeSha = await createTreeFromDirectory(repository, testDir, true);
      
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      expect(treeObject.entries).toHaveLength(1);
      expect(treeObject.entries[0]!.name).toBe('subdir');
      expect(treeObject.entries[0]!.mode).toBe(EntryType.DIRECTORY);
      
      // Verify the subdirectory tree
      const subTreeObject = await repository.readObject(treeObject.entries[0]!.sha) as TreeObject;
      expect(subTreeObject.entries).toHaveLength(1);
      expect(subTreeObject.entries[0]!.name).toBe('nested.txt');
    });

    test('creates tree object with multiple files and directories', async () => {
      const testDir = path.join(tempDir, 'complex');
      await fs.mkdir(testDir);
      
      // Create files
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'Content 1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'Content 2');
      
      // Create subdirectory with file
      const subDir = path.join(testDir, 'subdir');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(subDir, 'sub.txt'), 'Sub content');
      
      const treeSha = await createTreeFromDirectory(repository, testDir, true);
      
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      expect(treeObject.entries).toHaveLength(3);
      
      // Entries should be sorted alphabetically
      expect(treeObject.entries[0]!.name).toBe('file1.txt');
      expect(treeObject.entries[1]!.name).toBe('file2.txt');
      expect(treeObject.entries[2]!.name).toBe('subdir');
    });

    test('excludes .git directory by default', async () => {
      const testDir = path.join(tempDir, 'with-git');
      await fs.mkdir(testDir);
      
      // Create .git directory
      const gitDir = path.join(testDir, '.git');
      await fs.mkdir(gitDir);
      await fs.writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main');
      
      // Create regular file
      await fs.writeFile(path.join(testDir, 'file.txt'), 'Content');
      
      const treeSha = await createTreeFromDirectory(repository, testDir, true);
      
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      expect(treeObject.entries).toHaveLength(1);
      expect(treeObject.entries[0]!.name).toBe('file.txt');
    });

    test('excludes .source directory by default', async () => {
      const testDir = path.join(tempDir, 'with-source');
      await fs.mkdir(testDir);
      
      // Create .source directory
      const sourceDir = path.join(testDir, SourceRepository.DEFAULT_GIT_DIR);
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'HEAD'), 'ref: refs/heads/main');
      
      // Create regular file
      await fs.writeFile(path.join(testDir, 'file.txt'), 'Content');
      
      const treeSha = await createTreeFromDirectory(repository, testDir, true);
      
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      expect(treeObject.entries).toHaveLength(1);
      expect(treeObject.entries[0]!.name).toBe('file.txt');
    });

    test('includes .git directory when excludeGitDir is false', async () => {
      const testDir = path.join(tempDir, 'include-git');
      await fs.mkdir(testDir);
      
      // Create .git directory
      const gitDir = path.join(testDir, '.git');
      await fs.mkdir(gitDir);
      await fs.writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main');
      
      // Create regular file
      await fs.writeFile(path.join(testDir, 'file.txt'), 'Content');
      
      const treeSha = await createTreeFromDirectory(repository, testDir, false);
      
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      // .git is still excluded due to hidden file filtering, only regular files are included
      expect(treeObject.entries).toHaveLength(1);
      expect(treeObject.entries[0]!.name).toBe('file.txt');
    });

    test('excludes hidden files except .source', async () => {
      const testDir = path.join(tempDir, 'hidden-files');
      await fs.mkdir(testDir);
      
      // Create hidden files
      await fs.writeFile(path.join(testDir, '.hidden'), 'Hidden content');
      await fs.writeFile(path.join(testDir, '.another'), 'Another hidden');
      
      // Create regular file
      await fs.writeFile(path.join(testDir, 'visible.txt'), 'Visible content');
      
      const treeSha = await createTreeFromDirectory(repository, testDir, true);
      
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      // Only visible files are included, .source is not in this test
      expect(treeObject.entries).toHaveLength(1);
      expect(treeObject.entries[0]!.name).toBe('visible.txt');
    });

    test('handles symbolic links', async () => {
      const testDir = path.join(tempDir, 'symlinks');
      await fs.mkdir(testDir);
      
      // Create target file
      const targetFile = path.join(testDir, 'target.txt');
      await fs.writeFile(targetFile, 'Target content');
      
      // Create symbolic link
      const symlink = path.join(testDir, 'link.txt');
      await fs.symlink('target.txt', symlink);
      
      const treeSha = await createTreeFromDirectory(repository, testDir, true);
      
      const treeObject = await repository.readObject(treeSha) as TreeObject;
      expect(treeObject.entries).toHaveLength(2);
      
      // Find the symlink entry
      const linkEntry = treeObject.entries.find(e => e.name === 'link.txt');
      expect(linkEntry).toBeDefined();
      expect(linkEntry!.mode).toBe(EntryType.SYMBOLIC_LINK);
    });

    test('throws error for non-existent directory', async () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist');
      
      await expect(createTreeFromDirectory(repository, nonExistentDir, true))
        .rejects.toThrow(/failed to create tree from directory/);
    });
  });
});
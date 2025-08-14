import path from 'path';
import os from 'os';
import fs from 'fs-extra';

import { AtomicOperationManager, FileOperationService } from '../../core/work-dir/internal';
import type { FileOperation, FileBackup } from '../../core/work-dir/internal/types';
import type { Repository } from '../../core/repo';
import { BlobObject } from '../../core/objects';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

describe('AtomicOperationManager', () => {
  let tmp: string;
  let workDir: string;
  let fileService: FileOperationService;
  let atomicManager: AtomicOperationManager;

  const makeRepo = (contentBySha: Record<string, string> = {}): Repository =>
    ({
      readObject: jest.fn(async (sha: string) => {
        const content = contentBySha[sha];
        if (content == null) return null;
        return new BlobObject(toBytes(content));
      }),
    }) as unknown as Repository;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-atomic-'));
    workDir = tmp;

    const repo = makeRepo({
      sha1: 'hello world',
      sha2: 'modified content',
      sha3: 'new file content',
    });

    fileService = new FileOperationService(repo, workDir);
    atomicManager = new AtomicOperationManager(fileService);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.remove(tmp);
  });

  const read = async (rel: string) => {
    const abs = path.join(workDir, rel);
    return fs.readFile(abs, 'utf8');
  };

  const exists = async (rel: string) => fs.pathExists(path.join(workDir, rel));

  const createFile = async (rel: string, content: string) => {
    const abs = path.join(workDir, rel);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content, 'utf8');
  };

  describe('executeAtomically', () => {
    test('returns success for empty operations array', async () => {
      const result = await atomicManager.executeAtomically([]);

      expect(result).toEqual({
        success: true,
        operationsApplied: 0,
        totalOperations: 0,
      });
    });

    test('successfully executes single create operation', async () => {
      const operations: FileOperation[] = [
        {
          action: 'create',
          path: 'test.txt',
          blobSha: 'sha1',
          mode: '100644',
        },
      ];

      const result = await atomicManager.executeAtomically(operations);

      expect(result.success).toBe(true);
      expect(result.operationsApplied).toBe(1);
      expect(result.totalOperations).toBe(1);
      expect(await read('test.txt')).toBe('hello world');
    });

    test('successfully executes multiple operations', async () => {
      const operations: FileOperation[] = [
        {
          action: 'create',
          path: 'file1.txt',
          blobSha: 'sha1',
          mode: '100644',
        },
        {
          action: 'create',
          path: 'dir/file2.txt',
          blobSha: 'sha2',
          mode: '100644',
        },
      ];

      const result = await atomicManager.executeAtomically(operations);

      expect(result.success).toBe(true);
      expect(result.operationsApplied).toBe(2);
      expect(result.totalOperations).toBe(2);
      expect(await read('file1.txt')).toBe('hello world');
      expect(await read('dir/file2.txt')).toBe('modified content');
    });

    test('rolls back changes when an operation fails', async () => {
      await createFile('existing.txt', 'original content');

      const operations: FileOperation[] = [
        {
          action: 'modify',
          path: 'existing.txt',
          blobSha: 'sha2',
          mode: '100644',
        },
        {
          action: 'create',
          path: 'new.txt',
          blobSha: 'invalid-sha', // This will cause failure
          mode: '100644',
        },
      ];

      const result = await atomicManager.executeAtomically(operations);

      expect(result.success).toBe(false);
      expect(result.operationsApplied).toBe(1); // Only first operation was applied
      expect(result.totalOperations).toBe(2);
      expect(result.error).toBeDefined();

      // File should be rolled back to original content
      expect(await read('existing.txt')).toBe('original content');
      expect(await exists('new.txt')).toBe(false);
    });

    test('handles modify operation with backup and rollback', async () => {
      await createFile('modify-test.txt', 'original');

      const operations: FileOperation[] = [
        {
          action: 'modify',
          path: 'modify-test.txt',
          blobSha: 'sha2',
          mode: '100644',
        },
        {
          action: 'create',
          path: 'will-fail.txt',
          blobSha: 'bad-sha',
          mode: '100644',
        },
      ];

      const result = await atomicManager.executeAtomically(operations);

      expect(result.success).toBe(false);
      expect(await read('modify-test.txt')).toBe('original');
    });

    test('handles delete operation with backup and rollback', async () => {
      await createFile('delete-test.txt', 'will be deleted then restored');

      const operations: FileOperation[] = [
        {
          action: 'delete',
          path: 'delete-test.txt',
        },
        {
          action: 'create',
          path: 'fail.txt',
          blobSha: 'bad-sha',
          mode: '100644',
        },
      ];

      const result = await atomicManager.executeAtomically(operations);

      expect(result.success).toBe(false);
      expect(await exists('delete-test.txt')).toBe(true);
      expect(await read('delete-test.txt')).toBe('will be deleted then restored');
    });

    test('continues rollback even if some restore operations fail', async () => {
      await createFile('file1.txt', 'content1');
      await createFile('file2.txt', 'content2');

      const operations: FileOperation[] = [
        { action: 'modify', path: 'file1.txt', blobSha: 'sha2', mode: '100644' },
        { action: 'modify', path: 'file2.txt', blobSha: 'sha3', mode: '100644' },
        { action: 'create', path: 'fail.txt', blobSha: 'bad-sha', mode: '100644' },
      ];

      // Mock restoreFromBackup to fail for file1 but succeed for file2
      const originalRestore = fileService.restoreFromBackup;
      jest
        .spyOn(fileService, 'restoreFromBackup')
        .mockImplementation(async (backup: FileBackup) => {
          if (backup.path === 'file1.txt') {
            throw new Error('Restore failed');
          }
          return originalRestore.call(fileService, backup);
        });

      const result = await atomicManager.executeAtomically(operations);

      expect(result.success).toBe(false);
      // file2 should be restored even though file1 restore failed
      expect(await read('file2.txt')).toBe('content2');
    });
  });

  describe('validateOperations', () => {
    test('validates empty operations array', () => {
      const result = atomicManager.validateOperations([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('detects missing path', () => {
      const operations: FileOperation[] = [
        { action: 'create', path: '', blobSha: 'sha1', mode: '100644' },
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Operation 0: path is required');
    });

    test('detects invalid action', () => {
      const operations: FileOperation[] = [{ action: 'invalid' as any, path: 'test.txt' }];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Operation 0: invalid action 'invalid'");
    });

    test('detects missing blobSha for create operation', () => {
      const operations: FileOperation[] = [{ action: 'create', path: 'test.txt', mode: '100644' }];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Operation 0: blobSha is required for create');
    });

    test('detects missing mode for modify operation', () => {
      const operations: FileOperation[] = [{ action: 'modify', path: 'test.txt', blobSha: 'sha1' }];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Operation 0: mode is required for modify');
    });

    test('detects conflicting operations on same path', () => {
      const operations: FileOperation[] = [
        { action: 'create', path: 'test.txt', blobSha: 'sha1', mode: '100644' },
        { action: 'modify', path: 'test.txt', blobSha: 'sha2', mode: '100644' },
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Operations 0 and 1: conflicting operations on test.txt');
    });

    test('validates delete operation without requiring blobSha or mode', () => {
      const operations: FileOperation[] = [{ action: 'delete', path: 'test.txt' }];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('validates multiple valid operations', () => {
      const operations: FileOperation[] = [
        { action: 'create', path: 'file1.txt', blobSha: 'sha1', mode: '100644' },
        { action: 'modify', path: 'file2.txt', blobSha: 'sha2', mode: '100755' },
        { action: 'delete', path: 'file3.txt' },
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('detects whitespace-only path as invalid', () => {
      const operations: FileOperation[] = [
        { action: 'create', path: '   ', blobSha: 'sha1', mode: '100644' },
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Operation 0: path is required');
    });

    test('detects missing blobSha for modify operation', () => {
      const operations: FileOperation[] = [{ action: 'modify', path: 'test.txt', mode: '100644' }];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Operation 0: blobSha is required for modify');
    });

    test('detects missing mode for create operation', () => {
      const operations: FileOperation[] = [{ action: 'create', path: 'test.txt', blobSha: 'sha1' }];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Operation 0: mode is required for create');
    });

    test('detects both missing blobSha and mode for create operation', () => {
      const operations: FileOperation[] = [{ action: 'create', path: 'test.txt' }];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Operation 0: blobSha is required for create');
      expect(result.errors).toContain('Operation 0: mode is required for create');
    });

    test('detects multiple conflicts on same path', () => {
      const operations: FileOperation[] = [
        { action: 'create', path: 'conflict.txt', blobSha: 'sha1', mode: '100644' },
        { action: 'modify', path: 'conflict.txt', blobSha: 'sha2', mode: '100644' },
        { action: 'delete', path: 'conflict.txt' },
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Operations 0 and 1: conflicting operations on conflict.txt');
      expect(result.errors).toContain('Operations 1 and 0: conflicting operations on conflict.txt');
      expect(result.errors).toContain('Operations 2 and 0: conflicting operations on conflict.txt');
    });

    test('accumulates all validation errors for multiple invalid operations', () => {
      const operations: FileOperation[] = [
        { action: 'invalid' as any, path: '' }, // Invalid action and empty path
        { action: 'create', path: 'test.txt' }, // Missing blobSha and mode
        { action: 'modify', path: 'test.txt', blobSha: 'sha1' }, // Missing mode and conflicts with previous
        { action: 'weird' as any, path: '   ' }, // Invalid action and whitespace path
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(7);
      expect(result.errors).toContain('Operation 0: path is required');
      expect(result.errors).toContain("Operation 0: invalid action 'invalid'");
      expect(result.errors).toContain('Operation 1: blobSha is required for create');
      expect(result.errors).toContain('Operation 1: mode is required for create');
      expect(result.errors).toContain('Operation 2: mode is required for modify');
      expect(result.errors).toContain('Operations 1 and 2: conflicting operations on test.txt');
      expect(result.errors).toContain('Operation 3: path is required');
      expect(result.errors).toContain("Operation 3: invalid action 'weird'");
    });

    test('validates operations with deep directory paths', () => {
      const operations: FileOperation[] = [
        { action: 'create', path: 'deep/nested/dir/file.txt', blobSha: 'sha1', mode: '100644' },
        {
          action: 'modify',
          path: 'another/very/deep/path/file.js',
          blobSha: 'sha2',
          mode: '100755',
        },
        { action: 'delete', path: 'to/be/removed/file.log' },
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('validates operations with special characters in paths', () => {
      const operations: FileOperation[] = [
        { action: 'create', path: 'file-with_special.chars.txt', blobSha: 'sha1', mode: '100644' },
        { action: 'modify', path: 'another file with spaces.txt', blobSha: 'sha2', mode: '100644' },
        { action: 'delete', path: 'file@with#symbols$.log' },
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('validates executable file modes', () => {
      const operations: FileOperation[] = [
        { action: 'create', path: 'script.sh', blobSha: 'sha1', mode: '100755' },
        { action: 'modify', path: 'binary', blobSha: 'sha2', mode: '100755' },
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('validates symlink file modes', () => {
      const operations: FileOperation[] = [
        { action: 'create', path: 'link', blobSha: 'sha1', mode: '120000' },
        { action: 'modify', path: 'another-link', blobSha: 'sha2', mode: '120000' },
      ];

      const result = atomicManager.validateOperations(operations);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('dryRun', () => {
    test('analyzes operations without executing them', async () => {
      await createFile('existing.txt', 'content');

      const operations: FileOperation[] = [
        { action: 'create', path: 'new.txt', blobSha: 'sha1', mode: '100644' },
        { action: 'modify', path: 'existing.txt', blobSha: 'sha2', mode: '100644' },
        { action: 'delete', path: 'to-delete.txt' },
      ];

      const result = await atomicManager.dryRun(operations);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.analysis.willCreate).toEqual(['new.txt']);
      expect(result.analysis.willModify).toEqual(['existing.txt']);
      expect(result.analysis.willDelete).toEqual(['to-delete.txt']);
      expect(result.analysis.conflicts).toEqual([]);

      // Ensure no files were actually modified
      expect(await exists('new.txt')).toBe(false);
      expect(await read('existing.txt')).toBe('content');
    });

    test('detects conflicts when trying to create existing file', async () => {
      await createFile('existing.txt', 'content');

      const operations: FileOperation[] = [
        { action: 'create', path: 'existing.txt', blobSha: 'sha1', mode: '100644' },
      ];

      const result = await atomicManager.dryRun(operations);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('existing.txt (trying to create but file exists)');
      expect(result.analysis.conflicts).toContain(
        'existing.txt (trying to create but file exists)'
      );
      expect(result.analysis.willCreate).toEqual([]);
    });

    test('combines validation errors with conflict errors', async () => {
      const operations: FileOperation[] = [
        { action: 'create', path: '', blobSha: 'sha1', mode: '100644' }, // Invalid path
        { action: 'invalid' as any, path: 'test.txt' }, // Invalid action
      ];

      const result = await atomicManager.dryRun(operations);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('Operation 0: path is required');
      expect(result.errors).toContain("Operation 1: invalid action 'invalid'");
    });

    test('handles empty operations array', async () => {
      const result = await atomicManager.dryRun([]);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.analysis.willCreate).toEqual([]);
      expect(result.analysis.willModify).toEqual([]);
      expect(result.analysis.willDelete).toEqual([]);
      expect(result.analysis.conflicts).toEqual([]);
    });
  });
});

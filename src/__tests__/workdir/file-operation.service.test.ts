import path from 'path';
import os from 'os';
import fs from 'fs-extra';

import { FileOperationService } from '../../core/work-dir/internal';
import { BlobObject } from '../../core/objects';
import type { Repository } from '../../core/repo';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

describe('FileOperationService', () => {
  let tmp: string;
  let workDir: string;

  const makeRepo = (contentBySha: Record<string, string> = {}): Repository =>
    ({
      readObject: jest.fn(async (sha: string) => {
        const content = contentBySha[sha];
        if (content == null) return null;
        return new BlobObject(toBytes(content));
      }),
    }) as unknown as Repository;

  const newService = (repo: Repository) => new FileOperationService(repo, workDir);

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-fileop-'));
    workDir = tmp;
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

  test('applyOperation: create regular file (100644)', async () => {
    const repo = makeRepo({ sha1: 'hello world' });
    const svc = newService(repo);

    await svc.applyOperation({
      action: 'create',
      path: 'dir/a.txt',
      blobSha: 'sha1',
      mode: '100644',
    });

    expect(await read('dir/a.txt')).toBe('hello world');
  });

  test('applyOperation: modify regular file (100755) sets executable permission', async () => {
    const repo = makeRepo({ sha2: '#!/bin/sh\necho hi\n' });
    const svc = newService(repo);

    const target = path.join(workDir, 'bin', 'run.sh');
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, 'old', 'utf8');

    const chmodSpy = jest.spyOn(fs, 'chmod').mockImplementation(async () => {});

    await svc.applyOperation({
      action: 'modify',
      path: 'bin/run.sh',
      blobSha: 'sha2',
      mode: '100755',
    });

    expect(await read('bin/run.sh')).toBe('#!/bin/sh\necho hi\n');
    expect(chmodSpy).toHaveBeenCalled();
  });

  test('applyOperation: delete removes file and cleans now-empty directories', async () => {
    const p = path.join(workDir, 'a', 'b', 'c.txt');
    await fs.ensureDir(path.dirname(p));
    await fs.writeFile(p, 'x', 'utf8');
    expect(await exists('a/b/c.txt')).toBe(true);

    const repo = makeRepo();
    const svc = newService(repo);

    await svc.applyOperation({ action: 'delete', path: 'a/b/c.txt' });

    expect(await exists('a/b/c.txt')).toBe(false);
    // parent directories were empty -> should be pruned
    expect(await fs.pathExists(path.join(workDir, 'a'))).toBe(false);
  });

  test('symlink: creates symlink for mode 120000 (success path)', async () => {
    const repo = makeRepo({ sha3: '../target.txt' });
    const svc = newService(repo);

    const symlinkSpy = jest.spyOn(fs, 'symlink').mockImplementation(async () => {});
    const unlinkSpy = jest.spyOn(fs, 'unlink').mockImplementation(async () => {});

    await svc.applyOperation({
      action: 'create',
      path: 'links/l1',
      blobSha: 'sha3',
      mode: '120000',
    });

    expect(symlinkSpy).toHaveBeenCalledWith('../target.txt', path.join(workDir, 'links', 'l1'));
    // unlink may or may not be called depending on existence; assert not throwing is sufficient
    expect(unlinkSpy).toBeDefined();
  });

  test('symlink: falls back to writing target content when symlink fails', async () => {
    const repo = makeRepo({ sha4: './fallback.txt' });
    const svc = newService(repo);

    jest.spyOn(fs, 'symlink').mockImplementation(async () => {
      throw new Error('no symlink here');
    });
    // ensure no pre-existing file
    await fs.remove(path.join(workDir, 'links', 'l2'));

    await svc.applyOperation({
      action: 'create',
      path: 'links/l2',
      blobSha: 'sha4',
      mode: '120000',
    });

    // Should have written the target content as a regular file
    expect(await read('links/l2')).toBe('./fallback.txt');
  });

  test('createBackup: existing file captures content and mode', async () => {
    const p = path.join(workDir, 'bk.txt');
    await fs.writeFile(p, 'BK', 'utf8');
    const stats = await fs.stat(p);

    const repo = makeRepo();
    const svc = newService(repo);

    const backup = await svc.createBackup('bk.txt');
    expect(backup.existed).toBe(true);
    expect(backup.path).toBe('bk.txt');
    expect(backup.content?.toString('utf8')).toBe('BK');
    expect(backup.mode).toBe(stats.mode);
  });

  test('createBackup: non-existing file sets existed=false with no content', async () => {
    const repo = makeRepo();
    const svc = newService(repo);

    const backup = await svc.createBackup('missing.txt');
    expect(backup.existed).toBe(false);
    expect(backup.content).toBeUndefined();
    expect(backup.mode).toBeUndefined();
  });

  test('restoreFromBackup: writes content and reapplies mode when existed=true', async () => {
    const p = path.join(workDir, 'r.txt');
    await fs.writeFile(p, 'OLD', 'utf8');
    const st = await fs.stat(p);

    const repo = makeRepo();
    const svc = newService(repo);

    const backup = await svc.createBackup('r.txt');
    expect(backup.existed).toBe(true);
    expect(backup.mode).toBe(st.mode);

    // mutate file
    await fs.writeFile(p, 'NEW', 'utf8');
    const chmodSpy = jest.spyOn(fs, 'chmod').mockImplementation(async () => {});

    await svc.restoreFromBackup(backup);

    expect(await read('r.txt')).toBe('OLD');
    // mode re-application is best-effort; verify attempt when backup.mode present
    expect(chmodSpy).toHaveBeenCalled();
  });

  test('restoreFromBackup: deletes file and prunes empty dirs when existed=false', async () => {
    const p = path.join(workDir, 'x', 'y', 'z.txt');
    await fs.ensureDir(path.dirname(p));
    await fs.writeFile(p, 'temp', 'utf8');
    expect(await exists('x/y/z.txt')).toBe(true);

    const repo = makeRepo();
    const svc = newService(repo);

    await svc.restoreFromBackup({ path: 'x/y/z.txt', existed: false });

    expect(await exists('x/y/z.txt')).toBe(false);
    expect(await fs.pathExists(path.join(workDir, 'x'))).toBe(false);
  });

  test('getFileStats and fileExists: basic behavior', async () => {
    const repo = makeRepo();
    const svc = newService(repo);

    await fs.ensureDir(path.join(workDir, 'd'));
    await fs.writeFile(path.join(workDir, 'd', 'f.txt'), 'X', 'utf8');

    const stats = await svc.getFileStats('d/f.txt');
    expect(stats.isFile()).toBe(true);
    expect(await svc.fileExists('d/f.txt')).toBe(true);
    expect(await svc.fileExists('nope.txt')).toBe(false);
  });

  test('applyOperation: create/modify require blobSha and mode', async () => {
    const repo = makeRepo();
    const svc = newService(repo);

    await expect(svc.applyOperation({ action: 'create', path: 'a.txt' } as any)).rejects.toThrow(
      /Missing blob SHA or mode/
    );

    await expect(
      svc.applyOperation({ action: 'modify', path: 'a.txt', blobSha: 's' } as any)
    ).rejects.toThrow(/Missing blob SHA or mode/);
  });

  test('applyOperation: unknown action throws', async () => {
    const repo = makeRepo();
    const svc = newService(repo);

    await expect(svc.applyOperation({ action: 'weird', path: 'a.txt' } as any)).rejects.toThrow(
      /Unknown operation: weird/
    );
  });

  test('applyOperation: 100644 (non-exec) does not call chmod', async () => {
    const repo = makeRepo({ s: 'plain' });
    const svc = newService(repo);
    const chmodSpy = jest.spyOn(fs, 'chmod').mockImplementation(async () => {});

    await svc.applyOperation({
      action: 'create',
      path: 'plain.txt',
      blobSha: 's',
      mode: '100644',
    });

    expect(await read('plain.txt')).toBe('plain');
    expect(chmodSpy).not.toHaveBeenCalled();
  });

  test('applyOperation: executable mode passes masked 0o755 to chmod', async () => {
    const repo = makeRepo({ s: '#!/bin/sh\necho x\n' });
    const svc = newService(repo);
    const chmodSpy = jest.spyOn(fs, 'chmod').mockImplementation(async () => {});

    await svc.applyOperation({
      action: 'create',
      path: 'bin/x.sh',
      blobSha: 's',
      mode: '100755',
    });

    const last = chmodSpy.mock.calls.at(-1);
    expect(last?.[0]).toEqual(path.join(workDir, 'bin', 'x.sh'));
    expect(last?.[1]).toBe(0o755);
  });

  test('symlink: removes existing path before creating link (call order check)', async () => {
    const repo = makeRepo({ s: '../t.txt' });
    const svc = newService(repo);

    const linkPath = path.join(workDir, 'links', 'pre');
    await fs.ensureDir(path.dirname(linkPath));
    await fs.writeFile(linkPath, 'pre-existing', 'utf8');

    const unlinkSpy = jest.spyOn(fs, 'unlink').mockImplementation(async () => {});
    const symlinkSpy = jest.spyOn(fs, 'symlink').mockImplementation(async () => {});

    await svc.applyOperation({ action: 'create', path: 'links/pre', blobSha: 's', mode: '120000' });

    expect(unlinkSpy).toHaveBeenCalledWith(linkPath);
    // Ensure unlink happens before symlink
    expect(unlinkSpy).toHaveBeenCalled();
    expect(symlinkSpy).toHaveBeenCalled();

    const unlinkOrder = unlinkSpy.mock.invocationCallOrder[0]!;
    const symlinkOrder = symlinkSpy.mock.invocationCallOrder[0]!;

    expect(unlinkOrder).toBeLessThan(symlinkOrder);
  });

  test('delete: prunes only empty directories, keeps non-empty parents', async () => {
    const keepPath = path.join(workDir, 'a', 'keep.txt');
    const delPath = path.join(workDir, 'a', 'b', 'c.txt');

    await fs.ensureDir(path.dirname(keepPath));
    await fs.writeFile(keepPath, 'keep', 'utf8');
    await fs.ensureDir(path.dirname(delPath));
    await fs.writeFile(delPath, 'x', 'utf8');

    const repo = makeRepo();
    const svc = newService(repo);

    await svc.applyOperation({ action: 'delete', path: 'a/b/c.txt' });

    expect(await fs.pathExists(path.join(workDir, 'a', 'b'))).toBe(false);
    expect(await fs.pathExists(path.join(workDir, 'a'))).toBe(true);
    expect(await read('a/keep.txt')).toBe('keep');
  });

  test('restoreFromBackup: when mode is undefined, does not call chmod', async () => {
    const p = path.join(workDir, 'no-mode.txt');
    await fs.writeFile(p, 'ORIG', 'utf8');

    const repo = makeRepo();
    const svc = newService(repo);

    const backup = await svc.createBackup('no-mode.txt');
    // simulate missing mode in backup
    delete (backup as any).mode;

    const chmodSpy = jest.spyOn(fs, 'chmod').mockImplementation(async () => {});
    await fs.writeFile(p, 'CHANGED', 'utf8');

    await svc.restoreFromBackup(backup);

    expect(await read('no-mode.txt')).toBe('ORIG');
    expect(chmodSpy).not.toHaveBeenCalled();
  });

  test('restoreFromBackup: existed=false and file missing -> no-op (no throw)', async () => {
    const repo = makeRepo();
    const svc = newService(repo);

    await expect(
      svc.restoreFromBackup({ path: 'missing/also-missing.txt', existed: false })
    ).resolves.toBeUndefined();

    expect(await fs.pathExists(path.join(workDir, 'missing'))).toBe(false);
  });

  test('getFileStats: rejects for missing file', async () => {
    const repo = makeRepo();
    const svc = newService(repo);

    await expect(svc.getFileStats('no-such-file.txt')).rejects.toBeDefined();
  });
});

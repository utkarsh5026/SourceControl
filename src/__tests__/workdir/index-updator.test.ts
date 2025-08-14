import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { PathScurry } from 'path-scurry';

import type { Path } from 'glob';
import { SourceRepository } from '../../core/repo';
import { GitIndex, IndexEntry } from '../../core/index';
import { BlobObject } from '../../core/objects';
import { IndexUpdater } from '../../core/work-dir/internal/index-updator';
import { TreeFileInfo } from '../../core/work-dir/internal/types';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

describe('IndexUpdater', () => {
  let tmp: string;
  let scurry: PathScurry;
  let wd: Path;
  let indexUpdater: IndexUpdater;
  let indexPath: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-indexupdater-'));
    scurry = new PathScurry(tmp);
    wd = scurry.cwd;
    indexPath = path.join(tmp, '.git', 'index');
    await fs.ensureDir(path.dirname(indexPath));
    indexUpdater = new IndexUpdater(tmp, indexPath);
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  const writeWorkingFile = async (rel: string, content: string) => {
    const abs = path.join(wd.fullpath(), rel);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content, 'utf8');
    return abs;
  };

  const writeBlob = async (repo: SourceRepository, content: string): Promise<string> => {
    const blob = new BlobObject(toBytes(content));
    return repo.writeObject(blob);
  };

  const createTreeFileInfo = (sha: string, mode: string = '100644'): TreeFileInfo => ({
    sha,
    mode,
  });

  const buildEmptyIndex = async () => {
    const gi = new GitIndex();
    await gi.write(indexPath);
  };

  describe('updateToMatch', () => {
    test('successfully updates index with new files', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('a.txt', 'content-a');
      await writeWorkingFile('b.txt', 'content-b');

      const shaA = await writeBlob(repo, 'content-a');
      const shaB = await writeBlob(repo, 'content-b');

      const targetFiles = new Map<string, TreeFileInfo>([
        ['a.txt', createTreeFileInfo(shaA)],
        ['b.txt', createTreeFileInfo(shaB)],
      ]);

      const result = await indexUpdater.updateToMatch(targetFiles);

      expect(result.success).toBe(true);
      expect(result.entriesAdded).toBe(2);
      expect(result.entriesUpdated).toBe(0);
      expect(result.entriesRemoved).toBe(0);
      expect(result.errors).toHaveLength(0);

      const index = await GitIndex.read(indexPath);
      expect(index.entries).toHaveLength(2);
    });

    test('handles missing files gracefully', async () => {
      const targetFiles = new Map<string, TreeFileInfo>([
        ['missing.txt', createTreeFileInfo('abc123')],
      ]);

      const result = await indexUpdater.updateToMatch(targetFiles);

      expect(result.success).toBe(false);
      expect(result.entriesAdded).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('missing.txt');
    });

    test('creates completely new index when none exists', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('new.txt', 'new-content');
      const sha = await writeBlob(repo, 'new-content');

      const targetFiles = new Map<string, TreeFileInfo>([['new.txt', createTreeFileInfo(sha)]]);

      const result = await indexUpdater.updateToMatch(targetFiles);

      expect(result.success).toBe(true);
      expect(result.entriesAdded).toBe(1);

      const index = await GitIndex.read(indexPath);
      expect(index.entries).toHaveLength(1);
      expect(index.entries[0]?.filePath).toBe('new.txt');
    });
  });

  describe('updateIncremental', () => {
    test('adds new files to existing index', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);
      await buildEmptyIndex();

      await writeWorkingFile('new.txt', 'new-content');
      const sha = await writeBlob(repo, 'new-content');

      const changes = {
        add: new Map<string, TreeFileInfo>([['new.txt', createTreeFileInfo(sha)]]),
      };

      const result = await indexUpdater.updateIncremental(changes);

      expect(result.success).toBe(true);
      expect(result.entriesAdded).toBe(1);
      expect(result.entriesUpdated).toBe(0);
      expect(result.entriesRemoved).toBe(0);
    });

    test('updates existing files in index', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('existing.txt', 'old-content');
      const oldSha = await writeBlob(repo, 'old-content');

      // Create initial index with one entry
      const initialEntry = IndexEntry.fromFileStats(
        'existing.txt',
        await fs.stat(path.join(tmp, 'existing.txt')),
        oldSha
      );
      const initialIndex = new GitIndex(2, [initialEntry]);
      await initialIndex.write(indexPath);

      // Update file content
      await writeWorkingFile('existing.txt', 'new-content');
      const newSha = await writeBlob(repo, 'new-content');

      const changes = {
        add: new Map<string, TreeFileInfo>([['existing.txt', createTreeFileInfo(newSha)]]),
      };

      const result = await indexUpdater.updateIncremental(changes);

      expect(result.success).toBe(true);
      expect(result.entriesAdded).toBe(0);
      expect(result.entriesUpdated).toBe(1);
      expect(result.entriesRemoved).toBe(0);
    });

    test('removes files from index', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('to-remove.txt', 'content');
      const sha = await writeBlob(repo, 'content');

      // Create initial index with one entry
      const initialEntry = IndexEntry.fromFileStats(
        'to-remove.txt',
        await fs.stat(path.join(tmp, 'to-remove.txt')),
        sha
      );
      const initialIndex = new GitIndex(2, [initialEntry]);
      await initialIndex.write(indexPath);

      const changes = {
        remove: ['to-remove.txt'],
      };

      const result = await indexUpdater.updateIncremental(changes);

      expect(result.success).toBe(true);
      expect(result.entriesAdded).toBe(0);
      expect(result.entriesUpdated).toBe(0);
      expect(result.entriesRemoved).toBe(1);

      const index = await GitIndex.read(indexPath);
      expect(index.entries).toHaveLength(0);
    });

    test('handles mixed add and remove operations', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('existing.txt', 'content');
      await writeWorkingFile('new.txt', 'new-content');

      const existingSha = await writeBlob(repo, 'content');
      const newSha = await writeBlob(repo, 'new-content');

      // Create initial index with one entry
      const initialEntry = IndexEntry.fromFileStats(
        'existing.txt',
        await fs.stat(path.join(tmp, 'existing.txt')),
        existingSha
      );
      const initialIndex = new GitIndex(2, [initialEntry]);
      await initialIndex.write(indexPath);

      const changes = {
        add: new Map<string, TreeFileInfo>([['new.txt', createTreeFileInfo(newSha)]]),
        remove: ['existing.txt'],
      };

      const result = await indexUpdater.updateIncremental(changes);

      expect(result.success).toBe(true);
      expect(result.entriesAdded).toBe(1);
      expect(result.entriesUpdated).toBe(0);
      expect(result.entriesRemoved).toBe(1);

      const index = await GitIndex.read(indexPath);
      expect(index.entries).toHaveLength(1);
      expect(index.entries[0]?.filePath).toBe('new.txt');
    });

    test('handles removing non-existent files gracefully', async () => {
      await buildEmptyIndex();

      const changes = {
        remove: ['non-existent.txt'],
      };

      const result = await indexUpdater.updateIncremental(changes);

      expect(result.success).toBe(true);
      expect(result.entriesRemoved).toBe(0);
    });
  });

  describe('getStatistics', () => {
    test('returns correct statistics for populated index', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('small.txt', 'small');
      await writeWorkingFile('large.txt', 'large'.repeat(100));

      const smallSha = await writeBlob(repo, 'small');
      const largeSha = await writeBlob(repo, 'large'.repeat(100));

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const smallEntry = IndexEntry.fromFileStats(
        'small.txt',
        await fs.stat(path.join(tmp, 'small.txt')),
        smallSha
      );

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const largeEntry = IndexEntry.fromFileStats(
        'large.txt',
        await fs.stat(path.join(tmp, 'large.txt')),
        largeSha
      );

      const index = new GitIndex(2, [smallEntry, largeEntry]);
      await index.write(indexPath);

      const stats = await indexUpdater.getStatistics();

      expect(stats.entryCount).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
    });

    test('returns zero statistics for empty index', async () => {
      await buildEmptyIndex();

      const stats = await indexUpdater.getStatistics();

      expect(stats.entryCount).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.oldestEntry).toBeUndefined();
      expect(stats.newestEntry).toBeUndefined();
    });

    test('handles missing index file gracefully', async () => {
      const stats = await indexUpdater.getStatistics();

      expect(stats.entryCount).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('validateConsistency', () => {
    test('reports consistent index when files match', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('consistent.txt', 'content');
      const sha = await writeBlob(repo, 'content');

      const entry = IndexEntry.fromFileStats(
        'consistent.txt',
        await fs.stat(path.join(tmp, 'consistent.txt')),
        sha
      );

      const index = new GitIndex(2, [entry]);
      await index.write(indexPath);

      const validation = await indexUpdater.validateConsistency();

      expect(validation.consistent).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    test('reports size mismatch', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('size-mismatch.txt', 'original');
      const sha = await writeBlob(repo, 'original');

      const entry = IndexEntry.fromFileStats(
        'size-mismatch.txt',
        await fs.stat(path.join(tmp, 'size-mismatch.txt')),
        sha
      );

      const index = new GitIndex(2, [entry]);
      await index.write(indexPath);

      // Modify file to different size
      await writeWorkingFile('size-mismatch.txt', 'modified content');

      const validation = await indexUpdater.validateConsistency();

      expect(validation.consistent).toBe(false);
      expect(validation.issues).toHaveLength(1);
      expect(validation.issues[0]).toContain('size mismatch');
    });

    test('reports missing files', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('temp.txt', 'content');
      const sha = await writeBlob(repo, 'content');

      const entry = IndexEntry.fromFileStats(
        'temp.txt',
        await fs.stat(path.join(tmp, 'temp.txt')),
        sha
      );

      const index = new GitIndex(2, [entry]);
      await index.write(indexPath);

      // Remove the file
      await fs.remove(path.join(tmp, 'temp.txt'));

      const validation = await indexUpdater.validateConsistency();

      expect(validation.consistent).toBe(false);
      expect(validation.issues).toHaveLength(1);
      expect(validation.issues[0]).toContain('file missing from working directory');
    });
  });

  describe('repairIndex', () => {
    test('updates entries with mismatched timestamps', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('outdated.txt', 'content');
      const sha = await writeBlob(repo, 'content');

      // Create entry with current stats
      const originalStats = await fs.stat(path.join(tmp, 'outdated.txt'));
      const entry = IndexEntry.fromFileStats('outdated.txt', originalStats, sha);

      const index = new GitIndex(2, [entry]);
      await index.write(indexPath);

      // Wait and touch file to update mtime
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const now = new Date();
      await fs.utimes(path.join(tmp, 'outdated.txt'), now, now);

      const result = await indexUpdater.repairIndex();

      expect(result.success).toBe(true);
      expect(result.entriesUpdated).toBe(1);
      expect(result.entriesRemoved).toBe(0);
    });

    test('removes entries for missing files', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('temp.txt', 'content');
      const sha = await writeBlob(repo, 'content');

      const entry = IndexEntry.fromFileStats(
        'temp.txt',
        await fs.stat(path.join(tmp, 'temp.txt')),
        sha
      );

      const index = new GitIndex(2, [entry]);
      await index.write(indexPath);

      // Remove the file
      await fs.remove(path.join(tmp, 'temp.txt'));

      const result = await indexUpdater.repairIndex();

      expect(result.success).toBe(true);
      expect(result.entriesUpdated).toBe(0);
      expect(result.entriesRemoved).toBe(1);

      const repairedIndex = await GitIndex.read(indexPath);
      expect(repairedIndex.entries).toHaveLength(0);
    });

    test('handles mixed repair operations', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      await writeWorkingFile('outdated.txt', 'content1');
      await writeWorkingFile('missing.txt', 'content2');

      const sha1 = await writeBlob(repo, 'content1');
      const sha2 = await writeBlob(repo, 'content2');

      const entry1 = IndexEntry.fromFileStats(
        'outdated.txt',
        await fs.stat(path.join(tmp, 'outdated.txt')),
        sha1
      );
      const entry2 = IndexEntry.fromFileStats(
        'missing.txt',
        await fs.stat(path.join(tmp, 'missing.txt')),
        sha2
      );

      const index = new GitIndex(2, [entry1, entry2]);
      await index.write(indexPath);

      // Update timestamp of one file and remove the other
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const now = new Date();
      await fs.utimes(path.join(tmp, 'outdated.txt'), now, now);
      await fs.remove(path.join(tmp, 'missing.txt'));

      const result = await indexUpdater.repairIndex();

      expect(result.success).toBe(true);
      expect(result.entriesUpdated).toBe(1);
      expect(result.entriesRemoved).toBe(1);

      const repairedIndex = await GitIndex.read(indexPath);
      expect(repairedIndex.entries).toHaveLength(1);
      expect(repairedIndex.entries[0]?.filePath).toBe('outdated.txt');
    });
  });

  describe('error handling', () => {
    test('handles corrupt index file gracefully', async () => {
      await fs.writeFile(indexPath, 'corrupt data', 'utf8');

      const result = await indexUpdater.updateIncremental({});

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    test('handles file stat errors gracefully', async () => {
      const repo = new SourceRepository();
      await repo.init(wd);

      const targetFiles = new Map<string, TreeFileInfo>([
        ['nonexistent/file.txt', createTreeFileInfo('abc123')],
      ]);

      const result = await indexUpdater.updateToMatch(targetFiles);
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('nonexistent/file.txt');
    });
  });
});

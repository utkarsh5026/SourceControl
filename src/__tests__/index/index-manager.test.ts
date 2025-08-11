import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { PathScurry } from 'path-scurry';

import type { Path } from 'glob';
import { SourceRepository } from '../../core/repo';
import { IndexManager, GitIndex, IndexEntry } from '../../core/index';
import { BlobObject } from '../../core/objects';
import { TreeWalker } from '../../core/tree';

const toBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'utf8'));

describe('IndexManager', () => {
  let tmp: string;
  let scurry: PathScurry;
  let wd: Path;

  const repoIndexPath = (repo: SourceRepository) =>
    path.join(repo.gitDirectory().fullpath(), 'index');

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-indexmgr-'));
    scurry = new PathScurry(tmp);
    wd = scurry.cwd;
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

  const makeEntryFromDisk = async (relPath: string, sha: string): Promise<IndexEntry> => {
    const stats = await fs.stat(path.join(wd.fullpath(), relPath));
    return IndexEntry.fromFileStats(
      relPath,
      {
        ctimeMs: stats.ctimeMs,
        mtimeMs: stats.mtimeMs,
        dev: stats.dev,
        ino: stats.ino,
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
        size: stats.size,
      },
      sha
    );
  };

  const writeBlob = async (repo: SourceRepository, content: string): Promise<string> => {
    const blob = new BlobObject(toBytes(content));
    return repo.writeObject(blob);
  };

  const buildIndex = async (repo: SourceRepository, entries: IndexEntry[]) => {
    const gi = new GitIndex(2, entries);
    await gi.write(repoIndexPath(repo));
  };

  test('clearIndex removes all entries from on-disk index', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    // Create two files and pre-populate index
    await writeWorkingFile('a.txt', 'A');
    await writeWorkingFile('b.txt', 'B');

    const shaA = await writeBlob(repo, 'A');
    const shaB = await writeBlob(repo, 'B');

    const eA = await makeEntryFromDisk('a.txt', shaA);
    const eB = await makeEntryFromDisk('b.txt', shaB);

    await buildIndex(repo, [eA, eB]);

    const im = new IndexManager(repo);
    await im.clearIndex();

    const gi = await GitIndex.read(repoIndexPath(repo));
    expect(gi.entries).toHaveLength(0);
  });

  test('remove: failing when file not in index; success with deleteFromDisk', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    const fileNotStaged = await writeWorkingFile('not-staged.txt', 'X');

    // Index initially empty
    let im = new IndexManager(repo);
    let res = await im.remove([fileNotStaged], false);
    expect(res.removed).toEqual([]);
    expect(res.failed).toEqual([{ path: 'not-staged.txt', reason: 'File not in index' }]);
    expect(await fs.pathExists(fileNotStaged)).toBe(true);

    // Now stage a file by writing index directly, then remove it
    const fileStaged = await writeWorkingFile('staged.txt', 'Y');
    const shaY = await writeBlob(repo, 'Y');
    const eY = await makeEntryFromDisk('staged.txt', shaY);
    await buildIndex(repo, [eY]);

    im = new IndexManager(repo);
    res = await im.remove([fileStaged], true);
    expect(res.failed).toEqual([]);
    expect(res.removed).toEqual(['staged.txt']);
    expect(await fs.pathExists(fileStaged)).toBe(false);

    const gi = await GitIndex.read(repoIndexPath(repo));
    expect(gi.entries).toHaveLength(0);
  });

  test('status: categorizes staged added/modified/deleted and unstaged modified/deleted; untracked vs ignored', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    // Files in working dir
    await writeWorkingFile('a.txt', 'content-a'); // in index, not in HEAD -> staged.added
    await writeWorkingFile('b.txt', 'content-b'); // in index AND HEAD (same sha)
    await writeWorkingFile('b.txt', 'content-b'); // ensure timestamps updated but content same
    await writeWorkingFile('b.txt', 'content-b'); // stable
    await writeWorkingFile('d.txt', 'to-delete'); // will be in index then deleted
    await writeWorkingFile('u1.txt', 'untracked-1'); // untracked
    await writeWorkingFile('ignored.txt', 'ignored'); // ignored by root .sourceignore

    // Create root .sourceignore to ignore one file
    await fs.writeFile(path.join(wd.fullpath(), '.sourceignore'), 'ignored.txt\n', 'utf8');

    // Create blobs and entries for a.txt, b.txt, d.txt
    const shaA = await writeBlob(repo, 'content-a');
    const shaB = await writeBlob(repo, 'content-b');
    const shaD = await writeBlob(repo, 'to-delete');

    const eA = await makeEntryFromDisk('a.txt', shaA);
    const eB = await makeEntryFromDisk('b.txt', shaB);
    const eD = await makeEntryFromDisk('d.txt', shaD);
    await buildIndex(repo, [eA, eB, eD]);

    // Simulate HEAD tree files:
    // - b.txt present in HEAD with same sha (not staged.modified)
    // - c.txt present in HEAD but missing from index -> staged.deleted should include c.txt
    const headFiles = new Map<string, string>([
      ['b.txt', shaB],
      ['c.txt', 'c'.repeat(40)],
      ['d.txt', shaD],
    ]);
    const headSpy = jest.spyOn(TreeWalker.prototype, 'headFiles').mockResolvedValue(headFiles);

    // Modify working copy for b.txt to differ from index sha
    await fs.writeFile(path.join(wd.fullpath(), 'b.txt'), 'content-b-modified', 'utf8');

    // Delete working copy for d.txt to trigger unstaged.deleted
    await fs.remove(path.join(wd.fullpath(), 'd.txt'));

    const im = new IndexManager(repo);
    const st = await im.status();

    // Staged
    expect(st.staged.added.sort()).toEqual(['a.txt']); // not present in HEAD
    expect(st.staged.modified.sort()).toEqual([]); // b.txt same sha in HEAD vs index
    expect(st.staged.deleted.sort()).toEqual(['c.txt']); // in HEAD but not in index

    // Unstaged
    expect(st.unstaged.modified.sort()).toEqual(['b.txt']); // modified in working dir vs index
    expect(st.unstaged.deleted.sort()).toEqual(['d.txt']); // deleted in working dir vs index

    // Untracked and ignored
    expect(st.untracked.sort()).toEqual(['u1.txt']);
    expect(st.ignored.sort()).toEqual(['ignored.txt']);

    headSpy.mockRestore();
  });

  test('status: assumeValid suppresses unstaged.modified when size and mtime seconds unchanged', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    await writeWorkingFile('sv.txt', 'PING');
    const filePath = path.join(wd.fullpath(), 'sv.txt');
    const preStats = await fs.stat(filePath);

    const sha = await writeBlob(repo, 'PING');
    const e = await makeEntryFromDisk('sv.txt', sha);
    e.assumeValid = true;
    await buildIndex(repo, [e]);

    // Modify with same length and restore mtime seconds to match the index entry
    await fs.writeFile(filePath, 'PONG', 'utf8');
    await fs.utimes(filePath, preStats.atime, preStats.mtime);

    const im = new IndexManager(repo);
    const st = await im.status();

    expect(st.unstaged.modified).not.toContain('sv.txt');
  });

  test('status: identifies staged.modified when HEAD sha differs', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    await writeWorkingFile('x.txt', 'abc');
    const shaIdx = await writeBlob(repo, 'abc');
    const eX = await makeEntryFromDisk('x.txt', shaIdx);
    await buildIndex(repo, [eX]);

    const headFiles = new Map<string, string>([['x.txt', 'd'.repeat(40)]]);
    const headSpy = jest.spyOn(TreeWalker.prototype, 'headFiles').mockResolvedValue(headFiles);

    const im = new IndexManager(repo);
    const st = await im.status();

    expect(st.staged.modified.sort()).toEqual(['x.txt']);
    expect(st.staged.added).toEqual([]);
    expect(st.staged.deleted).toEqual([]);

    headSpy.mockRestore();
  });

  test('remove: processes mixed existing and missing paths without deleting from disk', async () => {
    const repo = new SourceRepository();
    await repo.init(wd);

    const keepAbs = await writeWorkingFile('keep.txt', 'K');
    const otherAbs = await writeWorkingFile('other.txt', 'O');

    const shaK = await writeBlob(repo, 'K');
    const eK = await makeEntryFromDisk('keep.txt', shaK);
    await buildIndex(repo, [eK]);

    const im = new IndexManager(repo);
    const res = await im.remove([keepAbs, otherAbs], false);

    expect(res.removed.sort()).toEqual(['keep.txt']);
    expect(res.failed).toEqual([{ path: 'other.txt', reason: 'File not in index' }]);

    // Files remain on disk since deleteFromDisk=false
    expect(await fs.pathExists(keepAbs)).toBe(true);
    expect(await fs.pathExists(otherAbs)).toBe(true);

    const gi = await GitIndex.read(repoIndexPath(repo));
    expect(gi.entries).toHaveLength(0);
  });
});

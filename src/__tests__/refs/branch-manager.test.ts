import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { BranchManager, RefManager } from '../../core/refs';
import { Repository } from '../../core/repo';

jest.mock('@/utils', () => {
  const actual = jest.requireActual('@/utils');
  return {
    ...actual,
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    },
  };
});

class FakePath {
  private p: string;
  constructor(p: string) {
    this.p = p;
  }
  fullpath() {
    return this.p;
  }
}

const makeRepo = (gitDir: string): Repository =>
  ({
    gitDirectory: () => new FakePath(gitDir),
  }) as unknown as Repository;

const SHA = '0123456789abcdef0123456789abcdef01234567';
const SHA2 = '89abcdef0123456789abcdef0123456789abcdef';

describe('BranchManager', () => {
  let tmpRoot: string;
  let gitDir: string;
  let refManager: RefManager;
  let branchManager: BranchManager;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'branch-manager-'));
    gitDir = path.join(tmpRoot, '.git');
    await fs.ensureDir(gitDir);
    refManager = new RefManager(makeRepo(gitDir));
    branchManager = new BranchManager(refManager);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await fs.remove(tmpRoot);
  });

  describe('init', () => {
    it('initializes refs and creates refs/heads directory', async () => {
      await branchManager.init();

      const refsPath = path.join(gitDir, 'refs');
      const headsPath = path.join(refsPath, 'heads');
      const headPath = path.join(gitDir, 'HEAD');

      await expect(fs.pathExists(refsPath)).resolves.toBe(true);
      await expect(fs.pathExists(headsPath)).resolves.toBe(true);
      await expect(fs.pathExists(headPath)).resolves.toBe(true);

      const headContent = (await fs.readFile(headPath, 'utf8')).trim();
      expect(headContent).toBe('ref: refs/heads/master');
    });
  });

  describe('getCurrentBranch', () => {
    it('returns current branch name when HEAD is symbolic', async () => {
      await branchManager.init();
      await expect(branchManager.getCurrentBranch()).resolves.toBe('master');
    });

    it('throws when HEAD file does not contain content', async () => {
      await branchManager.init();
      await fs.writeFile(refManager.getHeadPath(), ''); // empty content
      await expect(branchManager.getCurrentBranch()).rejects.toThrow('HEAD file not found');
    });

    it('throws when HEAD is not a symbolic ref', async () => {
      await branchManager.init();
      await refManager.updateRef('HEAD', SHA);
      await expect(branchManager.getCurrentBranch()).rejects.toThrow(
        'HEAD file is not a symbolic ref'
      );
    });
  });

  describe('createBranch', () => {
    beforeEach(async () => {
      await branchManager.init();
      // Ensure master points to a real commit so HEAD resolves to a SHA
      await refManager.updateRef('heads/master', SHA);
    });

    it('creates a branch from HEAD when startPoint not provided', async () => {
      await branchManager.createBranch('feature');
      const full = path.join(gitDir, 'refs', 'heads', 'feature');
      await expect(fs.pathExists(full)).resolves.toBe(true);
      const content = (await fs.readFile(full, 'utf8')).trim();
      expect(content).toBe(SHA);

      const info = await branchManager.getBranch('feature');
      expect(info).toEqual({ name: 'feature', sha: SHA, isCurrentBranch: false });
    });

    it('creates a branch from explicit HEAD startPoint', async () => {
      await branchManager.createBranch('feat2', 'HEAD');
      const content = (
        await fs.readFile(path.join(gitDir, 'refs', 'heads', 'feat2'), 'utf8')
      ).trim();
      expect(content).toBe(SHA);
    });

    it('creates a branch from an explicit branch startPoint', async () => {
      await refManager.updateRef('heads/source', SHA2);
      await branchManager.createBranch('from-source', 'heads/source');
      const content = (
        await fs.readFile(path.join(gitDir, 'refs', 'heads', 'from-source'), 'utf8')
      ).trim();
      expect(content).toBe(SHA2);
    });

    it('throws when creating an already existing branch', async () => {
      await branchManager.createBranch('dupe');
      await expect(branchManager.createBranch('dupe')).rejects.toThrow(
        'Branch dupe already exists'
      );
    });

    it.each([
      '',
      'HEAD',
      '.bad',
      'bad.',
      'bad/',
      'na..me',
      'na//me',
      'bad name',
      'bad^name',
      'ba?d',
      'ba:name',
      'ba*name',
      'ba[name',
    ])('rejects invalid branch name "%s"', async (name) => {
      await expect(branchManager.createBranch(name)).rejects.toThrow(
        `Invalid branch name: ${name}`
      );
    });

    it('bubbles startPoint resolution errors', async () => {
      await expect(branchManager.createBranch('oops', 'heads/missing')).rejects.toThrow(
        /Error creating branch oops:/
      );
    });
  });

  describe('getBranch', () => {
    beforeEach(async () => {
      await branchManager.init();
      await refManager.updateRef('heads/master', SHA);
    });

    it('returns branch info for existing branch; flags current branch', async () => {
      // master exists and is current
      const info = await branchManager.getBranch('master');
      expect(info).toEqual({ name: 'master', sha: SHA, isCurrentBranch: true });
    });

    it('throws for non-existing branch', async () => {
      await expect(branchManager.getBranch('nope')).rejects.toThrow('Branch nope not found');
    });
  });

  describe('listBranches', () => {
    it('throws if branches directory does not exist', async () => {
      // Not initialized: refs/heads missing
      await expect(branchManager.listBranches()).rejects.toThrow(
        'Branches directory heads not found'
      );
    });

    it('lists branches and filters out dot-prefixed entries', async () => {
      await branchManager.init();
      await refManager.updateRef('heads/master', SHA);
      await refManager.updateRef('heads/alpha', SHA);
      // simulate a dot entry
      await fs.ensureFile(path.join(refManager.getRefsPath(), 'heads', '.backup'));

      const branches = await branchManager.listBranches();
      expect(branches).toEqual(expect.arrayContaining(['master', 'alpha']));
      expect(branches).not.toEqual(expect.arrayContaining(['.backup']));
    });
  });

  describe('switchToBranch', () => {
    beforeEach(async () => {
      await branchManager.init();
      await refManager.updateRef('heads/master', SHA);
      await branchManager.createBranch('dev');
    });

    it('switches HEAD to the given existing branch', async () => {
      await branchManager.switchToBranch('dev');

      const headContent = (await fs.readFile(refManager.getHeadPath(), 'utf8')).trim();
      expect(headContent).toBe('ref: refs/heads/dev');
      await expect(branchManager.getCurrentBranch()).resolves.toBe('dev');
    });

    it('throws when switching to a non-existent branch', async () => {
      await expect(branchManager.switchToBranch('ghost')).rejects.toThrow('Branch ghost not found');
    });
  });

  describe('deleteBranch', () => {
    beforeEach(async () => {
      await branchManager.init();
      await refManager.updateRef('heads/master', SHA);
      await branchManager.createBranch('temp');
    });

    it('deletes a non-current branch', async () => {
      const target = path.join(refManager.getRefsPath(), 'heads', 'temp');
      await expect(fs.pathExists(target)).resolves.toBe(true);

      await branchManager.deleteBranch('temp');
      await expect(fs.pathExists(target)).resolves.toBe(false);
    });

    it('throws when deleting the currently checked out branch', async () => {
      await expect(branchManager.deleteBranch('master')).rejects.toThrow(
        'Cannot delete branch master: currently checked out'
      );
    });

    it('throws when deleting a non-existent branch', async () => {
      await expect(branchManager.deleteBranch('none')).rejects.toThrow(
        'Branch none does not exist'
      );
    });
  });
});

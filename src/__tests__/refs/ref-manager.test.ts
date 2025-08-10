import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { RefManager } from '../../core/refs';
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

const { logger } = jest.requireMock('@/utils') as { logger: { info: jest.Mock } };

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
const SHA_UPPER = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';

describe('RefManager', () => {
  let tmpRoot: string;
  let gitDir: string;
  let refManager: RefManager;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ref-manager-'));
    gitDir = path.join(tmpRoot, '.git');
    await fs.ensureDir(gitDir);
    refManager = new RefManager(makeRepo(gitDir));
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await fs.remove(tmpRoot);
  });

  describe('init', () => {
    it('creates refs directory and HEAD with default content', async () => {
      await refManager.init();

      const refsPath = path.join(gitDir, 'refs');
      const headPath = path.join(gitDir, 'HEAD');

      await expect(fs.pathExists(refsPath)).resolves.toBe(true);
      await expect(fs.pathExists(headPath)).resolves.toBe(true);

      const headContent = (await fs.readFile(headPath, 'utf8')).trim();
      expect(headContent).toBe('ref: refs/heads/master');
    });
  });

  describe('paths', () => {
    it('getRefsPath returns expected path', async () => {
      await refManager.init();
      expect(refManager.getRefsPath()).toBe(path.join(gitDir, 'refs'));
    });

    it('getHeadPath returns expected path', async () => {
      await refManager.init();
      expect(refManager.getHeadPath()).toBe(path.join(gitDir, 'HEAD'));
    });
  });

  describe('readRef', () => {
    it('reads and trims content', async () => {
      await refManager.init();
      const head = await refManager.readRef('HEAD');
      expect(head).toBe('ref: refs/heads/master');
    });

    it('throws for missing ref', async () => {
      await expect(refManager.readRef('heads/missing')).rejects.toThrow(
        /Ref heads\/missing not found/
      );
    });
  });

  describe('updateRef and exists', () => {
    it('creates directories, writes newline-terminated content, and logs', async () => {
      await refManager.init();
      const ref = 'heads/feature/x';
      await refManager.updateRef(ref, SHA);

      const full = path.join(gitDir, 'refs', ref);
      await expect(fs.pathExists(full)).resolves.toBe(true);

      const content = await fs.readFile(full, 'utf8');
      expect(content).toBe(`${SHA}\n`);

      await expect(refManager.exists(ref)).resolves.toBe(true);
      expect(logger.info).toHaveBeenCalledWith(`Updated ref ${ref} to ${SHA}`);
    });

    it('exists returns false when file does not exist', async () => {
      await expect(refManager.exists('heads/nope')).resolves.toBe(false);
    });
  });

  describe('deleteRef', () => {
    it('returns false when ref does not exist', async () => {
      await expect(refManager.deleteRef('heads/none')).resolves.toBe(false);
    });

    it('deletes existing ref and returns true', async () => {
      await refManager.init();
      const ref = 'heads/feat';
      await refManager.updateRef(ref, SHA);
      await expect(refManager.deleteRef(ref)).resolves.toBe(true);

      const full = path.join(gitDir, 'refs', ref);
      await expect(fs.pathExists(full)).resolves.toBe(false);
    });
  });

  describe('resolveReferenceToSha', () => {
    it('resolves direct SHA refs', async () => {
      await refManager.init();
      const ref = 'heads/foo';
      await refManager.updateRef(ref, SHA);
      await expect(refManager.resolveReferenceToSha(ref)).resolves.toBe(SHA);
    });

    it('accepts uppercase hex SHA', async () => {
      await refManager.init();
      const ref = 'heads/case';
      await refManager.updateRef(ref, SHA_UPPER);
      await expect(refManager.resolveReferenceToSha(ref)).resolves.toBe(SHA_UPPER);
    });

    it('follows symbolic ref chains to final SHA', async () => {
      await refManager.init();
      // Use relative targets ("heads/...") so resolution remains within refs root
      await fs.ensureDir(path.join(gitDir, 'refs', 'heads'));
      await fs.ensureDir(path.join(gitDir, 'refs', 'tags'));

      await refManager.updateRef('heads/a', 'ref: heads/b');
      await refManager.updateRef('heads/b', 'ref: tags/v1');
      await refManager.updateRef('tags/v1', SHA);

      await expect(refManager.resolveReferenceToSha('heads/a')).resolves.toBe(SHA);
    });

    it('resolves HEAD -> branch -> SHA when branch exists', async () => {
      await refManager.init();
      await refManager.updateRef('heads/master', SHA);
      await expect(refManager.resolveReferenceToSha('HEAD')).resolves.toBe(SHA);
    });

    it('throws when content is neither symbolic nor SHA after depth limit', async () => {
      await refManager.init();
      await refManager.updateRef('heads/bad', 'notasha');
      await expect(refManager.resolveReferenceToSha('heads/bad')).rejects.toThrow(
        /Reference depth exceeded for heads\/bad/
      );
    });

    it('throws when symbolic target does not exist', async () => {
      await refManager.init();
      await refManager.updateRef('heads/ghost', 'ref: heads/missing');
      await expect(refManager.resolveReferenceToSha('heads/ghost')).rejects.toThrow(
        /Error reading ref heads\/missing/
      );
    });

    it('throws when symbolic chain exceeds max depth', async () => {
      await refManager.init();
      // Build a chain longer than 10
      const chainLen = 12;
      for (let i = 0; i < chainLen - 1; i++) {
        await refManager.updateRef(`heads/n${i}`, `ref: heads/n${i + 1}`);
      }
      await refManager.updateRef(`heads/n${chainLen - 1}`, `ref: heads/end`);
      await expect(refManager.resolveReferenceToSha('heads/n0')).rejects.toThrow(
        /Reference depth exceeded/
      );
    });
  });
});

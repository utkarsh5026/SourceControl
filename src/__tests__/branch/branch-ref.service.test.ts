import path from 'path';
import { RefManager } from '../../core/refs';
import { BranchRefService } from '../../core/branch/services/branch-ref';

type RefManagerLike = Pick<
  RefManager,
  'exists' | 'resolveReferenceToSha' | 'updateRef' | 'deleteRef' | 'readRef'
>;

const makeMockRefManager = () => {
  const mock: jest.Mocked<RefManagerLike> = {
    exists: jest.fn(),
    resolveReferenceToSha: jest.fn(),
    updateRef: jest.fn(),
    deleteRef: jest.fn(),
    readRef: jest.fn(),
  };
  return mock;
};

describe('BranchRefService', () => {
  let refManagerMock: jest.Mocked<RefManagerLike>;
  let service: BranchRefService;

  beforeEach(() => {
    refManagerMock = makeMockRefManager();
    service = new BranchRefService(refManagerMock as unknown as RefManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('toBranchRefPath', () => {
    it('joins heads dir and branch name', () => {
      const result = service.toBranchRefPath('feature/foo');
      expect(result).toBe(path.join('heads', 'feature/foo'));
    });
  });

  describe('exists', () => {
    it('returns true when ref exists', async () => {
      refManagerMock.exists.mockResolvedValueOnce(true);
      await expect(service.exists('main')).resolves.toBe(true);
      expect(refManagerMock.exists).toHaveBeenCalledWith(path.join('heads', 'main'));
    });

    it('returns false when ref does not exist', async () => {
      refManagerMock.exists.mockResolvedValueOnce(false);
      await expect(service.exists('nope')).resolves.toBe(false);
      expect(refManagerMock.exists).toHaveBeenCalledWith(path.join('heads', 'nope'));
    });
  });

  describe('getBranchSha', () => {
    it('resolves branch ref to SHA', async () => {
      const sha = '0123456789abcdef0123456789abcdef01234567';
      refManagerMock.resolveReferenceToSha.mockResolvedValueOnce(sha);

      await expect(service.getBranchSha('dev')).resolves.toBe(sha);
      expect(refManagerMock.resolveReferenceToSha).toHaveBeenCalledWith(path.join('heads', 'dev'));
    });
  });

  describe('updateBranch', () => {
    it('updates the branch ref with the given SHA', async () => {
      const sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      await service.updateBranch('feature/x', sha);
      expect(refManagerMock.updateRef).toHaveBeenCalledWith(path.join('heads', 'feature/x'), sha);
    });
  });

  describe('deleteBranch', () => {
    it('returns true when deletion succeeds', async () => {
      refManagerMock.deleteRef.mockResolvedValueOnce(true);
      await expect(service.deleteBranch('hotfix')).resolves.toBe(true);
      expect(refManagerMock.deleteRef).toHaveBeenCalledWith(path.join('heads', 'hotfix'));
    });

    it('returns false when deletion fails or missing', async () => {
      refManagerMock.deleteRef.mockResolvedValueOnce(false);
      await expect(service.deleteBranch('ghost')).resolves.toBe(false);
      expect(refManagerMock.deleteRef).toHaveBeenCalledWith(path.join('heads', 'ghost'));
    });
  });

  describe('getCurrentBranch', () => {
    it('returns branch name when HEAD is symbolic to a branch', async () => {
      refManagerMock.readRef.mockResolvedValueOnce('ref: refs/heads/main');
      await expect(service.getCurrentBranch()).resolves.toBe('main');
      expect(refManagerMock.readRef).toHaveBeenCalledWith('HEAD');
    });

    it('returns null when HEAD is detached (direct SHA)', async () => {
      refManagerMock.readRef.mockResolvedValueOnce('0123456789abcdef0123456789abcdef01234567');
      await expect(service.getCurrentBranch()).resolves.toBeNull();
    });

    it('returns null when readRef throws', async () => {
      refManagerMock.readRef.mockRejectedValueOnce(new Error('cannot read'));
      await expect(service.getCurrentBranch()).resolves.toBeNull();
    });

    it('returns null when HEAD content is undefined', async () => {
      refManagerMock.readRef.mockResolvedValueOnce(undefined as unknown as string);
      await expect(service.getCurrentBranch()).resolves.toBeNull();
    });

    it('returns null when HEAD points to non-heads ref', async () => {
      refManagerMock.readRef.mockResolvedValueOnce('ref: refs/tags/v1.0.0');
      await expect(service.getCurrentBranch()).resolves.toBeNull();
    });
  });

  describe('setCurrentBranch', () => {
    it('writes HEAD as symbolic ref to the given branch', async () => {
      await service.setCurrentBranch('feature/y');
      expect(refManagerMock.updateRef).toHaveBeenCalledWith('HEAD', 'ref: refs/heads/feature/y');
    });
  });

  describe('setDetachedHead', () => {
    it('writes HEAD to a direct commit SHA (detached)', async () => {
      const sha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      await service.setDetachedHead(sha);
      expect(refManagerMock.updateRef).toHaveBeenCalledWith('HEAD', sha);
    });
  });
});

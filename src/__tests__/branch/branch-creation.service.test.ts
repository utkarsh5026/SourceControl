import { BranchCreator } from '../../core/branch/services/branch-creation';
import { BranchRefService } from '../../core/branch/services/branch-ref';
import { BranchInfoService } from '../../core/branch/services/branch-info';
import { Repository } from '../../core/repo';
import { BranchValidator } from '../../core/branch/services/branch-validator';
import { ObjectValidator } from '../../core/objects';
import { logger } from '../../utils';

type RepositoryLike = Pick<Repository, 'readObject'>;
type BranchRefServiceLike = Pick<
  BranchRefService,
  'exists' | 'getBranchSha' | 'getCurrentBranch' | 'updateBranch'
>;
type BranchInfoServiceLike = Pick<BranchInfoService, 'getBranchInfo'>;

const makeRepoMock = () => {
  const mock: jest.Mocked<RepositoryLike> = {
    readObject: jest.fn(),
  };
  return mock;
};

const makeBranchRefMock = () => {
  const mock: jest.Mocked<BranchRefServiceLike> = {
    exists: jest.fn(),
    getBranchSha: jest.fn(),
    getCurrentBranch: jest.fn(),
    updateBranch: jest.fn(),
  };
  return mock;
};

const makeBranchInfoMock = () => {
  const mock: jest.Mocked<BranchInfoServiceLike> = {
    getBranchInfo: jest.fn(),
  };
  return mock;
};

describe('BranchCreator', () => {
  let repoMock: jest.Mocked<RepositoryLike>;
  let refMock: jest.Mocked<BranchRefServiceLike>;
  let infoMock: jest.Mocked<BranchInfoServiceLike>;
  let creator: BranchCreator;

  beforeEach(() => {
    repoMock = makeRepoMock();
    refMock = makeBranchRefMock();
    infoMock = makeBranchInfoMock();
    creator = new BranchCreator(
      repoMock as unknown as Repository,
      refMock as unknown as BranchRefService,
      infoMock as unknown as BranchInfoService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const spyIsCommit = (impl: (obj: any) => boolean) =>
    jest.spyOn(ObjectValidator, 'isCommit').mockImplementation(impl as any);

  it('validates the branch name before proceeding', async () => {
    const spy = jest.spyOn(BranchValidator, 'validateAndThrow');
    refMock.exists.mockResolvedValueOnce(false);
    refMock.getCurrentBranch.mockResolvedValueOnce('main');
    const headSha = 'a'.repeat(40);
    refMock.getBranchSha.mockResolvedValueOnce(headSha);
    infoMock.getBranchInfo.mockResolvedValueOnce({
      name: 'feature/x',
      sha: headSha,
      isCurrentBranch: false,
    });

    await creator.createBranch('feature/x');

    expect(spy).toHaveBeenCalledWith('feature/x');
  });

  it('propagates validation errors from BranchValidator', async () => {
    jest
      .spyOn(BranchValidator, 'validateAndThrow')
      .mockImplementation(() => {
        throw new Error('Invalid branch name: bad');
      });

    await expect(creator.createBranch('bad')).rejects.toThrow(
      'Invalid branch name: bad'
    );

    expect(refMock.exists).not.toHaveBeenCalled();
    expect(refMock.updateBranch).not.toHaveBeenCalled();
    expect(infoMock.getBranchInfo).not.toHaveBeenCalled();
  });

  it('throws when branch exists and force=false', async () => {
    refMock.exists.mockResolvedValueOnce(true);

    await expect(
      creator.createBranch('main', { force: false })
    ).rejects.toThrow("Branch 'main' already exists");

    expect(refMock.exists).toHaveBeenCalledWith('main');
    expect(refMock.updateBranch).not.toHaveBeenCalled();
    expect(infoMock.getBranchInfo).not.toHaveBeenCalled();
  });

  it('skips existence check when force=true and creates from current branch', async () => {
    const headSha = 'b'.repeat(40);
    refMock.getCurrentBranch.mockResolvedValueOnce('main');
    refMock.getBranchSha.mockResolvedValueOnce(headSha);
    infoMock.getBranchInfo.mockResolvedValueOnce({
      name: 'topic',
      sha: headSha,
      isCurrentBranch: false,
    });

    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);

    const result = await creator.createBranch('topic', { force: true });

    expect(refMock.exists).not.toHaveBeenCalled(); // skipped due to force
    expect(refMock.getCurrentBranch).toHaveBeenCalled();
    expect(refMock.getBranchSha).toHaveBeenCalledWith('main');
    expect(refMock.updateBranch).toHaveBeenCalledWith('topic', headSha);
    expect(infoMock.getBranchInfo).toHaveBeenCalledWith('topic');
    expect(result.sha).toBe(headSha);

    expect(logSpy).toHaveBeenCalledWith(
      `Created branch 'topic' at ${headSha.substring(0, 7)}`
    );
  });

  it('throws when no startPoint and there are no commits yet (no current branch)', async () => {
    refMock.exists.mockResolvedValueOnce(false);
    refMock.getCurrentBranch.mockResolvedValueOnce(null);

    await expect(creator.createBranch('new-branch')).rejects.toThrow(
      'Cannot create branch: no commits yet'
    );

    expect(refMock.updateBranch).not.toHaveBeenCalled();
    expect(infoMock.getBranchInfo).not.toHaveBeenCalled();
  });

  it('throws when getCurrentBranch throws while resolving start point', async () => {
    refMock.exists.mockResolvedValueOnce(false);
    refMock.getCurrentBranch.mockRejectedValueOnce(new Error('IO error'));

    await expect(creator.createBranch('new-branch')).rejects.toThrow(
      'Cannot create branch: no commits yet'
    );

    expect(refMock.updateBranch).not.toHaveBeenCalled();
  });

  it('creates branch using startPoint as an existing branch name', async () => {
    const startSha = 'c'.repeat(40);
    refMock.exists.mockResolvedValueOnce(false);
    refMock.getBranchSha.mockResolvedValueOnce(startSha); // for startPoint
    infoMock.getBranchInfo.mockResolvedValueOnce({
      name: 'feature/y',
      sha: startSha,
      isCurrentBranch: false,
    });

    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);

    const result = await creator.createBranch('feature/y', {
      startPoint: 'main',
    });

    expect(refMock.exists).toHaveBeenCalledWith('feature/y');
    expect(refMock.getBranchSha).toHaveBeenCalledWith('main');
    expect(refMock.updateBranch).toHaveBeenCalledWith('feature/y', startSha);
    expect(result.sha).toBe(startSha);
    expect(logSpy).toHaveBeenCalledWith(
      `Created branch 'feature/y' at ${startSha.substring(0, 7)}`
    );
  });

  it('creates branch using startPoint as a commit SHA when object is a commit', async () => {
    const commitSha = 'd'.repeat(40);
    refMock.exists.mockResolvedValueOnce(false);
    // getBranchSha throws => treat as trying commit SHA
    refMock.getBranchSha.mockRejectedValueOnce(new Error('not a branch'));
    repoMock.readObject.mockResolvedValueOnce({} as any);
    spyIsCommit(() => true);

    infoMock.getBranchInfo.mockResolvedValueOnce({
      name: 'bugfix/z',
      sha: commitSha,
      isCurrentBranch: false,
    });

    await creator.createBranch('bugfix/z', { startPoint: commitSha });

    expect(refMock.updateBranch).toHaveBeenCalledWith('bugfix/z', commitSha);
    expect(infoMock.getBranchInfo).toHaveBeenCalledWith('bugfix/z');
  });

  it('throws when startPoint is invalid (not a branch and not a commit)', async () => {
    const bad = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    refMock.exists.mockResolvedValueOnce(false);
    refMock.getBranchSha.mockRejectedValueOnce(new Error('not a branch'));
    repoMock.readObject.mockResolvedValueOnce({ foo: 'bar' } as any);
    spyIsCommit(() => false);

    await expect(creator.createBranch('topic/x', { startPoint: bad })).rejects.toThrow(
      `Invalid start point: ${bad}`
    );

    expect(refMock.updateBranch).not.toHaveBeenCalled();
  });

  it('logs tracking information when track option is provided', async () => {
    const headSha = 'e'.repeat(40);
    refMock.exists.mockResolvedValueOnce(false);
    refMock.getCurrentBranch.mockResolvedValueOnce('main');
    refMock.getBranchSha.mockResolvedValueOnce(headSha);
    infoMock.getBranchInfo.mockResolvedValueOnce({
      name: 'feature/track',
      sha: headSha,
      isCurrentBranch: false,
    });

    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);

    await creator.createBranch('feature/track', { track: 'origin/main' });

    // Two logs: creation + tracking
    expect(logSpy).toHaveBeenCalledWith(
      `Created branch 'feature/track' at ${headSha.substring(0, 7)}`
    );
    expect(logSpy).toHaveBeenCalledWith(
      `Branch 'feature/track' set up to track 'origin/main'`
    );
  });

  it('successfully creates when branch does not exist and no explicit startPoint (uses current branch)', async () => {
    const headSha = 'f'.repeat(40);
    refMock.exists.mockResolvedValueOnce(false);
    refMock.getCurrentBranch.mockResolvedValueOnce('main');
    refMock.getBranchSha.mockResolvedValueOnce(headSha);
    infoMock.getBranchInfo.mockResolvedValueOnce({
      name: 'feature/basic',
      sha: headSha,
      isCurrentBranch: false,
    });

    await creator.createBranch('feature/basic');

    expect(refMock.exists).toHaveBeenCalledWith('feature/basic');
    expect(refMock.getCurrentBranch).toHaveBeenCalled();
    expect(refMock.getBranchSha).toHaveBeenCalledWith('main');
    expect(refMock.updateBranch).toHaveBeenCalledWith('feature/basic', headSha);
    expect(infoMock.getBranchInfo).toHaveBeenCalledWith('feature/basic');
  });
});
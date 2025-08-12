import { BranchInfoService } from '../../core/branch/services/branch-info';
import { Repository } from '../../core/repo';
import { BranchRefService } from '../../core/branch/services/branch-ref';
import { ObjectValidator } from '../../core/objects';

type RepositoryLike = Pick<Repository, 'readObject'>;
type BranchRefServiceLike = Pick<BranchRefService, 'getBranchSha' | 'getCurrentBranch'>;

const makeMockRepo = () => {
  const mock: jest.Mocked<RepositoryLike> = {
    readObject: jest.fn(),
  };
  return mock;
};

const makeMockRefService = () => {
  const mock: jest.Mocked<BranchRefServiceLike> = {
    getBranchSha: jest.fn(),
    getCurrentBranch: jest.fn(),
  };
  return mock;
};

describe('BranchInfoService', () => {
  let repoMock: jest.Mocked<RepositoryLike>;
  let branchRefMock: jest.Mocked<BranchRefServiceLike>;
  let service: BranchInfoService;

  beforeEach(() => {
    repoMock = makeMockRepo();
    branchRefMock = makeMockRefService();
    service = new BranchInfoService(
      repoMock as unknown as Repository,
      branchRefMock as unknown as BranchRefService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const spyIsCommit = (impl: (obj: any) => boolean) =>
    jest.spyOn(ObjectValidator, 'isCommit').mockImplementation(impl as any);

  it('returns branch info with message, date and commit count on a linear history', async () => {
    const branchName = 'main';
    const headSha = 'A'.repeat(40);
    const shaB = 'B'.repeat(40);
    const shaC = 'C'.repeat(40);

    branchRefMock.getBranchSha.mockResolvedValueOnce(headSha);
    branchRefMock.getCurrentBranch.mockResolvedValueOnce(branchName);

    const authorTs = 1700000000;
    const commitA = {
      parentShas: [shaB],
      author: { timestamp: authorTs },
      message: 'feat: top\nmore',
    };
    const commitB = {
      parentShas: [shaC],
      author: { timestamp: authorTs - 100 },
      message: 'chore: mid',
    };
    const commitC = { parentShas: [], author: { timestamp: authorTs - 200 }, message: 'init' };

    repoMock.readObject.mockImplementation(async (sha: string) => {
      if (sha === headSha) return commitA as any;
      if (sha === shaB) return commitB as any;
      if (sha === shaC) return commitC as any;
      return null;
    });

    spyIsCommit(() => true);

    const result = await service.getBranchInfo(branchName);

    expect(branchRefMock.getBranchSha).toHaveBeenCalledWith(branchName);
    expect(branchRefMock.getCurrentBranch).toHaveBeenCalled();

    expect(result.name).toBe(branchName);
    expect(result.sha).toBe(headSha);
    expect(result.isCurrentBranch).toBe(true);
    expect(result.lastCommitMessage).toBe('feat: top');
    expect(result.lastCommitDate?.getTime()).toBe(new Date(authorTs * 1000).getTime());
    expect(result.commitCount).toBe(3);
  });

  it('sets isCurrentBranch=false when current branch differs', async () => {
    const branchName = 'feature/x';
    const headSha = 'd'.repeat(40);

    branchRefMock.getBranchSha.mockResolvedValueOnce(headSha);
    branchRefMock.getCurrentBranch.mockResolvedValueOnce('main');

    repoMock.readObject.mockResolvedValueOnce({
      parentShas: [],
      author: { timestamp: 1 },
      message: 'm',
    } as any);
    spyIsCommit(() => true);

    const result = await service.getBranchInfo(branchName);
    expect(result.isCurrentBranch).toBe(false);
  });

  it('omits lastCommitMessage and lastCommitDate when object is not a commit', async () => {
    const branchName = 'dev';
    const headSha = 'e'.repeat(40);

    branchRefMock.getBranchSha.mockResolvedValueOnce(headSha);
    branchRefMock.getCurrentBranch.mockResolvedValueOnce('dev');

    // readObject returns something, but isCommit=false
    repoMock.readObject.mockResolvedValueOnce({ foo: 'bar' } as any);
    spyIsCommit(() => false);

    const result = await service.getBranchInfo(branchName);
    expect(result.lastCommitMessage).toBeUndefined();
    expect(result.lastCommitDate).toBeUndefined();
    // countCommits still counts the starting SHA as visited
    expect(result.commitCount).toBe(1);
  });

  it('returns empty commit details when readObject throws; commitCount still counts visited', async () => {
    const branchName = 'bugfix';
    const headSha = 'f'.repeat(40);

    branchRefMock.getBranchSha.mockResolvedValueOnce(headSha);
    branchRefMock.getCurrentBranch.mockResolvedValueOnce('bugfix');

    repoMock.readObject.mockRejectedValueOnce(new Error('IO'));
    spyIsCommit(() => true);

    const result = await service.getBranchInfo(branchName);
    expect(result.lastCommitMessage).toBeUndefined();
    expect(result.lastCommitDate).toBeUndefined();
    expect(result.commitCount).toBe(1); // visited contains startSha even if read fails
  });

  it('counts unique commits across merge parents (deduplicates shared ancestors)', async () => {
    // Graph:
    //   A
    //  / \
    // B   C
    //  \ /
    //   D
    const shaA = 'a'.repeat(40);
    const shaB = 'b'.repeat(40);
    const shaC = 'c'.repeat(40);
    const shaD = 'd'.repeat(40);

    branchRefMock.getBranchSha.mockResolvedValueOnce(shaA);
    branchRefMock.getCurrentBranch.mockResolvedValueOnce('topic');

    const commitA = { parentShas: [shaB, shaC], author: { timestamp: 2 }, message: 'A' };
    const commitB = { parentShas: [shaD], author: { timestamp: 1 }, message: 'B' };
    const commitC = { parentShas: [shaD], author: { timestamp: 1 }, message: 'C' };
    const commitD = { parentShas: [], author: { timestamp: 0 }, message: 'D' };

    repoMock.readObject.mockImplementation(async (sha: string) => {
      if (sha === shaA) return commitA as any;
      if (sha === shaB) return commitB as any;
      if (sha === shaC) return commitC as any;
      if (sha === shaD) return commitD as any;
      return null;
    });

    spyIsCommit(() => true);

    const result = await service.getBranchInfo('topic');
    expect(result.commitCount).toBe(4);
    expect(result.lastCommitMessage).toBe('A');
    expect(result.lastCommitDate?.getTime()).toBe(new Date(2 * 1000).getTime());
  });

  it('uses only the first line of the commit message', async () => {
    const headSha = '1'.repeat(40);

    branchRefMock.getBranchSha.mockResolvedValueOnce(headSha);
    branchRefMock.getCurrentBranch.mockResolvedValueOnce('m');

    repoMock.readObject.mockResolvedValueOnce({
      parentShas: [],
      author: { timestamp: 10 },
      message: 'subject line\nbody line 1\nbody line 2',
    } as any);
    spyIsCommit(() => true);

    const result = await service.getBranchInfo('m');
    expect(result.lastCommitMessage).toBe('subject line');
  });

  it('does not set lastCommitDate when author is missing', async () => {
    const headSha = '2'.repeat(40);

    branchRefMock.getBranchSha.mockResolvedValueOnce(headSha);
    branchRefMock.getCurrentBranch.mockResolvedValueOnce('x');

    repoMock.readObject.mockResolvedValueOnce({
      parentShas: [],
      message: 'no author',
    } as any);
    spyIsCommit(() => true);

    const result = await service.getBranchInfo('x');
    expect(result.lastCommitDate).toBeUndefined();
  });
});

import { BranchDelete, BranchRefService } from '../../core/branch/services';

type BranchRefServiceLike = Pick<BranchRefService, 'exists' | 'getCurrentBranch' | 'deleteBranch'>;

const makeRefMock = () => {
  const mock: jest.Mocked<BranchRefServiceLike> = {
    exists: jest.fn(),
    getCurrentBranch: jest.fn(),
    deleteBranch: jest.fn(),
  };
  return mock;
};

describe('BranchDelete', () => {
  let refMock: jest.Mocked<BranchRefServiceLike>;
  let service: BranchDelete;

  beforeEach(() => {
    refMock = makeRefMock();
    service = new BranchDelete(refMock as unknown as BranchRefService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('throws when attempting to delete the currently checked out branch', async () => {
    refMock.getCurrentBranch.mockResolvedValueOnce('main');

    await expect(service.deleteBranch('main')).rejects.toThrow(
      "Cannot delete branch 'main': currently checked out"
    );

    expect(refMock.exists).not.toHaveBeenCalled();
    expect(refMock.deleteBranch).not.toHaveBeenCalled();
  });

  it("throws when the branch doesn't exist", async () => {
    refMock.getCurrentBranch.mockResolvedValueOnce(null);
    refMock.exists.mockResolvedValueOnce(false);

    await expect(service.deleteBranch('ghost')).rejects.toThrow("Branch 'ghost' not found");

    expect(refMock.exists).toHaveBeenCalledTimes(1);
    expect(refMock.exists).toHaveBeenCalledWith('ghost');
    expect(refMock.deleteBranch).not.toHaveBeenCalled();
  });

  it('deletes an existing non-current branch', async () => {
    refMock.getCurrentBranch.mockResolvedValueOnce('main');
    refMock.exists.mockResolvedValueOnce(true);
    refMock.deleteBranch.mockResolvedValueOnce(true);

    await service.deleteBranch('feature/x');

    expect(refMock.exists).toHaveBeenCalledWith('feature/x');
    expect(refMock.deleteBranch).toHaveBeenCalledWith('feature/x');
  });

  it('allows deletion in detached HEAD state when the branch exists', async () => {
    refMock.getCurrentBranch.mockResolvedValueOnce(null);
    refMock.exists.mockResolvedValueOnce(true);
    refMock.deleteBranch.mockResolvedValueOnce(true);

    await service.deleteBranch('topic');

    expect(refMock.exists).toHaveBeenCalledWith('topic');
    expect(refMock.deleteBranch).toHaveBeenCalledWith('topic');
  });

  it('deletes with force=true (merge checks currently not implemented)', async () => {
    refMock.getCurrentBranch.mockResolvedValueOnce('develop');
    refMock.exists.mockResolvedValueOnce(true);
    refMock.deleteBranch.mockResolvedValueOnce(true);

    await service.deleteBranch('bugfix/y', true);

    expect(refMock.exists).toHaveBeenCalledWith('bugfix/y');
    expect(refMock.deleteBranch).toHaveBeenCalledWith('bugfix/y');
  });
});

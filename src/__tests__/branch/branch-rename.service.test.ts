import { BranchRename, BranchRefService, BranchValidator } from '../../core/branch/services';

type BranchRefServiceLike = Pick<
  BranchRefService,
  | 'exists'
  | 'getBranchSha'
  | 'updateBranch'
  | 'getCurrentBranch'
  | 'setCurrentBranch'
  | 'deleteBranch'
>;

const makeRefMock = () => {
  const mock: jest.Mocked<BranchRefServiceLike> = {
    exists: jest.fn(),
    getBranchSha: jest.fn(),
    updateBranch: jest.fn(),
    getCurrentBranch: jest.fn(),
    setCurrentBranch: jest.fn(),
    deleteBranch: jest.fn(),
  };
  return mock;
};

describe('BranchRename', () => {
  let refMock: jest.Mocked<BranchRefServiceLike>;
  let service: BranchRename;

  beforeEach(() => {
    refMock = makeRefMock();
    service = new BranchRename(refMock as unknown as BranchRefService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('validates the new branch name before proceeding', async () => {
    const spy = jest.spyOn(BranchValidator, 'validateAndThrow');

    // old exists, new does not
    refMock.exists.mockResolvedValueOnce(true);
    refMock.exists.mockResolvedValueOnce(false);

    const sha = 'a'.repeat(40);
    refMock.getBranchSha.mockResolvedValueOnce(sha);
    refMock.getCurrentBranch.mockResolvedValueOnce(null);
    refMock.deleteBranch.mockResolvedValueOnce(true);

    await service.renameBranch('old', 'new');

    expect(spy).toHaveBeenCalledWith('new');
    expect(refMock.exists).toHaveBeenCalledWith('old');
    expect(refMock.exists).toHaveBeenCalledWith('new');
    expect(refMock.getBranchSha).toHaveBeenCalledWith('old');
    expect(refMock.updateBranch).toHaveBeenCalledWith('new', sha);
    expect(refMock.setCurrentBranch).not.toHaveBeenCalled();
    expect(refMock.deleteBranch).toHaveBeenCalledWith('old');
  });

  it('propagates validation errors from BranchValidator and skips ref operations', async () => {
    jest.spyOn(BranchValidator, 'validateAndThrow').mockImplementation(() => {
      throw new Error('Invalid branch name: bad');
    });

    await expect(service.renameBranch('old', 'bad')).rejects.toThrow('Invalid branch name: bad');

    expect(refMock.exists).not.toHaveBeenCalled();
    expect(refMock.updateBranch).not.toHaveBeenCalled();
    expect(refMock.deleteBranch).not.toHaveBeenCalled();
  });

  it("throws when the old branch doesn't exist", async () => {
    refMock.exists.mockResolvedValueOnce(false);

    await expect(service.renameBranch('ghost', 'new')).rejects.toThrow("Branch 'ghost' not found");

    expect(refMock.exists).toHaveBeenCalledTimes(1);
    expect(refMock.exists).toHaveBeenCalledWith('ghost');
    expect(refMock.getBranchSha).not.toHaveBeenCalled();
    expect(refMock.updateBranch).not.toHaveBeenCalled();
    expect(refMock.deleteBranch).not.toHaveBeenCalled();
  });

  it('throws when the new branch exists and force=false', async () => {
    refMock.exists.mockResolvedValueOnce(true); // old exists
    refMock.exists.mockResolvedValueOnce(true); // new exists

    await expect(service.renameBranch('old', 'main')).rejects.toThrow(
      "Branch 'main' already exists"
    );

    expect(refMock.getBranchSha).not.toHaveBeenCalled();
    expect(refMock.updateBranch).not.toHaveBeenCalled();
    expect(refMock.deleteBranch).not.toHaveBeenCalled();
  });

  it('overwrites the new branch when force=true and skips new existence check', async () => {
    refMock.exists.mockResolvedValueOnce(true); // check old exists only
    const sha = 'b'.repeat(40);
    refMock.getBranchSha.mockResolvedValueOnce(sha);
    refMock.getCurrentBranch.mockResolvedValueOnce('another');
    refMock.deleteBranch.mockResolvedValueOnce(true);

    await service.renameBranch('old', 'main', true);

    // Only one exists check (for old)
    expect(refMock.exists).toHaveBeenCalledTimes(1);
    expect(refMock.exists).toHaveBeenCalledWith('old');

    expect(refMock.getBranchSha).toHaveBeenCalledWith('old');
    expect(refMock.updateBranch).toHaveBeenCalledWith('main', sha);
    expect(refMock.setCurrentBranch).not.toHaveBeenCalled();
    expect(refMock.deleteBranch).toHaveBeenCalledWith('old');
  });

  it('updates HEAD when renaming the currently checked out branch', async () => {
    refMock.exists.mockResolvedValueOnce(true);
    refMock.exists.mockResolvedValueOnce(false);

    const sha = 'c'.repeat(40);
    refMock.getBranchSha.mockResolvedValueOnce(sha);
    refMock.getCurrentBranch.mockResolvedValueOnce('old');
    refMock.deleteBranch.mockResolvedValueOnce(true);

    await service.renameBranch('old', 'new');

    expect(refMock.setCurrentBranch).toHaveBeenCalledWith('new');
    expect(refMock.updateBranch).toHaveBeenCalledWith('new', sha);
    expect(refMock.deleteBranch).toHaveBeenCalledWith('old');
  });

  it('does not update HEAD when renaming a non-current branch or in detached state', async () => {
    refMock.exists.mockResolvedValueOnce(true);
    refMock.exists.mockResolvedValueOnce(false);

    const sha = 'd'.repeat(40);
    refMock.getBranchSha.mockResolvedValueOnce(sha);
    refMock.getCurrentBranch.mockResolvedValueOnce(null); // detached
    refMock.deleteBranch.mockResolvedValueOnce(true);

    await service.renameBranch('feature/x', 'feature/y');

    expect(refMock.setCurrentBranch).not.toHaveBeenCalled();
    expect(refMock.updateBranch).toHaveBeenCalledWith('feature/y', sha);
    expect(refMock.deleteBranch).toHaveBeenCalledWith('feature/x');
  });
});

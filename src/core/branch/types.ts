export type BranchInfo = {
  name: string;
  sha: string;
  isCurrentBranch: boolean;
  commitCount?: number;
  lastCommitDate?: Date;
  lastCommitMessage?: string;
  ahead?: number; // commits ahead of upstream
  behind?: number; // commits behind upstream
};

export type CreateBranchOptions = {
  startPoint?: string; // commit SHA or branch name to start from
  checkout?: boolean; // switch to the new branch after creation
  force?: boolean; // overwrite if branch exists
  track?: string; // set up tracking branch
};

export type CheckoutOptions = {
  force?: boolean; // discard local changes
  create?: boolean; // create branch if it doesn't exist
  orphan?: boolean; // create orphan branch
  detach?: boolean; // checkout in detached HEAD state
};

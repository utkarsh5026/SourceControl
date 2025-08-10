import { CommitPerson } from '@/core/objects/commit/commit-person';

export interface CommitOptions {
  message: string;
  author?: CommitPerson;
  committer?: CommitPerson;
  amend?: boolean;
  allowEmpty?: boolean;
  noVerify?: boolean;
}

export interface CommitResult {
  sha: string;
  treeSha: string;
  parentShas: string[];
  message: string;
  author: CommitPerson;
  committer: CommitPerson;
}

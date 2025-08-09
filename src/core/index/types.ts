type StringArray = Array<string>;

export type AddOptions = {
  force?: boolean; // Force add even if ignored
  verbose?: boolean; // Show verbose output
  dryRun?: boolean; // Perform dry run without actual changes
};

export type AddResult = {
  added: StringArray; // New files added to index
  modified: StringArray; // Existing files updated in index
  ignored: StringArray; // Files skipped due to ignore patterns
  failed: Array<{
    path: string;
    reason: string;
  }>;
};

export type RemoveResult = {
  removed: StringArray;
  failed: Array<{
    path: string;
    reason: string;
  }>;
};

export type StatusResult = {
  staged: {
    added: StringArray; // New files in index (not in HEAD)
    modified: StringArray; // Files modified in index (different from HEAD)
    deleted: StringArray; // Files deleted from index (present in HEAD)
  };
  unstaged: {
    modified: StringArray; // Files modified in working dir (different from index)
    deleted: StringArray; // Files deleted from working dir (present in index)
  };
  untracked: StringArray; // Files in working dir but not in index
  ignored: StringArray; // Ignored files (shown with --ignored flag)
};

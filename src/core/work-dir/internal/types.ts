export interface FileOperation {
  path: string;
  action: 'create' | 'modify' | 'delete';
  blobSha?: string;
  mode?: string;
}

export interface BackupInfo {
  path: string;
  content?: Buffer;
  existed: boolean;
}

export interface FileBackup {
  path: string;
  content?: Buffer;
  existed: boolean;
  mode?: number;
}

export interface TreeFileInfo {
  sha: string;
  mode: string; // Git file mode from tree entry
}

export interface WorkingDirectoryStatus {
  clean: boolean;
  modifiedFiles: string[];
  deletedFiles: string[];
  details: FileStatusDetail[];
}

export interface FileStatusDetail {
  path: string;
  status: 'modified' | 'deleted' | 'size-changed' | 'time-changed' | 'content-changed';
  reason?: string;
}

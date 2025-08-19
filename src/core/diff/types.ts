/**
 * Core diff types and interfaces
 */

export interface DiffOptions {
  contextLines?: number; // Number of context lines (default: 3)
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  algorithm?: DiffAlgorithm;
  maxFileSize?: number; // Max file size to diff (bytes)
}

export enum DiffAlgorithm {
  MYERS = 'myers',
  PATIENCE = 'patience',
  HISTOGRAM = 'histogram',
}

export enum DiffOperation {
  EQUAL = 'equal',
  INSERT = 'insert',
  DELETE = 'delete',
}

export interface DiffEdit {
  operation: DiffOperation;
  text: string;
  lineNumber?: number;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
  header: string;
}

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export enum DiffLineType {
  CONTEXT = 'context', // ' '
  ADDITION = 'addition', // '+'
  DELETION = 'deletion', // '-'
  HEADER = 'header', // '@@ -1,4 +1,4 @@'
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  oldSha?: string;
  newSha?: string;
  type: FileChangeType;
  hunks: DiffHunk[];
  isBinary: boolean;
  similarity?: number; // For renames (0-100)
}

export enum FileChangeType {
  ADDED = 'added',
  DELETED = 'deleted',
  MODIFIED = 'modified',
  RENAMED = 'renamed',
  COPIED = 'copied',
  MODE_CHANGED = 'mode_changed',
}

export interface DiffStatistics {
  filesChanged: number;
  insertions: number;
  deletions: number;
  totalLines: number;
}

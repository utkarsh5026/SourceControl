export interface SampleOptions {
  dirs?: string;
  files?: string;
  depth?: string;
  size?: string;
  output?: string;
}

export interface GenerationStats {
  totalDirectories: number;
  totalFiles: number;
  totalSize: number;
  structure: DirectoryNode;
}

export interface DirectoryNode {
  name: string;
  path: string;
  files: string[];
  subdirectories: DirectoryNode[];
}

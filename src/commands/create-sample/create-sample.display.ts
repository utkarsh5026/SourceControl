import path from 'path';
import { DirectoryNode, GenerationStats } from './create-sample.types';

/**
 * Formats and displays the generation results to the user
 */

export const formatGenerationSummary = (stats: GenerationStats, outputPath: string): string => {
  const summary = [
    `📁 **Generated Sample Project Structure**`,
    ``,
    `**Location:** \`${outputPath}\``,
    `**Total Directories:** ${stats.totalDirectories}`,
    `**Total Files:** ${stats.totalFiles}`,
    `**Total Size:** ${formatBytes(stats.totalSize)}`,
    ``,
    `**Directory Structure:**`,
  ];

  summary.push(formatDirectoryTree(stats.structure, '', true));

  return summary.join('\n');
};

const formatDirectoryTree = (node: DirectoryNode, prefix: string, isLast: boolean): string => {
  const lines: string[] = [];
  const connector = isLast ? '└── ' : '├── ';
  const name = node.name || path.basename(node.path);

  if (name) {
    lines.push(`${prefix}${connector}📁 ${name}/`);
  }

  const newPrefix = prefix + (isLast ? '    ' : '│   ');

  // Add files
  node.files.forEach((file, index) => {
    const isLastFile = index === node.files.length - 1 && node.subdirectories.length === 0;
    const fileConnector = isLastFile ? '└── ' : '├── ';
    const icon = getFileIcon(file);
    lines.push(`${newPrefix}${fileConnector}${icon} ${file}`);
  });

  // Add subdirectories
  node.subdirectories.forEach((subdir, index) => {
    const isLastSubdir = index === node.subdirectories.length - 1;
    lines.push(formatDirectoryTree(subdir, newPrefix, isLastSubdir));
  });

  return lines.join('\n');
};

const getFileIcon = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const iconMap: Record<string, string> = {
    '.md': '📝',
    '.ts': '🔷',
    '.js': '🟨',
    '.json': '📋',
    '.txt': '📄',
    '.csv': '📊',
    '.yml': '⚙️',
    '.yaml': '⚙️',
    '.xml': '📄',
    '.html': '🌐',
    '.css': '🎨',
    '.scss': '🎨',
    '.less': '🎨',
  };

  return iconMap[ext] || '📄';
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

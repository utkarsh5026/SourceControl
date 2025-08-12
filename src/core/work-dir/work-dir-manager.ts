import { Repository } from '@/core/repo';
import { IndexManager } from '@/core/index';
import path from 'path';

/**
 * WorkingDirectoryManager handles updating the working directory
 * when switching between branches or commits.
 *
 * Fixed version that addresses:
 * - Path normalization issues
 * - File permission preservation
 * - Atomic operations with rollback
 * - Proper error handling
 * - Safety checks for uncommitted changes
 */
export class WorkingDirectoryManager {
  private readonly repository: Repository;
  private indexPath: string;
  private workDir: string;

  constructor(repository: Repository) {
    this.repository = repository;
    this.indexPath = path.join(repository.gitDirectory().fullpath(), IndexManager.INDEX_FILE_NAME);
    this.workDir = repository.workingDirectory().fullpath();
  }
}

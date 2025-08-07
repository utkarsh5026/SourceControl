import { SourceRepository } from '@/core/repo';
import { logger } from '../cli/logger';
import { PathScurry } from 'path-scurry';

/**
 * Get the repository object for the current working directory
 * @returns The repository object
 */
export const getRepo = async (): Promise<SourceRepository> => {
  const pathScurry = new PathScurry(process.cwd());
  const repository = await SourceRepository.findRepository(pathScurry.cwd);

  if (!repository) {
    logger.error('fatal: not a git repository (or any of the parent directories)');
    process.exit(1);
  }

  return repository;
};

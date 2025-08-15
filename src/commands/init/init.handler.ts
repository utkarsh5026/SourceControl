import { PathScurry } from 'path-scurry';
import { InitOptions } from './init.display';
import { SourceRepository } from '@/core/repo';
import {
  displayHeader,
  displayReinitializationInfo,
  displaySuccessMessage,
  displayRepositoryStructure,
  displayNextSteps,
} from './init.display';
import path from 'path';

/**
 * Initialize a repository with rich feedback using chalk, boxen, and ora
 */
export const initializeRepositoryWithFeedback = async (
  directory: string,
  options: InitOptions
): Promise<void> => {
  const targetPath = path.resolve(directory);
  const pathScurry = new PathScurry(targetPath);

  displayHeader();
  const { cwd } = pathScurry;
  const existingRepo = await SourceRepository.findRepository(cwd);
  if (existingRepo) {
    displayReinitializationInfo(existingRepo.workingDirectory().fullpath());
    return;
  }

  try {
    const repository = new SourceRepository();
    await repository.init(cwd);

    displaySuccessMessage(cwd.fullpath(), options);
    displayRepositoryStructure();
    displayNextSteps();
  } catch (error) {
    throw error;
  }
};

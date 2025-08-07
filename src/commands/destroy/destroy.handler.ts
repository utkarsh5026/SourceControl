import { SourceRepository } from '@/core/repo';
import { PathScurry } from 'path-scurry';
import {
  displayConfirmationPrompt,
  displayHeader,
  displayNoRepositoryInfo,
} from './destroy.display';
import fs from 'fs-extra';
import { displaySuccessMessage, displayWarningMessage } from './destroy.display';

/**
 * Destroy a repository with rich feedback using chalk, boxen, and ora
 */
export const destroyRepositoryWithFeedback = async (targetPath: PathScurry['cwd']) => {
  displayHeader();

  const existingRepo = await SourceRepository.findRepository(targetPath);
  if (!existingRepo) {
    displayNoRepositoryInfo(targetPath.toString());
    return;
  }

  const repoPath = existingRepo.workingDirectory().toString();
  const gitPath = existingRepo.gitDirectory().toString();

  await displayConfirmationPrompt(repoPath);

  try {
    await fs.remove(gitPath);
    displaySuccessMessage(repoPath);
    displayWarningMessage();
  } catch (error) {
    throw error;
  }
};

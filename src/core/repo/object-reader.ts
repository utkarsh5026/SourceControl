import { Repository } from './repo';
import { RepositoryException } from './exceptions';
import { BlobObject, CommitObject, TreeObject, ObjectValidator } from '@/core/objects';

export class ObjectReader {
  /**
   * Read and validate a commit object from the repository
   */
  public static async readCommit(repository: Repository, commitSha: string): Promise<CommitObject> {
    const obj = await repository.readObject(commitSha);
    if (!ObjectValidator.isCommit(obj)) {
      throw new RepositoryException(`Invalid commit: ${commitSha}`);
    }
    return obj;
  }

  /**
   * Read and validate a tree object from the repository
   */
  public static async readTree(repository: Repository, treeSha: string): Promise<TreeObject> {
    const obj = await repository.readObject(treeSha);
    if (!ObjectValidator.isTree(obj)) {
      throw new RepositoryException(`Invalid tree: ${treeSha}`);
    }
    return obj;
  }

  /**
   * Read and validate a blob object from the repository
   */
  public static async reabBlobOrThrow(
    repository: Repository,
    blobSha: string
  ): Promise<BlobObject> {
    const obj = await repository.readObject(blobSha);
    if (!ObjectValidator.isBlob(obj)) {
      throw new RepositoryException(`Invalid blob: ${blobSha}`);
    }
    return obj;
  }
}

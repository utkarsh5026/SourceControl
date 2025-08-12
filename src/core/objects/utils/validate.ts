import { GitObject, ObjectType } from '../base';
import { CommitObject } from '../commit/commit-object';
import { BlobObject } from '../blob/blob-object';
import { TreeObject } from '../tree/tree-object';

/**
 * Validates the type of a Git object.
 */
export class ObjectValidator {
  private constructor() {}

  /**
   * Checks if the object is a commit.
   */
  public static isCommit(object: GitObject): object is CommitObject {
    return object && object.type() === ObjectType.COMMIT;
  }

  /**
   * Checks if the object is a tree.
   */
  public static isTree(object: GitObject): object is TreeObject {
    return object && object.type() === ObjectType.TREE;
  }

  /**
   * Checks if the object is a blob.
   */
  public static isBlob(object: GitObject): object is BlobObject {
    return object && object.type() === ObjectType.BLOB;
  }
}

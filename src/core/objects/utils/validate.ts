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
  public static isCommit(object: GitObject | null): object is CommitObject {
    return ObjectValidator.isObjectType(object, ObjectType.COMMIT);
  }

  /**
   * Checks if the object is a tree.
   */
  public static isTree(object: GitObject | null): object is TreeObject {
    return ObjectValidator.isObjectType(object, ObjectType.TREE);
  }

  /**
   * Checks if the object is a blob.
   */
  public static isBlob(object: GitObject | null): object is BlobObject {
    return ObjectValidator.isObjectType(object, ObjectType.BLOB);
  }

  /**
   * Checks if the object is of a specific type.
   */
  private static isObjectType<T extends GitObject>(
    object: GitObject | null,
    type: ObjectType
  ): object is T {
    if (!object) return false;
    return object.type() === type;
  }
}

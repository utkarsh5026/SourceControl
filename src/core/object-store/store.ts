import { GitObject } from '../objects/base';
import { Path } from 'glob';

export interface ObjectStore {
  /**
   * Write an object to storage
   *
   * @param object The object to store
   * @return The SHA-1 hash of the stored object
   */
  writeObject(object: GitObject): Promise<string>;

  /**
   * Read an object from storage
   *
   * @param sha The SHA-1 hash of the object
   * @return The object if found, empty otherwise
   */
  readObject(sha: string): Promise<GitObject | null>;

  /**
   * Check if an object exists in storage
   *
   * @param sha The SHA-1 hash of the object
   * @return true if object exists, false otherwise
   */
  hasObject(sha: string): Promise<boolean>;

  /**
   * Initialize the object store
   *
   * @param gitDir The .git directory path
   */
  initialize(gitDir: Path): Promise<void>;
}

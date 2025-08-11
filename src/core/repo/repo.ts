import type { Path } from 'glob';
import type { GitObject } from '@/core/objects';
import type { ObjectStore } from '@/core/object-store';

/**
 * Abstract base class for Git repositories
 *
 * This class provides a common interface for interacting with Git repositories,
 * regardless of the underlying implementation.
 */
export abstract class Repository {
  /**
   * Initialize a new repository at the given path
   */
  abstract init(path: Path): Promise<void>;

  /**
   * Get the working directory path
   */
  abstract workingDirectory(): Path;

  /**
   * Get the .git directory path
   */
  abstract gitDirectory(): Path;

  /**
   * Get the object store
   */
  abstract objectStore(): ObjectStore;

  /**
   * Read an object from the repository
   */
  abstract readObject(sha: string): Promise<GitObject | null>;

  /**
   * Write an object to the repository
   */
  abstract writeObject(object: GitObject): Promise<string>;
}

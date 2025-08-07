import { Path } from 'glob';
import { Repository } from './repo';
import { ObjectStore, FileObjectStore } from '../object-store';
import { FileUtils } from '@/utils';
import { RepositoryException } from './exceptions';
import { GitObject } from '../objects';

/**
 * Git repository implementation that manages the complete Git repository
 * structure
 * and provides access to Git objects, references, and configuration.
 *
 * This class represents a standard Git repository with the following structure:
 * ┌─ <working-directory>/
 * │ ├─ .git/ ← Git metadata directory
 * │ │ ├─ objects/ ← Object storage (blobs, trees, commits, tags)
 * │ │ │ ├─ ab/ ← Object subdirectories (first 2 chars of SHA)
 * │ │ │ │ └─ cdef123... ← Object files (remaining 38 chars of SHA)
 * │ │ │ └─ ...
 * │ │ ├─ refs/ ← References (branches and tags)
 * │ │ │ ├─ heads/ ← Branch references
 * │ │ │ └─ tags/ ← Tag references
 * │ │ ├─ HEAD ← Current branch pointer
 * │ │ ├─ config ← Repository configuration
 * │ │ └─ description ← Repository description
 * │ ├─ file1.txt ← Working directory files
 * │ ├─ file2.txt
 * │ └─ ...
 *
 * The repository manages both the working directory (user files) and the Git
 * directory (metadata and object storage).
 */
export class SourceRepository extends Repository {
  private _workingDirectory: Path | null = null;
  private _gitDirectory: Path | null = null;
  private _objectStore: ObjectStore;

  private static DEFAULT_GIT_DIR = '.git';
  private static DEFAULT_OBJECTS_DIR = 'objects';
  private static DEFAULT_REFS_DIR = 'refs';
  private static DEFAULT_HEAD_FILE = 'HEAD';
  private static DEFAULT_DESCRIPTION_FILE = 'description';
  private static DEFAULT_CONFIG_FILE = 'config';

  constructor() {
    super();
    this._objectStore = new FileObjectStore();
  }

  /**
   * Initialize a new repository at the given path
   */
  override async init(path: Path): Promise<void> {
    try {
      this._workingDirectory = path.resolve();
      this._gitDirectory = this._workingDirectory.resolve(SourceRepository.DEFAULT_GIT_DIR);

      if (await Repository.exists(this._workingDirectory)) {
        throw new RepositoryException('Already a git repository: ' + this._workingDirectory);
      }
      const gitDir = this._gitDirectory;

      FileUtils.createDirectories(gitDir.toString());
      FileUtils.createDirectories(gitDir.resolve(SourceRepository.DEFAULT_OBJECTS_DIR).toString());
      FileUtils.createDirectories(gitDir.resolve(SourceRepository.DEFAULT_REFS_DIR).toString());

      FileUtils.createDirectories(
        gitDir.resolve(SourceRepository.DEFAULT_REFS_DIR).resolve('heads').toString()
      );
      FileUtils.createDirectories(
        gitDir.resolve(SourceRepository.DEFAULT_REFS_DIR).resolve('tags').toString()
      );

      this._objectStore.initialize(this._gitDirectory);
      this.createInitialFiles();
    } catch (e) {
      throw new RepositoryException('Failed to initialize repository');
    }
  }

  /**
   * Get the working directory path
   */
  override workingDirectory(): Path {
    if (!this._workingDirectory) {
      throw new RepositoryException('Repository not initialized');
    }
    return this._workingDirectory;
  }

  /**
   * Get the .git directory path
   */
  override gitDirectory(): Path {
    if (!this._gitDirectory) {
      throw new RepositoryException('Repository not initialized');
    }
    return this._gitDirectory;
  }

  /**
   * Get the object store
   */
  override objectStore(): ObjectStore {
    return this._objectStore;
  }

  /**
   * Read an object from the repository
   */
  override async readObject(sha: string): Promise<GitObject | null> {
    try {
      return this._objectStore.readObject(sha);
    } catch (e) {
      throw new RepositoryException('Failed to read object');
    }
  }

  /**
   * Write an object to the repository
   */
  override async writeObject(object: GitObject): Promise<string> {
    try {
      return this._objectStore.writeObject(object);
    } catch (e) {
      throw new RepositoryException('Failed to write object');
    }
  }

  /**
   * Find repository by walking up the directory tree from current path
   */
  public static async findRepository(startPath: Path): Promise<SourceRepository | null> {
    let current: Path | null = startPath.resolve();

    while (current != null) {
      if (await Repository.exists(current)) {
        const repo = new SourceRepository();
        repo._workingDirectory = current;
        repo._gitDirectory = current.resolve('.git');
        try {
          await repo._objectStore.initialize(repo._gitDirectory);
        } catch (e) {
          return null;
        }
        return repo;
      }
      current = current.parent || null;
    }

    return null;
  }

  /**
   * Create initial files for the repository
   */
  private async createInitialFiles() {
    if (!this._gitDirectory) {
      throw new RepositoryException('Repository not initialized');
    }

    const headContent = 'ref: refs/heads/master\n';
    await FileUtils.createFile(
      this._gitDirectory.resolve(SourceRepository.DEFAULT_HEAD_FILE).toString(),
      headContent
    );

    const description =
      "Unnamed repository; edit this file 'description' to name the repository.\n";
    await FileUtils.createFile(
      this._gitDirectory.resolve(SourceRepository.DEFAULT_DESCRIPTION_FILE).toString(),
      description
    );

    const config =
      '[core]\n' +
      '    repositoryformatversion = 0\n' +
      '    filemode = false\n' +
      '    bare = false\n';
    await FileUtils.createFile(
      this._gitDirectory.resolve(SourceRepository.DEFAULT_CONFIG_FILE).toString(),
      config
    );
  }
}

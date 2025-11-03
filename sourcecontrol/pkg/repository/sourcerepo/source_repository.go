package sourcerepo

import (
	"fmt"
	"os"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/blob"
	"github.com/utkarsh5026/SourceControl/pkg/objects/commit"
	"github.com/utkarsh5026/SourceControl/pkg/objects/tree"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/store"
)

// SourceRepository is a Git repository implementation that manages the complete Git repository
// structure and provides access to Git objects, references, and configuration.
//
// This struct represents a standard Git repository with the following structure:
//
//	┌─ <working-directory>/
//	│ ├─ .source/ ← Git metadata directory
//	│ │ ├─ objects/ ← Object storage (blobs, trees, commits, tags)
//	│ │ │ ├─ ab/ ← Object subdirectories (first 2 chars of SHA)
//	│ │ │ │ └─ cdef123... ← Object files (remaining 38 chars of SHA)
//	│ │ │ └─ ...
//	│ │ ├─ refs/ ← References (branches and tags)
//	│ │ │ ├─ heads/ ← Branch references
//	│ │ │ └─ tags/ ← Tag references
//	│ │ ├─ HEAD ← Current branch pointer
//	│ │ ├─ config ← Repository configuration
//	│ │ └─ description ← Repository description
//	│ ├─ file1.txt ← Working directory files
//	│ ├─ file2.txt
//	│ └─ ...
//
// The repository manages both the working directory (user files) and the Source
// directory (metadata and object storage).
//
// Fields:
//   - workingDir: The root directory of the repository where user files are stored
//   - sourceDir: The .source directory containing all Git metadata and objects
//   - objectStore: Interface for reading and writing Git objects (blobs, trees, commits, tags)
//   - initialized: Flag indicating whether the repository has been properly initialized
//
// Thread Safety:
// This struct is not thread-safe. External synchronization is required when
// accessing a SourceRepository instance from multiple goroutines.
type SourceRepository struct {
	workingDir  scpath.RepositoryPath
	sourceDir   scpath.SourcePath
	objectStore store.ObjectStore
	initialized bool
}

// NewSourceRepository creates a new SourceRepository instance in an uninitialized state.
//
// The returned repository must be initialized by calling Initialize() before use.
// The repository is configured with a FileObjectStore for persistent object storage.
//
// Returns:
//   - *SourceRepository: A new uninitialized repository instance
//
// Example:
//
//	repo := NewSourceRepository()
//	if err := repo.Initialize(scpath.RepositoryPath("/path/to/repo")); err != nil {
//	    log.Fatal(err)
//	}
func NewSourceRepository() *SourceRepository {
	return &SourceRepository{
		objectStore: store.NewFileObjectStore(),
		initialized: false,
	}
}

// Initialize creates a new repository at the given path.
//
// This method sets up the complete repository structure including all necessary
// directories and initial configuration files. It will fail if a repository
// already exists at the specified path.
//
// Directory structure created:
//   - .source/              (main Git metadata directory)
//   - .source/objects/      (object database for blobs, trees, commits, tags)
//   - .source/refs/         (references directory)
//   - .source/refs/heads/   (branch references)
//   - .source/refs/tags/    (tag references)
//
// Files created:
//   - .source/HEAD          (points to refs/heads/master by default)
//   - .source/config        (repository configuration with core settings)
//   - .source/description   (human-readable repository description)
//
// Parameters:
//   - path: The directory path where the repository should be initialized
//
// Returns:
//   - error: nil on success, or an error if:
//   - A repository already exists at the path
//   - Directory creation fails
//   - Object store initialization fails
//   - Initial file creation fails
//
// Example:
//
//	repo := NewSourceRepository()
//	err := repo.Initialize(scpath.RepositoryPath("/path/to/new/repo"))
//	if err != nil {
//	    log.Fatalf("Failed to initialize repository: %v", err)
//	}
func (sr *SourceRepository) Initialize(path scpath.RepositoryPath) error {
	exists, err := RepositoryExists(path)
	if err != nil {
		return fmt.Errorf("failed to check if repository exists: %w", err)
	}
	if exists {
		return fmt.Errorf("already a source repository: %s", path)
	}

	sr.workingDir = path
	sr.sourceDir = path.SourcePath()

	if err := sr.createDirectories(); err != nil {
		return fmt.Errorf("failed to create directories: %w", err)
	}

	if err := sr.objectStore.Initialize(sr.workingDir); err != nil {
		return fmt.Errorf("failed to initialize object store: %w", err)
	}

	// Create initial files
	if err := sr.createInitialFiles(); err != nil {
		return fmt.Errorf("failed to create initial files: %w", err)
	}

	sr.initialized = true
	return nil
}

// WorkingDirectory returns the path to the repository's working directory.
//
// The working directory is the root directory of the repository where user files
// and directories are stored. It is the parent directory of the .source folder.
//
// Returns:
//   - scpath.RepositoryPath: The absolute path to the working directory
//
// Panics:
//   - If the repository has not been initialized via Initialize()
//
// Example:
//
//	repo := NewSourceRepository()
//	repo.Initialize(scpath.RepositoryPath("/home/user/myrepo"))
//	workDir := repo.WorkingDirectory() // Returns "/home/user/myrepo"
func (sr *SourceRepository) WorkingDirectory() scpath.RepositoryPath {
	if !sr.initialized {
		panic("repository not initialized")
	}
	return sr.workingDir
}

// SourceDirectory returns the path to the .source metadata directory.
//
// The .source directory contains all Git metadata including objects, references,
// configuration files, and the HEAD pointer. This is equivalent to the .git
// directory in standard Git repositories.
//
// Returns:
//   - scpath.SourcePath: The absolute path to the .source directory
//
// Panics:
//   - If the repository has not been initialized via Initialize()
func (sr *SourceRepository) SourceDirectory() scpath.SourcePath {
	if !sr.initialized {
		panic("repository not initialized")
	}
	return sr.sourceDir
}

// ObjectStore returns the object store for this repository.
//
// The object store provides the interface for reading and writing Git objects
// (blobs, trees, commits, and tags) to persistent storage.
//
// Returns:
//   - store.ObjectStore: The object store instance used by this repository
func (sr *SourceRepository) ObjectStore() store.ObjectStore {
	return sr.objectStore
}

// ReadObject reads a Git object by its SHA-1 hash from the object store.
//
// This method retrieves and deserializes a Git object (blob, tree, commit, or tag)
// from the repository's object database. The object is identified by its SHA-1
// hash, which is computed from the object's content.
//
// Parameters:
//   - hash: The SHA-1 hash of the object to read (40 character hex string)
//
// Returns:
//   - objects.BaseObject: The deserialized Git object
//   - error: nil on success, or an error if:
//   - The repository is not initialized
//   - The object does not exist
//   - The object file is corrupted
//   - Deserialization fails
//
// Example:
//
//	hash := objects.ObjectHash("a1b2c3d4e5f6...")
//	obj, err := repo.ReadObject(hash)
//	if err != nil {
//	    log.Fatalf("Failed to read object: %v", err)
//	}
//	fmt.Printf("Object type: %s\n", obj.Type())
func (sr *SourceRepository) ReadObject(hash objects.ObjectHash) (objects.BaseObject, error) {
	if !sr.initialized {
		return nil, fmt.Errorf("repository not initialized")
	}

	obj, err := sr.objectStore.ReadObject(hash)
	if err != nil {
		return nil, fmt.Errorf("failed to read object: %w", err)
	}
	return obj, nil
}

// WriteObject writes a Git object to the repository and returns its SHA-1 hash.
//
// This method serializes a Git object (blob, tree, commit, or tag) and stores it
// in the repository's object database. The object is content-addressable, meaning
// its SHA-1 hash is computed from its content and serves as its unique identifier.
//
// The object is stored in the following location:
//
//	.source/objects/<first-2-chars-of-hash>/<remaining-38-chars-of-hash>
//
// Parameters:
//   - obj: The Git object to write (must implement objects.BaseObject interface)
//
// Returns:
//   - objects.ObjectHash: The SHA-1 hash of the written object
//   - error: nil on success, or an error if:
//   - The repository is not initialized
//   - Serialization fails
//   - File system write fails
//   - Hash computation fails
//
// Example:
//
//	blob := objects.NewBlob([]byte("Hello, World!"))
//	hash, err := repo.WriteObject(blob)
//	if err != nil {
//	    log.Fatalf("Failed to write object: %v", err)
//	}
//	fmt.Printf("Object written with hash: %s\n", hash)
func (sr *SourceRepository) WriteObject(obj objects.BaseObject) (objects.ObjectHash, error) {
	if !sr.initialized {
		return "", fmt.Errorf("repository not initialized")
	}

	hash, err := sr.objectStore.WriteObject(obj)
	if err != nil {
		return "", fmt.Errorf("failed to write object: %w", err)
	}
	return hash, nil
}

// Exists checks if a valid repository exists at the working directory.
//
// This method verifies that a .source directory exists at the working directory
// path and contains the necessary repository structure.
//
// Returns:
//   - bool: true if a valid repository exists, false otherwise
//   - error: nil on success, or an error if:
//   - The repository is not initialized
//   - File system access fails
func (sr *SourceRepository) Exists() (bool, error) {
	if !sr.initialized {
		return false, fmt.Errorf("repository not initialized")
	}
	return RepositoryExists(sr.workingDir)
}

// IsInitialized returns whether the repository has been properly initialized.
//
// A repository is considered initialized after a successful call to Initialize().
// This flag indicates that all directory structures and initial files have been
// created, and the repository is ready for use.
//
// Returns:
//   - bool: true if Initialize() has been successfully called, false otherwise
func (sr *SourceRepository) IsInitialized() bool {
	return sr.initialized
}

// createDirectories creates all necessary directories for the repository structure.
//
// This internal method creates the complete directory hierarchy required for a
// Git repository, including the main .source directory and all subdirectories
// for objects and references.
//
// Directories created:
//   - .source/              (main metadata directory)
//   - .source/objects/      (object database)
//   - .source/refs/         (references root)
//   - .source/refs/heads/   (branch references)
//   - .source/refs/tags/    (tag references)
//
// All directories are created with permissions 0755 (rwxr-xr-x).
//
// Returns:
//   - error: nil on success, or an error if any directory creation fails
func (sr *SourceRepository) createDirectories() error {
	directories := []scpath.SourcePath{
		sr.sourceDir,
		sr.sourceDir.ObjectsPath(),
		sr.sourceDir.RefsPath(),
		sr.sourceDir.RefsPath().Join(scpath.HeadsDir),
		sr.sourceDir.RefsPath().Join(scpath.TagsDir),
	}

	for _, dir := range directories {
		if err := os.MkdirAll(dir.String(), 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	return nil
}

// createInitialFiles creates the initial configuration and metadata files for a new repository.
//
// This internal method creates three essential files that every Git repository needs:
//
//  1. HEAD: Points to the current branch (initially refs/heads/master)
//  2. description: Contains a human-readable description of the repository
//  3. config: Contains the repository configuration in Git INI format
//
// The config file includes:
//   - repositoryformatversion = 0 (Git object format version)
//   - filemode = false (disable executable bit tracking on Windows)
//   - bare = false (this is a repository with a working directory)
//
// All files are created with permissions 0644 (rw-r--r--).
//
// Returns:
//   - error: nil on success, or an error if any file creation fails
func (sr *SourceRepository) createInitialFiles() error {
	files := []struct {
		path    scpath.SourcePath
		content string
		name    string
	}{
		{
			path:    sr.sourceDir.HeadPath(),
			content: "ref: refs/heads/master\n",
			name:    "HEAD",
		},
		{
			path:    sr.sourceDir.Join("description"),
			content: "Unnamed repository; edit this file 'description' to name the repository.\n",
			name:    "description",
		},
		{
			path: sr.sourceDir.ConfigPath(),
			content: `[core]
    repositoryformatversion = 0
    filemode = false
    bare = false
`,
			name: "config",
		},
	}

	for _, file := range files {
		if err := os.WriteFile(file.path.String(), []byte(file.content), 0644); err != nil {
			return fmt.Errorf("failed to create %s file: %w", file.name, err)
		}
	}

	return nil
}

// ReadBlobObject reads and validates a blob object from the repository.
//
// This method retrieves a Git blob object by its SHA-1 hash and ensures that
// the retrieved object is actually a blob (not a tree, commit, or tag).
// Blobs represent file contents in Git's object database.
//
// Parameters:
//   - blobSHA: The SHA-1 hash of the blob object to read
//
// Returns:
//   - *objects.Blob: The validated blob object containing file content
//   - error: nil on success, or an error if:
//   - The object cannot be read from the object store
//   - The object exists but is not a blob type
//   - The repository is not initialized
func (sr *SourceRepository) ReadBlobObject(blobSHA objects.ObjectHash) (*blob.Blob, error) {
	obj, err := sr.ReadObject(blobSHA)
	if err != nil {
		return nil, fmt.Errorf("read blob %s: %w", blobSHA.Short(), err)
	}

	blobObj, ok := obj.(*blob.Blob)
	if !ok {
		return nil, fmt.Errorf("object %s is not a blob", blobSHA.Short())
	}

	return blobObj, nil
}

// ReadTreeObject reads and validates a tree object from the repository.
//
// This method retrieves a Git tree object by its SHA-1 hash and ensures that
// the retrieved object is actually a tree (not a blob, commit, or tag).
// Trees represent directory structures in Git's object database.
//
// Parameters:
//   - treeSHA: The SHA-1 hash of the tree object to read
//
// Returns:
//   - *tree.Tree: The validated tree object containing directory entries
//   - error: nil on success, or an error if:
//   - The object cannot be read from the object store
//   - The object exists but is not a tree type
//   - The repository is not initialized
func (sr *SourceRepository) ReadTreeObject(treeSHA objects.ObjectHash) (*tree.Tree, error) {
	obj, err := sr.ReadObject(treeSHA)
	if err != nil {
		return nil, fmt.Errorf("read tree %s: %w", treeSHA.Short(), err)
	}

	treeObj, ok := obj.(*tree.Tree)
	if !ok {
		return nil, fmt.Errorf("object %s is not a tree", treeSHA.Short())
	}

	return treeObj, nil
}

// ReadCommitObject reads and validates a commit object from the repository.
//
// This method retrieves a Git commit object by its SHA-1 hash and ensures that
// the retrieved object is actually a commit (not a blob, tree, or tag).
// Commits represent snapshots in the repository's history.
//
// Parameters:
//   - commitSHA: The SHA-1 hash of the commit object to read
//
// Returns:
//   - *commit.Commit: The validated commit object containing metadata and tree reference
//   - error: nil on success, or an error if:
//   - The object cannot be read from the object store
//   - The object exists but is not a commit type
//   - The repository is not initialized
func (sr *SourceRepository) ReadCommitObject(commitSHA objects.ObjectHash) (*commit.Commit, error) {
	obj, err := sr.ReadObject(commitSHA)
	if err != nil {
		return nil, fmt.Errorf("read commit %s: %w", commitSHA.Short(), err)
	}

	commitObj, ok := obj.(*commit.Commit)
	if !ok {
		return nil, fmt.Errorf("object %s is not a commit", commitSHA.Short())
	}

	return commitObj, nil
}

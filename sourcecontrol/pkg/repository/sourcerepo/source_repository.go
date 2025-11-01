package sourcerepo

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/store"
)

// SourceRepository is a Git repository implementation that manages the complete Git repository
// structure and provides access to Git objects, references, and configuration.
//
// This struct represents a standard Git repository with the following structure:
// ┌─ <working-directory>/
// │ ├─ .source/ ← Git metadata directory
// │ │ ├─ objects/ ← Object storage (blobs, trees, commits, tags)
// │ │ │ ├─ ab/ ← Object subdirectories (first 2 chars of SHA)
// │ │ │ │ └─ cdef123... ← Object files (remaining 38 chars of SHA)
// │ │ │ └─ ...
// │ │ ├─ refs/ ← References (branches and tags)
// │ │ │ ├─ heads/ ← Branch references
// │ │ │ └─ tags/ ← Tag references
// │ │ ├─ HEAD ← Current branch pointer
// │ │ ├─ config ← Repository configuration
// │ │ └─ description ← Repository description
// │ ├─ file1.txt ← Working directory files
// │ ├─ file2.txt
// │ └─ ...
//
// The repository manages both the working directory (user files) and the Source
// directory (metadata and object storage).
type SourceRepository struct {
	workingDir  scpath.RepositoryPath
	sourceDir   scpath.WorkingPath
	objectStore store.ObjectStore
	initialized bool
}

// NewSourceRepository creates a new SourceRepository instance
func NewSourceRepository() *SourceRepository {
	return &SourceRepository{
		objectStore: store.NewFileObjectStore(),
		initialized: false,
	}
}

// Initialize creates a new repository at the given path.
// It creates all necessary directory structures and initial files.
//
// Directory structure created:
// - .source/
// - .source/objects/
// - .source/refs/
// - .source/refs/heads/
// - .source/refs/tags/
//
// Files created:
// - .source/HEAD (points to refs/heads/master)
// - .source/config (repository configuration)
// - .source/description (repository description)
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

	// Create directory structure
	if err := sr.createDirectories(); err != nil {
		return fmt.Errorf("failed to create directories: %w", err)
	}

	// Initialize object store
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

// WorkingDirectory returns the path to the repository's working directory
func (sr *SourceRepository) WorkingDirectory() scpath.RepositoryPath {
	if !sr.initialized {
		panic("repository not initialized")
	}
	return sr.workingDir
}

// SourceDirectory returns the path to the .source directory
func (sr *SourceRepository) SourceDirectory() scpath.WorkingPath {
	if !sr.initialized {
		panic("repository not initialized")
	}
	return sr.sourceDir
}

// ObjectStore returns the object store for this repository
func (sr *SourceRepository) ObjectStore() store.ObjectStore {
	return sr.objectStore
}

// ReadObject reads a Git object by its SHA-1 hash
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

// WriteObject writes a Git object to the repository and returns its hash
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

// Exists checks if a repository exists at the working directory
func (sr *SourceRepository) Exists() (bool, error) {
	if !sr.initialized {
		return false, fmt.Errorf("repository not initialized")
	}
	return RepositoryExists(sr.workingDir)
}

// IsInitialized returns whether the repository has been initialized
func (sr *SourceRepository) IsInitialized() bool {
	return sr.initialized
}

// createDirectories creates all necessary directories for the repository
func (sr *SourceRepository) createDirectories() error {
	directories := []scpath.WorkingPath{
		sr.sourceDir,
		sr.workingDir.ObjectsPath(),
		sr.workingDir.RefsPath(),
		sr.workingDir.RefsPath().Join("heads"),
		sr.workingDir.RefsPath().Join("tags"),
	}

	for _, dir := range directories {
		if err := os.MkdirAll(dir.String(), 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	return nil
}

// createInitialFiles creates the initial files for a new repository
func (sr *SourceRepository) createInitialFiles() error {
	// Create HEAD file
	headContent := "ref: refs/heads/master\n"
	headPath := sr.workingDir.HeadPath()
	if err := os.WriteFile(headPath.String(), []byte(headContent), 0644); err != nil {
		return fmt.Errorf("failed to create HEAD file: %w", err)
	}

	// Create description file
	descriptionContent := "Unnamed repository; edit this file 'description' to name the repository.\n"
	descriptionPath := sr.sourceDir.Join("description")
	if err := os.WriteFile(descriptionPath.String(), []byte(descriptionContent), 0644); err != nil {
		return fmt.Errorf("failed to create description file: %w", err)
	}

	// Create config file
	configContent := `[core]
    repositoryformatversion = 0
    filemode = false
    bare = false
`
	configPath := sr.workingDir.ConfigPath()
	if err := os.WriteFile(configPath.String(), []byte(configContent), 0644); err != nil {
		return fmt.Errorf("failed to create config file: %w", err)
	}

	return nil
}

// FindRepository finds a repository by walking up the directory tree from the start path.
// It returns the first repository found, or nil if no repository is found.
//
// The search starts at startPath and walks up the directory tree until:
// 1. A repository is found (directory containing .source)
// 2. The root of the filesystem is reached
//
// Example:
// If startPath is /home/user/project/src/main and a repository exists at /home/user/project,
// this function will find and return that repository.
func FindRepository(startPath scpath.RepositoryPath) (*SourceRepository, error) {
	currentPath := startPath.String()

	for {
		// Check if repository exists at current path
		repoPath, err := scpath.NewRepositoryPath(currentPath)
		if err != nil {
			return nil, fmt.Errorf("failed to create repository path: %w", err)
		}

		exists, err := RepositoryExists(repoPath)
		if err != nil {
			return nil, fmt.Errorf("failed to check repository existence: %w", err)
		}

		if exists {
			// Found a repository, initialize and return it
			repo := NewSourceRepository()
			repo.workingDir = repoPath
			repo.sourceDir = repoPath.SourcePath()

			// Initialize the object store
			if err := repo.objectStore.Initialize(repoPath); err != nil {
				return nil, fmt.Errorf("failed to initialize object store: %w", err)
			}

			repo.initialized = true
			return repo, nil
		}

		// Move up one directory
		parentPath := filepath.Dir(currentPath)

		// Check if we've reached the root
		if parentPath == currentPath {
			// We've reached the root and found nothing
			return nil, nil
		}

		currentPath = parentPath
	}
}

// RepositoryExists checks if a repository exists at the given path
// by checking for the existence of the .source directory
func RepositoryExists(path scpath.RepositoryPath) (bool, error) {
	sourcePath := path.SourcePath()
	info, err := os.Stat(sourcePath.String())

	if os.IsNotExist(err) {
		return false, nil
	}

	if err != nil {
		return false, fmt.Errorf("failed to check .source directory: %w", err)
	}

	return info.IsDir(), nil
}

// Open opens an existing repository at the given path
// Returns an error if the repository doesn't exist
func Open(path scpath.RepositoryPath) (*SourceRepository, error) {
	exists, err := RepositoryExists(path)
	if err != nil {
		return nil, fmt.Errorf("failed to check repository existence: %w", err)
	}

	if !exists {
		return nil, fmt.Errorf("not a source repository: %s", path)
	}

	repo := NewSourceRepository()
	repo.workingDir = path
	repo.sourceDir = path.SourcePath()

	// Initialize the object store
	if err := repo.objectStore.Initialize(path); err != nil {
		return nil, fmt.Errorf("failed to initialize object store: %w", err)
	}

	repo.initialized = true
	return repo, nil
}

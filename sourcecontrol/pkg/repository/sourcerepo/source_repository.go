package sourcerepo

import (
	"fmt"
	"os"

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
	files := []struct {
		path    string
		content string
		name    string
	}{
		{
			path:    sr.workingDir.HeadPath().String(),
			content: "ref: refs/heads/master\n",
			name:    "HEAD",
		},
		{
			path:    sr.sourceDir.Join("description").String(),
			content: "Unnamed repository; edit this file 'description' to name the repository.\n",
			name:    "description",
		},
		{
			path: sr.workingDir.ConfigPath().String(),
			content: `[core]
    repositoryformatversion = 0
    filemode = false
    bare = false
`,
			name: "config",
		},
	}

	for _, file := range files {
		if err := os.WriteFile(file.path, []byte(file.content), 0644); err != nil {
			return fmt.Errorf("failed to create %s file: %w", file.name, err)
		}
	}

	return nil
}

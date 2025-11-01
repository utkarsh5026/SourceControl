package sourcerepo

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

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
		repoPath, err := scpath.NewRepositoryPath(currentPath)
		if err != nil {
			return nil, fmt.Errorf("failed to create repository path: %w", err)
		}

		exists, err := RepositoryExists(repoPath)
		if err != nil {
			return nil, fmt.Errorf("failed to check repository existence: %w", err)
		}

		if exists {
			repo := NewSourceRepository()
			repo.workingDir = repoPath
			repo.sourceDir = repoPath.SourcePath()

			if err := repo.objectStore.Initialize(repoPath); err != nil {
				return nil, fmt.Errorf("failed to initialize object store: %w", err)
			}

			repo.initialized = true
			return repo, nil
		}

		parentPath := filepath.Dir(currentPath)

		if parentPath == currentPath {
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

	if err := repo.objectStore.Initialize(path); err != nil {
		return nil, fmt.Errorf("failed to initialize object store: %w", err)
	}

	repo.initialized = true
	return repo, nil
}

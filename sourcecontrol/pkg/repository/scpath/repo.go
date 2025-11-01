package scpath

import (
	"fmt"
	"path/filepath"
)

// String returns the path as a string
func (rp RepositoryPath) String() string {
	return string(rp)
}

// IsValid checks if this is a valid absolute path
func (rp RepositoryPath) IsValid() bool {
	return filepath.IsAbs(string(rp))
}

// Join joins path elements to the repository path
func (rp RepositoryPath) Join(elem ...string) WorkingPath {
	parts := append([]string{string(rp)}, elem...)
	return WorkingPath(filepath.Join(parts...))
}

// SourcePath returns the path to the .source directory
func (rp RepositoryPath) SourcePath() WorkingPath {
	return rp.Join(SourceDir)
}

// ObjectsPath returns the path to the objects directory
func (rp RepositoryPath) ObjectsPath() WorkingPath {
	return rp.Join(SourceDir, ObjectsDir)
}

// RefsPath returns the path to the refs directory
func (rp RepositoryPath) RefsPath() WorkingPath {
	return rp.Join(SourceDir, RefsDir)
}

// IndexPath returns the path to the index file
func (rp RepositoryPath) IndexPath() IndexPath {
	return IndexPath(rp.Join(SourceDir, IndexFile))
}

// ConfigPath returns the path to the config file
func (rp RepositoryPath) ConfigPath() ConfigPath {
	return ConfigPath(rp.Join(SourceDir, ConfigFile))
}

// HeadPath returns the path to the HEAD file
func (rp RepositoryPath) HeadPath() WorkingPath {
	return rp.Join(SourceDir, HeadFile)
}

// NewRepositoryPath creates a new RepositoryPath from a string
func NewRepositoryPath(path string) (RepositoryPath, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("failed to get absolute path: %w", err)
	}
	return RepositoryPath(absPath), nil
}

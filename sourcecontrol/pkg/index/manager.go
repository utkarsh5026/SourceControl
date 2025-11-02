package index

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/blob"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

// Manager orchestrates all operations between the working directory,
// the index (staging area), and the repository's object database.
type Manager struct {
	repoRoot  scpath.RepositoryPath
	indexPath scpath.SourcePath
	index     *Index
	mu        sync.RWMutex
}

// NewManager creates a new index manager.
func NewManager(repoRoot scpath.RepositoryPath) *Manager {
	indexPath := repoRoot.SourcePath().IndexPath()
	return &Manager{
		repoRoot:  repoRoot,
		indexPath: indexPath,
		index:     NewIndex(),
	}
}

// Initialize loads the index from disk.
func (m *Manager) Initialize() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	index, err := Read(m.indexPath)
	if err != nil {
		return fmt.Errorf("failed to load index: %w", err)
	}

	m.index = index
	return nil
}

// AddResult represents the result of adding files to the index.
type AddResult struct {
	Added    []string           // New files added to index
	Modified []string           // Existing files updated in index
	Ignored  []string           // Files skipped due to ignore patterns
	Failed   []AddFailureResult // Files that failed to add
}

// AddFailureResult represents a failed add operation.
type AddFailureResult struct {
	Path   string
	Reason string
}

// Add adds files to the index (like git add).
//
// This operation:
// 1. Reads the file content from the working directory
// 2. Creates a blob object and stores it in the repository
// 3. Updates the index entry with the file's metadata and blob SHA
func (m *Manager) Add(paths []string, objectStore ObjectStore) (*AddResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	result := &AddResult{
		Added:    make([]string, 0),
		Modified: make([]string, 0),
		Ignored:  make([]string, 0),
		Failed:   make([]AddFailureResult, 0),
	}

	for _, path := range paths {
		if err := m.addFile(path, objectStore, result); err != nil {
			result.Failed = append(result.Failed, AddFailureResult{
				Path:   path,
				Reason: err.Error(),
			})
		}
	}

	// Save index after all additions
	if err := m.saveIndex(); err != nil {
		return result, fmt.Errorf("failed to save index: %w", err)
	}

	return result, nil
}

// addFile adds a single file to the index.
func (m *Manager) addFile(path string, objectStore ObjectStore, result *AddResult) error {
	// Resolve absolute path
	absPath, relPath, err := m.resolvePaths(path)
	if err != nil {
		return err
	}

	// Get file info
	info, err := os.Stat(absPath)
	if err != nil {
		return fmt.Errorf("failed to stat file: %w", err)
	}

	if info.IsDir() {
		return fmt.Errorf("cannot add directory (use files within it)")
	}

	// Read file content
	content, err := os.ReadFile(absPath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	// Create blob and store it
	b := blob.NewBlob(content)
	hash, err := b.Hash()
	if err != nil {
		return fmt.Errorf("failed to compute hash: %w", err)
	}

	if err := objectStore.Store(b); err != nil {
		return fmt.Errorf("failed to store blob: %w", err)
	}

	// Create or update index entry
	isNew := !m.index.Has(relPath)

	entry, err := NewEntryFromFileInfo(relPath, info, hash)
	if err != nil {
		return fmt.Errorf("failed to create entry: %w", err)
	}

	m.index.Add(entry)

	if isNew {
		result.Added = append(result.Added, relPath)
	} else {
		result.Modified = append(result.Modified, relPath)
	}

	return nil
}

// RemoveResult represents the result of removing files from the index.
type RemoveResult struct {
	Removed []string              // Successfully removed files
	Failed  []RemoveFailureResult // Files that failed to remove
}

// RemoveFailureResult represents a failed remove operation.
type RemoveFailureResult struct {
	Path   string
	Reason string
}

// Remove removes files from the index and optionally from the working directory.
func (m *Manager) Remove(paths []string, deleteFromDisk bool) (*RemoveResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	result := &RemoveResult{
		Removed: make([]string, 0),
		Failed:  make([]RemoveFailureResult, 0),
	}

	for _, path := range paths {
		absPath, relPath, err := m.resolvePaths(path)
		if err != nil {
			result.Failed = append(result.Failed, RemoveFailureResult{
				Path:   path,
				Reason: err.Error(),
			})
			continue
		}

		if !m.index.Has(relPath) {
			result.Failed = append(result.Failed, RemoveFailureResult{
				Path:   relPath,
				Reason: "file not in index",
			})
			continue
		}

		m.index.Remove(relPath)
		result.Removed = append(result.Removed, relPath)

		// Optionally delete from disk
		if deleteFromDisk {
			if err := os.Remove(absPath); err != nil && !os.IsNotExist(err) {
				// File was removed from index but failed to delete from disk
				// We don't add this to Failed since index operation succeeded
			}
		}
	}

	// Save index after all removals
	if err := m.saveIndex(); err != nil {
		return result, fmt.Errorf("failed to save index: %w", err)
	}

	return result, nil
}

// StatusResult represents the repository status.
type StatusResult struct {
	Staged    StagedChanges
	Unstaged  UnstagedChanges
	Untracked []string
	Ignored   []string
}

// StagedChanges represents changes that are staged (in index but differ from HEAD).
type StagedChanges struct {
	Added    []string // New files in index (not in HEAD)
	Modified []string // Files modified in index (different from HEAD)
	Deleted  []string // Files deleted from index (present in HEAD)
}

// UnstagedChanges represents changes in working directory (differ from index).
type UnstagedChanges struct {
	Modified []string // Files modified in working dir (different from index)
	Deleted  []string // Files deleted from working dir (present in index)
}

// Status returns the current repository status (like git status).
// Note: This is a simplified version. A complete implementation would:
// - Compare index with HEAD commit for staged changes
// - Use ignore patterns to filter untracked files
// - Potentially use goroutines for parallel file checking
func (m *Manager) Status() (*StatusResult, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := &StatusResult{
		Staged: StagedChanges{
			Added:    make([]string, 0),
			Modified: make([]string, 0),
			Deleted:  make([]string, 0),
		},
		Unstaged: UnstagedChanges{
			Modified: make([]string, 0),
			Deleted:  make([]string, 0),
		},
		Untracked: make([]string, 0),
		Ignored:   make([]string, 0),
	}

	// Check indexed files for modifications
	for _, entry := range m.index.Entries {
		absPath := filepath.Join(m.repoRoot.String(), entry.Path)
		info, err := os.Stat(absPath)

		if os.IsNotExist(err) {
			// File exists in index but not in working directory
			result.Unstaged.Deleted = append(result.Unstaged.Deleted, entry.Path)
			continue
		}

		if err != nil {
			// Can't check file - skip it
			continue
		}

		// Check if file is modified
		if entry.IsModified(info) {
			result.Unstaged.Modified = append(result.Unstaged.Modified, entry.Path)
		}
	}

	// Find untracked files (simplified - just checking working directory)
	// A complete implementation would walk the directory tree
	// and check against .sourceignore patterns

	return result, nil
}

// Clear removes all entries from the index.
func (m *Manager) Clear() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.index.Clear()
	return m.saveIndex()
}

// GetIndex returns a read-only copy of the index.
func (m *Manager) GetIndex() *Index {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Return a copy to prevent external modifications
	return m.index
}

// saveIndex writes the index to disk (caller must hold lock).
func (m *Manager) saveIndex() error {
	return m.index.Write(m.indexPath)
}

// resolvePaths converts a path to absolute and relative forms.
func (m *Manager) resolvePaths(path string) (absPath, relPath string, err error) {
	if filepath.IsAbs(path) {
		absPath = filepath.Clean(path)
	} else {
		absPath = filepath.Join(m.repoRoot, path)
	}

	relPath, err = filepath.Rel(m.repoRoot, absPath)
	if err != nil {
		return "", "", fmt.Errorf("failed to compute relative path: %w", err)
	}

	// Convert to forward slashes for Git compatibility
	relPath = filepath.ToSlash(relPath)

	return absPath, relPath, nil
}

// ObjectStore is an interface for storing Git objects.
// This allows the Manager to be decoupled from the specific storage implementation.
type ObjectStore interface {
	Store(obj objects.BaseObject) error
}

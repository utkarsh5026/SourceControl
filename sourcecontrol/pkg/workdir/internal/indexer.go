package internal

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/utkarsh5026/SourceControl/pkg/index"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

// IndexUpdater implements the IndexUpdater interface for synchronizing the Git index.
type IndexUpdater struct {
	workDir   string
	indexPath scpath.AbsolutePath
}

// NewUpdater creates a new index updater
func NewUpdater(workDir string, indexPath scpath.AbsolutePath) *IndexUpdater {
	return &IndexUpdater{
		workDir:   workDir,
		indexPath: indexPath,
	}
}

// UpdateToMatch replaces the entire index to match the target files.
// This is used after checking out a commit or branch.
func (u *IndexUpdater) UpdateToMatch(targetFiles map[scpath.RelativePath]FileInfo) (IndexUpdateResult, error) {
	result := IndexUpdateResult{
		Success:        true,
		EntriesUpdated: 0,
		EntriesRemoved: 0,
		Errors:         []error{},
	}

	newIndex := index.NewIndex()

	for path, info := range targetFiles {
		entry, err := u.createIndexEntry(path, info)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Errorf("create entry for %s: %w", path, err))
			result.Success = false
			continue
		}

		newIndex.Add(entry)
		result.EntriesUpdated++
	}

	if result.Success {
		if err := newIndex.Write(u.indexPath); err != nil {
			result.Success = false
			result.Errors = append(result.Errors, fmt.Errorf("index %s failed (%s): %w", "write", u.indexPath.String(), err))
			return result, err
		}
	}

	return result, nil
}

// UpdateIncremental applies specific additions and removals to the existing index.
// This is more efficient than replacing the entire index.
func (u *IndexUpdater) UpdateIncremental(toAdd FileMap, toRemove []scpath.RelativePath) (IndexUpdateResult, error) {
	result := IndexUpdateResult{
		Success:        true,
		EntriesUpdated: 0,
		EntriesRemoved: 0,
		Errors:         []error{},
	}

	idx, err := index.Read(u.indexPath)
	if err != nil {
		return result, fmt.Errorf("index %s failed (%s): %w", "read", u.indexPath.String(), err)
	}

	for _, path := range toRemove {
		if idx.Remove(path) {
			result.EntriesRemoved++
		}
	}

	for path, info := range toAdd {
		entry, err := u.createIndexEntry(path, info)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Errorf("create entry for %s: %w", path, err))
			result.Success = false
			continue
		}

		idx.Add(entry)
		result.EntriesUpdated++
	}

	if result.Success {
		if err := idx.Write(u.indexPath); err != nil {
			result.Success = false
			result.Errors = append(result.Errors, fmt.Errorf("index %s failed (%s): %w", "write", u.indexPath.String(), err))
			return result, err
		}
	}

	return result, nil
}

// createIndexEntry creates an index entry from file information.
// It stats the file to get metadata and combines it with the provided SHA and mode.
func (u *IndexUpdater) createIndexEntry(path scpath.RelativePath, info FileInfo) (*index.Entry, error) {
	fullPath := filepath.Join(u.workDir, path.String())

	stats, err := os.Stat(fullPath)
	if err != nil {
		return nil, fmt.Errorf("stat file: %w", err)
	}

	entry, err := index.NewEntryFromFileInfo(path, stats, info.SHA)
	if err != nil {
		return nil, fmt.Errorf("create entry: %w", err)
	}

	return entry, nil
}

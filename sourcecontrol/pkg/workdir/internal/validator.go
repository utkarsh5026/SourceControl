package internal

import (
	"fmt"
	"os"

	"github.com/utkarsh5026/SourceControl/pkg/index"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/objects/blob"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

// FileStatus represents the status of a file in the working directory
type FileStatus int

const (
	// FileDeleted indicates the file was removed from the working directory
	FileDeleted FileStatus = iota
	// FileSizeChanged indicates the file size differs from the index
	FileSizeChanged
	// FileContentChanged indicates the file content has been modified
	FileContentChanged
	// FileTimeChanged indicates only the modification time changed
	FileTimeChanged
)

// String returns the string representation of the file status
func (fs FileStatus) String() string {
	switch fs {
	case FileDeleted:
		return "deleted"
	case FileSizeChanged:
		return "size-changed"
	case FileContentChanged:
		return "content-changed"
	case FileTimeChanged:
		return "time-changed"
	default:
		return "unknown"
	}
}

// FileStatusDetail contains detailed status information for a single file
type FileStatusDetail struct {
	Path       scpath.RelativePath
	Status     FileStatus
	IndexSHA   objects.ObjectHash
	WorkingSHA objects.ObjectHash
}

func NewFSD(p scpath.RelativePath, st FileStatus, ish, wsh objects.ObjectHash) *FileStatusDetail {
	return &FileStatusDetail{
		Path:       p,
		Status:     st,
		IndexSHA:   ish,
		WorkingSHA: wsh,
	}
}

// Validator implements the working directory validation interface.
// It checks for uncommitted changes and validates safe overwrite conditions.
type Validator struct {
	workDir scpath.RepositoryPath
}

// NewValidator creates a new working directory validator
func NewValidator(workDir scpath.RepositoryPath) *Validator {
	return &Validator{
		workDir: workDir,
	}
}

// ValidateCleanState checks if the working directory has uncommitted changes.
// It compares each index entry against the actual file on disk.
func (v *Validator) ValidateCleanState(idx *index.Index) (Status, error) {
	status := Status{
		Clean:         true,
		ModifiedFiles: []scpath.RelativePath{},
		DeletedFiles:  []scpath.RelativePath{},
		Details:       []FileStatusDetail{},
	}

	for _, entry := range idx.Entries {
		detail, err := v.checkFileStatus(entry)
		if err != nil {
			return status, fmt.Errorf("check %s: %w", entry.Path, err)
		}

		if detail != nil {
			status.Clean = false
			status.Details = append(status.Details, *detail)

			if detail.Status == FileDeleted {
				status.DeletedFiles = append(status.DeletedFiles, detail.Path)
			} else {
				status.ModifiedFiles = append(status.ModifiedFiles, detail.Path)
			}
		}
	}

	return status, nil
}

// CanSafelyOverwrite checks if files can be safely replaced without losing changes.
// Returns an error if any file has uncommitted modifications.
func (v *Validator) CanSafelyOverwrite(paths []scpath.RelativePath, idx *index.Index) error {
	var conflicts []scpath.RelativePath

	for _, path := range paths {
		entry, ok := idx.Get(path)
		if !ok {
			continue
		}

		detail, err := v.checkFileStatus(entry)
		if err != nil {
			return fmt.Errorf("check %s: %w", path, err)
		}

		if detail != nil && detail.Status != FileTimeChanged {
			conflicts = append(conflicts, path)
		}
	}

	if len(conflicts) > 0 {
		return fmt.Errorf("cannot overwrite files with uncommitted changes: %v", conflicts)
	}

	return nil
}

// checkFileStatus compares a file on disk with its index entry
func (v *Validator) checkFileStatus(entry *index.Entry) (*FileStatusDetail, error) {
	fullPath := v.workDir.Join(entry.Path.String())

	stats, err := os.Stat(fullPath.String())
	if os.IsNotExist(err) {
		return NewFSD(entry.Path, FileDeleted, entry.BlobHash, ""), nil
	}
	if err != nil {
		return nil, fmt.Errorf("stat file: %w", err)
	}

	return v.compareWithIndex(entry, stats)
}

// compareWithIndex performs detailed comparison between file stats and index entry
func (v *Validator) compareWithIndex(entry *index.Entry, stats os.FileInfo) (*FileStatusDetail, error) {
	if uint32(stats.Size()) != entry.SizeInBytes {
		return NewFSD(entry.Path, FileSizeChanged, entry.BlobHash, ""), nil
	}

	mtimeSeconds := stats.ModTime().Unix()
	if uint32(mtimeSeconds) != entry.ModificationTime.Seconds {
		contentChanged, currentSHA, err := v.isContentModified(entry)
		if err != nil {
			return nil, fmt.Errorf("check content: %w", err)
		}

		if contentChanged {
			return NewFSD(entry.Path, FileContentChanged, entry.BlobHash, currentSHA), nil
		}

		return NewFSD(entry.Path, FileTimeChanged, entry.BlobHash, currentSHA), nil
	}

	contentChanged, currentSHA, err := v.isContentModified(entry)
	if err != nil {
		return nil, fmt.Errorf("check content: %w", err)
	}

	if contentChanged {
		return NewFSD(entry.Path, FileContentChanged, entry.BlobHash, currentSHA), nil
	}

	return nil, nil
}

// isContentModified checks if file content has changed by computing its hash
func (v *Validator) isContentModified(entry *index.Entry) (bool, objects.ObjectHash, error) {
	fullPath := v.workDir.Join(entry.Path.String())

	data, err := os.ReadFile(fullPath.String())
	if err != nil {
		return true, "", fmt.Errorf("read file: %w", err)
	}

	b := blob.NewBlob(data)
	currentHash, err := b.Hash()
	if err != nil {
		return true, "", fmt.Errorf("compute hash: %w", err)
	}

	return currentHash != entry.BlobHash, currentHash, nil
}

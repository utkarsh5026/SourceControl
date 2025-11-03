package internal

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/utkarsh5026/SourceControl/pkg/objects/blob"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

// FileOps implements the FileOperator interface for low-level file system operations.
// It handles creating, modifying, and deleting files in the working directory.
type FileOps struct {
	repo    *sourcerepo.SourceRepository
	workDir scpath.RepositoryPath
	tempDir scpath.AbsolutePath // Directory for temporary files
	dryRun  bool                // If true, operations are simulated
}

// NewFileOps creates a new FileOps service
func NewFileOps(repo *sourcerepo.SourceRepository) *FileOps {
	workDir := repo.WorkingDirectory()
	tempDir := workDir.Join(".source", "tmp")
	return &FileOps{
		repo:    repo,
		workDir: workDir,
		tempDir: tempDir,
		dryRun:  false,
	}
}

// SetDryRun enables or disables dry-run mode
func (f *FileOps) SetDryRun(enabled bool) {
	f.dryRun = enabled
}

// ApplyOperation executes a single file operation (create, modify, or delete).
// Returns a WorkdirError if the operation fails.
func (f *FileOps) ApplyOperation(op Operation) error {
	if f.dryRun {
		return nil // In dry-run mode, don't actually perform operations
	}

	switch op.Action {
	case ActionCreate, ActionModify:
		return f.writeFile(op)
	case ActionDelete:
		return f.deleteFile(op.Path)
	default:
		return fmt.Errorf("apply %s: %w: unknown action %v", op.Path, ErrInvalidOperation, op.Action)
	}
}

// writeFile creates or modifies a file by reading content from a blob object.
// Uses atomic write pattern: write to temp file, then rename.
func (f *FileOps) writeFile(op Operation) error {
	if op.SHA == "" {
		return fmt.Errorf("%s %s: %w: missing SHA", op.Action.String(), op.Path, ErrInvalidOperation)
	}

	blobObj, err := f.repo.ReadObject(op.SHA)
	if err != nil {
		return fmt.Errorf("%s %s: read blob %s: %w", op.Action.String(), op.Path, op.SHA.Short(), err)
	}

	blobData, ok := blobObj.(*blob.Blob)
	if !ok {
		return fmt.Errorf("%s %s: object %s is not a blob", op.Action.String(), op.Path, op.SHA.Short())
	}

	content, err := blobData.Content()
	if err != nil {
		return fmt.Errorf("%s %s: get blob content: %w", op.Action.String(), op.Path, err)
	}

	fullPath := f.workDir.Join(op.Path.String())

	if err := f.ensureParentDir(fullPath); err != nil {
		return fmt.Errorf("%s %s: create parent directory: %w", op.Action.String(), op.Path, err)
	}

	// Write atomically using temp file
	if err := f.atomicWrite(fullPath, content.Bytes(), op.Mode); err != nil {
		return fmt.Errorf("%s %s: write file: %w", op.Action.String(), op.Path, err)
	}

	return nil
}

// atomicWrite writes data to a file atomically by using a temporary file and rename.
// This ensures that the file is never in a partial state.
func (f *FileOps) atomicWrite(targetPath scpath.AbsolutePath, data []byte, mode os.FileMode) error {
	if err := os.MkdirAll(f.tempDir.String(), 0755); err != nil {
		return fmt.Errorf("create temp directory: %w", err)
	}

	// Create temp file in the same directory as target (ensures same filesystem)
	dir := filepath.Dir(targetPath.String())
	tmpFile, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	defer func() {
		tmpFile.Close()
		// Only remove if still exists (successful rename will already remove it)
		os.Remove(tmpPath)
	}()

	// Write data
	if _, err := tmpFile.Write(data); err != nil {
		return fmt.Errorf("write data: %w", err)
	}

	// Sync to ensure data is on disk
	if err := tmpFile.Sync(); err != nil {
		return fmt.Errorf("sync: %w", err)
	}

	// Close before rename (required on Windows)
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("close: %w", err)
	}

	// Set permissions on temp file
	if err := os.Chmod(tmpPath, mode); err != nil {
		return fmt.Errorf("chmod: %w", err)
	}

	// Atomic rename (on POSIX systems, this is truly atomic)
	if err := os.Rename(tmpPath, targetPath.String()); err != nil {
		return fmt.Errorf("rename: %w", err)
	}

	return nil
}

// deleteFile removes a file from the working directory and cleans up empty parent directories
func (f *FileOps) deleteFile(path scpath.RelativePath) error {
	fullPath := f.workDir.Join(path.String())

	if _, err := os.Stat(fullPath.String()); os.IsNotExist(err) {
		return nil
	}

	if err := os.Remove(fullPath.String()); err != nil {
		return fmt.Errorf("delete %s: remove file: %w", path, err)
	}

	parentDir := fullPath.Dir()
	if err := f.cleanEmptyParents(parentDir); err != nil {
		// Non-fatal: log but don't fail the operation
		// In production, you might want to use a proper logger here
		_ = err
	}

	return nil
}

// ensureParentDir creates all parent directories for a file path if they don't exist
func (f *FileOps) ensureParentDir(filePath scpath.AbsolutePath) error {
	dir := filepath.Dir(filePath.String())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return nil
}

// cleanEmptyParents recursively removes empty directories up to the working directory root
func (f *FileOps) cleanEmptyParents(dir scpath.AbsolutePath) error {
	// Don't go above the working directory
	if !filepath.HasPrefix(dir.String(), f.workDir.String()) || dir.String() == f.workDir.String() {
		return nil
	}

	// Check if directory is empty
	entries, err := os.ReadDir(dir.String())
	if err != nil {
		return err
	}

	// If not empty, stop
	if len(entries) > 0 {
		return nil
	}

	// Remove empty directory
	if err := os.Remove(dir.String()); err != nil {
		return err
	}

	// Recursively check parent
	parentDir := dir.Dir()
	return f.cleanEmptyParents(parentDir)
}

// CreateBackup creates a backup of a file before modification.
// Returns a Backup struct that can be used to restore the file later.
func (f *FileOps) CreateBackup(path scpath.RelativePath) (*Backup, error) {
	fullPath := f.workDir.Join(path.String())

	// Check if file exists
	info, err := os.Stat(fullPath.String())
	if os.IsNotExist(err) {
		// File doesn't exist, create a backup that records this
		return &Backup{
			Path:     path,
			TempFile: "",
			Existed:  false,
			Mode:     0,
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("backup %s: stat file: %w", path, err)
	}

	// Ensure temp directory exists
	if err := os.MkdirAll(f.tempDir.String(), 0755); err != nil {
		return nil, fmt.Errorf("backup %s: create temp directory: %w", path, err)
	}

	// Create temp file for backup
	tmpFile, err := os.CreateTemp(f.tempDir.String(), "backup-*")
	if err != nil {
		return nil, fmt.Errorf("backup %s: create temp file: %w", path, err)
	}
	tmpPath := tmpFile.Name()

	// Ensure cleanup on error
	success := false
	defer func() {
		tmpFile.Close()
		if !success {
			os.Remove(tmpPath)
		}
	}()

	// Copy file content to temp file
	srcFile, err := os.Open(fullPath.String())
	if err != nil {
		return nil, fmt.Errorf("backup %s: open source: %w", path, err)
	}
	defer srcFile.Close()

	if _, err := io.Copy(tmpFile, srcFile); err != nil {
		return nil, fmt.Errorf("backup %s: copy content: %w", path, err)
	}

	// Sync to ensure backup is on disk
	if err := tmpFile.Sync(); err != nil {
		return nil, fmt.Errorf("backup %s: sync backup: %w", path, err)
	}

	success = true
	return &Backup{
		Path:     path,
		TempFile: tmpPath,
		Existed:  true,
		Mode:     info.Mode(),
	}, nil
}

// RestoreBackup restores a file from a backup
func (f *FileOps) RestoreBackup(backup *Backup) error {
	if backup == nil {
		return fmt.Errorf("nil backup")
	}

	fullPath := f.workDir.Join(backup.Path.String())

	if !backup.Existed {
		// File didn't exist before, so delete it
		err := os.Remove(fullPath.String())
		if err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("restore %s: remove file: %w", backup.Path, err)
		}
		return nil
	}

	// File existed, restore from backup
	if backup.TempFile == "" {
		return fmt.Errorf("restore %s: backup has no temp file", backup.Path)
	}

	// Ensure parent directory exists
	if err := f.ensureParentDir(fullPath); err != nil {
		return fmt.Errorf("restore %s: create parent directory: %w", backup.Path, err)
	}

	// Copy backup file back
	srcFile, err := os.Open(backup.TempFile)
	if err != nil {
		return fmt.Errorf("restore %s: open backup: %w", backup.Path, err)
	}
	defer srcFile.Close()

	// Use atomic write to restore
	data, err := io.ReadAll(srcFile)
	if err != nil {
		return fmt.Errorf("restore %s: read backup: %w", backup.Path, err)
	}

	if err := f.atomicWrite(fullPath, data, backup.Mode); err != nil {
		return fmt.Errorf("restore %s: write file: %w", backup.Path, err)
	}

	return nil
}

// CleanupBackup removes a backup file after successful operation
func (f *FileOps) CleanupBackup(backup *Backup) error {
	if backup == nil || backup.TempFile == "" {
		return nil
	}

	if err := os.Remove(backup.TempFile); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove backup file: %w", err)
	}

	return nil
}

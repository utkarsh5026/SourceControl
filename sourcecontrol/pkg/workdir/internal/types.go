package internal

import (
	"os"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

// ActionType represents the type of file operation to perform
type ActionType int

const (
	// ActionCreate creates a new file in the working directory
	ActionCreate ActionType = iota
	// ActionModify updates an existing file's content or permissions
	ActionModify
	// ActionDelete removes a file from the working directory
	ActionDelete
)

// String returns the string representation of the action type
func (a ActionType) String() string {
	switch a {
	case ActionCreate:
		return "create"
	case ActionModify:
		return "modify"
	case ActionDelete:
		return "delete"
	default:
		return "unknown"
	}
}

// Operation represents a single file operation to be performed on the working directory.
type Operation struct {
	Path   scpath.RelativePath
	Action ActionType
	SHA    objects.ObjectHash
	Mode   os.FileMode
}

// FileInfo represents metadata about a file in a tree or index
type FileInfo struct {
	SHA  objects.ObjectHash
	Mode os.FileMode
}

// Backup represents a snapshot of a file before modification
type Backup struct {
	Path     scpath.RelativePath
	TempFile string
	Existed  bool
	Mode     os.FileMode
}

// Status represents the state of the working directory relative to the index
type Status struct {
	Clean         bool
	ModifiedFiles []scpath.RelativePath
	DeletedFiles  []scpath.RelativePath
	Details       []FileStatusDetail
}

// FileStatusDetail contains detailed status information for a single file
type FileStatusDetail struct {
	Path       scpath.RelativePath
	Status     string
	IndexSHA   objects.ObjectHash
	WorkingSHA objects.ObjectHash
}

// ChangeAnalysis contains the result of comparing two file states
type ChangeAnalysis struct {
	Operations  []Operation
	Summary     ChangeSummary
	TargetFiles map[scpath.RelativePath]FileInfo
}

// ChangeSummary provides statistics about detected changes
type ChangeSummary struct {
	Created  int
	Modified int
	Deleted  int
}

// TransactionResult contains the outcome of an atomic transaction
type TransactionResult struct {
	Success           bool
	OperationsApplied int
	TotalOperations   int
	Err               error
}

// DryRunResult contains the analysis of operations without executing them
type DryRunResult struct {
	Valid     bool
	Analysis  DryRunAnalysis
	Conflicts []string
	Errors    []string
}

// DryRunAnalysis categorizes operations for dry run reporting
type DryRunAnalysis struct {
	WillCreate []scpath.RelativePath
	WillModify []scpath.RelativePath
	WillDelete []scpath.RelativePath
	Conflicts  []string
}

// IndexUpdateResult contains the outcome of an index synchronization operation
type IndexUpdateResult struct {
	Success        bool
	EntriesUpdated int
	EntriesRemoved int
	Errors         []error
}

// FileOperator defines the interface for low-level file system operations
type FileOperator interface {
	ApplyOperation(op Operation) error
	CreateBackup(path scpath.RelativePath) (*Backup, error)
	RestoreBackup(backup *Backup) error
	CleanupBackup(backup *Backup) error
}

package workdir

import (
	"errors"
	"fmt"

	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/workdir/internal"
)

// Common error variables for type checking with errors.Is()
var (
	// ErrDirtyWorkingDirectory is returned when uncommitted changes would be overwritten
	ErrDirtyWorkingDirectory = errors.New("working directory has uncommitted changes")
	// ErrInvalidOperation is returned when an operation is malformed
	ErrInvalidOperation = internal.ErrInvalidOperation
	// ErrLockAcquisitionFailed is returned when unable to acquire repository lock
	ErrLockAcquisitionFailed = internal.ErrLockAcquisitionFailed
)

// WorkdirError represents an error that occurred during working directory operations.
// It wraps the underlying error with additional context about the operation and file path.
type WorkdirError struct {
	// Op is the operation that was being performed (e.g., "create", "modify", "delete")
	Op string
	// Path is the file path where the error occurred
	Path scpath.RelativePath
	// Err is the underlying error
	Err error
}

// Error implements the error interface
func (e *WorkdirError) Error() string {
	if e.Path.String() != "" {
		return fmt.Sprintf("%s %s: %v", e.Op, e.Path, e.Err)
	}
	return fmt.Sprintf("%s: %v", e.Op, e.Err)
}

func (e *WorkdirError) Unwrap() error {
	return e.Err
}

// ValidationError represents an error during working directory validation
type ValidationError struct {
	// Message describes the validation failure
	Message string
	// ModifiedFiles lists files with uncommitted changes
	ModifiedFiles []scpath.RelativePath
	// DeletedFiles lists files that are missing from the working directory
	DeletedFiles []scpath.RelativePath
}

// Error implements the error interface
func (e *ValidationError) Error() string {
	msg := e.Message
	if len(e.ModifiedFiles) > 0 {
		msg += fmt.Sprintf("\n  Modified files (%d):", len(e.ModifiedFiles))
		for i, path := range e.ModifiedFiles {
			if i < 10 {
				msg += fmt.Sprintf("\n    %s", path)
			} else if i == 10 {
				msg += fmt.Sprintf("\n    ... and %d more files", len(e.ModifiedFiles)-10)
				break
			}
		}
	}
	if len(e.DeletedFiles) > 0 {
		msg += fmt.Sprintf("\n  Deleted files (%d):", len(e.DeletedFiles))
		for i, path := range e.DeletedFiles {
			if i < 10 {
				msg += fmt.Sprintf("\n    %s", path)
			} else if i == 10 {
				msg += fmt.Sprintf("\n    ... and %d more files", len(e.DeletedFiles)-10)
				break
			}
		}
	}
	return msg
}

// TransactionError represents an error during atomic transaction execution
type TransactionError struct {
	// Message describes what went wrong
	Message string
	// FailedOperation is the operation that caused the failure
	FailedOperation *Operation
	// OperationsCompleted is the number of operations that succeeded before failure
	OperationsCompleted int
	// RollbackSucceeded indicates whether the rollback was successful
	RollbackSucceeded bool
	// Err is the underlying error
	Err error
}

// Error implements the error interface
func (e *TransactionError) Error() string {
	msg := e.Message
	if e.FailedOperation != nil {
		msg += fmt.Sprintf(" (failed at: %s %s)", e.FailedOperation.Action, e.FailedOperation.Path)
	}
	if e.OperationsCompleted > 0 {
		msg += fmt.Sprintf(" (%d operations completed before failure)", e.OperationsCompleted)
	}
	if !e.RollbackSucceeded {
		msg += " (WARNING: rollback failed, working directory may be in inconsistent state)"
	}
	if e.Err != nil {
		msg += fmt.Sprintf(": %v", e.Err)
	}
	return msg
}

// Unwrap returns the underlying error
func (e *TransactionError) Unwrap() error {
	return e.Err
}

// LockError represents an error acquiring or managing a repository lock
type LockError struct {
	// LockPath is the path to the lock file
	LockPath string
	// Message describes the lock error
	Message string
	// Err is the underlying error
	Err error
}

// Error implements the error interface
func (e *LockError) Error() string {
	return fmt.Sprintf("lock error (%s): %s: %v", e.LockPath, e.Message, e.Err)
}

// Unwrap returns the underlying error
func (e *LockError) Unwrap() error {
	return e.Err
}

// IndexError represents an error during index operations
type IndexError struct {
	// Operation describes what was being done (e.g., "read", "write", "update")
	Operation string
	// Path is the index file path
	Path string
	// Err is the underlying error
	Err error
}

// Error implements the error interface
func (e *IndexError) Error() string {
	return fmt.Sprintf("index %s failed (%s): %v", e.Operation, e.Path, e.Err)
}

// Unwrap returns the underlying error
func (e *IndexError) Unwrap() error {
	return e.Err
}

// NewWorkdirError creates a new WorkdirError
func NewWorkdirError(op string, path scpath.RelativePath, err error) *WorkdirError {
	return &WorkdirError{
		Op:   op,
		Path: path,
		Err:  err,
	}
}

// NewValidationError creates a new ValidationError
func NewValidationError(message string, modified, deleted []scpath.RelativePath) *ValidationError {
	return &ValidationError{
		Message:       message,
		ModifiedFiles: modified,
		DeletedFiles:  deleted,
	}
}

// NewTransactionError creates a new TransactionError
func NewTransactionError(message string, failedOp *Operation, completed int, rollbackOK bool, err error) *TransactionError {
	return &TransactionError{
		Message:             message,
		FailedOperation:     failedOp,
		OperationsCompleted: completed,
		RollbackSucceeded:   rollbackOK,
		Err:                 err,
	}
}

// NewLockError creates a new LockError
func NewLockError(lockPath, message string, err error) *LockError {
	return &LockError{
		LockPath: lockPath,
		Message:  message,
		Err:      err,
	}
}

// NewIndexError creates a new IndexError
func NewIndexError(operation, path string, err error) *IndexError {
	return &IndexError{
		Operation: operation,
		Path:      path,
		Err:       err,
	}
}

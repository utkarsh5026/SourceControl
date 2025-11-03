package internal

import (
	"context"
	"fmt"

	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

// DryRunAnalysis categorizes operations for dry run reporting
type DryRunAnalysis struct {
	WillCreate []scpath.RelativePath
	WillModify []scpath.RelativePath
	WillDelete []scpath.RelativePath
	Conflicts  []string
}

// TransactionResult contains the outcome of an atomic transaction
type TransactionResult struct {
	Success           bool
	OperationsApplied int
	TotalOperations   int
	Err               error
}

func newTr(success bool, opsApplied, totalOps int, err error) TransactionResult {
	return TransactionResult{
		Success:           success,
		OperationsApplied: opsApplied,
		TotalOperations:   totalOps,
		Err:               err,
	}
}

func success(opsApplied, totalOps int) TransactionResult {
	return newTr(true, opsApplied, totalOps, nil)
}

func failure(opsApplied, totalOps int, err error) TransactionResult {
	return newTr(false, opsApplied, totalOps, err)
}

// Manager implements atomic transaction execution with rollback support.
// It ensures all-or-nothing semantics for file operations.
type Manager struct {
	fileOps   FileOperator
	sourceDir scpath.SourcePath
}

// NewManager creates a new transaction manager
func NewManager(fileOps FileOperator, sourceDir scpath.SourcePath) *Manager {
	return &Manager{
		fileOps:   fileOps,
		sourceDir: sourceDir,
	}
}

// ExecuteAtomically executes all operations as a single transaction.
// If any operation fails, all changes are rolled back.
func (m *Manager) ExecuteAtomically(ctx context.Context, ops []Operation) TransactionResult {
	if len(ops) == 0 {
		return success(0, 0)
	}

	lock, err := AcquireLock(m.sourceDir)
	if err != nil {
		return failure(0, len(ops), err)
	}
	defer lock.Release()

	// Validate operations first
	if err := m.validateOperations(ops); err != nil {
		return TransactionResult{
			Success:         false,
			TotalOperations: len(ops),
			Err:             err,
		}
	}

	// Create backups for modify/delete operations
	backups, err := m.createBackups(ops)
	if err != nil {
		return TransactionResult{
			Success:         false,
			TotalOperations: len(ops),
			Err:             fmt.Errorf("create backups: %w", err),
		}
	}

	// Execute operations
	applied := 0
	var failedOp *Operation

	for i, op := range ops {
		// Check context cancellation
		select {
		case <-ctx.Done():
			m.rollback(backups)
			return TransactionResult{
				Success:           false,
				OperationsApplied: applied,
				TotalOperations:   len(ops),
				Err:               ctx.Err(),
			}
		default:
		}

		// Apply operation
		if err := m.fileOps.ApplyOperation(op); err != nil {
			failedOp = &ops[i]
			// Rollback on failure
			rollbackOK := m.rollback(backups)

			// Build error message
			errMsg := fmt.Sprintf("operation failed (failed at: %s %s)", failedOp.Action, failedOp.Path)
			if applied > 0 {
				errMsg += fmt.Sprintf(" (%d operations completed before failure)", applied)
			}
			if !rollbackOK {
				errMsg += " (WARNING: rollback failed, working directory may be in inconsistent state)"
			}
			errMsg += fmt.Sprintf(": %v", err)

			return TransactionResult{
				Success:           false,
				OperationsApplied: applied,
				TotalOperations:   len(ops),
				Err:               fmt.Errorf("%s", errMsg),
			}
		}
		applied++
	}

	// Success - cleanup backups
	for _, backup := range backups {
		m.fileOps.CleanupBackup(backup)
	}

	return TransactionResult{
		Success:           true,
		OperationsApplied: applied,
		TotalOperations:   len(ops),
	}
}

// DryRun analyzes operations without executing them.
// It validates operations and checks for conflicts.
func (m *Manager) DryRun(ops []Operation) DryRunResult {
	result := DryRunResult{
		Valid:     true,
		Analysis:  DryRunAnalysis{},
		Conflicts: []string{},
		Errors:    []string{},
	}

	if err := m.validateOperations(ops); err != nil {
		result.Valid = false
		result.Errors = append(result.Errors, err.Error())
		return result
	}

	for _, op := range ops {
		switch op.Action {
		case ActionCreate:
			result.Analysis.WillCreate = append(result.Analysis.WillCreate, op.Path)
		case ActionModify:
			result.Analysis.WillModify = append(result.Analysis.WillModify, op.Path)
		case ActionDelete:
			result.Analysis.WillDelete = append(result.Analysis.WillDelete, op.Path)
		}
	}

	return result
}

// validateOperations checks if operations are valid
func (m *Manager) validateOperations(ops []Operation) error {
	pathsSeen := make(map[scpath.RelativePath]bool)

	for i, op := range ops {
		if !op.Path.IsValid() {
			return fmt.Errorf("%w: operation %d has empty path", ErrInvalidOperation, i)
		}

		if op.Action != ActionCreate &&
			op.Action != ActionModify &&
			op.Action != ActionDelete {
			return fmt.Errorf("%w: operation %d has invalid action %d", ErrInvalidOperation, i, op.Action)
		}

		if (op.Action == ActionCreate || op.Action == ActionModify) && op.SHA == "" {
			return fmt.Errorf("%w: operation %d (%s) missing SHA", ErrInvalidOperation, i, op.Action)
		}

		if pathsSeen[op.Path] {
			return fmt.Errorf("%w: duplicate operation on path %s", ErrInvalidOperation, op.Path)
		}
		pathsSeen[op.Path] = true
	}

	return nil
}

// createBackups creates backups for all modify/delete operations
func (m *Manager) createBackups(ops []Operation) ([]*Backup, error) {
	var backups []*Backup

	for _, op := range ops {
		if op.Action == ActionModify || op.Action == ActionDelete {
			backup, err := m.fileOps.CreateBackup(op.Path)
			if err != nil {
				for _, b := range backups {
					m.fileOps.CleanupBackup(b)
				}
				return nil, fmt.Errorf("backup %s: %w", op.Path, err)
			}
			backups = append(backups, backup)
		}
	}

	return backups, nil
}

// rollback restores all files from backups (in reverse order)
func (m *Manager) rollback(backups []*Backup) bool {
	success := true

	for i := len(backups) - 1; i >= 0; i-- {
		if err := m.fileOps.RestoreBackup(backups[i]); err != nil {
			success = false
		}
	}

	for _, backup := range backups {
		m.fileOps.CleanupBackup(backup)
	}

	return success
}

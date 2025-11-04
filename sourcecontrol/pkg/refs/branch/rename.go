package branch

import (
	"context"
	"fmt"
)

// Rename handles branch renaming operations
type Rename struct {
	refService *RefService
}

// NewRename creates a new branch rename service
func NewRename(refSvc *RefService) *Rename {
	return &Rename{
		refService: refSvc,
	}
}

// Rename renames a branch from oldName to newName
func (r *Rename) Rename(ctx context.Context, oldName, newName string, config *RenameConfig) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	if err := r.validateNames(oldName, newName); err != nil {
		return err
	}

	if err := r.validateOldExist(oldName); err != nil {
		return err
	}

	if !config.Force {
		if err := r.validateNewNotExist(newName); err != nil {
			return err
		}
	}

	if err := r.refService.Rename(oldName, newName, config.Force); err != nil {
		return fmt.Errorf("rename branch: %w", err)
	}

	return nil
}

func (r *Rename) validateNames(oldName, newName string) error {
	if err := ValidateBranchName(oldName); err != nil {
		return fmt.Errorf("invalid old name: %w", err)
	}
	if err := ValidateBranchName(newName); err != nil {
		return fmt.Errorf("invalid new name: %w", err)
	}

	if oldName == newName {
		return fmt.Errorf("old and new branch names are the same")
	}

	return nil
}

func (r *Rename) validateOldExist(oldName string) error {
	exists, err := r.refService.Exists(oldName)
	if err != nil {
		return fmt.Errorf("check old branch exists: %w", err)
	}
	if !exists {
		return NewNotFoundError(oldName)
	}

	return nil
}

func (r *Rename) validateNewNotExist(newName string) error {
	newExists, err := r.refService.Exists(newName)
	if err != nil {
		return fmt.Errorf("check new branch exists: %w", err)
	}
	if newExists {
		return NewAlreadyExistsError(newName)
	}

	return nil
}

// RenameCurrent renames the current branch
func (r *Rename) RenameCurrent(ctx context.Context, newName string, config *RenameConfig) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	current, err := r.refService.Current()
	if err != nil {
		return fmt.Errorf("get current branch: %w", err)
	}

	if current == "" {
		return NewDetachedHeadError("")
	}

	return r.Rename(ctx, current, newName, config)
}

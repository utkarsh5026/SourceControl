package branch

import (
	"context"
	"fmt"
)

type Rename struct {
	rs               *BranchRefManager
	oldName, newName string
	force            bool
}

func NewRenameService(rs *BranchRefManager, newName, oldName string, force bool) *Rename {
	return &Rename{rs: rs, oldName: oldName, newName: newName, force: force}
}

func (r *Rename) Execute(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	if err := r.checkBranchExistence(); err != nil {
		return err
	}

	if err := r.updateNew(); err != nil {
		return err
	}

	if err := r.updateOld(); err != nil {
		return err
	}

	return nil
}

func (r *Rename) checkBranchExistence() error {
	exists, err := r.rs.Exists(r.oldName)
	if err != nil {
		return fmt.Errorf("check old branch exists: %w", err)
	}
	if !exists {
		return NewNotFoundError(r.oldName)
	}

	newExists, err := r.rs.Exists(r.newName)
	if err != nil {
		return fmt.Errorf("check new branch exists: %w", err)
	}
	if newExists && !r.force {
		return NewAlreadyExistsError(r.newName)
	}

	return nil
}

func (r *Rename) updateNew() error {
	sha, err := r.rs.Resolve(r.oldName)
	if err != nil {
		return fmt.Errorf("resolve old branch: %w", err)
	}

	if err := r.rs.Update(r.newName, sha, r.force); err != nil {
		return fmt.Errorf("update new branch ref: %w", err)
	}
	return nil
}

func (r *Rename) updateOld() error {
	current, err := r.rs.Current()
	if err != nil {
		return fmt.Errorf("get current branch: %w", err)
	}
	if current == r.oldName {
		if err := r.rs.SetHead(r.newName); err != nil {
			return fmt.Errorf("update HEAD: %w", err)
		}
	}

	if err := r.rs.Delete(r.oldName); err != nil {
		return fmt.Errorf("delete old branch: %w", err)
	}

	return nil
}

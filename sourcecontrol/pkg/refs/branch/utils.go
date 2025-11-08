package branch

import (
	"fmt"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

// resolveCommit resolves a commit SHA string to an ObjectHash
func resolveCommit(commit string, repo sourcerepo.SourceRepository) (objects.ObjectHash, error) {
	sha, err := objects.NewObjectHashFromString(commit)
	if err != nil {
		return "", fmt.Errorf("invalid target '%s': not a valid branch name or commit SHA", commit)
	}

	_, err = repo.ReadCommitObject(sha)
	if err != nil {
		return "", fmt.Errorf("commit %s does not exist: %w", sha.Short(), err)
	}

	return sha, nil
}

func resolveBranch(refService *BranchRefManager, target string) (objects.ObjectHash, error) {
	exists, err := refService.Exists(target)
	if err != nil {
		return "", fmt.Errorf("check branch exists: %w", err)
	}

	if exists {
		sha, err := refService.Resolve(target)
		if err != nil {
			return "", fmt.Errorf("resolve branch: %w", err)
		}
		return sha, nil
	}

	return "", nil
}

// ResolveOptions configures the behavior of ResolveRefOrCommit
type ResolveOptions struct {
	AllowCreate bool

	// CreateFunc is called to create a new branch if AllowCreate is true
	CreateFunc func(string) (objects.ObjectHash, error)

	// DefaultValue is returned if target is empty
	DefaultValue objects.ObjectHash
}

// ResolveResult contains the resolution result
type ResolveResult struct {
	// SHA is the resolved commit hash
	SHA objects.ObjectHash

	// IsBranch indicates if the target was resolved as a branch
	IsBranch bool

	// Created indicates if a new branch was created during resolution
	Created bool
}

func newResolveResult(sha objects.ObjectHash, isBranch, created bool) *ResolveResult {
	return &ResolveResult{
		SHA:      sha,
		IsBranch: isBranch,
		Created:  created,
	}
}

// ResolveRefOrCommit resolves a target as either a branch name or commit SHA
// It first attempts branch resolution, then falls back to commit resolution
func ResolveRefOrCommit(
	target string,
	refService *BranchRefManager,
	repo *sourcerepo.SourceRepository,
	o ResolveOptions,
) (*ResolveResult, error) {
	if target == "" {
		if o.DefaultValue != "" {
			return newResolveResult(o.DefaultValue, false, false), nil
		}
		return nil, fmt.Errorf("target cannot be empty")
	}

	if err := refService.validateBranchName(target); err == nil {
		sha, err := resolveBranch(refService, target)
		if err != nil {
			return nil, err
		}

		if sha != "" {
			return newResolveResult(sha, true, false), nil
		}

		if o.AllowCreate && o.CreateFunc != nil {
			sha, err := o.CreateFunc(target)
			if err != nil {
				return nil, fmt.Errorf("create branch: %w", err)
			}

			return newResolveResult(sha, true, true), nil
		}

		sha, err = resolveCommit(target, *repo)
		if err != nil {
			return nil, NewNotFoundError(target)
		}

		return newResolveResult(sha, false, false), nil
	}

	sha, err := resolveCommit(target, *repo)
	if err != nil {
		return nil, err
	}

	return newResolveResult(sha, false, false), nil
}

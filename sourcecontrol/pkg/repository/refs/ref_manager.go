package refs

import (
	"fmt"
	"strings"

	"github.com/utkarsh5026/SourceControl/pkg/common/fileops"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"github.com/utkarsh5026/SourceControl/pkg/repository/sourcerepo"
)

const (
	// SymbolicRefPrefix is the prefix for symbolic references
	SymbolicRefPrefix = "ref: "

	// MaxRefDepth is the maximum depth for resolving symbolic references
	MaxRefDepth = 10
)

// RefManager handles Git references (refs) - human-readable names for commits
type RefManager struct {
	refsPath scpath.SourcePath
	headPath scpath.SourcePath
}

// NewRefManager creates a new reference manager for the given repository
func NewRefManager(repo sourcerepo.Repository) *RefManager {
	sourceDir := repo.SourceDirectory()
	return &RefManager{
		refsPath: sourceDir.RefsPath(),
		headPath: sourceDir.HeadPath(),
	}
}

// Init initializes the ref manager by creating the refs directory and HEAD file
func (rm *RefManager) Init() error {
	if err := fileops.EnsureDir(rm.refsPath.ToAbsolutePath()); err != nil {
		return fmt.Errorf("failed to create refs directory: %w", err)
	}

	defaultRef := "ref: refs/heads/master\n"
	if err := fileops.WriteConfigString(rm.headPath.ToAbsolutePath(), defaultRef); err != nil {
		return fmt.Errorf("failed to create HEAD file: %w", err)
	}

	return nil
}

// ReadRef reads a reference and returns its content
func (rm *RefManager) ReadRef(ref RefPath) (string, error) {
	fullPath := rm.resolveReferencePath(ref)

	content, err := fileops.ReadStringStrict(fullPath.ToAbsolutePath())
	if err != nil {
		return "", fmt.Errorf("error reading ref %s: %w", ref, err)
	}

	return content, nil
}

// UpdateRef updates a reference with a new SHA-1 hash
func (rm *RefManager) UpdateRef(ref RefPath, hash objects.ObjectHash) error {
	// Validate the hash
	if err := hash.Validate(); err != nil {
		return fmt.Errorf("invalid hash: %w", err)
	}

	fullPath := rm.resolveReferencePath(ref).ToAbsolutePath()

	if err := fileops.EnsureParentDir(fullPath); err != nil {
		return fmt.Errorf("failed to create ref directory: %w", err)
	}

	content := hash.String() + "\n"
	if err := fileops.WriteConfigString(fullPath, content); err != nil {
		return fmt.Errorf("failed to write ref %s: %w", ref, err)
	}

	return nil
}

// ResolveToSHA resolves a reference to its final SHA-1 hash, following symbolic refs
func (rm *RefManager) ResolveToSHA(ref RefPath) (objects.ObjectHash, error) {
	currentRef := ref

	for range MaxRefDepth {
		content, err := rm.ReadRef(currentRef)
		if err != nil {
			return "", fmt.Errorf("error reading ref %s: %w", currentRef, err)
		}

		if after, ok := strings.CutPrefix(content, SymbolicRefPrefix); ok {
			target := after
			currentRef = RefPath(target)
			continue
		}

		hash, err := objects.NewObjectHashFromString(content)
		if err != nil {
			return "", fmt.Errorf("invalid ref content: %s", content)
		}

		return hash, nil
	}

	return "", fmt.Errorf("reference depth exceeded for %s", ref)
}

// DeleteRef deletes a reference
func (rm *RefManager) DeleteRef(ref RefPath) (bool, error) {
	fullPath := rm.resolveReferencePath(ref).ToAbsolutePath()

	exists, err := fileops.Exists(fullPath)
	if err != nil {
		return false, err
	}
	if !exists {
		return false, nil
	}

	if err := fileops.SafeRemove(fullPath); err != nil {
		return false, err
	}

	return true, nil
}

// Exists checks if a reference exists
func (rm *RefManager) Exists(ref RefPath) (bool, error) {
	fullPath := rm.resolveReferencePath(ref).ToAbsolutePath()
	return fileops.Exists(fullPath)
}

// GetHeadPath returns the full path to the HEAD file
func (rm *RefManager) GetHeadPath() scpath.SourcePath {
	return rm.headPath
}

// GetRefsPath returns the full path to the refs directory
func (rm *RefManager) GetRefsPath() scpath.SourcePath {
	return rm.refsPath
}

// resolveReferencePath resolves a RefPath to its full filesystem path
func (rm *RefManager) resolveReferencePath(ref RefPath) scpath.SourcePath {
	refStr := strings.TrimSpace(ref.String())

	if refStr == scpath.HeadFile {
		return rm.headPath
	}

	if after, ok := strings.CutPrefix(refStr, scpath.RefsDir+"/"); ok {
		relPath := after
		return rm.refsPath.Join(relPath)
	}

	return rm.refsPath.Join(refStr)
}

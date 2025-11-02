package refs

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

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
	if err := os.MkdirAll(rm.refsPath.String(), 0755); err != nil {
		return fmt.Errorf("failed to create refs directory: %w", err)
	}

	defaultRef := "ref: refs/heads/master\n"
	if err := os.WriteFile(rm.headPath.String(), []byte(defaultRef), 0644); err != nil {
		return fmt.Errorf("failed to create HEAD file: %w", err)
	}

	return nil
}

// ReadRef reads a reference and returns its content
func (rm *RefManager) ReadRef(ref RefPath) (string, error) {
	fullPath := rm.resolveReferencePath(ref)

	data, err := os.ReadFile(fullPath.String())
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("ref %s not found", ref)
		}
		return "", fmt.Errorf("error reading ref %s: %w", ref, err)
	}

	return strings.TrimSpace(string(data)), nil
}

// UpdateRef updates a reference with a new SHA-1 hash
func (rm *RefManager) UpdateRef(ref RefPath, hash objects.ObjectHash) error {
	// Validate the hash
	if err := hash.Validate(); err != nil {
		return fmt.Errorf("invalid hash: %w", err)
	}

	fullPath := rm.resolveReferencePath(ref)

	if err := os.MkdirAll(filepath.Dir(fullPath.String()), 0755); err != nil {
		return fmt.Errorf("failed to create ref directory: %w", err)
	}

	content := hash.String() + "\n"
	if err := os.WriteFile(fullPath.String(), []byte(content), 0644); err != nil {
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
	fullPath := rm.resolveReferencePath(ref)

	if err := os.Remove(fullPath.String()); err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

// Exists checks if a reference exists
func (rm *RefManager) Exists(ref RefPath) (bool, error) {
	fullPath := rm.resolveReferencePath(ref)
	_, err := os.Stat(fullPath.String())
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
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

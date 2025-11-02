package refs

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

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
func (rm *RefManager) ReadRef(ref scpath.RefPath) (string, error) {
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
func (rm *RefManager) UpdateRef(ref scpath.RefPath, sha string) error {
	fullPath := rm.resolveReferencePath(ref)

	// Create parent directories if needed
	if err := os.MkdirAll(filepath.Dir(fullPath.String()), 0755); err != nil {
		return fmt.Errorf("failed to create ref directory: %w", err)
	}

	content := sha + "\n"
	if err := os.WriteFile(fullPath.String(), []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write ref %s: %w", ref, err)
	}

	return nil
}

// ResolveToSHA resolves a reference to its final SHA-1 hash, following symbolic refs
func (rm *RefManager) ResolveToSHA(ref scpath.RefPath) (string, error) {
	currentRef := ref

	for depth := 0; depth < MaxRefDepth; depth++ {
		content, err := rm.ReadRef(currentRef)
		if err != nil {
			return "", fmt.Errorf("error reading ref %s: %w", currentRef, err)
		}

		// Check if it's a symbolic reference
		if strings.HasPrefix(content, SymbolicRefPrefix) {
			target := strings.TrimPrefix(content, SymbolicRefPrefix)
			currentRef = scpath.RefPath(target)
			continue
		}

		// Check if it's a valid SHA-1
		if isSHA1(content) {
			return content, nil
		}

		return "", fmt.Errorf("invalid ref content: %s", content)
	}

	return "", fmt.Errorf("reference depth exceeded for %s", ref)
}

// DeleteRef deletes a reference
func (rm *RefManager) DeleteRef(ref scpath.RefPath) (bool, error) {
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
func (rm *RefManager) Exists(ref scpath.RefPath) (bool, error) {
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
func (rm *RefManager) resolveReferencePath(ref scpath.RefPath) scpath.SourcePath {
	refStr := strings.TrimSpace(ref.String())

	// Handle HEAD reference
	if refStr == scpath.HeadFile {
		return rm.headPath
	}

	// If ref starts with "refs/", don't duplicate the refs root
	if strings.HasPrefix(refStr, scpath.RefsDir+"/") {
		// Remove the "refs/" prefix and join with refsPath
		relPath := strings.TrimPrefix(refStr, scpath.RefsDir+"/")
		return rm.refsPath.Join(relPath)
	}

	// Otherwise, join directly with refsPath
	return rm.refsPath.Join(refStr)
}

// isSHA1 checks if a string is a valid SHA-1 hash
func isSHA1(str string) bool {
	sha1Regex := regexp.MustCompile(`^[0-9a-f]{40}$`)
	return sha1Regex.MatchString(strings.ToLower(str))
}

package scpath

import (
	"fmt"
	"path/filepath"
	"strings"
)

// RepositoryPath represents an absolute path to a repository root directory
// Example: "/home/user/myproject" or "C:\Users\user\myproject"
type RepositoryPath string

// WorkingPath represents a path within the working directory
// This is typically an absolute path
type WorkingPath string

// RelativePath represents a normalized relative path (forward slashes, no ..)
// Example: "src/main.go" or "docs/README.md"
type RelativePath string

// ObjectPath represents a path within .source/objects directory
// Format: "ab/cdef123..." (2-char prefix + 38-char suffix)
type ObjectPath string

// RefPath represents a Git reference path
// Examples: "refs/heads/main", "refs/tags/v1.0.0", "HEAD"
type RefPath string

// IndexPath represents the path to the Git index file
// Typically ".source/index"
type IndexPath string

// ConfigPath represents a path to a configuration file
type ConfigPath string

// RepositoryPath methods

// WorkingPath methods

// String returns the path as a string
func (wp WorkingPath) String() string {
	return string(wp)
}

// IsValid checks if this is a valid path
func (wp WorkingPath) IsValid() bool {
	return len(wp) > 0
}

// Join joins path elements to the working path
func (wp WorkingPath) Join(elem ...string) WorkingPath {
	parts := append([]string{string(wp)}, elem...)
	return WorkingPath(filepath.Join(parts...))
}

// RelativeTo returns a relative path from the base path
func (wp WorkingPath) RelativeTo(base RepositoryPath) (RelativePath, error) {
	rel, err := filepath.Rel(string(base), string(wp))
	if err != nil {
		return "", fmt.Errorf("failed to get relative path: %w", err)
	}
	return RelativePath(rel).Normalize(), nil
}

// Base returns the last element of the path
func (wp WorkingPath) Base() string {
	return filepath.Base(string(wp))
}

// Dir returns all but the last element of the path
func (wp WorkingPath) Dir() WorkingPath {
	return WorkingPath(filepath.Dir(string(wp)))
}

// String returns the reference path as a string
func (rp RefPath) String() string {
	return string(rp)
}

// IsValid checks if this is a valid reference path
func (rp RefPath) IsValid() bool {
	s := string(rp)
	if len(s) == 0 {
		return false
	}

	invalidChars := []string{" ", "~", "^", ":", "?", "*", "[", "\\", "..", "@{", "//"}
	for _, invalid := range invalidChars {
		if strings.Contains(s, invalid) {
			return false
		}
	}

	if strings.HasSuffix(s, ".lock") || strings.HasSuffix(s, ".") {
		return false
	}

	if strings.HasPrefix(s, ".") {
		return false
	}
	return true
}

// IsBranch checks if this is a branch reference
func (rp RefPath) IsBranch() bool {
	return strings.HasPrefix(string(rp), "refs/heads/")
}

// IsTag checks if this is a tag reference
func (rp RefPath) IsTag() bool {
	return strings.HasPrefix(string(rp), "refs/tags/")
}

// IsHEAD checks if this is the HEAD reference
func (rp RefPath) IsHEAD() bool {
	return rp == RefHEAD
}

// ShortName returns the short name of the reference
// "refs/heads/main" -> "main"
// "refs/tags/v1.0.0" -> "v1.0.0"
// "HEAD" -> "HEAD"
func (rp RefPath) ShortName() string {
	s := string(rp)
	if rp.IsBranch() {
		return strings.TrimPrefix(s, "refs/heads/")
	}
	if rp.IsTag() {
		return strings.TrimPrefix(s, "refs/tags/")
	}
	return s
}

// ToWorkingPath converts to a working path within the repository
func (rp RefPath) ToWorkingPath(repoPath RepositoryPath) WorkingPath {
	return repoPath.Join(SourceDir, string(rp))
}

// NewBranchRef creates a branch reference path
func NewBranchRef(name string) (RefPath, error) {
	if len(name) == 0 {
		return "", fmt.Errorf("branch name cannot be empty")
	}
	refPath := RefPath("refs/heads/" + name)
	if !refPath.IsValid() {
		return "", fmt.Errorf("invalid branch name: %s", name)
	}
	return refPath, nil
}

// NewTagRef creates a tag reference path
func NewTagRef(name string) (RefPath, error) {
	if len(name) == 0 {
		return "", fmt.Errorf("tag name cannot be empty")
	}
	refPath := RefPath("refs/tags/" + name)
	if !refPath.IsValid() {
		return "", fmt.Errorf("invalid tag name: %s", name)
	}
	return refPath, nil
}

// IndexPath methods

// String returns the index path as a string
func (ip IndexPath) String() string {
	return string(ip)
}

// ToWorkingPath converts to a working path
func (ip IndexPath) ToWorkingPath() WorkingPath {
	return WorkingPath(ip)
}

// ConfigPath methods

// String returns the config path as a string
func (cp ConfigPath) String() string {
	return string(cp)
}

// ToWorkingPath converts to a working path
func (cp ConfigPath) ToWorkingPath() WorkingPath {
	return WorkingPath(cp)
}

// Helper functions

// isHexString checks if a string contains only hex characters
func isHexString(s string) bool {
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// SanitizePath sanitizes a path for use in Git
func SanitizePath(path string) string {
	path = filepath.ToSlash(path)
	path = strings.Trim(path, "/")
	return path
}

// IsPathSafe checks if a path is safe (no directory traversal, etc.)
func IsPathSafe(path string) bool {
	if strings.Contains(path, "..") {
		return false
	}
	// Cannot be absolute (check both Unix and Windows style)
	if filepath.IsAbs(path) || strings.HasPrefix(path, "/") {
		return false
	}
	// Cannot contain backslashes (use forward slashes)
	if strings.Contains(path, "\\") {
		return false
	}
	return true
}

// NormalizePath normalizes a path for Git (forward slashes, no trailing slash)
func NormalizePath(path string) string {
	// Convert to forward slashes
	path = filepath.ToSlash(filepath.Clean(path))
	// Remove leading ./
	path = strings.TrimPrefix(path, "./")
	// Remove trailing slash (except for root)
	if len(path) > 1 {
		path = strings.TrimSuffix(path, "/")
	}
	return path
}

// JoinPaths joins multiple path segments using forward slashes
func JoinPaths(paths ...string) string {
	return NormalizePath(filepath.Join(paths...))
}

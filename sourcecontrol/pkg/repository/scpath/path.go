package scpath

import (
	"fmt"
	"path/filepath"
	"strings"
)

// RepositoryPath represents an absolute path to a repository root directory
// Example: "/home/user/myproject" or "C:\Users\user\myproject"
type RepositoryPath string

// AbsolutePath represents any absolute path in the repository filesystem
// This can be used for paths anywhere in the repository structure
type AbsolutePath string

// SourcePath represents a path within the .source directory (Git metadata)
// Example: "/repo/.source" or "/repo/.source/refs/heads"
type SourcePath string

// RelativePath represents a normalized relative path (forward slashes, no ..)
// Example: "src/main.go" or "docs/README.md"
type RelativePath string

// ObjectPath represents a path within .source/objects directory
// Format: "ab/cdef123..." (2-char prefix + 38-char suffix)
type ObjectPath string

// RefPath represents a Git reference path
// Examples: "refs/heads/main", "refs/tags/v1.0.0", "HEAD"
type RefPath string

// String returns the path as a string
func (ap AbsolutePath) String() string {
	return string(ap)
}

// IsValid checks if this is a valid path
func (ap AbsolutePath) IsValid() bool {
	return len(ap) > 0
}

// Join joins path elements to the absolute path
func (ap AbsolutePath) Join(elem ...string) AbsolutePath {
	parts := append([]string{string(ap)}, elem...)
	return AbsolutePath(filepath.Join(parts...))
}

// RelativeTo returns a relative path from the base path
func (ap AbsolutePath) RelativeTo(base RepositoryPath) (RelativePath, error) {
	rel, err := filepath.Rel(string(base), string(ap))
	if err != nil {
		return "", fmt.Errorf("failed to get relative path: %w", err)
	}
	return RelativePath(rel).Normalize(), nil
}

// Base returns the last element of the path
func (ap AbsolutePath) Base() string {
	return filepath.Base(string(ap))
}

// Dir returns all but the last element of the path
func (ap AbsolutePath) Dir() AbsolutePath {
	return AbsolutePath(filepath.Dir(string(ap)))
}

// SourcePath methods

// String returns the path as a string
func (sp SourcePath) String() string {
	return string(sp)
}

// IsValid checks if this is a valid source path
func (sp SourcePath) IsValid() bool {
	return len(sp) > 0
}

// Join joins path elements to the source path
func (sp SourcePath) Join(elem ...string) SourcePath {
	parts := append([]string{string(sp)}, elem...)
	return SourcePath(filepath.Join(parts...))
}

// ToAbsolutePath converts to an absolute path
func (sp SourcePath) ToAbsolutePath() AbsolutePath {
	return AbsolutePath(sp)
}

// Base returns the last element of the path
func (sp SourcePath) Base() string {
	return filepath.Base(string(sp))
}

// Dir returns all but the last element of the path
func (sp SourcePath) Dir() SourcePath {
	return SourcePath(filepath.Dir(string(sp)))
}

// ObjectsPath returns the path to the objects directory
func (sp SourcePath) ObjectsPath() SourcePath {
	return sp.Join(ObjectsDir)
}

// RefsPath returns the path to the refs directory
func (sp SourcePath) RefsPath() SourcePath {
	return sp.Join(RefsDir)
}

// HeadPath returns the path to the HEAD file
func (sp SourcePath) HeadPath() SourcePath {
	return sp.Join(HeadFile)
}

// IndexPath returns the path to the index file
func (sp SourcePath) IndexPath() SourcePath {
	return sp.Join(IndexFile)
}

// ConfigPath returns the path to the config file
func (sp SourcePath) ConfigPath() SourcePath {
	return sp.Join(ConfigFile)
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

// ToSourcePath converts to a source path within the repository
func (rp RefPath) ToSourcePath(repoPath RepositoryPath) SourcePath {
	return SourcePath(repoPath.Join(SourceDir, string(rp)))
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

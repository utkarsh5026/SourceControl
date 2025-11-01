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

const (
	// SourceDir is the name of the source control directory
	SourceDir = ".source"

	// ObjectsDir is the name of the objects directory
	ObjectsDir = "objects"

	// RefsDir is the name of the refs directory
	RefsDir = "refs"

	// HeadsDir is the name of the heads directory (branches)
	HeadsDir = "heads"

	// TagsDir is the name of the tags directory
	TagsDir = "tags"

	// IndexFile is the name of the index file
	IndexFile = "index"

	// ConfigFile is the name of the config file
	ConfigFile = "config"

	// HeadFile is the name of the HEAD file
	HeadFile = "HEAD"
)

// Common reference paths
const (
	RefHeads RefPath = "refs/heads"
	RefTags  RefPath = "refs/tags"
	RefHEAD  RefPath = "HEAD"
)

// RepositoryPath methods

// String returns the path as a string
func (rp RepositoryPath) String() string {
	return string(rp)
}

// IsValid checks if this is a valid absolute path
func (rp RepositoryPath) IsValid() bool {
	return filepath.IsAbs(string(rp))
}

// Join joins path elements to the repository path
func (rp RepositoryPath) Join(elem ...string) WorkingPath {
	parts := append([]string{string(rp)}, elem...)
	return WorkingPath(filepath.Join(parts...))
}

// SourcePath returns the path to the .source directory
func (rp RepositoryPath) SourcePath() WorkingPath {
	return rp.Join(SourceDir)
}

// ObjectsPath returns the path to the objects directory
func (rp RepositoryPath) ObjectsPath() WorkingPath {
	return rp.Join(SourceDir, ObjectsDir)
}

// RefsPath returns the path to the refs directory
func (rp RepositoryPath) RefsPath() WorkingPath {
	return rp.Join(SourceDir, RefsDir)
}

// IndexPath returns the path to the index file
func (rp RepositoryPath) IndexPath() IndexPath {
	return IndexPath(rp.Join(SourceDir, IndexFile))
}

// ConfigPath returns the path to the config file
func (rp RepositoryPath) ConfigPath() ConfigPath {
	return ConfigPath(rp.Join(SourceDir, ConfigFile))
}

// HeadPath returns the path to the HEAD file
func (rp RepositoryPath) HeadPath() WorkingPath {
	return rp.Join(SourceDir, HeadFile)
}

// NewRepositoryPath creates a new RepositoryPath from a string
func NewRepositoryPath(path string) (RepositoryPath, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("failed to get absolute path: %w", err)
	}
	return RepositoryPath(absPath), nil
}

// WorkingPath methods

// String returns the path as a string
func (wp WorkingPath) String() string {
	return string(wp)
}

// IsValid checks if this is a valid path
func (wp WorkingPath) IsValid() bool {
	return len(wp) > 0
}

// Exists checks if the path exists on the filesystem
// Note: This would typically require os.Stat, which we'll implement when needed
func (wp WorkingPath) Exists() bool {
	// Placeholder - will be implemented with actual file system check
	return true
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

// RelativePath methods

// String returns the path as a string
func (rp RelativePath) String() string {
	return string(rp)
}

// IsValid checks if this is a valid relative path
func (rp RelativePath) IsValid() bool {
	s := string(rp)
	// Cannot be empty
	if len(s) == 0 {
		return false
	}
	// Cannot be absolute (check for both Unix and Windows style)
	if filepath.IsAbs(s) || strings.HasPrefix(s, "/") {
		return false
	}
	// Cannot contain .. (directory traversal)
	if strings.Contains(s, "..") {
		return false
	}
	return true
}

// Normalize normalizes the path (converts to forward slashes, cleans)
func (rp RelativePath) Normalize() RelativePath {
	// Convert to forward slashes (Git convention)
	normalized := filepath.ToSlash(filepath.Clean(string(rp)))
	// Remove leading ./
	normalized = strings.TrimPrefix(normalized, "./")
	return RelativePath(normalized)
}

// Components returns the path components
func (rp RelativePath) Components() []string {
	normalized := rp.Normalize()
	if normalized == "" || normalized == "." {
		return []string{}
	}
	return strings.Split(string(normalized), "/")
}

// Join joins path elements to create a new relative path
func (rp RelativePath) Join(elem ...string) RelativePath {
	parts := append([]string{string(rp)}, elem...)
	joined := filepath.Join(parts...)
	return RelativePath(joined).Normalize()
}

// Base returns the last element of the path
func (rp RelativePath) Base() string {
	normalized := rp.Normalize()
	components := normalized.Components()
	if len(components) == 0 {
		return ""
	}
	return components[len(components)-1]
}

// Dir returns all but the last element of the path
func (rp RelativePath) Dir() RelativePath {
	normalized := rp.Normalize()
	components := normalized.Components()
	if len(components) <= 1 {
		return ""
	}
	return RelativePath(strings.Join(components[:len(components)-1], "/"))
}

// IsInSubdir checks if the path is within the given subdirectory
func (rp RelativePath) IsInSubdir(subdir string) bool {
	normalized := rp.Normalize()
	return strings.HasPrefix(string(normalized), subdir+"/") || string(normalized) == subdir
}

// Depth returns the directory depth (number of path components)
func (rp RelativePath) Depth() int {
	return len(rp.Components())
}

// NewRelativePath creates and validates a new RelativePath
func NewRelativePath(path string) (RelativePath, error) {
	rp := RelativePath(path).Normalize()
	if !rp.IsValid() {
		return "", fmt.Errorf("invalid relative path: %s", path)
	}
	return rp, nil
}

// ObjectPath methods

// String returns the object path as a string
func (op ObjectPath) String() string {
	return string(op)
}

// IsValid checks if this is a valid object path (format: "ab/cdef...")
func (op ObjectPath) IsValid() bool {
	s := string(op)
	// Must be exactly 43 characters (2 + "/" + 38)
	if len(s) != 41 {
		return false
	}
	// Must have slash at position 2
	if s[2] != '/' {
		return false
	}
	// First 2 chars and last 38 chars must be hex
	prefix := s[:2]
	suffix := s[3:]
	return isHexString(prefix) && isHexString(suffix)
}

// Hash returns the full object hash (concatenating prefix and suffix)
func (op ObjectPath) Hash() string {
	s := string(op)
	if len(s) < 3 {
		return ""
	}
	return s[:2] + s[3:]
}

// Prefix returns the 2-character directory prefix
func (op ObjectPath) Prefix() string {
	if len(op) < 2 {
		return ""
	}
	return string(op[:2])
}

// Suffix returns the 38-character file name
func (op ObjectPath) Suffix() string {
	if len(op) < 4 {
		return ""
	}
	return string(op[3:])
}

// ToWorkingPath converts to a working path within the objects directory
func (op ObjectPath) ToWorkingPath(objectsDir WorkingPath) WorkingPath {
	return objectsDir.Join(op.Prefix(), op.Suffix())
}

// NewObjectPath creates an ObjectPath from a hash
func NewObjectPath(hash string) (ObjectPath, error) {
	if len(hash) != 40 {
		return "", fmt.Errorf("hash must be 40 characters, got %d", len(hash))
	}
	if !isHexString(hash) {
		return "", fmt.Errorf("hash must be hex string")
	}
	// Format: "ab/cdef123..."
	prefix := hash[:2]
	suffix := hash[2:]
	return ObjectPath(prefix + "/" + suffix), nil
}

// RefPath methods

// String returns the reference path as a string
func (rp RefPath) String() string {
	return string(rp)
}

// IsValid checks if this is a valid reference path
func (rp RefPath) IsValid() bool {
	s := string(rp)
	// Cannot be empty
	if len(s) == 0 {
		return false
	}
	// Cannot contain invalid characters
	invalidChars := []string{" ", "~", "^", ":", "?", "*", "[", "\\", "..", "@{", "//"}
	for _, invalid := range invalidChars {
		if strings.Contains(s, invalid) {
			return false
		}
	}
	// Cannot end with .lock or .
	if strings.HasSuffix(s, ".lock") || strings.HasSuffix(s, ".") {
		return false
	}
	// Cannot start with .
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
	// Convert to forward slashes
	path = filepath.ToSlash(path)
	// Remove leading/trailing slashes
	path = strings.Trim(path, "/")
	return path
}

// IsPathSafe checks if a path is safe (no directory traversal, etc.)
func IsPathSafe(path string) bool {
	// Cannot contain ..
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

package ignore

import (
	"path/filepath"
	"regexp"
	"strings"
)

const (
	NegationPrefix   = '!'
	DirectorySuffix  = '/'
	RootedPrefix     = '/'
	CommentPrefix    = '#'
	DefaultSource    = ".sourceignore"
)

// PatternConfig holds the parsed configuration of an ignore pattern
type PatternConfig struct {
	IsNegation     bool
	IsDirOnly      bool
	IsRooted       bool
	CleanedPattern string
}

// NewPatternConfig parses a pattern string and extracts its configuration
func NewPatternConfig(pattern string) PatternConfig {
	config := PatternConfig{}

	// Check for negation prefix (!)
	if strings.HasPrefix(pattern, string(NegationPrefix)) {
		config.IsNegation = true
		pattern = pattern[1:]
	}

	// Check for directory suffix (/)
	if strings.HasSuffix(pattern, string(DirectorySuffix)) {
		config.IsDirOnly = true
		pattern = pattern[:len(pattern)-1]
	}

	// Check for rooted prefix (/)
	if strings.HasPrefix(pattern, string(RootedPrefix)) {
		config.IsRooted = true
		pattern = pattern[1:]
	}

	config.CleanedPattern = strings.TrimSpace(pattern)
	return config
}

// IgnorePattern represents a single ignore pattern from .sourceignore file
//
// Pattern Rules:
// - Blank lines and lines starting with # are comments
// - Trailing spaces are ignored unless escaped with \
// - ! prefix negates the pattern (re-includes files)
// - / suffix matches only directories
// - / prefix matches from repository root
// - ** matches zero or more directories
// - * matches anything except /
// - ? matches any single character except /
// - [...] matches character ranges
//
// Examples:
// - *.log         → Ignore all .log files
// - build/        → Ignore build directory
// - /TODO         → Ignore TODO file in root only
// - **/temp       → Ignore temp in any directory
// - !important.log → Don't ignore important.log
// - docs/*.pdf    → Ignore PDFs in docs directory
// - src/**/*.test.ts → Ignore test files in src
type IgnorePattern struct {
	Pattern         string
	OriginalPattern string
	IsNegation      bool
	IsDirOnly       bool
	IsRooted        bool
	Source          string
	LineNumber      int
}

// NewIgnorePattern creates a new ignore pattern with the given parameters
func NewIgnorePattern(pattern, source string, lineNumber int) IgnorePattern {
	if source == "" {
		source = DefaultSource
	}

	config := NewPatternConfig(pattern)
	cleanedPattern := unescapePattern(config.CleanedPattern)

	return IgnorePattern{
		Pattern:         cleanedPattern,
		OriginalPattern: pattern,
		IsNegation:      config.IsNegation,
		IsDirOnly:       config.IsDirOnly,
		IsRooted:        config.IsRooted,
		Source:          source,
		LineNumber:      lineNumber,
	}
}

// FromLine creates an IgnorePattern from a line in .sourceignore file
// Returns nil if the line should be skipped (empty or comment)
func FromLine(line, source string, lineNumber int) *IgnorePattern {
	line = trimTrailingWhitespace(line)

	// Skip empty lines and comments
	if len(line) == 0 || strings.HasPrefix(line, string(CommentPrefix)) {
		return nil
	}

	if source == "" {
		source = DefaultSource
	}

	pattern := NewIgnorePattern(line, source, lineNumber)
	return &pattern
}

// Matches checks if this pattern matches the given path
// filePath: Path relative to repository root
// isDirectory: Whether the path is a directory
// fromDirectory: Directory containing the .sourceignore file
func (ip *IgnorePattern) Matches(filePath string, isDirectory bool, fromDirectory string) bool {
	// Normalize path separators to forward slashes
	filePath = filepath.ToSlash(filePath)
	fromDirectory = filepath.ToSlash(fromDirectory)

	// Directory-only patterns don't match files
	if ip.IsDirOnly && !isDirectory {
		return false
	}

	testPath := filePath
	if fromDirectory != "" {
		// Check if file is within the fromDirectory
		prefix := fromDirectory + "/"
		if !strings.HasPrefix(filePath, prefix) {
			return false
		}
		// Get relative path from fromDirectory
		testPath = filePath[len(prefix):]
	}

	// Rooted patterns match from the base directory
	if ip.IsRooted {
		return matchPattern(testPath, ip.Pattern, ip.IsDirOnly)
	}

	// Non-rooted patterns can match any subpath
	return matchAnySubpath(testPath, ip.Pattern, ip.IsDirOnly)
}

// trimTrailingWhitespace removes trailing whitespace unless escaped with backslash
func trimTrailingWhitespace(line string) string {
	// Count trailing backslashes
	backslashCount := 0
	for i := len(line) - 1; i >= 0; i-- {
		if line[i] == '\\' {
			backslashCount++
		} else {
			break
		}
	}

	// If odd number of backslashes, the last one escapes the space
	if backslashCount%2 == 1 {
		return line
	}

	return strings.TrimRight(line, " \t")
}

// unescapePattern removes escape sequences from the pattern
func unescapePattern(pattern string) string {
	// Unescape any escaped character
	result := strings.Builder{}
	escaped := false

	for _, ch := range pattern {
		if escaped {
			result.WriteRune(ch)
			escaped = false
		} else if ch == '\\' {
			escaped = true
		} else {
			result.WriteRune(ch)
		}
	}

	return result.String()
}

// containsWildcard checks if the pattern contains glob wildcards
func containsWildcard(pattern string) bool {
	wildcardChars := []rune{'*', '?', '[', ']', '{', '}'}
	for _, ch := range wildcardChars {
		if strings.ContainsRune(pattern, ch) {
			return true
		}
	}
	return strings.Contains(pattern, "**")
}

// matchPattern matches a path against a pattern using glob rules
func matchPattern(path, pattern string, isDirOnly bool) bool {
	// If no wildcards, do exact matching
	if !containsWildcard(pattern) {
		parts := strings.Split(path, "/")
		basename := ""
		if len(parts) > 0 {
			basename = parts[len(parts)-1]
		}

		exactMatch := basename == pattern || path == pattern

		// For directory patterns, also match children
		if isDirOnly && strings.HasPrefix(path, pattern+"/") {
			return true
		}

		return exactMatch
	}

	// Use filepath.Match for glob pattern matching
	matched, err := filepath.Match(pattern, path)
	if err == nil && matched {
		return true
	}

	// Handle ** matching (match across directories)
	if strings.Contains(pattern, "**") {
		globPattern := globToRegex(pattern)
		matched, _ := regexp.MatchString(globPattern, path)
		return matched
	}

	return false
}

// matchAnySubpath matches pattern against any subpath of the given path
func matchAnySubpath(testPath, pattern string, isDirOnly bool) bool {
	pathSegments := strings.Split(testPath, "/")

	for startIndex := 0; startIndex < len(pathSegments); startIndex++ {
		subPath := strings.Join(pathSegments[startIndex:], "/")
		if matchPattern(subPath, pattern, isDirOnly) {
			return true
		}
	}

	return false
}

// globToRegex converts a glob pattern to a regular expression
func globToRegex(pattern string) string {
	pattern = regexp.QuoteMeta(pattern)

	// Replace quoted wildcards with regex equivalents
	pattern = strings.ReplaceAll(pattern, `\*\*`, ".*")
	pattern = strings.ReplaceAll(pattern, `\*`, "[^/]*")
	pattern = strings.ReplaceAll(pattern, `\?`, "[^/]")

	return "^" + pattern + "$"
}

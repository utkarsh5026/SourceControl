package ignore

import "strings"

// PatternSet is a collection of ignore patterns with efficient matching
type PatternSet struct {
	patterns         []*IgnorePattern
	negationPatterns []*IgnorePattern
}

// NewPatternSet creates a new empty pattern set
func NewPatternSet() *PatternSet {
	return &PatternSet{
		patterns:         make([]*IgnorePattern, 0),
		negationPatterns: make([]*IgnorePattern, 0),
	}
}

// Add adds a pattern to the set
func (ps *PatternSet) Add(pattern *IgnorePattern) {
	if pattern.IsNegation {
		ps.negationPatterns = append(ps.negationPatterns, pattern)
	} else {
		ps.patterns = append(ps.patterns, pattern)
	}
}

// AddPatternsFromText parses text and adds all valid patterns to the set
func (ps *PatternSet) AddPatternsFromText(text, source string) {
	if source == "" {
		source = DefaultSource
	}

	lines := strings.Split(text, "\n")

	for index, line := range lines {
		pattern := FromLine(line, source, index+1)
		if pattern != nil {
			ps.Add(pattern)
		}
	}
}

// IsIgnored checks if a file path should be ignored
// filePath: Path relative to repository root
// isDirectory: Whether the path is a directory
// fromDirectory: Directory containing the .sourceignore file
func (ps *PatternSet) IsIgnored(filePath string, isDirectory bool, fromDirectory string) bool {
	// Check if any ignore pattern matches
	checkIgnored := func() bool {
		for _, pattern := range ps.patterns {
			if pattern.Matches(filePath, isDirectory, fromDirectory) {
				return true
			}
		}
		return false
	}

	// Check if any negation pattern matches (which would un-ignore the file)
	checkNegation := func() bool {
		for _, pattern := range ps.negationPatterns {
			if pattern.Matches(filePath, isDirectory, fromDirectory) {
				return false
			}
		}
		return true
	}

	return checkIgnored() && checkNegation()
}

// Clear removes all patterns from the set
func (ps *PatternSet) Clear() {
	ps.patterns = make([]*IgnorePattern, 0)
	ps.negationPatterns = make([]*IgnorePattern, 0)
}

// IgnoredPatterns returns all ignore patterns (non-negation patterns)
func (ps *PatternSet) IgnoredPatterns() []*IgnorePattern {
	return ps.patterns
}

// UnignoredPatterns returns all negation patterns (patterns that un-ignore files)
func (ps *PatternSet) UnignoredPatterns() []*IgnorePattern {
	return ps.negationPatterns
}

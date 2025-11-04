package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/utkarsh5026/SourceControl/pkg/common/fileops"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

// Store handles reading and writing JSON configuration files
// Provides atomic write operations to prevent corruption
type Store struct {
	path    scpath.AbsolutePath
	level   ConfigLevel
	entries map[string][]*ConfigEntry
	parser  *Parser
}

// NewStore creates a new configuration store for a specific file and level
func NewStore(path scpath.AbsolutePath, level ConfigLevel) *Store {
	return &Store{
		path:    path,
		level:   level,
		entries: make(map[string][]*ConfigEntry),
		parser:  &Parser{},
	}
}

// Load reads and parses the configuration file
// Returns nil if the file doesn't exist (empty config is valid)
// Returns error only for actual read/parse failures
func (s *Store) Load() error {
	if _, err := os.Stat(s.path.String()); os.IsNotExist(err) {
		// File doesn't exist - this is fine, start with empty config
		s.entries = make(map[string][]*ConfigEntry)
		return nil
	}

	content, err := os.ReadFile(s.path.String())
	if err != nil {
		return NewConfigError("load", CodeNotFoundErr, "", s.path.String(), "", err)
	}

	validation := s.parser.Validate(string(content))
	if !validation.Valid {
		fmt.Fprintf(os.Stderr, "Warning: Invalid configuration in %s:\n", s.path.String())
		for _, errMsg := range validation.Errors {
			fmt.Fprintf(os.Stderr, "  %s\n", errMsg)
		}
		s.entries = make(map[string][]*ConfigEntry)
		return nil
	}

	entries, err := s.parser.Parse(string(content), NewFileSource(s.path), s.level)
	if err != nil {
		return NewInvalidFormatError("load", s.path.String(), err)
	}

	s.entries = entries
	return nil
}

// Save writes the configuration to disk atomically
// Uses write-to-temp-then-rename pattern to ensure atomic updates
func (s *Store) Save() error {
	content, err := s.parser.Serialize(s.entries)
	if err != nil {
		return NewInvalidFormatError("save", s.path.String(), err)
	}

	dir := filepath.Dir(s.path.String())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return NewInvalidFormatError("save", s.path.String(), fmt.Errorf("failed to create directory: %w", err))
	}

	if err := fileops.AtomicWrite(s.path, []byte(content), 0644); err != nil {
		return NewInvalidFormatError("save", s.path.String(), err)
	}

	return nil
}

// GetEntries returns all entries for a specific key
func (s *Store) GetEntries(key string) []*ConfigEntry {
	entries, exists := s.entries[key]
	if !exists {
		return []*ConfigEntry{}
	}

	result := make([]*ConfigEntry, len(entries))
	for i, entry := range entries {
		result[i] = entry.Clone()
	}
	return result
}

// GetAllEntries returns a copy of all entries
func (s *Store) GetAllEntries() map[string][]*ConfigEntry {
	result := make(map[string][]*ConfigEntry, len(s.entries))
	for key, entries := range s.entries {
		result[key] = make([]*ConfigEntry, len(entries))
		for i, entry := range entries {
			result[key][i] = entry.Clone()
		}
	}
	return result
}

// Set replaces all values for a key with a single value
func (s *Store) Set(key, value string) {
	entry := NewEntry(key, value, s.level, NewFileSource(s.path), 0)
	s.entries[key] = []*ConfigEntry{entry}
}

// Add appends a value to a multi-value key
func (s *Store) Add(key, value string) {
	if _, exists := s.entries[key]; !exists {
		s.entries[key] = []*ConfigEntry{}
	}
	entry := NewEntry(key, value, s.level, NewFileSource(s.path), 0)
	s.entries[key] = append(s.entries[key], entry)
}

// Unset removes all values for a key
func (s *Store) Unset(key string) {
	delete(s.entries, key)
}

// ToJSON exports configuration as formatted JSON string
func (s *Store) ToJSON() (string, error) {
	return s.parser.FormatForDisplay(s.entries)
}

// FromJSON imports configuration from JSON string
func (s *Store) FromJSON(jsonContent string) error {
	validation := s.parser.Validate(jsonContent)
	if !validation.Valid {
		return NewInvalidFormatError("import", "", fmt.Errorf("invalid JSON configuration: %v", validation.Errors))
	}

	entries, err := s.parser.Parse(jsonContent, NewFileSource(s.path), s.level)
	if err != nil {
		return NewInvalidFormatError("import", "", err)
	}

	s.entries = entries
	return nil
}

// Path returns the file path for this store
func (s *Store) Path() scpath.AbsolutePath {
	return s.path
}

// Level returns the configuration level for this store
func (s *Store) Level() ConfigLevel {
	return s.level
}

// HasKey returns true if the store has any entries for the given key
func (s *Store) HasKey(key string) bool {
	entries, exists := s.entries[key]
	return exists && len(entries) > 0
}

// Clear removes all entries from the store
func (s *Store) Clear() {
	s.entries = make(map[string][]*ConfigEntry)
}

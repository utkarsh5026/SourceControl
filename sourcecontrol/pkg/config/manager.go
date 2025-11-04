package config

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"

	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
	"golang.org/x/sync/errgroup"
)

// Default configuration paths
const (
	WindowsProgramFilesPath = `C:\ProgramData\SourceControl`
	UnixProgramFilesPath    = "/etc/sourcecontrol"
	ConfigFileName          = "config.json"
)

// Manager is the central configuration manager that handles the hierarchy of config files
// It is thread-safe and can be used concurrently
type Manager struct {
	mu              sync.RWMutex
	stores          map[ConfigLevel]*Store
	commandLine     map[string]string
	builtinDefaults map[string]string
	parser          *Parser
}

// NewManager creates a new configuration manager
// If repositoryPath is provided, it will include repository-level configuration
func NewManager(repositoryPath scpath.RepositoryPath) *Manager {
	m := &Manager{
		stores:          make(map[ConfigLevel]*Store),
		commandLine:     make(map[string]string),
		builtinDefaults: make(map[string]string),
		parser:          &Parser{},
	}

	m.initializeStores(repositoryPath)
	m.loadBuiltinDefaults()

	return m
}

// Load loads all configuration files from disk
// This is typically called once during initialization
func (m *Manager) Load(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	g, _ := errgroup.WithContext(ctx)

	for _, store := range m.stores {
		s := store
		g.Go(func() error {
			return s.Load()
		})
	}

	return g.Wait()
}

// Get retrieves a configuration value, respecting the hierarchy
// Returns the highest precedence value, or nil if not found
func (m *Manager) Get(key string) *ConfigEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.getUnsafe(key)
}

// GetAll retrieves all values for a configuration key across all levels
// Useful for multi-value keys like remote.origin.fetch
func (m *Manager) GetAll(key string) []*ConfigEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var allEntries []*ConfigEntry

	if value, exists := m.commandLine[key]; exists {
		allEntries = append(allEntries, NewCommandLineEntry(key, value))
	}

	allEntries = append(allEntries, m.findInStores(key)...)

	if value, exists := m.builtinDefaults[key]; exists {
		allEntries = append(allEntries, NewBuiltinEntry(key, value))
	}

	return allEntries
}

// Set sets a configuration value at a specific level
// Returns an error if the level is not writable or doesn't exist
func (m *Manager) Set(key, value string, level ConfigLevel) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	store, err := m.validateStore("set", key, level)
	if err != nil {
		return err
	}

	store.Set(key, value)
	return store.Save()
}

// Add adds a value to a multi-value configuration key
func (m *Manager) Add(key, value string, level ConfigLevel) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	store, err := m.validateStore("add", key, level)
	if err != nil {
		return err
	}

	store.Add(key, value)
	return store.Save()
}

// Unset removes a configuration key at a specific level
func (m *Manager) Unset(key string, level ConfigLevel) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	store, err := m.validateStore("unset", key, level)
	if err != nil {
		return err
	}

	store.Unset(key)
	return store.Save()
}

func (m *Manager) validateStore(operation string, key string, level ConfigLevel) (*Store, error) {
	if !level.CanWrite() {
		return nil, NewConfigError(operation, CodeReadOnlyErr, key, "", level.String(), ErrReadOnly)
	}

	store, exists := m.stores[level]
	if !exists {
		return nil, NewConfigError(operation, CodeNotFoundErr, key, "", level.String(), fmt.Errorf("store does not exist for level"))
	}

	return store, nil
}

// SetCommandLine sets a command-line configuration value
func (m *Manager) SetCommandLine(key, value string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.commandLine[key] = value
}

// List returns all effective configuration entries (respecting hierarchy)
func (m *Manager) List() []*ConfigEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.listUnsafe()
}

func (m *Manager) collectAllKeys() map[string]bool {
	allKeys := make(map[string]bool)

	for key := range m.commandLine {
		allKeys[key] = true
	}
	for _, store := range m.stores {
		for key := range store.GetAllEntries() {
			allKeys[key] = true
		}
	}
	for key := range m.builtinDefaults {
		allKeys[key] = true
	}

	return allKeys
}

// ExportJSON exports configuration as JSON string
// If level is specified, only exports that level
// Otherwise exports all effective configuration
func (m *Manager) ExportJSON(level *ConfigLevel) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if level != nil {
		store, exists := m.stores[*level]
		if !exists {
			return "{}", nil
		}
		return store.ToJSON()
	}

	entries := m.listUnsafe()
	entriesMap := make(map[string][]*ConfigEntry)

	for _, entry := range entries {
		if _, exists := entriesMap[entry.Key]; !exists {
			entriesMap[entry.Key] = []*ConfigEntry{}
		}
		entriesMap[entry.Key] = append(entriesMap[entry.Key], entry)
	}

	return m.parser.Serialize(entriesMap)
}

// GetStore returns the store for a specific level
// Returns nil if the store doesn't exist
func (m *Manager) GetStore(level ConfigLevel) *Store {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.stores[level]
}

// initializeStores creates stores for different configuration levels
func (m *Manager) initializeStores(repositoryPath scpath.RepositoryPath) {
	systemPath := m.getSystemConfigPath()
	m.stores[SystemLevel] = NewStore(systemPath, SystemLevel)

	userPath := m.getUserConfigPath()
	m.stores[UserLevel] = NewStore(userPath, UserLevel)

	if repositoryPath != "" {
		repoPath := scpath.AbsolutePath(filepath.Join(string(repositoryPath), ConfigFileName))
		m.stores[RepositoryLevel] = NewStore(repoPath, RepositoryLevel)
	}
}

// getSystemConfigPath returns the system-wide configuration path
func (m *Manager) getSystemConfigPath() scpath.AbsolutePath {
	var path string
	if runtime.GOOS == "windows" {
		path = filepath.Join(WindowsProgramFilesPath, ConfigFileName)
	} else {
		path = filepath.Join(UnixProgramFilesPath, ConfigFileName)
	}
	return scpath.AbsolutePath(path)
}

// getUserConfigPath returns the user-specific configuration path
func (m *Manager) getUserConfigPath() scpath.AbsolutePath {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		// Fallback to current directory if home dir can't be determined
		homeDir = "."
	}
	return scpath.AbsolutePath(filepath.Join(homeDir, ".config", "sourcecontrol", ConfigFileName))
}

// loadBuiltinDefaults initializes hardcoded default values
func (m *Manager) loadBuiltinDefaults() {
	m.builtinDefaults["core.repositoryformatversion"] = "0"
	m.builtinDefaults["core.filemode"] = "true"
	m.builtinDefaults["core.bare"] = "false"
	m.builtinDefaults["core.logallrefupdates"] = "true"
	m.builtinDefaults["init.defaultbranch"] = "main"
	m.builtinDefaults["color.ui"] = "auto"
	m.builtinDefaults["diff.renames"] = "true"
	m.builtinDefaults["pull.rebase"] = "false"
	m.builtinDefaults["push.default"] = "simple"

	// Platform-specific defaults
	if runtime.GOOS == "windows" {
		m.builtinDefaults["core.ignorecase"] = "true"
		m.builtinDefaults["core.autocrlf"] = "true"
	} else {
		m.builtinDefaults["core.ignorecase"] = "false"
		m.builtinDefaults["core.autocrlf"] = "input"
	}
}

// getUnsafe is the internal implementation of Get without locking
// Caller must hold at least read lock
func (m *Manager) getUnsafe(key string) *ConfigEntry {
	if value, exists := m.commandLine[key]; exists {
		return NewCommandLineEntry(key, value)
	}

	entries := m.findInStores(key)
	if len(entries) > 0 {
		return entries[len(entries)-1]
	}

	if value, exists := m.builtinDefaults[key]; exists {
		return NewBuiltinEntry(key, value)
	}

	return nil
}

// listUnsafe is the internal implementation of List without locking
// Caller must hold at least read lock
func (m *Manager) listUnsafe() []*ConfigEntry {
	allKeys := m.collectAllKeys()
	var entries []*ConfigEntry
	for key := range allKeys {
		if entry := m.getUnsafe(key); entry != nil {
			entries = append(entries, entry)
		}
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Key < entries[j].Key
	})

	return entries
}

func (m *Manager) findInStores(key string) []*ConfigEntry {
	levels := []ConfigLevel{RepositoryLevel, UserLevel, SystemLevel}
	for _, level := range levels {
		store, exists := m.stores[level]
		if !exists {
			continue
		}

		entries := store.GetEntries(key)
		if len(entries) > 0 {
			return entries
		}
	}
	return nil
}

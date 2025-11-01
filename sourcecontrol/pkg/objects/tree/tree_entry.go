package tree

import (
	"bytes"
	"encoding/hex"
	"fmt"
	"strings"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
)

// EntryType represents the type of entry in a tree object
type EntryType string

const (
	EntryTypeDirectory      EntryType = "040000"
	EntryTypeRegularFile    EntryType = "100644"
	EntryTypeExecutableFile EntryType = "100755"
	EntryTypeSymbolicLink   EntryType = "120000"
	EntryTypeSubmodule      EntryType = "160000"
)

const (
	SHALengthBytes = 20
)

// TreeEntry represents a single entry in a Git tree object.
//
// Each entry contains:
// - mode: File permissions and type (6 bytes, octal)
// - name: Filename or directory name (variable length string)
// - sha: SHA-1 hash of the referenced object (40 character hex string)
//
// Entry types by mode:
// - 040000: Directory (tree object)
// - 100644: Regular file (blob object)
// - 100755: Executable file (blob object)
// - 120000: Symbolic link (blob object)
// - 160000: Git submodule (commit object)
//
// Serialized format in tree object:
// [mode] [space] [filename] [null byte] [20-byte SHA-1 binary]
//
// Example serialized entry for "hello.txt" file:
// "100644 hello.txt\0[20 bytes of SHA-1]"
type TreeEntry struct {
	mode string
	name string
	sha  string
}

// NewTreeEntry creates a new TreeEntry with validation
func NewTreeEntry(mode, name, sha string) (*TreeEntry, error) {
	entry := &TreeEntry{
		mode: mode,
	}

	if err := entry.validateName(name); err != nil {
		return nil, err
	}
	entry.name = name

	if err := entry.validateSha(sha); err != nil {
		return nil, err
	}
	entry.sha = strings.ToLower(sha)

	return entry, nil
}

// Mode returns the entry mode
func (e *TreeEntry) Mode() string {
	return e.mode
}

// Name returns the entry name
func (e *TreeEntry) Name() string {
	return e.name
}

// SHA returns the entry SHA-1 hash
func (e *TreeEntry) SHA() string {
	return e.sha
}

// EntryType returns the type of the entry based on its mode
func (e *TreeEntry) EntryType() (EntryType, error) {
	return FromMode(e.mode)
}

// FromMode converts a mode string to EntryType
func FromMode(mode string) (EntryType, error) {
	switch EntryType(mode) {
	case EntryTypeDirectory, EntryTypeRegularFile, EntryTypeExecutableFile,
		EntryTypeSymbolicLink, EntryTypeSubmodule:
		return EntryType(mode), nil
	default:
		return "", fmt.Errorf("unknown mode: %s", mode)
	}
}

// IsDirectory returns true if this entry is a directory
func (e *TreeEntry) IsDirectory() bool {
	entryType, _ := e.EntryType()
	return entryType == EntryTypeDirectory
}

// IsFile returns true if this entry is a regular or executable file
func (e *TreeEntry) IsFile() bool {
	entryType, _ := e.EntryType()
	return entryType == EntryTypeRegularFile || entryType == EntryTypeExecutableFile
}

// IsExecutable returns true if this entry is an executable file
func (e *TreeEntry) IsExecutable() bool {
	entryType, _ := e.EntryType()
	return entryType == EntryTypeExecutableFile
}

// IsSymbolicLink returns true if this entry is a symbolic link
func (e *TreeEntry) IsSymbolicLink() bool {
	entryType, _ := e.EntryType()
	return entryType == EntryTypeSymbolicLink
}

// IsSubmodule returns true if this entry is a submodule
func (e *TreeEntry) IsSubmodule() bool {
	entryType, _ := e.EntryType()
	return entryType == EntryTypeSubmodule
}

// Serialize serializes this entry for inclusion in a tree object
// Format: [mode] [space] [filename] [null byte] [20-byte SHA-1 binary]
func (e *TreeEntry) Serialize() ([]byte, error) {
	modeAndName := fmt.Sprintf("%s %s%c", e.mode, e.name, objects.NullByte)
	modeNameBytes := []byte(modeAndName)

	// Convert SHA-1 hex string to binary (20 bytes)
	shaBytes, err := hex.DecodeString(e.sha)
	if err != nil {
		return nil, fmt.Errorf("failed to decode SHA: %w", err)
	}

	result := make([]byte, len(modeNameBytes)+len(shaBytes))
	copy(result, modeNameBytes)
	copy(result[len(modeNameBytes):], shaBytes)

	return result, nil
}

// CompareTo compares this entry with another entry.
// The comparison is based on the entry's name, with directories sorted before files.
// Returns a negative value if this entry is less than the other, zero if they are equal,
// or a positive value if this entry is greater than the other.
func (e *TreeEntry) CompareTo(other *TreeEntry) int {
	if e.name == other.name {
		if e.IsDirectory() && !other.IsDirectory() {
			return -1
		}
		if !e.IsDirectory() && other.IsDirectory() {
			return 1
		}
		return 0
	}
	if e.name < other.name {
		return -1
	}
	return 1
}

// DeserializeTreeEntry creates a TreeEntry from serialized data
func DeserializeTreeEntry(data []byte, offset int) (*TreeEntry, int, error) {
	spaceIndex := bytes.IndexByte(data[offset:], objects.SpaceByte)
	if spaceIndex == -1 {
		return nil, 0, fmt.Errorf("invalid tree entry: missing space")
	}
	spaceIndex += offset

	mode := string(data[offset:spaceIndex])

	nullIndex := bytes.IndexByte(data[spaceIndex+1:], objects.NullByte)
	if nullIndex == -1 {
		return nil, 0, fmt.Errorf("invalid tree entry: missing null byte")
	}
	nullIndex += spaceIndex + 1

	name := string(data[spaceIndex+1 : nullIndex])

	// Extract SHA bytes
	start := nullIndex + 1
	end := start + SHALengthBytes
	if end > len(data) {
		return nil, 0, fmt.Errorf("invalid tree entry: incomplete SHA")
	}

	shaBytes := data[start:end]
	sha := hex.EncodeToString(shaBytes)

	entry, err := NewTreeEntry(mode, name, sha)
	if err != nil {
		return nil, 0, err
	}

	return entry, end, nil
}

// validateName validates the name of the entry.
// Git doesn't allow certain characters in filenames
func (e *TreeEntry) validateName(name string) error {
	if name == "" {
		return fmt.Errorf("name cannot be empty")
	}

	invalidChars := []string{"/", "\x00"}
	for _, char := range invalidChars {
		if strings.Contains(name, char) {
			return fmt.Errorf("invalid characters in name: %s", name)
		}
	}

	return nil
}

// validateSha validates the SHA of the entry.
// The SHA should only be hex characters and should be exactly 40 chars
func (e *TreeEntry) validateSha(sha string) error {
	expectedLength := SHALengthBytes * 2
	if len(sha) != expectedLength {
		return fmt.Errorf("SHA must be %d characters long, got %d", expectedLength, len(sha))
	}

	// Validate hex characters
	_, err := hex.DecodeString(sha)
	if err != nil {
		return fmt.Errorf("SHA must contain only hex characters: %w", err)
	}

	return nil
}

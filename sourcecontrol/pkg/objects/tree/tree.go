package tree

import (
	"bytes"
	"fmt"
	"io"
	"sort"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
)

// Tree represents a Git tree object implementation
//
// A tree object represents a directory snapshot in Git. It contains entries for
// files and subdirectories, each with their mode, name, and SHA-1 hash.
//
// Tree Object Structure:
// ┌─────────────────────────────────────────────────────────────────┐
// │ Header: "tree" SPACE size NULL                                  │
// │ Entry 1: mode SPACE name NULL [20-byte SHA-1]                   │
// │ Entry 2: mode SPACE name NULL [20-byte SHA-1]                   │
// │ ...                                                             │
// │ Entry N: mode SPACE name NULL [20-byte SHA-1]                   │
// └─────────────────────────────────────────────────────────────────┘
//
// Example tree object content (without header):
// "100644 README.md\0[20 bytes]040000 src\0[20 bytes]100755 build.sh\0[20 bytes]"
//
// Tree objects are essential for Git's content tracking because they:
// 1. Preserve directory structure and file organization
// 2. Track file permissions and types
// 3. Enable efficient diff calculations between directory states
// 4. Form the backbone of commit objects (each commit points to a root tree)
//
// Sorting Rules:
// Git sorts tree entries in a specific way to ensure deterministic hashes:
// - Entries are sorted lexicographically by name
// - Directories are treated as if they have a trailing "/"
// - This ensures that "file" comes before "file.txt" and "dir/" comes before "dir2"
type Tree struct {
	entries []*TreeEntry
	sha     *[20]byte
}

// NewTree creates a new Tree object with the given entries
func NewTree(entries []*TreeEntry) *Tree {
	tree := &Tree{
		entries: entries,
		sha:     nil,
	}
	tree.sortEntries()
	return tree
}

// ParseTree parses a tree object from serialized data (with header)
func ParseTree(data []byte) (*Tree, error) {
	size, contentStart, err := objects.ParseHeader(data, objects.TreeType)
	if err != nil {
		return nil, err
	}

	content := data[contentStart:]
	if int64(len(content)) != size {
		return nil, fmt.Errorf("tree size mismatch: expected %d, got %d", size, len(content))
	}

	entries, err := parseEntries(content)
	if err != nil {
		return nil, err
	}

	tree := &Tree{
		entries: entries,
		sha:     nil,
	}
	tree.sortEntries()

	sha := objects.CreateSha(data)
	tree.sha = &sha

	return tree, nil
}

// Type returns the object type
func (t *Tree) Type() objects.ObjectType {
	return objects.TreeType
}

// Content returns the raw content of the tree (serialized entries without header)
func (t *Tree) Content() ([]byte, error) {
	return t.serializeContent()
}

// Hash returns the SHA-1 hash of the tree
func (t *Tree) Hash() ([20]byte, error) {
	if t.sha != nil {
		return *t.sha, nil
	}

	// Calculate SHA if not cached
	content, err := t.Content()
	if err != nil {
		return [20]byte{}, fmt.Errorf("failed to get content: %w", err)
	}

	header := fmt.Sprintf("%s %d%c", objects.TreeType, len(content), objects.NullByte)
	fullData := append([]byte(header), content...)
	sha := objects.CreateSha(fullData)
	t.sha = &sha
	return sha, nil
}

// Size returns the size of the content in bytes
func (t *Tree) Size() (int64, error) {
	content, err := t.Content()
	if err != nil {
		return 0, err
	}
	return int64(len(content)), nil
}

// Serialize writes the tree in Git's storage format
func (t *Tree) Serialize(w io.Writer) error {
	content, err := t.Content()
	if err != nil {
		return fmt.Errorf("failed to get content: %w", err)
	}

	header := fmt.Sprintf("%s %d%c", objects.TreeType, len(content), objects.NullByte)

	if _, err := w.Write([]byte(header)); err != nil {
		return fmt.Errorf("failed to write tree header: %w", err)
	}

	if _, err := w.Write(content); err != nil {
		return fmt.Errorf("failed to write tree content: %w", err)
	}

	return nil
}

// String returns a human-readable representation
func (t *Tree) String() string {
	hash, err := t.Hash()
	if err != nil {
		return fmt.Sprintf("Tree{entries: %d, error: %v}", len(t.entries), err)
	}
	size, _ := t.Size()
	return fmt.Sprintf("Tree{entries: %d, size: %d, hash: %x}", len(t.entries), size, hash)
}

// Entries returns a copy of the tree entries to prevent external modification
func (t *Tree) Entries() []*TreeEntry {
	entries := make([]*TreeEntry, len(t.entries))
	copy(entries, t.entries)
	return entries
}

// IsEmpty returns true if the tree has no entries
func (t *Tree) IsEmpty() bool {
	return len(t.entries) == 0
}

// sortEntries sorts the entries according to Git's sorting rules
func (t *Tree) sortEntries() {
	sort.Slice(t.entries, func(i, j int) bool {
		return t.entries[i].CompareTo(t.entries[j]) < 0
	})
}

// serializeContent serializes all entries into a byte array
func (t *Tree) serializeContent() ([]byte, error) {
	if len(t.entries) == 0 {
		return []byte{}, nil
	}

	var buf bytes.Buffer
	for _, entry := range t.entries {
		serialized, err := entry.Serialize()
		if err != nil {
			return nil, fmt.Errorf("failed to serialize tree entry: %w", err)
		}
		if _, err := buf.Write(serialized); err != nil {
			return nil, fmt.Errorf("failed to write serialized entry: %w", err)
		}
	}

	return buf.Bytes(), nil
}

// parseEntries parses tree entries from content
func parseEntries(content []byte) ([]*TreeEntry, error) {
	var entries []*TreeEntry
	offset := 0

	for offset < len(content) {
		entry, nextOffset, err := DeserializeTreeEntry(content, offset)
		if err != nil {
			return nil, fmt.Errorf("failed to parse tree entry at offset %d: %w", offset, err)
		}
		entries = append(entries, entry)
		offset = nextOffset
	}

	return entries, nil
}

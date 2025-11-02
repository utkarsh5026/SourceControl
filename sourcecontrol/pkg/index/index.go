package index

import (
	"bytes"
	"crypto/sha1"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"sort"

	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

// Index represents the Git Index (Staging Area) - the bridge between working directory and commits.
//
// The index is Git's "staging area" - a snapshot of your working directory that
// you're building up for your next commit. It's stored as a binary file at .git/index.
//
// Index File Format:
//
//	┌────────────────────────────────────────┐
//	│ Header (12 bytes)                      │
//	│   Signature: "DIRC" (4 bytes)          │
//	│   Version: 2 (4 bytes)                 │
//	│   Entry Count: N (4 bytes)             │
//	├────────────────────────────────────────┤
//	│ Entries (variable length)              │
//	│   Entry 1                              │
//	│   Entry 2                              │
//	│   ...                                  │
//	│   Entry N                              │
//	├────────────────────────────────────────┤
//	│ Extensions (optional)                  │
//	├────────────────────────────────────────┤
//	│ SHA-1 Checksum (20 bytes)              │
//	└────────────────────────────────────────┘
type Index struct {
	Version uint32
	Entries []*Entry
}

// NewIndex creates a new empty index.
func NewIndex() *Index {
	return &Index{
		Version: IndexVersion,
		Entries: make([]*Entry, 0),
	}
}

// Read reads an index file from disk.
func Read(path scpath.SourcePath) (*Index, error) {
	// Check if file exists
	if _, err := os.Stat(path.String()); os.IsNotExist(err) {
		return NewIndex(), nil
	}

	// Read file
	data, err := os.ReadFile(path.String())
	if err != nil {
		return nil, fmt.Errorf("failed to read index file: %w", err)
	}

	// Deserialize
	index := NewIndex()
	if err := index.Deserialize(bytes.NewReader(data)); err != nil {
		return nil, fmt.Errorf("failed to deserialize index: %w", err)
	}

	return index, nil
}

// Write writes the index to disk.
func (idx *Index) Write(path string) error {
	buf := new(bytes.Buffer)

	if err := idx.Serialize(buf); err != nil {
		return fmt.Errorf("failed to serialize index: %w", err)
	}

	if err := os.WriteFile(path, buf.Bytes(), 0644); err != nil {
		return fmt.Errorf("failed to write index file: %w", err)
	}

	return nil
}

// Add adds an entry to the index.
func (idx *Index) Add(entry *Entry) {
	// Check if entry already exists
	for i, e := range idx.Entries {
		if e.Path == entry.Path {
			idx.Entries[i] = entry
			idx.sort()
			return
		}
	}

	// Add new entry
	idx.Entries = append(idx.Entries, entry)
	idx.sort()
}

// Remove removes an entry from the index by path.
func (idx *Index) Remove(path string) bool {
	for i, e := range idx.Entries {
		if e.Path == path {
			idx.Entries = append(idx.Entries[:i], idx.Entries[i+1:]...)
			return true
		}
	}
	return false
}

// Get retrieves an entry by path.
func (idx *Index) Get(path string) (*Entry, bool) {
	for _, e := range idx.Entries {
		if e.Path == path {
			return e, true
		}
	}
	return nil, false
}

// Has checks if an entry exists in the index.
func (idx *Index) Has(path string) bool {
	_, ok := idx.Get(path)
	return ok
}

// Clear removes all entries from the index.
func (idx *Index) Clear() {
	idx.Entries = make([]*Entry, 0)
}

// Paths returns all entry paths.
func (idx *Index) Paths() []string {
	paths := make([]string, len(idx.Entries))
	for i, e := range idx.Entries {
		paths[i] = e.Path
	}
	return paths
}

// Count returns the number of entries.
func (idx *Index) Count() int {
	return len(idx.Entries)
}

// Serialize writes the index in Git's binary format.
func (idx *Index) Serialize(w io.Writer) error {
	buf := new(bytes.Buffer)

	// Write header
	if err := idx.writeHeader(buf); err != nil {
		return fmt.Errorf("failed to write header: %w", err)
	}

	// Write entries
	for _, entry := range idx.Entries {
		if err := entry.Serialize(buf); err != nil {
			return fmt.Errorf("failed to serialize entry %s: %w", entry.Path, err)
		}
	}

	// Calculate and write checksum
	content := buf.Bytes()
	checksum := sha1.Sum(content)

	// Write content and checksum to output
	if _, err := w.Write(content); err != nil {
		return fmt.Errorf("failed to write content: %w", err)
	}
	if _, err := w.Write(checksum[:]); err != nil {
		return fmt.Errorf("failed to write checksum: %w", err)
	}

	return nil
}

// writeHeader writes the 12-byte index header.
func (idx *Index) writeHeader(w io.Writer) error {
	// Write signature "DIRC"
	if _, err := w.Write([]byte(IndexSignature)); err != nil {
		return fmt.Errorf("failed to write signature: %w", err)
	}

	// Write version
	if err := binary.Write(w, binary.BigEndian, idx.Version); err != nil {
		return fmt.Errorf("failed to write version: %w", err)
	}

	// Write entry count
	entryCount := uint32(len(idx.Entries))
	if err := binary.Write(w, binary.BigEndian, entryCount); err != nil {
		return fmt.Errorf("failed to write entry count: %w", err)
	}

	return nil
}

// Deserialize reads an index from binary data.
func (idx *Index) Deserialize(r io.Reader) error {
	// Read all data
	data, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("failed to read data: %w", err)
	}

	if len(data) < IndexHeaderSize+IndexChecksumSize {
		return fmt.Errorf("invalid index file: too small")
	}

	// Validate checksum first
	contentSize := len(data) - IndexChecksumSize
	content := data[:contentSize]
	expectedChecksum := data[contentSize:]
	actualChecksum := sha1.Sum(content)

	if !bytes.Equal(expectedChecksum, actualChecksum[:]) {
		return fmt.Errorf("index checksum mismatch")
	}

	// Parse header
	buf := bytes.NewReader(content)
	if err := idx.readHeader(buf); err != nil {
		return fmt.Errorf("failed to read header: %w", err)
	}

	// Read entries
	entryCount := uint32(len(idx.Entries))
	idx.Entries = make([]*Entry, 0, entryCount)

	for i := uint32(0); i < entryCount; i++ {
		entry := &Entry{}
		if _, err := entry.Deserialize(buf); err != nil {
			return fmt.Errorf("failed to deserialize entry %d: %w", i, err)
		}
		idx.Entries = append(idx.Entries, entry)
	}

	return nil
}

// readHeader reads the 12-byte index header.
func (idx *Index) readHeader(r io.Reader) error {
	// Read signature
	sig := make([]byte, 4)
	if _, err := io.ReadFull(r, sig); err != nil {
		return fmt.Errorf("failed to read signature: %w", err)
	}
	if string(sig) != IndexSignature {
		return fmt.Errorf("invalid index signature: %s", string(sig))
	}

	// Read version
	if err := binary.Read(r, binary.BigEndian, &idx.Version); err != nil {
		return fmt.Errorf("failed to read version: %w", err)
	}
	if idx.Version != IndexVersion {
		return fmt.Errorf("unsupported index version: %d", idx.Version)
	}

	// Read entry count
	var entryCount uint32
	if err := binary.Read(r, binary.BigEndian, &entryCount); err != nil {
		return fmt.Errorf("failed to read entry count: %w", err)
	}

	// Pre-allocate entries slice
	idx.Entries = make([]*Entry, entryCount)

	return nil
}

// sort sorts entries according to Git's rules.
// Git sorts entries by path, treating directories as having a trailing '/'.
func (idx *Index) sort() {
	sort.Slice(idx.Entries, func(i, j int) bool {
		return idx.Entries[i].CompareTo(idx.Entries[j]) < 0
	})
}

// String returns a human-readable representation of the index.
func (idx *Index) String() string {
	return fmt.Sprintf("Index{version: %d, entries: %d}", idx.Version, len(idx.Entries))
}

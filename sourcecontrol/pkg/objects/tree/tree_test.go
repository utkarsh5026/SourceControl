package tree

import (
	"bytes"
	"encoding/hex"
	"testing"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
)

func TestNewTree(t *testing.T) {
	sha := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"

	entry1, _ := NewTreeEntry("100644", "README.md", sha)
	entry2, _ := NewTreeEntry("040000", "src", sha)
	entry3, _ := NewTreeEntry("100755", "build.sh", sha)

	entries := []*TreeEntry{entry3, entry1, entry2} // Unsorted order

	tree := NewTree(entries)

	if tree == nil {
		t.Fatal("NewTree() returned nil")
	}

	if len(tree.Entries()) != 3 {
		t.Errorf("Entries() length = %v, want 3", len(tree.Entries()))
	}

	// Verify entries are sorted
	if tree.Entries()[0].Name() != "README.md" {
		t.Errorf("First entry name = %v, want README.md", tree.Entries()[0].Name())
	}
	if tree.Entries()[1].Name() != "build.sh" {
		t.Errorf("Second entry name = %v, want build.sh", tree.Entries()[1].Name())
	}
	if tree.Entries()[2].Name() != "src" {
		t.Errorf("Third entry name = %v, want src", tree.Entries()[2].Name())
	}
}

func TestTreeType(t *testing.T) {
	tree := NewTree([]*TreeEntry{})
	if tree.Type() != objects.TreeType {
		t.Errorf("Type() = %v, want %v", tree.Type(), objects.TreeType)
	}
}

func TestTreeIsEmpty(t *testing.T) {
	tests := []struct {
		name    string
		entries []*TreeEntry
		isEmpty bool
	}{
		{
			name:    "empty tree",
			entries: []*TreeEntry{},
			isEmpty: true,
		},
		{
			name: "non-empty tree",
			entries: []*TreeEntry{
				mustCreateEntry("100644", "file.txt", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"),
			},
			isEmpty: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tree := NewTree(tt.entries)
			if tree.IsEmpty() != tt.isEmpty {
				t.Errorf("IsEmpty() = %v, want %v", tree.IsEmpty(), tt.isEmpty)
			}
		})
	}
}

func TestTreeContent(t *testing.T) {
	sha := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
	entry, _ := NewTreeEntry("100644", "test.txt", sha)

	tree := NewTree([]*TreeEntry{entry})
	content := tree.Content()

	// Verify content is the serialized entry
	expectedContent, _ := entry.Serialize()
	if !bytes.Equal(content, expectedContent) {
		t.Errorf("Content() = %x, want %x", content, expectedContent)
	}
}

func TestTreeSize(t *testing.T) {
	sha := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
	entry1, _ := NewTreeEntry("100644", "a.txt", sha)
	entry2, _ := NewTreeEntry("100644", "b.txt", sha)

	tree := NewTree([]*TreeEntry{entry1, entry2})

	expectedSize := int64(len(tree.Content()))
	if tree.Size() != expectedSize {
		t.Errorf("Size() = %v, want %v", tree.Size(), expectedSize)
	}
}

func TestTreeHash(t *testing.T) {
	sha := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
	entry, _ := NewTreeEntry("100644", "test.txt", sha)

	tree := NewTree([]*TreeEntry{entry})
	hash1 := tree.Hash()

	// Hash should be consistent
	hash2 := tree.Hash()
	if hash1 != hash2 {
		t.Errorf("Hash() not consistent: %x != %x", hash1, hash2)
	}

	// Hash should be 20 bytes
	if len(hash1) != 20 {
		t.Errorf("Hash() length = %v, want 20", len(hash1))
	}
}

func TestTreeSerialize(t *testing.T) {
	sha := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
	entry, _ := NewTreeEntry("100644", "test.txt", sha)

	tree := NewTree([]*TreeEntry{entry})

	var buf bytes.Buffer
	err := tree.Serialize(&buf)
	if err != nil {
		t.Fatalf("Serialize() error = %v", err)
	}

	// Verify header
	data := buf.Bytes()
	nullIndex := bytes.IndexByte(data, objects.NullByte)
	if nullIndex == -1 {
		t.Fatal("Serialize() missing null byte in header")
	}

	header := string(data[:nullIndex])
	expectedHeaderPrefix := "tree "
	if !bytes.HasPrefix([]byte(header), []byte(expectedHeaderPrefix)) {
		t.Errorf("Serialize() header = %q, want prefix %q", header, expectedHeaderPrefix)
	}

	// Verify content after header
	content := data[nullIndex+1:]
	expectedContent, _ := entry.Serialize()
	if !bytes.Equal(content, expectedContent) {
		t.Errorf("Serialize() content = %x, want %x", content, expectedContent)
	}
}

func TestParseTree(t *testing.T) {
	// Create a tree and serialize it
	sha := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
	entry1, _ := NewTreeEntry("100644", "README.md", sha)
	entry2, _ := NewTreeEntry("040000", "src", sha)

	originalTree := NewTree([]*TreeEntry{entry1, entry2})

	var buf bytes.Buffer
	err := originalTree.Serialize(&buf)
	if err != nil {
		t.Fatalf("Serialize() error = %v", err)
	}

	// Parse it back
	parsedTree, err := ParseTree(buf.Bytes())
	if err != nil {
		t.Fatalf("ParseTree() error = %v", err)
	}

	// Verify entries
	if len(parsedTree.Entries()) != len(originalTree.Entries()) {
		t.Errorf("ParseTree() entries length = %v, want %v", len(parsedTree.Entries()), len(originalTree.Entries()))
	}

	for i, entry := range parsedTree.Entries() {
		originalEntry := originalTree.Entries()[i]
		if entry.Mode() != originalEntry.Mode() {
			t.Errorf("Entry %d mode = %v, want %v", i, entry.Mode(), originalEntry.Mode())
		}
		if entry.Name() != originalEntry.Name() {
			t.Errorf("Entry %d name = %v, want %v", i, entry.Name(), originalEntry.Name())
		}
		if entry.SHA() != originalEntry.SHA() {
			t.Errorf("Entry %d SHA = %v, want %v", i, entry.SHA(), originalEntry.SHA())
		}
	}

	// Verify hash
	if parsedTree.Hash() != originalTree.Hash() {
		t.Errorf("ParseTree() hash = %x, want %x", parsedTree.Hash(), originalTree.Hash())
	}
}

func TestParseTreeInvalidData(t *testing.T) {
	tests := []struct {
		name string
		data []byte
	}{
		{
			name: "invalid header type",
			data: []byte("blob 10\x00test data"),
		},
		{
			name: "missing null byte",
			data: []byte("tree 10 test data"),
		},
		{
			name: "size mismatch",
			data: []byte("tree 100\x00short"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseTree(tt.data)
			if err == nil {
				t.Error("ParseTree() expected error, got nil")
			}
		})
	}
}

func TestTreeEntrySorting(t *testing.T) {
	sha := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"

	// Create entries in random order
	entries := []*TreeEntry{
		mustCreateEntry("100644", "z.txt", sha),
		mustCreateEntry("040000", "a", sha),
		mustCreateEntry("100644", "b.txt", sha),
		mustCreateEntry("040000", "c", sha),
		mustCreateEntry("100755", "a.sh", sha),
	}

	tree := NewTree(entries)

	// Verify sorted order: a, a.sh, b.txt, c, z.txt
	expectedOrder := []string{"a", "a.sh", "b.txt", "c", "z.txt"}
	for i, expectedName := range expectedOrder {
		if tree.Entries()[i].Name() != expectedName {
			t.Errorf("Entry %d name = %v, want %v", i, tree.Entries()[i].Name(), expectedName)
		}
	}
}

func TestTreeBaseObjectInterface(t *testing.T) {
	// Ensure Tree implements BaseObject interface
	var _ objects.BaseObject = (*Tree)(nil)

	sha := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
	entry, _ := NewTreeEntry("100644", "test.txt", sha)
	tree := NewTree([]*TreeEntry{entry})

	// Test interface methods
	if tree.Type() != objects.TreeType {
		t.Errorf("Type() = %v, want %v", tree.Type(), objects.TreeType)
	}

	content := tree.Content()
	if content == nil {
		t.Error("Content() returned nil")
	}

	hash := tree.Hash()
	if len(hash) != 20 {
		t.Errorf("Hash() length = %v, want 20", len(hash))
	}

	size := tree.Size()
	if size != int64(len(content)) {
		t.Errorf("Size() = %v, want %v", size, len(content))
	}

	var buf bytes.Buffer
	err := tree.Serialize(&buf)
	if err != nil {
		t.Errorf("Serialize() error = %v", err)
	}

	str := tree.String()
	if str == "" {
		t.Error("String() returned empty string")
	}
}

func TestTreeRoundTrip(t *testing.T) {
	// Create a complex tree
	sha1 := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
	sha2 := "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1"
	sha3 := "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2"

	entries := []*TreeEntry{
		mustCreateEntry("100644", "README.md", sha1),
		mustCreateEntry("040000", "src", sha2),
		mustCreateEntry("100755", "build.sh", sha3),
		mustCreateEntry("120000", "link", sha1),
		mustCreateEntry("160000", "submodule", sha2),
	}

	originalTree := NewTree(entries)

	// Serialize
	var buf bytes.Buffer
	err := originalTree.Serialize(&buf)
	if err != nil {
		t.Fatalf("Serialize() error = %v", err)
	}

	// Parse back
	parsedTree, err := ParseTree(buf.Bytes())
	if err != nil {
		t.Fatalf("ParseTree() error = %v", err)
	}

	// Compare
	if len(parsedTree.Entries()) != len(originalTree.Entries()) {
		t.Fatalf("Entry count mismatch: got %d, want %d", len(parsedTree.Entries()), len(originalTree.Entries()))
	}

	for i := range originalTree.Entries() {
		orig := originalTree.Entries()[i]
		parsed := parsedTree.Entries()[i]

		if parsed.Mode() != orig.Mode() {
			t.Errorf("Entry %d mode: got %s, want %s", i, parsed.Mode(), orig.Mode())
		}
		if parsed.Name() != orig.Name() {
			t.Errorf("Entry %d name: got %s, want %s", i, parsed.Name(), orig.Name())
		}
		if parsed.SHA() != orig.SHA() {
			t.Errorf("Entry %d SHA: got %s, want %s", i, parsed.SHA(), orig.SHA())
		}
	}

	// Hashes should match
	if parsedTree.Hash() != originalTree.Hash() {
		t.Errorf("Hash mismatch: got %x, want %x", parsedTree.Hash(), originalTree.Hash())
	}
}

func TestTreeEmptySerialization(t *testing.T) {
	tree := NewTree([]*TreeEntry{})

	var buf bytes.Buffer
	err := tree.Serialize(&buf)
	if err != nil {
		t.Fatalf("Serialize() error = %v", err)
	}

	// Should have header with size 0
	data := buf.Bytes()
	expected := "tree 0\x00"
	if string(data) != expected {
		t.Errorf("Serialize() = %q, want %q", string(data), expected)
	}

	// Should be parseable
	parsed, err := ParseTree(data)
	if err != nil {
		t.Fatalf("ParseTree() error = %v", err)
	}

	if !parsed.IsEmpty() {
		t.Error("ParseTree() expected empty tree")
	}
}

// Helper function to create entries without error handling in tests
func mustCreateEntry(mode, name, sha string) *TreeEntry {
	entry, err := NewTreeEntry(mode, name, sha)
	if err != nil {
		panic(err)
	}
	return entry
}

func TestTreeContentWithMultipleEntries(t *testing.T) {
	sha1 := "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
	sha2 := "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1"

	entry1, _ := NewTreeEntry("100644", "a.txt", sha1)
	entry2, _ := NewTreeEntry("100644", "b.txt", sha2)

	tree := NewTree([]*TreeEntry{entry1, entry2})
	content := tree.Content()

	// Content should be concatenation of serialized entries
	serialized1, _ := entry1.Serialize()
	serialized2, _ := entry2.Serialize()

	expectedContent := append(serialized1, serialized2...)
	if !bytes.Equal(content, expectedContent) {
		t.Errorf("Content() = %x, want %x", content, expectedContent)
	}
}

func TestParseEntriesWithInvalidData(t *testing.T) {
	tests := []struct {
		name string
		data []byte
	}{
		{
			name: "truncated entry",
			data: []byte("100644 test.txt"),
		},
		{
			name: "missing SHA bytes",
			data: []byte("100644 test.txt\x00abc"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parseEntries(tt.data)
			if err == nil {
				t.Error("parseEntries() expected error, got nil")
			}
		})
	}
}

func TestTreeEntryInvalidMode(t *testing.T) {
	// Invalid modes are allowed during parsing but will error when accessing EntryType()
	sha, _ := hex.DecodeString("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0")
	data := append([]byte("999999 test.txt\x00"), sha...)

	entry, _, err := DeserializeTreeEntry(data, 0)
	if err != nil {
		t.Fatalf("DeserializeTreeEntry() unexpected error = %v", err)
	}

	// Should succeed in parsing
	if entry.Name() != "test.txt" {
		t.Errorf("Name() = %v, want test.txt", entry.Name())
	}

	// But should fail when trying to get entry type
	_, err = entry.EntryType()
	if err == nil {
		t.Error("EntryType() expected error for invalid mode, got nil")
	}
}

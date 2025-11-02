package index

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
)

func TestIndex_AddGetRemove(t *testing.T) {
	idx := NewIndex()
	hash, _ := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")

	entry := &Entry{
		Path: "test.txt",
		Mode: FileModeRegular,
		Size: 42,
		Hash: hash,
	}

	// Test Add
	idx.Add(entry)
	if idx.Count() != 1 {
		t.Errorf("Count() = %v, want 1", idx.Count())
	}

	// Test Get
	got, ok := idx.Get("test.txt")
	if !ok {
		t.Fatal("Get() returned not found")
	}
	if got.Path != entry.Path {
		t.Errorf("Get().Path = %v, want %v", got.Path, entry.Path)
	}

	// Test Has
	if !idx.Has("test.txt") {
		t.Error("Has() = false, want true")
	}
	if idx.Has("nonexistent.txt") {
		t.Error("Has() = true, want false for non-existent file")
	}

	// Test Remove
	if !idx.Remove("test.txt") {
		t.Error("Remove() = false, want true")
	}
	if idx.Count() != 0 {
		t.Errorf("Count() after remove = %v, want 0", idx.Count())
	}
	if idx.Has("test.txt") {
		t.Error("Has() after remove = true, want false")
	}

	// Test Remove non-existent
	if idx.Remove("nonexistent.txt") {
		t.Error("Remove() non-existent = true, want false")
	}
}

func TestIndex_Clear(t *testing.T) {
	idx := NewIndex()
	hash, _ := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")

	// Add multiple entries
	for i := 0; i < 5; i++ {
		entry := &Entry{
			Path: filepath.Join("test", string(rune('a'+i))+".txt"),
			Mode: FileModeRegular,
			Hash: hash,
		}
		idx.Add(entry)
	}

	if idx.Count() != 5 {
		t.Errorf("Count() = %v, want 5", idx.Count())
	}

	// Clear
	idx.Clear()
	if idx.Count() != 0 {
		t.Errorf("Count() after clear = %v, want 0", idx.Count())
	}
}

func TestIndex_Paths(t *testing.T) {
	idx := NewIndex()
	hash, _ := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")

	paths := []string{"a.txt", "b.txt", "c.txt"}
	for _, path := range paths {
		entry := &Entry{
			Path: path,
			Mode: FileModeRegular,
			Hash: hash,
		}
		idx.Add(entry)
	}

	got := idx.Paths()
	if len(got) != len(paths) {
		t.Fatalf("Paths() length = %v, want %v", len(got), len(paths))
	}

	// Entries should be sorted
	for i, path := range paths {
		if got[i] != path {
			t.Errorf("Paths()[%d] = %v, want %v", i, got[i], path)
		}
	}
}

func TestIndex_SerializeDeserialize(t *testing.T) {
	// Create an index with some entries
	original := NewIndex()
	hash1, _ := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")
	hash2, _ := objects.ParseObjectHash("5891b5b522d5df086d0ff0b110fbd9d21bb4fc71")

	entries := []*Entry{
		{
			Path:        "a.txt",
			Mode:        FileModeRegular,
			SizeInBytes: 100,
			Hash:        hash1,
		},
		{
			Path:        "b.txt",
			Mode:        FileModeExecutable,
			SizeInBytes: 200,
			Hash:        hash2,
		},
	}

	for _, entry := range entries {
		original.Add(entry)
	}

	// Serialize
	buf := new(bytes.Buffer)
	if err := original.Serialize(buf); err != nil {
		t.Fatalf("Serialize() error = %v", err)
	}

	// Deserialize
	deserialized := NewIndex()
	reader := bytes.NewReader(buf.Bytes())
	if err := deserialized.Deserialize(reader); err != nil {
		t.Fatalf("Deserialize() error = %v", err)
	}

	// Compare
	if deserialized.Version != original.Version {
		t.Errorf("Version = %v, want %v", deserialized.Version, original.Version)
	}
	if deserialized.Count() != original.Count() {
		t.Errorf("Count() = %v, want %v", deserialized.Count(), original.Count())
	}

	for i := 0; i < original.Count(); i++ {
		origEntry := original.Entries[i]
		deserEntry := deserialized.Entries[i]

		if deserEntry.Path != origEntry.Path {
			t.Errorf("Entry[%d].Path = %v, want %v", i, deserEntry.Path, origEntry.Path)
		}
		if deserEntry.Mode != origEntry.Mode {
			t.Errorf("Entry[%d].Mode = %v, want %v", i, deserEntry.Mode, origEntry.Mode)
		}
		if deserEntry.SizeInBytes != origEntry.SizeInBytes {
			t.Errorf("Entry[%d].SizeInBytes = %v, want %v", i, deserEntry.SizeInBytes, origEntry.SizeInBytes)
		}
		if deserEntry.Hash.String() != origEntry.Hash.String() {
			t.Errorf("Entry[%d].Hash = %v, want %v", i, deserEntry.Hash, origEntry.Hash)
		}
	}
}

func TestIndex_ReadWrite(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "index-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	indexPath := filepath.Join(tmpDir, "index")

	// Create and write index
	original := NewIndex()
	hash, _ := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")

	entry := &Entry{
		Path: "test.txt",
		Mode: FileModeRegular,
		Size: 42,
		Hash: hash,
	}
	original.Add(entry)

	if err := original.Write(indexPath); err != nil {
		t.Fatalf("Write() error = %v", err)
	}

	// Read index
	loaded, err := Read(scpath.SourcePath(indexPath))
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}

	// Compare
	if loaded.Count() != original.Count() {
		t.Errorf("Count() = %v, want %v", loaded.Count(), original.Count())
	}

	loadedEntry, ok := loaded.Get("test.txt")
	if !ok {
		t.Fatal("Get() returned not found")
	}

	if loadedEntry.Path != entry.Path {
		t.Errorf("Path = %v, want %v", loadedEntry.Path, entry.Path)
	}
	if loadedEntry.Hash.String() != entry.Hash.String() {
		t.Errorf("Hash = %v, want %v", loadedEntry.Hash, entry.Hash)
	}
}

func TestIndex_ReadNonExistent(t *testing.T) {
	// Reading non-existent file should return empty index
	idx, err := Read("/nonexistent/path/index")
	if err != nil {
		t.Fatalf("Read() error = %v, want nil", err)
	}

	if idx.Count() != 0 {
		t.Errorf("Count() = %v, want 0", idx.Count())
	}
}

func TestIndex_Sorting(t *testing.T) {
	idx := NewIndex()
	hash, _ := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")

	// Add entries in random order
	paths := []string{"z.txt", "a.txt", "m.txt", "b.txt"}
	for _, path := range paths {
		entry := &Entry{
			Path: path,
			Mode: FileModeRegular,
			Hash: hash,
		}
		idx.Add(entry)
	}

	// Verify they're sorted
	gotPaths := idx.Paths()
	expected := []string{"a.txt", "b.txt", "m.txt", "z.txt"}

	for i, path := range expected {
		if gotPaths[i] != path {
			t.Errorf("Paths()[%d] = %v, want %v", i, gotPaths[i], path)
		}
	}
}

func TestIndex_Update(t *testing.T) {
	idx := NewIndex()
	hash1, _ := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")
	hash2, _ := objects.ParseObjectHash("5891b5b522d5df086d0ff0b110fbd9d21bb4fc71")

	// Add entry
	entry1 := &Entry{
		Path: "test.txt",
		Mode: FileModeRegular,
		Size: 42,
		Hash: hash1,
	}
	idx.Add(entry1)

	if idx.Count() != 1 {
		t.Errorf("Count() after add = %v, want 1", idx.Count())
	}

	// Update entry (add same path with different data)
	entry2 := &Entry{
		Path: "test.txt",
		Mode: FileModeExecutable,
		Size: 100,
		Hash: hash2,
	}
	idx.Add(entry2)

	// Should still have 1 entry
	if idx.Count() != 1 {
		t.Errorf("Count() after update = %v, want 1", idx.Count())
	}

	// Check updated values
	got, ok := idx.Get("test.txt")
	if !ok {
		t.Fatal("Get() returned not found")
	}

	if got.Size != 100 {
		t.Errorf("Size = %v, want 100", got.Size)
	}
	if got.Mode != FileModeExecutable {
		t.Errorf("Mode = %v, want FileModeExecutable", got.Mode)
	}
	if got.Hash.String() != hash2.String() {
		t.Errorf("Hash = %v, want %v", got.Hash, hash2)
	}
}

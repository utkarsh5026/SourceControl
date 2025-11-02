package index

import (
	"bytes"
	"os"
	"testing"
	"time"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
)

func TestEntry_SerializeDeserialize(t *testing.T) {
	// Create a test entry
	hash, err := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")
	if err != nil {
		t.Fatalf("failed to parse hash: %v", err)
	}

	original := &Entry{
		CTime:       NewTimestamp(time.Now()),
		MTime:       NewTimestamp(time.Now()),
		DeviceID:    1,
		Inode:       12345,
		Mode:        FileModeRegular,
		UID:         1000,
		GID:         1000,
		Size:        42,
		Hash:        hash,
		AssumeValid: false,
		Stage:       0,
		Path:        "test/file.txt",
	}

	// Serialize
	buf := new(bytes.Buffer)
	if err := original.Serialize(buf); err != nil {
		t.Fatalf("Serialize() error = %v", err)
	}

	// Deserialize
	deserialized := &Entry{}
	reader := bytes.NewReader(buf.Bytes())
	if _, err := deserialized.Deserialize(reader); err != nil {
		t.Fatalf("Deserialize() error = %v", err)
	}

	// Compare
	if original.Path != deserialized.Path {
		t.Errorf("Path = %v, want %v", deserialized.Path, original.Path)
	}
	if original.Mode != deserialized.Mode {
		t.Errorf("Mode = %v, want %v", deserialized.Mode, original.Mode)
	}
	if original.Size != deserialized.Size {
		t.Errorf("Size = %v, want %v", deserialized.Size, original.Size)
	}
	if original.Hash.String() != deserialized.Hash.String() {
		t.Errorf("Hash = %v, want %v", deserialized.Hash, original.Hash)
	}
	if original.AssumeValid != deserialized.AssumeValid {
		t.Errorf("AssumeValid = %v, want %v", deserialized.AssumeValid, original.AssumeValid)
	}
	if original.Stage != deserialized.Stage {
		t.Errorf("Stage = %v, want %v", deserialized.Stage, original.Stage)
	}
}

func TestEntry_CompareTo(t *testing.T) {
	tests := []struct {
		name     string
		entry1   *Entry
		entry2   *Entry
		wantCmp  int
	}{
		{
			name:     "equal paths",
			entry1:   &Entry{Path: "file.txt"},
			entry2:   &Entry{Path: "file.txt"},
			wantCmp:  0,
		},
		{
			name:     "first comes before second",
			entry1:   &Entry{Path: "a.txt"},
			entry2:   &Entry{Path: "b.txt"},
			wantCmp:  -1,
		},
		{
			name:     "first comes after second",
			entry1:   &Entry{Path: "z.txt"},
			entry2:   &Entry{Path: "a.txt"},
			wantCmp:  1,
		},
		{
			name:     "directory vs file",
			entry1:   &Entry{Path: "dir", Mode: FileModeRegular},
			entry2:   &Entry{Path: "dir.txt", Mode: FileModeRegular},
			wantCmp:  -1, // "dir" < "dir.txt"
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.entry1.CompareTo(tt.entry2)

			// We only care about the sign, not the exact value
			var gotSign int
			if got < 0 {
				gotSign = -1
			} else if got > 0 {
				gotSign = 1
			} else {
				gotSign = 0
			}

			if gotSign != tt.wantCmp {
				t.Errorf("CompareTo() = %v, want %v", gotSign, tt.wantCmp)
			}
		})
	}
}

func TestEntry_IsModified(t *testing.T) {
	// Create a mock file
	tmpFile, err := os.CreateTemp("", "test-*.txt")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	if _, err := tmpFile.WriteString("test content"); err != nil {
		t.Fatalf("failed to write to temp file: %v", err)
	}

	info, err := tmpFile.Stat()
	if err != nil {
		t.Fatalf("failed to stat temp file: %v", err)
	}

	hash, _ := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")

	t.Run("not modified", func(t *testing.T) {
		entry := &Entry{
			Path:  "test.txt",
			Size:  uint32(info.Size()),
			MTime: NewTimestamp(info.ModTime()),
			Hash:  hash,
		}

		if entry.IsModified(info) {
			t.Error("entry should not be modified")
		}
	})

	t.Run("size changed", func(t *testing.T) {
		entry := &Entry{
			Path:  "test.txt",
			Size:  999, // Different size
			MTime: NewTimestamp(info.ModTime()),
			Hash:  hash,
		}

		if !entry.IsModified(info) {
			t.Error("entry should be modified (size changed)")
		}
	})

	t.Run("assume valid", func(t *testing.T) {
		entry := &Entry{
			Path:        "test.txt",
			Size:        999, // Different size
			MTime:       NewTimestamp(info.ModTime()),
			Hash:        hash,
			AssumeValid: true,
		}

		// Even with different size, assume-valid means not modified
		if entry.IsModified(info) {
			t.Error("entry with assume-valid should not be modified")
		}
	})
}

func TestNewEntryFromFileInfo(t *testing.T) {
	// Create a temp file
	tmpFile, err := os.CreateTemp("", "test-*.txt")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	content := "test content"
	if _, err := tmpFile.WriteString(content); err != nil {
		t.Fatalf("failed to write to temp file: %v", err)
	}

	info, err := tmpFile.Stat()
	if err != nil {
		t.Fatalf("failed to stat temp file: %v", err)
	}

	hash, _ := objects.ParseObjectHash("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")

	entry, err := NewEntryFromFileInfo("test.txt", info, hash)
	if err != nil {
		t.Fatalf("NewEntryFromFileInfo() error = %v", err)
	}

	if entry.Path != "test.txt" {
		t.Errorf("Path = %v, want %v", entry.Path, "test.txt")
	}
	if entry.Size != uint32(len(content)) {
		t.Errorf("Size = %v, want %v", entry.Size, len(content))
	}
	if entry.Hash.String() != hash.String() {
		t.Errorf("Hash = %v, want %v", entry.Hash, hash)
	}
}

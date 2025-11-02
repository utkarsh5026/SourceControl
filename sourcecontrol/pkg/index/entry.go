package index

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/utkarsh5026/SourceControl/pkg/common"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
)

// Entry represents a single file entry in the Git index (staging area).
//
// Each entry contains comprehensive metadata about a file:
// - Timestamps (creation and modification times with nanosecond precision)
// - File system metadata (device ID, inode, permissions)
// - Content hash (SHA-1 of the file's blob object)
// - Flags (staging state, assumptions about validity)
//
// Binary Layout (62 bytes + filename + padding):
//
//	┌────────────────────────────────────────────────────┐
//	│ CreationTime seconds    (4 bytes) │ CreationTime nanosecs (4)    │
//	│ mtime seconds    (4 bytes) │ mtime nanosecs (4)    │
//	│ device ID        (4 bytes) │ inode         (4)     │
//	│ mode             (4 bytes) │ UserID           (4)     │
//	│ GroupID              (4 bytes) │ file size     (4)     │
//	│ SHA-1 hash      (20 bytes)                         │
//	│ flags            (2 bytes)                         │
//	│ filename (variable) + null terminator + padding    │
//	└────────────────────────────────────────────────────┘
type Entry struct {
	CreationTime     common.Timestamp
	ModificationTime common.Timestamp

	// File system metadata
	DeviceID    uint32   // Device ID
	Inode       uint32   // Inode number
	Mode        FileMode // File mode (type + permissions)
	UserID      uint32   // User ID
	GroupID     uint32   // Group ID
	SizeInBytes uint32   // File size in bytes

	// Git object reference
	Hash objects.ObjectHash // SHA-1 hash of the blob

	// Index-specific flags
	AssumeValid bool  // Assume file hasn't changed
	Stage       uint8 // Staging number (0=normal, 1-3=merge conflict)

	// File path (relative to repository root)
	Path string
}

// NewEntry creates a new Entry with default values.
func NewEntry(path string) *Entry {
	return &Entry{
		Path:        path,
		Mode:        FileModeRegular,
		AssumeValid: false,
		Stage:       0,
	}
}

// NewEntryFromFileInfo creates an Entry from file system information.
func NewEntryFromFileInfo(path string, info os.FileInfo, hash objects.ObjectHash) (*Entry, error) {
	entry := NewEntry(path)
	entry.SizeInBytes = uint32(info.Size())
	entry.Mode = FileMode(info.Mode())
	entry.Hash = hash

	// Set timestamps
	modTime := info.ModTime()
	entry.ModificationTime = NewTimestamp(modTime)

	// Note: Go's FileInfo doesn't provide creation time or detailed stat info
	// For a complete implementation, you'd use platform-specific syscalls
	// For now, we'll use modification time for both
	entry.CreationTime = NewTimestamp(modTime)

	return entry, nil
}

// IsModified checks if the entry has been modified compared to file stats.
// This is used to detect changes between the index and working directory.
func (e *Entry) IsModified(info os.FileInfo) bool {
	// If assume-valid is set, trust the index
	if e.AssumeValid {
		return false
	}

	// Check file size
	if e.SizeInBytes != uint32(info.Size()) {
		return true
	}

	// Check modification time (seconds precision is usually sufficient)
	mtimeSeconds := info.ModTime().Unix()
	if int64(e.ModificationTime.Seconds) != mtimeSeconds {
		return true
	}

	// For more accurate detection, caller should compare actual file hash
	return false
}

// CompareTo compares this entry with another for sorting.
// Git sorts entries by name, treating directories as having a trailing '/'.
func (e *Entry) CompareTo(other *Entry) int {
	thisKey := e.Path
	otherKey := other.Path

	if e.Mode.IsDirectory() {
		thisKey += "/"
	}
	if other.Mode.IsDirectory() {
		otherKey += "/"
	}

	return strings.Compare(thisKey, otherKey)
}

// Serialize writes the entry in Git's index binary format.
func (e *Entry) Serialize(w io.Writer) error {
	buf := new(bytes.Buffer)

	// Write fixed-size fields (62 bytes)
	if err := e.writeFixedFields(buf); err != nil {
		return fmt.Errorf("failed to write fixed fields: %w", err)
	}

	// Write variable-length filename with null terminator
	if _, err := buf.WriteString(e.Path); err != nil {
		return fmt.Errorf("failed to write path: %w", err)
	}
	if err := buf.WriteByte(0); err != nil {
		return fmt.Errorf("failed to write null terminator: %w", err)
	}

	// Calculate padding to 8-byte boundary
	entrySize := FixedHeaderSize + len(e.Path) + 1
	paddedSize := (entrySize + AlignmentBoundary - 1) / AlignmentBoundary * AlignmentBoundary
	padding := paddedSize - entrySize

	// Write padding
	for i := 0; i < padding; i++ {
		if err := buf.WriteByte(0); err != nil {
			return fmt.Errorf("failed to write padding: %w", err)
		}
	}

	// Write to output
	if _, err := w.Write(buf.Bytes()); err != nil {
		return fmt.Errorf("failed to write entry: %w", err)
	}

	return nil
}

// writeFixedFields writes the 62-byte fixed header.
func (e *Entry) writeFixedFields(w io.Writer) error {
	// Create a buffer for binary encoding
	buf := new(bytes.Buffer)

	// Write timestamps
	fields := []uint32{
		e.CreationTime.Seconds,
		e.CreationTime.Nanoseconds,
		e.ModificationTime.Seconds,
		e.ModificationTime.Nanoseconds,
		e.DeviceID,
		e.Inode,
		uint32(e.Mode),
		e.UserID,
		e.GroupID,
		e.SizeInBytes,
	}

	for _, field := range fields {
		if err := binary.Write(buf, binary.BigEndian, field); err != nil {
			return fmt.Errorf("failed to write field: %w", err)
		}
	}

	// Write SHA-1 hash (20 bytes)
	hashBytes, err := e.Hash.Raw()
	if err != nil {
		return fmt.Errorf("failed to get hash bytes: %w", err)
	}
	if _, err := buf.Write(hashBytes[:]); err != nil {
		return fmt.Errorf("failed to write hash: %w", err)
	}

	// Write flags (2 bytes)
	flags := NewEntryFlags(e.AssumeValid, e.Stage, len(e.Path))
	if err := binary.Write(buf, binary.BigEndian, flags); err != nil {
		return fmt.Errorf("failed to write flags: %w", err)
	}

	// Write to output
	if _, err := w.Write(buf.Bytes()); err != nil {
		return fmt.Errorf("failed to write fixed fields: %w", err)
	}

	return nil
}

// Deserialize reads an entry from binary data.
func (e *Entry) Deserialize(r io.Reader) (int, error) {
	// Read fixed-size header (62 bytes)
	fixedData := make([]byte, FixedHeaderSize)
	if _, err := io.ReadFull(r, fixedData); err != nil {
		return 0, fmt.Errorf("failed to read fixed header: %w", err)
	}

	if err := e.readFixedFields(fixedData); err != nil {
		return 0, fmt.Errorf("failed to parse fixed fields: %w", err)
	}

	// Read variable-length filename (until null terminator)
	pathBytes := make([]byte, 0, 256) // Start with reasonable capacity
	for {
		b := make([]byte, 1)
		if _, err := r.Read(b); err != nil {
			return 0, fmt.Errorf("failed to read path: %w", err)
		}
		if b[0] == 0 {
			break
		}
		pathBytes = append(pathBytes, b[0])
	}
	e.Path = string(pathBytes)

	// Calculate total bytes read so far
	bytesRead := FixedHeaderSize + len(pathBytes) + 1 // +1 for null terminator

	// Calculate and skip padding
	paddedSize := (bytesRead + AlignmentBoundary - 1) / AlignmentBoundary * AlignmentBoundary
	padding := paddedSize - bytesRead

	if padding > 0 {
		paddingBuf := make([]byte, padding)
		if _, err := io.ReadFull(r, paddingBuf); err != nil {
			return 0, fmt.Errorf("failed to read padding: %w", err)
		}
	}

	return paddedSize, nil
}

// readFixedFields parses the 62-byte fixed header.
func (e *Entry) readFixedFields(data []byte) error {
	if len(data) < FixedHeaderSize {
		return fmt.Errorf("insufficient data for fixed header: got %d bytes, need %d", len(data), FixedHeaderSize)
	}

	buf := bytes.NewReader(data)

	// Read timestamps
	var CreationTimeSeconds, CreationTimeNanos, mtimeSeconds, mtimeNanos uint32
	if err := binary.Read(buf, binary.BigEndian, &CreationTimeSeconds); err != nil {
		return err
	}
	if err := binary.Read(buf, binary.BigEndian, &CreationTimeNanos); err != nil {
		return err
	}
	if err := binary.Read(buf, binary.BigEndian, &mtimeSeconds); err != nil {
		return err
	}
	if err := binary.Read(buf, binary.BigEndian, &mtimeNanos); err != nil {
		return err
	}

	e.CreationTime = common.Timestamp{Seconds: CreationTimeSeconds, Nanoseconds: CreationTimeNanos}
	e.ModificationTime = common.Timestamp{Seconds: mtimeSeconds, Nanoseconds: mtimeNanos}

	// Read file system metadata
	if err := binary.Read(buf, binary.BigEndian, &e.DeviceID); err != nil {
		return err
	}
	if err := binary.Read(buf, binary.BigEndian, &e.Inode); err != nil {
		return err
	}

	var mode uint32
	if err := binary.Read(buf, binary.BigEndian, &mode); err != nil {
		return err
	}
	e.Mode = FileMode(mode)

	if err := binary.Read(buf, binary.BigEndian, &e.UserID); err != nil {
		return err
	}
	if err := binary.Read(buf, binary.BigEndian, &e.GroupID); err != nil {
		return err
	}
	if err := binary.Read(buf, binary.BigEndian, &e.SizeInBytes); err != nil {
		return err
	}

	// Read SHA-1 hash (20 bytes)
	hashBytes := make([]byte, SHALength)
	if _, err := io.ReadFull(buf, hashBytes); err != nil {
		return fmt.Errorf("failed to read hash: %w", err)
	}
	hashStr := hex.EncodeToString(hashBytes)
	hash, err := objects.ParseObjectHash(hashStr)
	if err != nil {
		return fmt.Errorf("invalid hash: %w", err)
	}
	e.Hash = hash

	// Read flags (2 bytes)
	var flags EntryFlags
	if err := binary.Read(buf, binary.BigEndian, &flags); err != nil {
		return err
	}

	// Check for extended flag (not supported in version 2)
	if flags.Extended() {
		return fmt.Errorf("extended flags not supported in index version 2")
	}

	e.AssumeValid = flags.AssumeValid()
	e.Stage = flags.Stage()

	return nil
}

// String returns a human-readable representation of the entry.
func (e *Entry) String() string {
	return fmt.Sprintf("Entry{path: %s, mode: %s, hash: %s, size: %d}",
		e.Path, e.Mode, e.Hash.Short(), e.SizeInBytes)
}

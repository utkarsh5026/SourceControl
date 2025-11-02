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
	"github.com/utkarsh5026/SourceControl/pkg/repository/scpath"
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
	BlobHash objects.ObjectHash // SHA-1 hash of the blob

	// Index-specific flags
	AssumeValid bool  // Assume file hasn't changed
	Stage       uint8 // Staging number (0=normal, 1-3=merge conflict)

	// File path (relative to repository root)
	Path scpath.RelativePath
}

// NewEntry creates a new Entry with default values.
// The path is normalized to ensure consistency.
func NewEntry(path scpath.RelativePath) *Entry {
	return &Entry{
		Path:        path.Normalize(),
		Mode:        FileModeRegular,
		AssumeValid: false,
		Stage:       0,
	}
}

// NewEntryFromFileInfo creates an Entry from file system information.
// The path is validated and normalized before creating the entry.
func NewEntryFromFileInfo(path scpath.RelativePath, info os.FileInfo, hash objects.ObjectHash) (*Entry, error) {
	if !path.IsValid() {
		return nil, fmt.Errorf("invalid path: %s", path)
	}

	entry := NewEntry(path)
	entry.SizeInBytes = uint32(info.Size())
	entry.Mode = FileMode(info.Mode())
	entry.BlobHash = hash

	// Set timestamps
	modTime := info.ModTime()
	entry.ModificationTime = common.NewTimestampFromTime(modTime)

	// Note: Go's FileInfo doesn't provide creation time or detailed stat info
	// For a complete implementation, you'd use platform-specific syscalls
	// For now, we'll use modification time for both
	entry.CreationTime = common.NewTimestampFromTime(modTime)

	return entry, nil
}

// IsModified checks if the entry has been modified compared to file stats.
// This is used to detect changes between the index and working directory.
func (e *Entry) IsModified(info os.FileInfo) bool {
	if e.AssumeValid {
		return false
	}

	if e.SizeInBytes != uint32(info.Size()) {
		return true
	}

	mtimeSeconds := info.ModTime().Unix()
	if int64(e.ModificationTime.Seconds) != mtimeSeconds {
		return true
	}

	return false
}

// CompareTo compares this entry with another for sorting.
// Git sorts entries by name, treating directories as having a trailing '/'.
func (e *Entry) CompareTo(other *Entry) int {
	thisKey := e.Path.String()
	otherKey := other.Path.String()

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

	if err := e.writeFixedFields(buf); err != nil {
		return fmt.Errorf("failed to write fixed fields: %w", err)
	}

	if _, err := buf.WriteString(e.Path.String()); err != nil {
		return fmt.Errorf("failed to write path: %w", err)
	}
	if err := buf.WriteByte(objects.NullByte); err != nil {
		return fmt.Errorf("failed to write null terminator: %w", err)
	}

	// Calculate padding to 8-byte boundary
	pathLen := len(e.Path.String())
	entrySize := FixedHeaderSize + pathLen + 1
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
	buf := new(bytes.Buffer)

	if err := e.writeTimestampsAndMetadata(buf); err != nil {
		return fmt.Errorf("failed to write timestamps and metadata %w", err)
	}

	hashBytes, err := e.BlobHash.Raw()
	if err != nil {
		return fmt.Errorf("failed to get hash bytes: %w", err)
	}
	if _, err := buf.Write(hashBytes[:]); err != nil {
		return fmt.Errorf("failed to write hash: %w", err)
	}

	flags := NewEntryFlags(e.AssumeValid, e.Stage, len(e.Path.String()))
	if err := binary.Write(buf, binary.BigEndian, flags); err != nil {
		return fmt.Errorf("failed to write flags: %w", err)
	}

	if _, err := w.Write(buf.Bytes()); err != nil {
		return fmt.Errorf("failed to write fixed fields: %w", err)
	}

	return nil
}

func (e *Entry) writeTimestampsAndMetadata(w io.Writer) error {
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
		if err := binary.Write(w, binary.BigEndian, field); err != nil {
			return fmt.Errorf("failed to write field: %w", err)
		}
	}

	return nil
}

// Deserialize reads an entry from binary data.
func (e *Entry) Deserialize(r io.Reader) (int, error) {
	fixedData := make([]byte, FixedHeaderSize)
	if _, err := io.ReadFull(r, fixedData); err != nil {
		return 0, fmt.Errorf("failed to read fixed header: %w", err)
	}

	if err := e.readFixedFields(fixedData); err != nil {
		return 0, fmt.Errorf("failed to parse fixed fields: %w", err)
	}

	if err := e.readFilePath(r); err != nil {
		return 0, err
	}

	return e.calculatePadding(r)
}

// readFixedFields parses the 62-byte fixed header.
func (e *Entry) readFixedFields(data []byte) error {
	if len(data) < FixedHeaderSize {
		return fmt.Errorf("insufficient data for fixed header: got %d bytes, need %d", len(data), FixedHeaderSize)
	}

	buf := bytes.NewReader(data)

	if err := e.readTimestamp(buf); err != nil {
		return err
	}

	if err := e.readMetadata(buf); err != nil {
		return err
	}

	if err := e.readHash(buf); err != nil {
		return err
	}

	var flags EntryFlags
	if err := binary.Read(buf, binary.BigEndian, &flags); err != nil {
		return err
	}

	if flags.Extended() {
		return fmt.Errorf("extended flags not supported in index version 2")
	}

	e.AssumeValid = flags.AssumeValid()
	e.Stage = flags.Stage()
	return nil
}

func (e *Entry) readTimestamp(r io.Reader) error {
	var createMs, createNanos, modMs, modNanos uint32
	if err := binary.Read(r, binary.BigEndian, &createMs); err != nil {
		return err
	}
	if err := binary.Read(r, binary.BigEndian, &createNanos); err != nil {
		return err
	}
	if err := binary.Read(r, binary.BigEndian, &modMs); err != nil {
		return err
	}
	if err := binary.Read(r, binary.BigEndian, &modNanos); err != nil {
		return err
	}

	e.CreationTime = common.NewTimestamp(createMs, createNanos)
	e.ModificationTime = common.NewTimestamp(modMs, modNanos)
	return nil
}

func (e *Entry) readMetadata(r io.Reader) error {
	if err := binary.Read(r, binary.BigEndian, &e.DeviceID); err != nil {
		return err
	}
	if err := binary.Read(r, binary.BigEndian, &e.Inode); err != nil {
		return err
	}

	var mode uint32
	if err := binary.Read(r, binary.BigEndian, &mode); err != nil {
		return err
	}
	e.Mode = FileMode(mode)

	if err := binary.Read(r, binary.BigEndian, &e.UserID); err != nil {
		return err
	}
	if err := binary.Read(r, binary.BigEndian, &e.GroupID); err != nil {
		return err
	}
	if err := binary.Read(r, binary.BigEndian, &e.SizeInBytes); err != nil {
		return err
	}

	return nil
}

func (e *Entry) readHash(r io.Reader) error {
	hashBytes := make([]byte, SHALength)
	if _, err := io.ReadFull(r, hashBytes); err != nil {
		return fmt.Errorf("failed to read hash: %w", err)
	}
	hashStr := hex.EncodeToString(hashBytes)
	hash, err := objects.ParseObjectHash(hashStr)
	if err != nil {
		return fmt.Errorf("invalid hash: %w", err)
	}
	e.BlobHash = hash
	return nil
}

func (e *Entry) readFilePath(r io.Reader) error {
	pathBytes := make([]byte, 0, 256) // Start with reasonable capacity
	for {
		b := make([]byte, 1)
		if _, err := r.Read(b); err != nil {
			return fmt.Errorf("failed to read path: %w", err)
		}
		if b[0] == 0 {
			break
		}
		pathBytes = append(pathBytes, b[0])
	}

	// Validate and normalize the path
	pathStr := string(pathBytes)
	relativePath, err := scpath.NewRelativePath(pathStr)
	if err != nil {
		return fmt.Errorf("invalid path in index: %w", err)
	}

	e.Path = relativePath
	return nil
}

func (e *Entry) calculatePadding(r io.Reader) (int, error) {
	pathLen := len(e.Path.String())
	bytesRead := FixedHeaderSize + pathLen + 1 // +1 for null terminator

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

// String returns a human-readable representation of the entry.
func (e *Entry) String() string {
	return fmt.Sprintf("Entry{path: %s, mode: %s, hash: %s, size: %d}",
		e.Path, e.Mode, e.BlobHash.Short(), e.SizeInBytes)
}

package index

import (
	"fmt"

	"github.com/utkarsh5026/SourceControl/pkg/common"
)

// NewTimestampFromMillis creates a Timestamp from milliseconds.
var NewTimestampFromMillis = common.NewTimestampFromMillis

// FileMode represents Git file mode (type + permissions).
// Git stores file type in the upper 4 bits and permissions in the lower bits.
type FileMode uint32

// File mode constants that Git uses
const (
	FileModeTypeMask FileMode = 0xF000 // Upper 4 bits (bits 12-15)
	FileModePermMask FileMode = 0x01FF // Lower 9 bits (permissions)
	FileModeExecMask FileMode = 0x0049 // Execute bits (owner/group/other)

	// File type values (after shifting right by 12 bits)
	FileModeTypeRegular FileMode = 0x8000 // 0b1000 << 12 - Regular file
	FileModeTypeSymlink FileMode = 0xA000 // 0b1010 << 12 - Symbolic link
	FileModeTypeGitlink FileMode = 0xE000 // 0b1110 << 12 - Gitlink (submodule)
	FileModeTypeDir     FileMode = 0x0000 // 0b0000 << 12 - Directory (rare in index)

	// Common mode values
	FileModeRegular    FileMode = 0o100644 // Regular file, rw-r--r--
	FileModeExecutable FileMode = 0o100755 // Executable file, rwxr-xr-x
	FileModeSymlink    FileMode = 0o120000 // Symbolic link
	FileModeGitlink    FileMode = 0o160000 // Gitlink (submodule)
)

// Type returns the file type portion of the mode.
func (m FileMode) Type() FileMode {
	return m & FileModeTypeMask
}

// Permissions returns the permission bits.
func (m FileMode) Permissions() FileMode {
	return m & FileModePermMask
}

// IsRegular returns true if this is a regular file.
func (m FileMode) IsRegular() bool {
	return m.Type() == FileModeTypeRegular
}

// IsSymlink returns true if this is a symbolic link.
func (m FileMode) IsSymlink() bool {
	return m.Type() == FileModeTypeSymlink
}

// IsGitlink returns true if this is a gitlink (submodule).
func (m FileMode) IsGitlink() bool {
	return m.Type() == FileModeTypeGitlink
}

// IsDirectory returns true if this is a directory.
func (m FileMode) IsDirectory() bool {
	return m.Type() == FileModeTypeDir
}

// IsExecutable returns true if the file has execute permissions.
func (m FileMode) IsExecutable() bool {
	return (m & FileModeExecMask) != 0
}

// String returns a human-readable representation of the file mode.
func (m FileMode) String() string {
	switch m.Type() {
	case FileModeTypeRegular:
		return fmt.Sprintf("regular(%o)", m.Permissions())
	case FileModeTypeSymlink:
		return "symlink"
	case FileModeTypeGitlink:
		return "gitlink"
	case FileModeTypeDir:
		return "directory"
	default:
		return fmt.Sprintf("unknown(%o)", m)
	}
}

// EntryFlags represents the flags field in an index entry.
// The flags field contains several pieces of information packed into 16 bits:
// - Bit 15: assume-valid flag
// - Bit 14: extended flag (must be 0 for version 2)
// - Bits 13-12: stage number (0-3, for merge conflicts)
// - Bits 11-0: filename length (max 4095)
type EntryFlags uint16

const (
	// Flag bit positions and masks
	FlagAssumeValidBit                = 15
	FlagAssumeValidMask    EntryFlags = 0x8000
	FlagExtendedBit                   = 14
	FlagExtendedMask       EntryFlags = 0x4000
	FlagStageShift                    = 12
	FlagStageMask          EntryFlags = 0x3000
	FlagFilenameLengthMask EntryFlags = 0x0FFF
	MaxFilenameLength                 = 0x0FFF
)

// NewEntryFlags creates EntryFlags from components.
func NewEntryFlags(assumeValid bool, stage uint8, filenameLen int) EntryFlags {
	var flags EntryFlags

	if assumeValid {
		flags |= FlagAssumeValidMask
	}

	flags |= EntryFlags(stage&0x3) << FlagStageShift

	cappedLen := filenameLen
	if cappedLen > MaxFilenameLength {
		cappedLen = MaxFilenameLength
	}
	flags |= EntryFlags(cappedLen)

	return flags
}

// AssumeValid returns the assume-valid flag.
func (f EntryFlags) AssumeValid() bool {
	return (f & FlagAssumeValidMask) != 0
}

// Extended returns the extended flag.
func (f EntryFlags) Extended() bool {
	return (f & FlagExtendedMask) != 0
}

// Stage returns the stage number (0-3).
func (f EntryFlags) Stage() uint8 {
	return uint8((f & FlagStageMask) >> FlagStageShift)
}

// FilenameLength returns the filename length from the flags.
func (f EntryFlags) FilenameLength() int {
	return int(f & FlagFilenameLengthMask)
}

// Binary layout constants for index entries
const (
	FixedHeaderSize   = 62 // Everything before filename
	SHALength         = 20 // SHA-1 is always 20 bytes
	FlagsLength       = 2  // Flags are 2 bytes
	FieldSize         = 4  // Most fields are 4 bytes
	AlignmentBoundary = 8  // Entries are padded to 8-byte boundaries
)

// Index file format constants
const (
	IndexSignature    = "DIRC"
	IndexVersion      = 2
	IndexHeaderSize   = 12 // Signature (4) + Version (4) + Entry count (4)
	IndexChecksumSize = 20 // SHA-1 checksum
)

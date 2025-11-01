package objects

import (
	"bytes"
	"crypto/sha1"
	"fmt"
	"io"
)

// ObjectType represents the type of Git object
type ObjectType string

const (
	BlobType   ObjectType = "blob"
	TreeType   ObjectType = "tree"
	CommitType ObjectType = "commit"
	TagType    ObjectType = "tag"
)

const (
	NullByte  = byte(0)
	SpaceByte = byte(' ')
)

// String implements the Stringer interface
func (o ObjectType) String() string {
	return string(o)
}

// BaseObject represents a Git object interface
type BaseObject interface {
	// Type returns the object type
	Type() ObjectType

	// Content returns the raw content of the object
	Content() ([]byte, error)

	// Hash returns the SHA-1 hash of the object (20 bytes)
	Hash() ([20]byte, error)

	// Size returns the size of the content in bytes
	Size() (int64, error)

	// Serialize writes the object in Git's storage format
	Serialize(w io.Writer) error

	// String returns a human-readable representation
	String() string
}

// ParseObjectType converts a string to ObjectType
func ParseObjectType(s string) (ObjectType, error) {
	switch ObjectType(s) {
	case BlobType, TreeType, CommitType, TagType:
		return ObjectType(s), nil
	default:
		return "", fmt.Errorf("unknown object type: %s", s)
	}
}

// CreateSha creates a SHA-1 hash from data
func CreateSha(data []byte) [20]byte {
	return sha1.Sum(data)
}

// createSha is a private alias for backward compatibility
func createSha(data []byte) [20]byte {
	return CreateSha(data)
}

// ParseHeader parses the object header
func ParseHeader(data []byte, ot ObjectType) (size int64, contentStart int, err error) {
	nullIndex := bytes.IndexByte(data, NullByte)

	if nullIndex == -1 {
		return -1, -1, fmt.Errorf("invalid object header: missing null byte")
	}

	spaceIndex := bytes.IndexByte(data[:nullIndex], SpaceByte)
	if spaceIndex == -1 {
		return -1, -1, fmt.Errorf("invalid object header: missing space")
	}

	sizeBytes := data[spaceIndex+1 : nullIndex]
	typeBytes := data[:spaceIndex]

	if string(typeBytes) != ot.String() {
		return -1, -1, fmt.Errorf("object type mismatch: expected %s, got %s", ot.String(), string(typeBytes))
	}

	_, err = fmt.Sscanf(string(sizeBytes), "%d", &size)

	if err != nil {
		return -1, -1, fmt.Errorf("error in scanning bytes: %w", err)
	}

	return size, nullIndex + 1, nil
}

// parseHeader is a private alias for backward compatibility
func parseHeader(data []byte, ot ObjectType) (size int64, contentStart int, err error) {
	return ParseHeader(data, ot)
}

// ParseContent parses the content of an object
func ParseContent(data []byte, ot ObjectType) ([]byte, error) {
	size, contentStart, err := ParseHeader(data, ot)
	if err != nil {
		return nil, err
	}

	content := data[contentStart:]
	if int64(len(content)) != size {
		return nil, fmt.Errorf("tree size mismatch: expected %d, got %d", size, len(content))
	}

	return content, nil
}

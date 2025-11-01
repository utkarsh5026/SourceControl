package blob

import (
	"fmt"
	"io"
	"github.com/utkarsh5026/SourceControl/pkg/objects"
)

type Blob struct {
	data []byte
	sha  [20]byte
}

// NewBlob creates a new Blob object from raw data
func NewBlob(data []byte) *Blob {
	header := fmt.Sprintf("%s %d%c", objects.BlobType, len(data), objects.NullByte)
	fullData := append([]byte(header), data...)

	return &Blob{
		data: data,
		sha:  objects.CreateSha(fullData),
	}
}

// ParseBlob parses a blob from serialized data (with header)
func ParseBlob(data []byte) (*Blob, error) {
	content, err := objects.ParseContent(data, objects.BlobType)
	if err != nil {
		return nil, err
	}
	return &Blob{
		data: content,
		sha:  objects.CreateSha(data),
	}, nil
}

// Type returns the object type
func (b *Blob) Type() objects.ObjectType {
	return objects.BlobType
}

// Content returns the raw content of the blob
func (b *Blob) Content() ([]byte, error) {
	return b.data, nil
}

// Hash returns the SHA-1 hash of the blob
func (b *Blob) Hash() ([20]byte, error) {
	return b.sha, nil
}

// Size returns the size of the content in bytes
func (b *Blob) Size() (int64, error) {
	return int64(len(b.data)), nil
}

// Serialize writes the blob in Git's storage format
func (b *Blob) Serialize(w io.Writer) error {
	header := fmt.Sprintf("%s %d%c", objects.BlobType, len(b.data), objects.NullByte)
	if _, err := w.Write([]byte(header)); err != nil {
		return fmt.Errorf("failed to write blob header: %w", err)
	}

	if _, err := w.Write(b.data); err != nil {
		return fmt.Errorf("failed to write blob content: %w", err)
	}

	return nil
}

// String returns a human-readable representation
func (b *Blob) String() string {
	return fmt.Sprintf("Blob{size: %d, hash: %x}", len(b.data), b.sha)
}

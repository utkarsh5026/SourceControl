package objects

import (
	"fmt"
	"io"
)

type Blob struct {
	data []byte
	sha  [20]byte
}

// NewBlob creates a new Blob object from raw data
func NewBlob(data []byte) *Blob {
	header := fmt.Sprintf("%s %d%c", BlobType, len(data), NullByte)
	fullData := append([]byte(header), data...)

	return &Blob{
		data: data,
		sha:  createSha(fullData),
	}
}

// ParseBlob parses a blob from serialized data (with header)
func ParseBlob(data []byte) (*Blob, error) {
	size, contentStart, err := parseHeader(data, BlobType)
	if err != nil {
		return nil, err
	}

	content := data[contentStart:]
	if int64(len(content)) != size {
		return nil, fmt.Errorf("blob size mismatch: expected %d, got %d", size, len(content))
	}

	return &Blob{
		data: content,
		sha:  createSha(data),
	}, nil
}

// Type returns the object type
func (b *Blob) Type() ObjectType {
	return BlobType
}

// Content returns the raw content of the blob
func (b *Blob) Content() []byte {
	return b.data
}

// Hash returns the SHA-1 hash of the blob
func (b *Blob) Hash() [20]byte {
	return b.sha
}

// Size returns the size of the content in bytes
func (b *Blob) Size() int64 {
	return int64(len(b.data))
}

// Serialize writes the blob in Git's storage format
func (b *Blob) Serialize(w io.Writer) error {
	header := fmt.Sprintf("%s %d%c", BlobType, len(b.data), NullByte)
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

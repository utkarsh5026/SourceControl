package blob

import (
	"fmt"
	"io"

	"github.com/utkarsh5026/SourceControl/pkg/objects"
)

type Blob struct {
	content objects.ObjectContent
	hash    *objects.ObjectHash
}

// NewBlob creates a new Blob object from raw data
func NewBlob(data []byte) *Blob {
	return &Blob{
		content: objects.ObjectContent(data),
		hash:    nil, // Lazy computation
	}
}

// ParseBlob parses a blob from serialized data (with header)
func ParseBlob(data []byte) (*Blob, error) {
	content, err := objects.ParseSerializedObject(data, objects.BlobType)
	if err != nil {
		return nil, err
	}

	hash := objects.NewObjectHash(objects.SerializedObject(data))
	return &Blob{
		content: content,
		hash:    &hash,
	}, nil
}

// Type returns the object type
func (b *Blob) Type() objects.ObjectType {
	return objects.BlobType
}

// Content returns the raw content of the blob
func (b *Blob) Content() (objects.ObjectContent, error) {
	return b.content, nil
}

// Hash returns the SHA-1 hash of the blob
func (b *Blob) Hash() (objects.ObjectHash, error) {
	if b.hash != nil {
		return *b.hash, nil
	}

	hash := objects.ComputeObjectHash(objects.BlobType, b.content)
	b.hash = &hash
	return hash, nil
}

// RawHash returns the SHA-1 hash as a 20-byte array
func (b *Blob) RawHash() (objects.RawHash, error) {
	hash, err := b.Hash()
	if err != nil {
		return objects.RawHash{}, err
	}
	return hash.Raw()
}

// Size returns the size of the content in bytes
func (b *Blob) Size() (objects.ObjectSize, error) {
	return b.content.Size(), nil
}

// Serialize writes the blob in Git's storage format
func (b *Blob) Serialize(w io.Writer) error {
	serialized := objects.NewSerializedObject(objects.BlobType, b.content)

	if _, err := w.Write(serialized.Bytes()); err != nil {
		return fmt.Errorf("failed to write blob: %w", err)
	}

	return nil
}

// String returns a human-readable representation
func (b *Blob) String() string {
	hash, err := b.Hash()
	if err != nil {
		return fmt.Sprintf("Blob{size: %s, error: %v}", b.content.Size(), err)
	}
	return fmt.Sprintf("Blob{size: %s, hash: %s}", b.content.Size(), hash.Short())
}

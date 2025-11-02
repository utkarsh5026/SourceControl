package scpath

import "fmt"

// String returns the object path as a string
func (op ObjectPath) String() string {
	return string(op)
}

// IsValid checks if this is a valid object path (format: "ab/cdef...")
func (op ObjectPath) IsValid() bool {
	s := string(op)
	// Must be exactly 43 characters (2 + "/" + 38)
	if len(s) != 41 {
		return false
	}
	// Must have slash at position 2
	if s[2] != '/' {
		return false
	}
	// First 2 chars and last 38 chars must be hex
	prefix := s[:2]
	suffix := s[3:]
	return isHexString(prefix) && isHexString(suffix)
}

// Hash returns the full object hash (concatenating prefix and suffix)
func (op ObjectPath) Hash() string {
	s := string(op)
	if len(s) < 3 {
		return ""
	}
	return s[:2] + s[3:]
}

// Prefix returns the 2-character directory prefix
func (op ObjectPath) Prefix() string {
	if len(op) < 2 {
		return ""
	}
	return string(op[:2])
}

// Suffix returns the 38-character file name
func (op ObjectPath) Suffix() string {
	if len(op) < 4 {
		return ""
	}
	return string(op[3:])
}

// ToSourcePath converts to a source path within the objects directory
func (op ObjectPath) ToSourcePath(objectsDir SourcePath) SourcePath {
	return objectsDir.Join(op.Prefix(), op.Suffix())
}

// NewObjectPath creates an ObjectPath from a hash
func NewObjectPath(hash string) (ObjectPath, error) {
	if len(hash) != 40 {
		return "", fmt.Errorf("hash must be 40 characters, got %d", len(hash))
	}
	if !isHexString(hash) {
		return "", fmt.Errorf("hash must be hex string")
	}
	// Format: "ab/cdef123..."
	prefix := hash[:2]
	suffix := hash[2:]
	return ObjectPath(prefix + "/" + suffix), nil
}

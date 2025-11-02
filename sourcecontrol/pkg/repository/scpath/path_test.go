package scpath

import (
	"path/filepath"
	"testing"
)

func TestRepositoryPath_IsValid(t *testing.T) {
	tests := []struct {
		name  string
		path  RepositoryPath
		valid bool
	}{
		{
			name:  "valid absolute windows path",
			path:  RepositoryPath("C:\\Users\\user\\repo"),
			valid: true,
		},
		{
			name:  "invalid relative path",
			path:  RepositoryPath("relative/path"),
			valid: false,
		},
		{
			name:  "empty path",
			path:  RepositoryPath(""),
			valid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.IsValid(); got != tt.valid {
				t.Errorf("IsValid() = %v, want %v for path %q", got, tt.valid, tt.path)
			}
		})
	}
}

func TestRepositoryPath_SourcePath(t *testing.T) {
	repo := RepositoryPath("/home/user/repo")
	sourcePath := repo.SourcePath()

	expected := filepath.Join("/home/user/repo", ".source")
	if sourcePath.String() != expected {
		t.Errorf("SourcePath() = %v, want %v", sourcePath, expected)
	}
}

func TestRepositoryPath_ObjectsPath(t *testing.T) {
	repo := RepositoryPath("/home/user/repo")
	objectsPath := repo.SourcePath().ObjectsPath()

	expected := filepath.Join("/home/user/repo", ".source", "objects")
	if objectsPath.String() != expected {
		t.Errorf("ObjectsPath() = %v, want %v", objectsPath, expected)
	}
}

func TestRelativePath_Normalize(t *testing.T) {
	tests := []struct {
		name     string
		path     RelativePath
		expected RelativePath
	}{
		{
			name:     "already normalized",
			path:     RelativePath("src/main.go"),
			expected: RelativePath("src/main.go"),
		},
		{
			name:     "with leading ./",
			path:     RelativePath("./src/main.go"),
			expected: RelativePath("src/main.go"),
		},
		{
			name:     "with backslashes",
			path:     RelativePath("src\\main.go"),
			expected: RelativePath("src/main.go"),
		},
		{
			name:     "with redundant slashes",
			path:     RelativePath("src//main.go"),
			expected: RelativePath("src/main.go"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.path.Normalize()
			if got != tt.expected {
				t.Errorf("Normalize() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestRelativePath_IsValid(t *testing.T) {
	tests := []struct {
		name  string
		path  RelativePath
		valid bool
	}{
		{
			name:  "valid relative path",
			path:  RelativePath("src/main.go"),
			valid: true,
		},
		{
			name:  "absolute path",
			path:  RelativePath("/home/user/file.go"),
			valid: false,
		},
		{
			name:  "contains ..",
			path:  RelativePath("../other/file.go"),
			valid: false,
		},
		{
			name:  "empty path",
			path:  RelativePath(""),
			valid: false,
		},
		{
			name:  "single file",
			path:  RelativePath("README.md"),
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.IsValid(); got != tt.valid {
				t.Errorf("IsValid() = %v, want %v for path %q", got, tt.valid, tt.path)
			}
		})
	}
}

func TestRelativePath_Components(t *testing.T) {
	tests := []struct {
		name     string
		path     RelativePath
		expected []string
	}{
		{
			name:     "simple path",
			path:     RelativePath("src/main.go"),
			expected: []string{"src", "main.go"},
		},
		{
			name:     "single component",
			path:     RelativePath("README.md"),
			expected: []string{"README.md"},
		},
		{
			name:     "deep path",
			path:     RelativePath("a/b/c/d/file.txt"),
			expected: []string{"a", "b", "c", "d", "file.txt"},
		},
		{
			name:     "empty path",
			path:     RelativePath(""),
			expected: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.path.Components()
			if len(got) != len(tt.expected) {
				t.Errorf("Components() length = %v, want %v", len(got), len(tt.expected))
				return
			}
			for i := range got {
				if got[i] != tt.expected[i] {
					t.Errorf("Components()[%d] = %v, want %v", i, got[i], tt.expected[i])
				}
			}
		})
	}
}

func TestRelativePath_Depth(t *testing.T) {
	tests := []struct {
		name  string
		path  RelativePath
		depth int
	}{
		{
			name:  "single file",
			path:  RelativePath("README.md"),
			depth: 1,
		},
		{
			name:  "nested path",
			path:  RelativePath("src/main.go"),
			depth: 2,
		},
		{
			name:  "deep path",
			path:  RelativePath("a/b/c/d/e.txt"),
			depth: 5,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.Depth(); got != tt.depth {
				t.Errorf("Depth() = %v, want %v", got, tt.depth)
			}
		})
	}
}

func TestRelativePath_Join(t *testing.T) {
	tests := []struct {
		name     string
		base     RelativePath
		elements []string
		expected RelativePath
	}{
		{
			name:     "join single element",
			base:     RelativePath("src"),
			elements: []string{"main.go"},
			expected: RelativePath("src/main.go"),
		},
		{
			name:     "join multiple elements",
			base:     RelativePath("src"),
			elements: []string{"utils", "helper.go"},
			expected: RelativePath("src/utils/helper.go"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.base.Join(tt.elements...)
			if got != tt.expected {
				t.Errorf("Join() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestSourcePath_ObjectFilePath(t *testing.T) {
	objectsPath := SourcePath(filepath.Join("/repo", ".source", "objects"))

	tests := []struct {
		name         string
		hash         string
		expectEmpty  bool
		expectPrefix string
		expectSuffix string
	}{
		{
			name:         "valid hash",
			hash:         "abcdef0123456789abcdef0123456789abcdef01",
			expectEmpty:  false,
			expectPrefix: "ab",
			expectSuffix: "cdef0123456789abcdef0123456789abcdef01",
		},
		{
			name:         "different hash",
			hash:         "1234567890abcdef1234567890abcdef12345678",
			expectEmpty:  false,
			expectPrefix: "12",
			expectSuffix: "34567890abcdef1234567890abcdef12345678",
		},
		{
			name:        "invalid hash - too short",
			hash:        "abcdef",
			expectEmpty: true,
		},
		{
			name:        "invalid hash - too long",
			hash:        "abcdef0123456789abcdef0123456789abcdef012345",
			expectEmpty: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := objectsPath.ObjectFilePath(tt.hash)

			if tt.expectEmpty {
				if got != "" {
					t.Errorf("ObjectFilePath() = %v, want empty string", got)
				}
				return
			}

			// Check if the path contains the expected components
			expected := filepath.Join(objectsPath.String(), tt.expectPrefix, tt.expectSuffix)
			if got.String() != expected {
				t.Errorf("ObjectFilePath() = %v, want %v", got, expected)
			}
		})
	}
}

func TestRefPath_IsValid(t *testing.T) {
	tests := []struct {
		name  string
		path  RefPath
		valid bool
	}{
		{
			name:  "valid branch ref",
			path:  RefPath("refs/heads/main"),
			valid: true,
		},
		{
			name:  "valid tag ref",
			path:  RefPath("refs/tags/v1.0.0"),
			valid: true,
		},
		{
			name:  "HEAD",
			path:  RefPath("HEAD"),
			valid: true,
		},
		{
			name:  "contains space",
			path:  RefPath("refs/heads/my branch"),
			valid: false,
		},
		{
			name:  "contains ..",
			path:  RefPath("refs/../heads/main"),
			valid: false,
		},
		{
			name:  "ends with .lock",
			path:  RefPath("refs/heads/main.lock"),
			valid: false,
		},
		{
			name:  "starts with .",
			path:  RefPath(".refs/heads/main"),
			valid: false,
		},
		{
			name:  "empty",
			path:  RefPath(""),
			valid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.IsValid(); got != tt.valid {
				t.Errorf("IsValid() = %v, want %v for path %q", got, tt.valid, tt.path)
			}
		})
	}
}

func TestRefPath_IsBranch(t *testing.T) {
	tests := []struct {
		name     string
		path     RefPath
		isBranch bool
	}{
		{
			name:     "branch ref",
			path:     RefPath("refs/heads/main"),
			isBranch: true,
		},
		{
			name:     "tag ref",
			path:     RefPath("refs/tags/v1.0.0"),
			isBranch: false,
		},
		{
			name:     "HEAD",
			path:     RefPath("HEAD"),
			isBranch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.IsBranch(); got != tt.isBranch {
				t.Errorf("IsBranch() = %v, want %v", got, tt.isBranch)
			}
		})
	}
}

func TestRefPath_IsTag(t *testing.T) {
	tests := []struct {
		name  string
		path  RefPath
		isTag bool
	}{
		{
			name:  "tag ref",
			path:  RefPath("refs/tags/v1.0.0"),
			isTag: true,
		},
		{
			name:  "branch ref",
			path:  RefPath("refs/heads/main"),
			isTag: false,
		},
		{
			name:  "HEAD",
			path:  RefPath("HEAD"),
			isTag: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.IsTag(); got != tt.isTag {
				t.Errorf("IsTag() = %v, want %v", got, tt.isTag)
			}
		})
	}
}

func TestRefPath_ShortName(t *testing.T) {
	tests := []struct {
		name      string
		path      RefPath
		shortName string
	}{
		{
			name:      "branch ref",
			path:      RefPath("refs/heads/main"),
			shortName: "main",
		},
		{
			name:      "tag ref",
			path:      RefPath("refs/tags/v1.0.0"),
			shortName: "v1.0.0",
		},
		{
			name:      "HEAD",
			path:      RefPath("HEAD"),
			shortName: "HEAD",
		},
		{
			name:      "branch with slashes",
			path:      RefPath("refs/heads/feature/new-feature"),
			shortName: "feature/new-feature",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.ShortName(); got != tt.shortName {
				t.Errorf("ShortName() = %v, want %v", got, tt.shortName)
			}
		})
	}
}

func TestNewBranchRef(t *testing.T) {
	tests := []struct {
		name     string
		branch   string
		wantErr  bool
		expected RefPath
	}{
		{
			name:     "valid branch name",
			branch:   "main",
			wantErr:  false,
			expected: RefPath("refs/heads/main"),
		},
		{
			name:     "branch with slashes",
			branch:   "feature/new-feature",
			wantErr:  false,
			expected: RefPath("refs/heads/feature/new-feature"),
		},
		{
			name:    "empty name",
			branch:  "",
			wantErr: true,
		},
		{
			name:    "invalid characters",
			branch:  "my branch",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NewBranchRef(tt.branch)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewBranchRef() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("NewBranchRef() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestNewTagRef(t *testing.T) {
	tests := []struct {
		name     string
		tag      string
		wantErr  bool
		expected RefPath
	}{
		{
			name:     "valid tag name",
			tag:      "v1.0.0",
			wantErr:  false,
			expected: RefPath("refs/tags/v1.0.0"),
		},
		{
			name:    "empty name",
			tag:     "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NewTagRef(tt.tag)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewTagRef() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("NewTagRef() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestIsPathSafe(t *testing.T) {
	tests := []struct {
		name string
		path string
		safe bool
	}{
		{
			name: "safe relative path",
			path: "src/main.go",
			safe: true,
		},
		{
			name: "contains ..",
			path: "../../../etc/passwd",
			safe: false,
		},
		{
			name: "absolute path",
			path: "/etc/passwd",
			safe: false,
		},
		{
			name: "backslashes",
			path: "src\\main.go",
			safe: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsPathSafe(tt.path); got != tt.safe {
				t.Errorf("IsPathSafe() = %v, want %v for path %q", got, tt.safe, tt.path)
			}
		})
	}
}

func TestNormalizePath(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected string
	}{
		{
			name:     "already normalized",
			path:     "src/main.go",
			expected: "src/main.go",
		},
		{
			name:     "with leading ./",
			path:     "./src/main.go",
			expected: "src/main.go",
		},
		{
			name:     "with backslashes",
			path:     "src\\main.go",
			expected: "src/main.go",
		},
		{
			name:     "with trailing slash",
			path:     "src/",
			expected: "src",
		},
		{
			name:     "with redundant slashes",
			path:     "src//main.go",
			expected: "src/main.go",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NormalizePath(tt.path); got != tt.expected {
				t.Errorf("NormalizePath() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestRelativePath_IsInSubdir(t *testing.T) {
	tests := []struct {
		name   string
		path   RelativePath
		subdir string
		result bool
	}{
		{
			name:   "file in subdir",
			path:   RelativePath("src/main.go"),
			subdir: "src",
			result: true,
		},
		{
			name:   "file not in subdir",
			path:   RelativePath("docs/README.md"),
			subdir: "src",
			result: false,
		},
		{
			name:   "exact match",
			path:   RelativePath("src"),
			subdir: "src",
			result: true,
		},
		{
			name:   "deep nesting",
			path:   RelativePath("src/utils/helper.go"),
			subdir: "src",
			result: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.IsInSubdir(tt.subdir); got != tt.result {
				t.Errorf("IsInSubdir() = %v, want %v", got, tt.result)
			}
		})
	}
}

func TestRelativePath_Base(t *testing.T) {
	tests := []struct {
		name     string
		path     RelativePath
		expected string
	}{
		{
			name:     "simple path",
			path:     RelativePath("src/main.go"),
			expected: "main.go",
		},
		{
			name:     "single file",
			path:     RelativePath("README.md"),
			expected: "README.md",
		},
		{
			name:     "deep path",
			path:     RelativePath("a/b/c/file.txt"),
			expected: "file.txt",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.Base(); got != tt.expected {
				t.Errorf("Base() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestRelativePath_Dir(t *testing.T) {
	tests := []struct {
		name     string
		path     RelativePath
		expected RelativePath
	}{
		{
			name:     "simple path",
			path:     RelativePath("src/main.go"),
			expected: RelativePath("src"),
		},
		{
			name:     "single file",
			path:     RelativePath("README.md"),
			expected: RelativePath(""),
		},
		{
			name:     "deep path",
			path:     RelativePath("a/b/c/file.txt"),
			expected: RelativePath("a/b/c"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.Dir(); got != tt.expected {
				t.Errorf("Dir() = %v, want %v", got, tt.expected)
			}
		})
	}
}

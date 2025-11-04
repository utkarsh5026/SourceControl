package config

import (
	"fmt"

	"github.com/utkarsh5026/SourceControl/pkg/common/err"
)

const (
	pkgName = "config"

	// Package-specific error codes
	CodeNotFoundErr      = err.CodeNotFound
	CodeInvalidFormatErr = err.CodeInvalidFormat
	CodeInvalidValueErr  = err.CodeInvalidFormat
	CodeReadOnlyErr      = err.CodeReadOnly
	CodeConversionErr    = "CONVERSION_FAILED"
	CodeInvalidLevelErr  = "INVALID_LEVEL"
)

// ConfigError represents a configuration-related error with detailed context
type ConfigError struct {
	base  *err.Error
	Path  string // file path if applicable
	Key   string // config key if applicable
	Level string // config level if applicable
}

// NewConfigError creates a new ConfigError
func NewConfigError(op, code, key, path, level string, underlying error) *ConfigError {
	return &ConfigError{
		base:  err.New(pkgName, code, op, "", underlying),
		Path:  path,
		Key:   key,
		Level: level,
	}
}

// Error implements the error interface
func (e *ConfigError) Error() string {
	msg := e.base.Error()
	if e.Key != "" {
		msg += fmt.Sprintf(" [key=%s]", e.Key)
	}
	if e.Path != "" {
		msg += fmt.Sprintf(" [path=%s]", e.Path)
	}
	if e.Level != "" {
		msg += fmt.Sprintf(" [level=%s]", e.Level)
	}
	return msg
}

// Unwrap returns the underlying error
func (e *ConfigError) Unwrap() error {
	return e.base
}

// Sentinel errors for specific conditions
var (
	// ErrNotFound indicates a configuration key was not found
	ErrNotFound = err.New(pkgName, CodeNotFoundErr, "", "configuration key not found", nil)

	// ErrInvalidFormat indicates the config file has invalid format
	ErrInvalidFormat = err.New(pkgName, CodeInvalidFormatErr, "", "invalid configuration format", nil)

	// ErrInvalidValue indicates a configuration value is invalid
	ErrInvalidValue = err.New(pkgName, CodeInvalidValueErr, "", "invalid configuration value", nil)

	// ErrInvalidLevel indicates an invalid configuration level
	ErrInvalidLevel = err.New(pkgName, CodeInvalidLevelErr, "", "invalid configuration level", nil)

	// ErrReadOnly indicates an attempt to modify a read-only configuration
	ErrReadOnly = err.New(pkgName, CodeReadOnlyErr, "", "configuration is read-only", nil)

	// ErrConversion indicates a type conversion error
	ErrConversion = err.New(pkgName, CodeConversionErr, "", "configuration value conversion failed", nil)
)

// IsNotFound returns true if the error is ErrNotFound
func IsNotFound(e error) bool {
	return err.IsCode(e, CodeNotFoundErr)
}

// IsInvalidFormat returns true if the error is ErrInvalidFormat
func IsInvalidFormat(e error) bool {
	return err.IsCode(e, CodeInvalidFormatErr)
}

// IsReadOnly returns true if the error is ErrReadOnly
func IsReadOnly(e error) bool {
	return err.IsCode(e, CodeReadOnlyErr)
}

// IsConversion returns true if the error is ErrConversion
func IsConversion(e error) bool {
	return err.IsCode(e, CodeConversionErr)
}

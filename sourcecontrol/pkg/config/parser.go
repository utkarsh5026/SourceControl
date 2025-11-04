package config

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Parser handles parsing and serialization of JSON configuration files
type Parser struct{}

// ConfigFileStructure represents the JSON structure of a config file
// Supports nested sections and both single values and arrays
// Example:
//
//	{
//	  "core": {
//	    "repositoryformatversion": "0",
//	    "filemode": "false"
//	  },
//	  "remote": {
//	    "origin": {
//	      "url": "https://github.com/user/repo.git",
//	      "fetch": ["+refs/heads/*:refs/remotes/origin/*"]
//	    }
//	  }
//	}
type ConfigFileStructure map[string]any

// ValidationResult contains validation results
type ValidationResult struct {
	Valid  bool
	Errors []string
}

// Parse parses JSON configuration content into a map of entries
func (p *Parser) Parse(content string, source string, level ConfigLevel) (map[string][]*ConfigEntry, error) {
	result := make(map[string][]*ConfigEntry)

	if strings.TrimSpace(content) == "" {
		return result, nil
	}

	var configData ConfigFileStructure
	if err := json.Unmarshal([]byte(content), &configData); err != nil {
		return nil, NewConfigError("parse", CodeInvalidFormatErr, "", source, "", fmt.Errorf("%w: %v", ErrInvalidFormat, err))
	}

	if err := p.parseSection(configData, result, source, level, ""); err != nil {
		return nil, err
	}

	return result, nil
}

// Serialize converts configuration entries to JSON format
func (p *Parser) Serialize(entries map[string][]*ConfigEntry) (string, error) {
	configData := make(ConfigFileStructure)

	for fullKey, entryList := range entries {
		for _, entry := range entryList {
			if err := setNestedValue(configData, fullKey, entry.Value); err != nil {
				return "", err
			}
		}
	}

	data, err := json.MarshalIndent(configData, "", "  ")
	if err != nil {
		return "", NewConfigError("serialize", CodeInvalidFormatErr, "", "", "", fmt.Errorf("%w: %v", ErrInvalidFormat, err))
	}

	return string(data), nil
}

// Validate validates JSON configuration structure
func (p *Parser) Validate(content string) ValidationResult {
	errors := []string{}

	var parsed any
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		errors = append(errors, fmt.Sprintf("Invalid JSON: %v", err))
		return ValidationResult{Valid: false, Errors: errors}
	}

	configMap, ok := parsed.(map[string]any)
	if !ok {
		errors = append(errors, "Configuration must be a JSON object")
		return ValidationResult{Valid: false, Errors: errors}
	}

	p.validateSection(configMap, "", &errors)
	return ValidationResult{Valid: len(errors) == 0, Errors: errors}
}

// FormatForDisplay creates a pretty-formatted JSON string for display
// Only includes the last (effective) value for each key
func (p *Parser) FormatForDisplay(entries map[string][]*ConfigEntry) (string, error) {
	configData := make(ConfigFileStructure)

	for fullKey, entryList := range entries {
		if len(entryList) > 0 {
			// Last value wins
			effectiveEntry := entryList[len(entryList)-1]
			if err := setNestedValue(configData, fullKey, effectiveEntry.Value); err != nil {
				return "", err
			}
		}
	}

	data, err := json.MarshalIndent(configData, "", "  ")
	if err != nil {
		return "", NewConfigError("format", CodeInvalidFormatErr, "", "", "", fmt.Errorf("%w: %v", ErrInvalidFormat, err))
	}

	return string(data), nil
}

// parseSection recursively parses sections and subsections
func (p *Parser) parseSection(
	configData ConfigFileStructure,
	result map[string][]*ConfigEntry,
	source string,
	level ConfigLevel,
	keyPrefix string,
) error {
	for sectionKey, sectionValue := range configData {
		fullKey := p.buildFullKey(keyPrefix, sectionKey)
		if err := p.processConfigValue(fullKey, sectionValue, result, source, level); err != nil {
			return err
		}
	}
	return nil
}

// buildFullKey builds the full configuration key from prefix and section key
func (p *Parser) buildFullKey(prefix, key string) string {
	if prefix == "" {
		return key
	}
	return prefix + "." + key
}

// processConfigValue processes a configuration value based on its type
func (p *Parser) processConfigValue(
	key string,
	value any,
	result map[string][]*ConfigEntry,
	source string,
	level ConfigLevel,
) error {
	switch v := value.(type) {
	case []any:
		return p.processArrayValue(key, v, result, source, level)
	case map[string]any:
		return p.parseSection(v, result, source, level, key)
	case string:
		p.addEntry(result, key, v, source, level)
		return nil
	default:
		// Convert other types to string
		p.addEntry(result, key, fmt.Sprintf("%v", v), source, level)
		return nil
	}
}

// processArrayValue processes array configuration values
func (p *Parser) processArrayValue(
	key string,
	values []any,
	result map[string][]*ConfigEntry,
	source string,
	level ConfigLevel,
) error {
	for _, item := range values {
		if strVal, ok := item.(string); ok {
			p.addEntry(result, key, strVal, source, level)
		} else {
			p.addEntry(result, key, fmt.Sprintf("%v", item), source, level)
		}
	}
	return nil
}

// addEntry adds a configuration entry to the result map
func (p *Parser) addEntry(
	entryMap map[string][]*ConfigEntry,
	configKey string,
	configValue string,
	source string,
	level ConfigLevel,
) {
	if _, exists := entryMap[configKey]; !exists {
		entryMap[configKey] = []*ConfigEntry{}
	}

	entry := NewEntry(configKey, configValue, level, source, 0)
	entryMap[configKey] = append(entryMap[configKey], entry)
}

// setNestedValue sets a nested value in the configuration object
func setNestedValue(configObject ConfigFileStructure, keyPath, value string) error {
	pathSegments := strings.Split(keyPath, ".")
	if len(pathSegments) == 0 {
		return NewConfigError("set", CodeInvalidValueErr, keyPath, "", "", fmt.Errorf("empty key path"))
	}

	finalKey := pathSegments[len(pathSegments)-1]
	targetObject := navigateToTargetObject(configObject, pathSegments[:len(pathSegments)-1])

	setValueInObject(targetObject, finalKey, value)
	return nil
}

// navigateToTargetObject navigates through the object hierarchy
func navigateToTargetObject(root ConfigFileStructure, pathSegments []string) map[string]any {
	currentObject := root

	for _, segment := range pathSegments {
		if !hasValidObjectProperty(currentObject, segment) {
			currentObject[segment] = make(map[string]any)
		}
		currentObject = currentObject[segment].(map[string]any)
	}

	return currentObject
}

// hasValidObjectProperty checks if an object has a valid property for navigation
func hasValidObjectProperty(obj map[string]any, propertyKey string) bool {
	val, exists := obj[propertyKey]
	if !exists {
		return false
	}
	_, isMap := val.(map[string]any)
	return isMap
}

// setValueInObject sets a value in an object, handling existing values
func setValueInObject(targetObject map[string]any, key, newValue string) {
	if existingValue, exists := targetObject[key]; exists {
		if arr, ok := existingValue.([]any); ok {
			targetObject[key] = append(arr, newValue)
			return
		}

		if strVal, ok := existingValue.(string); ok {
			targetObject[key] = []any{strVal, newValue}
			return
		}

		if _, ok := existingValue.(map[string]any); ok {
			return
		}
		targetObject[key] = []any{existingValue, newValue}
	} else {
		targetObject[key] = newValue
	}
}

// validateSection validates a configuration section
func (p *Parser) validateSection(configSection map[string]any, currentPath string, errors *[]string) {
	for key, value := range configSection {
		valuePath := p.buildFullKey(currentPath, key)
		p.validateConfigValue(valuePath, value, errors)
	}
}

// validateConfigValue validates a single configuration value
func (p *Parser) validateConfigValue(path string, value any, errors *[]string) {
	switch v := value.(type) {
	case []any:
		p.validateArrayValue(path, v, errors)
	case map[string]any:
		p.validateSection(v, path, errors)
	case string:
	default:
		// Other types are allowed and will be converted to strings
	}
}

// validateArrayValue validates array configuration values
func (p *Parser) validateArrayValue(path string, values []any, errors *[]string) {
	for _, item := range values {
		switch item.(type) {
		case string:
		case map[string]any:
			*errors = append(*errors, fmt.Sprintf("Configuration array at '%s' cannot contain objects", path))
		default:
			// Other types are allowed and will be converted to strings
		}
	}
}

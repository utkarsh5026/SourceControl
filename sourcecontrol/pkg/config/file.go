package config

import (
	"encoding/json"
	"fmt"
	"strings"
)

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
type ConfigFileStructure struct {
	data map[string]any
}

// NewConfigFileStructure creates a new ConfigFileStructure
func NewConfigFileStructure() *ConfigFileStructure {
	return &ConfigFileStructure{
		data: make(map[string]any),
	}
}

// UnmarshalJSON implements json.Unmarshaler interface
func (c *ConfigFileStructure) UnmarshalJSON(data []byte) error {
	c.data = make(map[string]any)
	return json.Unmarshal(data, &c.data)
}

// MarshalJSON implements json.Marshaler interface
func (c *ConfigFileStructure) MarshalJSON() ([]byte, error) {
	return json.Marshal(c.data)
}

// Range iterates over all top-level keys and values
func (c *ConfigFileStructure) Range(fn func(key string, value any) error) error {
	for key, value := range c.data {
		if err := fn(key, value); err != nil {
			return err
		}
	}
	return nil
}

// SetNestedValue sets a nested value in the configuration using dot notation
// Example: "core.user.name" -> creates nested structure and sets value
func (c *ConfigFileStructure) SetNestedValue(keyPath, value string) error {
	pathSegments := strings.Split(keyPath, ".")
	if len(pathSegments) == 0 {
		return NewConfigError("set", CodeInvalidValueErr, keyPath, "", "", fmt.Errorf("empty key path"))
	}

	finalKey := pathSegments[len(pathSegments)-1]
	targetObject := c.navigateToTargetObject(pathSegments[:len(pathSegments)-1])

	c.setValueInObject(targetObject, finalKey, value)
	return nil
}

// navigateToTargetObject navigates through the object hierarchy, creating maps as needed
func (c *ConfigFileStructure) navigateToTargetObject(pathSegments []string) map[string]any {
	currentObject := c.data

	for _, segment := range pathSegments {
		if !c.hasValidObjectProperty(currentObject, segment) {
			currentObject[segment] = make(map[string]any)
		}
		currentObject = currentObject[segment].(map[string]any)
	}

	return currentObject
}

// hasValidObjectProperty checks if an object has a valid map property for navigation
func (c *ConfigFileStructure) hasValidObjectProperty(obj map[string]any, propertyKey string) bool {
	val, exists := obj[propertyKey]
	if !exists {
		return false
	}
	_, isMap := val.(map[string]any)
	return isMap
}

// setValueInObject sets a value in an object, handling existing values intelligently
// If a value exists and is a string, converts to array
// If a value exists and is an array, appends to it
func (c *ConfigFileStructure) setValueInObject(targetObject map[string]any, key, newValue string) {
	existingValue, exists := targetObject[key]
	if !exists {
		targetObject[key] = newValue
		return
	}

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
}

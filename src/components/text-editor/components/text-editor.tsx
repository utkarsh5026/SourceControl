import React, { useEffect, useRef, useState } from "react";
import { useFileStore } from "../../directory/store/use-file-store";
import { File, Circle, X, Search, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFileIcon } from "@/components/directory/components/utils";

const TextEditor: React.FC = () => {
  const {
    activeFileId,
    getFileContent,
    updateFileContent,
    saveFile,
    isFileModified,
    findNodeById,
    openFiles,
    closeFile,
    setActiveFile,
    isSearchOpen,
    toggleSearch,
    searchQuery,
    setSearchQuery,
  } = useFileStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localContent, setLocalContent] = useState("");
  const [lineCount, setLineCount] = useState(1);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });

  // Load file content when active file changes
  useEffect(() => {
    if (activeFileId) {
      const content = getFileContent(activeFileId);
      setLocalContent(content);
      setLineCount(content.split("\n").length);
    } else {
      setLocalContent("");
      setLineCount(1);
    }
  }, [activeFileId, getFileContent]);

  // Update cursor position
  const updateCursorPosition = () => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const selectionStart = textarea.selectionStart;
      const textBeforeCursor = textarea.value.substring(0, selectionStart);
      const lines = textBeforeCursor.split("\n");
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      setCursorPosition({ line, column });
    }
  };

  // Handle content change
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
    setLineCount(newContent.split("\n").length);

    if (activeFileId) {
      updateFileContent(activeFileId, newContent);
    }
  };

  // Handle save
  const handleSave = () => {
    if (activeFileId) {
      saveFile(activeFileId, localContent);
    }
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "s":
          e.preventDefault();
          handleSave();
          break;
        case "f":
          e.preventDefault();
          toggleSearch();
          break;
      }
    }
  };

  const activeFile = activeFileId ? findNodeById(activeFileId) : null;
  const isModified = activeFileId ? isFileModified(activeFileId) : false;

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <File size={48} className="mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            No file selected
          </h3>
          <p className="text-muted-foreground">
            Select a file from the explorer to start editing
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* File Tabs */}
      <div className="border-b border-border flex items-center overflow-x-auto">
        {openFiles.map((fileId) => {
          const file = findNodeById(fileId);
          if (!file) return null;

          return (
            <div
              key={fileId}
              className={`flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer min-w-0 ${
                fileId === activeFileId
                  ? "bg-background border-b-background text-foreground"
                  : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveFile(fileId)}
            >
              {getFileIcon(file.name, false)}
              <span className="text-sm truncate">{file.name}</span>
              {file.isModified && (
                <Circle
                  size={6}
                  className="text-accent fill-current flex-shrink-0"
                />
              )}
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(fileId);
                }}
                className="ml-1 p-0.5 hover:bg-muted rounded"
                variant="ghost"
                size="sm"
              >
                <X size={12} />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Editor Header */}
      <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getFileIcon(activeFile.name, false)}
          <span className="text-sm font-medium text-foreground">
            {activeFile.name}
          </span>
          {isModified && (
            <Circle size={6} className="text-accent fill-current" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSearch}
            title="Search (Ctrl+F)"
            className="hover:bg-muted"
          >
            <Search size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={!isModified}
            title="Save (Ctrl+S)"
            className="hover:bg-muted disabled:opacity-50"
          >
            <Save size={14} />
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      {isSearchOpen && (
        <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-2">
          <Search size={14} className="text-muted-foreground" />
          <Input
            placeholder="Search in file..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 h-8 bg-input border-border text-foreground placeholder:text-muted-foreground"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSearch}
            className="h-8 w-8 p-0 hover:bg-muted"
          >
            <X size={14} />
          </Button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 flex">
        {/* Line Numbers */}
        <div className="bg-card border-r border-border px-2 py-4 text-right">
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i + 1}
              className="text-xs text-muted-foreground leading-6 font-mono"
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            onSelect={updateCursorPosition}
            onKeyUp={updateCursorPosition}
            onClick={updateCursorPosition}
            className="w-full h-full p-4 font-mono text-sm resize-none outline-none border-none leading-6 bg-background text-foreground placeholder:text-muted-foreground"
            placeholder="Start typing..."
            spellCheck={false}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-1 border-t border-border bg-card flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </span>
          <span>{localContent.length} characters</span>
          <span>{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{activeFile.extension?.toUpperCase() || "Plain Text"}</span>
          <span>UTF-8</span>
          {isModified && <span className="text-accent">● Unsaved</span>}
        </div>
      </div>
    </div>
  );
};

export default TextEditor;

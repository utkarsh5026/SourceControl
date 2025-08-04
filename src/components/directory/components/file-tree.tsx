import React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronDown,
  Copy,
} from "lucide-react";
import type { FileNode } from "../types";
import { getFileIcon } from "./utils";

interface FileTreeProps {
  node: FileNode;
  depth: number;
  selectedFileId: string;
  toggleDirectory: (nodeId: string) => void;
  handleFileSelect: (nodeId: string) => void;
  openCreateDialog: (parentId: string, type: "file" | "directory") => void;
  openRenameDialog: (nodeId: string, currentName: string) => void;
  handleDelete: (nodeId: string) => void;
}

const FileTree: React.FC<FileTreeProps> = ({
  node,
  depth,
  selectedFileId,
  toggleDirectory,
  handleFileSelect,
  openCreateDialog,
  openRenameDialog,
  handleDelete,
}: FileTreeProps) => {
  const isSelected = selectedFileId === node.id;
  const isDirectory = node.type === "directory";
  const hasChildren = node.children && node.children.length > 0;

  if (isDirectory) {
    return (
      <DirectorySelect
        node={node}
        depth={depth}
        isSelected={isSelected}
        selectedFileId={selectedFileId}
        hasChildren={hasChildren || false}
        toggleDirectory={toggleDirectory}
        handleFileSelect={handleFileSelect}
        openCreateDialog={openCreateDialog}
        openRenameDialog={openRenameDialog}
        handleDelete={handleDelete}
        getFileIcon={getFileIcon}
      />
    );
  } else {
    // File node
    return (
      <FileSelect
        node={node}
        depth={depth}
        isSelected={isSelected}
        selectedFileId={selectedFileId}
        handleFileSelect={handleFileSelect}
        openRenameDialog={openRenameDialog}
        handleDelete={handleDelete}
      />
    );
  }
};

interface FileSelectProps {
  node: FileNode;
  depth: number;
  isSelected: boolean;
  selectedFileId: string;
  handleFileSelect: (nodeId: string) => void;
  openRenameDialog: (nodeId: string, currentName: string) => void;
  handleDelete: (nodeId: string) => void;
}

const FileSelect: React.FC<FileSelectProps> = ({
  node,
  depth,
  isSelected,
  handleFileSelect,
  openRenameDialog,
  handleDelete,
}) => {
  return (
    <div key={node.id}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`flex items-center gap-2 px-2 py-1.5 hover:bg-sidebar-accent cursor-pointer rounded-sm group transition-colors text-sidebar-foreground ${
              isSelected
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : ""
            }`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={(e) => {
              e.preventDefault();
              handleFileSelect(node.id);
            }}
          >
            {/* Empty space for icon alignment */}
            <div className="w-4 h-4" />

            {/* File Icon */}
            {getFileIcon(node.name, false)}

            {/* Name */}
            <span
              className={`text-sm flex-1 ${
                node.isModified ? "text-accent font-medium" : ""
              }`}
            >
              {node.name}
            </span>

            {/* Modified indicator */}
            {node.isModified && (
              <div className="w-2 h-2 bg-accent rounded-full" />
            )}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => openRenameDialog(node.id, node.name)}>
            <Edit3 size={16} className="mr-2" />
            Rename
          </ContextMenuItem>

          <ContextMenuItem
            onClick={() => navigator.clipboard.writeText(node.name)}
          >
            <Copy size={16} className="mr-2" />
            Copy Name
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem
            onClick={() => handleDelete(node.id)}
            variant="destructive"
          >
            <Trash2 size={16} className="mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
};

interface DirectorySelectProps {
  node: FileNode;
  depth: number;
  isSelected: boolean;
  selectedFileId: string;
  hasChildren: boolean;
  toggleDirectory: (nodeId: string) => void;
  handleFileSelect: (nodeId: string) => void;
  openCreateDialog: (parentId: string, type: "file" | "directory") => void;
  openRenameDialog: (nodeId: string, currentName: string) => void;
  handleDelete: (nodeId: string) => void;
  getFileIcon: (fileName: string, isDirectory: boolean) => React.ReactNode;
}

const DirectorySelect: React.FC<DirectorySelectProps> = ({
  node,
  depth,
  isSelected,
  selectedFileId,
  hasChildren,
  toggleDirectory,
  handleFileSelect,
  openCreateDialog,
  openRenameDialog,
  handleDelete,
}: DirectorySelectProps) => {
  return (
    <Collapsible
      key={node.id}
      open={node.isOpen}
      onOpenChange={() => toggleDirectory(node.id)}
    >
      <div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <CollapsibleTrigger asChild>
              <div
                className={`flex items-center gap-2 px-2 py-1.5 hover:bg-sidebar-accent cursor-pointer rounded-sm group transition-colors w-full text-sidebar-foreground ${
                  isSelected
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : ""
                }`}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
              >
                {/* Expand/Collapse Icon */}
                <div className="w-4 h-4 flex items-center justify-center">
                  {hasChildren &&
                    (node.isOpen ? (
                      <ChevronDown
                        size={14}
                        className="text-sidebar-foreground"
                      />
                    ) : (
                      <ChevronRight
                        size={14}
                        className="text-sidebar-foreground"
                      />
                    ))}
                </div>

                {/* Folder Icon */}
                {node.isOpen ? (
                  <FolderOpen size={16} className="text-sidebar-accent" />
                ) : (
                  <Folder size={16} className="text-sidebar-accent" />
                )}

                {/* Name */}
                <span
                  className={`text-sm flex-1 ${
                    node.isModified ? "text-accent font-medium" : ""
                  }`}
                >
                  {node.name}
                </span>

                {/* Modified indicator */}
                {node.isModified && (
                  <div className="w-2 h-2 bg-accent rounded-full" />
                )}
              </div>
            </CollapsibleTrigger>
          </ContextMenuTrigger>

          <ContextMenuContent className="w-48">
            <ContextMenuItem onClick={() => openCreateDialog(node.id, "file")}>
              <FilePlus size={16} className="mr-2" />
              New File
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => openCreateDialog(node.id, "directory")}
            >
              <FolderPlus size={16} className="mr-2" />
              New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />

            <ContextMenuItem
              onClick={() => openRenameDialog(node.id, node.name)}
            >
              <Edit3 size={16} className="mr-2" />
              Rename
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => navigator.clipboard.writeText(node.name)}
            >
              <Copy size={16} className="mr-2" />
              Copy Name
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              onClick={() => handleDelete(node.id)}
              variant="destructive"
            >
              <Trash2 size={16} className="mr-2" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {/* Render children with Collapsible animation */}
        <CollapsibleContent className="space-y-0">
          {node.children?.map((child) => (
            <FileTree
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedFileId={selectedFileId}
              toggleDirectory={toggleDirectory}
              handleFileSelect={handleFileSelect}
              openCreateDialog={openCreateDialog}
              openRenameDialog={openRenameDialog}
              handleDelete={handleDelete}
            />
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default FileTree;

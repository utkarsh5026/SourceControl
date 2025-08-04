import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal,
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div
            className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 cursor-pointer rounded-sm group transition-colors ${
              isSelected ? "bg-blue-100 text-blue-800" : ""
            }`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={(e) => {
              e.preventDefault();
              handleFileSelect(node.id);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Empty space for icon alignment */}
            <div className="w-4 h-4" />

            {/* File Icon */}
            {getFileIcon(node.name, false)}

            {/* Name */}
            <span
              className={`text-sm flex-1 ${
                node.isModified ? "text-orange-600 font-medium" : ""
              }`}
            >
              {node.name}
            </span>

            {/* Modified indicator */}
            {node.isModified && (
              <div className="w-2 h-2 bg-orange-500 rounded-full" />
            )}

            {/* Context menu trigger */}
            <MoreHorizontal
              size={14}
              className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem
            onClick={() => openRenameDialog(node.id, node.name)}
          >
            <Edit3 size={16} className="mr-2" />
            Rename
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => navigator.clipboard.writeText(node.name)}
          >
            <Copy size={16} className="mr-2" />
            Copy Name
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => handleDelete(node.id)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 size={16} className="mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
  getFileIcon,
}: DirectorySelectProps) => {
  return (
    <Collapsible
      key={node.id}
      open={node.isOpen}
      onOpenChange={() => toggleDirectory(node.id)}
    >
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <CollapsibleTrigger asChild>
              <div
                className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 cursor-pointer rounded-sm group transition-colors w-full ${
                  isSelected ? "bg-blue-100 text-blue-800" : ""
                }`}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {/* Expand/Collapse Icon */}
                <div className="w-4 h-4 flex items-center justify-center">
                  {hasChildren &&
                    (node.isOpen ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    ))}
                </div>

                {/* Folder Icon */}
                {node.isOpen ? (
                  <FolderOpen size={16} className="text-blue-600" />
                ) : (
                  <Folder size={16} className="text-blue-600" />
                )}

                {/* Name */}
                <span
                  className={`text-sm flex-1 ${
                    node.isModified ? "text-orange-600 font-medium" : ""
                  }`}
                >
                  {node.name}
                </span>

                {/* Modified indicator */}
                {node.isModified && (
                  <div className="w-2 h-2 bg-orange-500 rounded-full" />
                )}

                {/* Context menu trigger */}
                <MoreHorizontal
                  size={14}
                  className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </CollapsibleTrigger>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => openCreateDialog(node.id, "file")}>
              <FilePlus size={16} className="mr-2" />
              New File
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => openCreateDialog(node.id, "directory")}
            >
              <FolderPlus size={16} className="mr-2" />
              New Folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => openRenameDialog(node.id, node.name)}
            >
              <Edit3 size={16} className="mr-2" />
              Rename
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(node.name)}
            >
              <Copy size={16} className="mr-2" />
              Copy Name
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => handleDelete(node.id)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 size={16} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Render children with Collapsible animation */}
        <CollapsibleContent className="space-y-0">
          {node.children?.map((child) => (
            <DirectorySelect
              key={child.id}
              node={child}
              depth={depth + 1}
              isSelected={isSelected}
              selectedFileId={selectedFileId}
              hasChildren={hasChildren}
              toggleDirectory={toggleDirectory}
              handleFileSelect={handleFileSelect}
              openCreateDialog={openCreateDialog}
              openRenameDialog={openRenameDialog}
              handleDelete={handleDelete}
              getFileIcon={getFileIcon}
            />
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default FileTree;

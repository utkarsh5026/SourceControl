import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { FileNode } from "../types";

interface EditorState {
  content: string;
  cursorPosition: number;
  scrollPosition: number;
  selection?: { start: number; end: number };
}

interface FileStore {
  // State
  fileTree: FileNode;
  activeFileId: string | null;
  openFiles: string[]; // Tabs
  fileStates: Map<string, EditorState>; // Editor states for each file
  searchQuery: string;
  isSearchOpen: boolean;

  // Actions
  setActiveFile: (fileId: string | null) => void;
  openFile: (fileId: string) => void;
  closeFile: (fileId: string) => void;
  saveFile: (fileId: string, content?: string) => void;
  saveAllFiles: () => void;

  // File operations
  createFile: (
    parentId: string,
    name: string,
    type: "file" | "directory"
  ) => void;
  deleteFile: (fileId: string) => void;
  renameFile: (fileId: string, newName: string) => void;
  toggleDirectory: (nodeId: string) => void;

  // Content management
  updateFileContent: (fileId: string, content: string) => void;
  getFileContent: (fileId: string) => string;
  isFileModified: (fileId: string) => boolean;

  // Editor state management
  updateEditorState: (fileId: string, state: Partial<EditorState>) => void;
  getEditorState: (fileId: string) => EditorState;

  // Search
  setSearchQuery: (query: string) => void;
  toggleSearch: () => void;

  // Utilities
  findNodeById: (nodeId: string) => FileNode | null;
  getFileExtension: (filename: string) => string;
  getModifiedFiles: () => FileNode[];
  initializeFileTree: () => void;
}

// Add a function to load the file tree from JSON
const loadFileTreeFromJSON = async (): Promise<FileNode | null> => {
  try {
    const response = await fetch("/filetree.json");
    if (!response.ok) {
      throw new Error("Failed to load filetree.json");
    }
    const fileTree = await response.json();
    console.log(fileTree);
    return fileTree;
  } catch (error) {
    console.error("Error loading file tree:", error);
    return null;
  }
};

// Zustand Store
export const useFileStore = create<FileStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state - will be replaced by loaded data
        fileTree: {
          id: "root",
          name: "loading...",
          type: "directory",
          isOpen: true,
          parentId: undefined,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          children: [],
        },
        activeFileId: "1",
        openFiles: ["1"],
        fileStates: new Map(),
        searchQuery: "",
        isSearchOpen: false,

        // Add an action to initialize the file tree
        initializeFileTree: async () => {
          const loadedTree = await loadFileTreeFromJSON();
          if (loadedTree) {
            set({ fileTree: loadedTree });
          }
        },

        // Actions
        setActiveFile: (fileId) => set({ activeFileId: fileId }),

        openFile: (fileId) =>
          set((state) => {
            const openFiles = [...state.openFiles];
            if (!openFiles.includes(fileId)) {
              openFiles.push(fileId);
            }
            return { openFiles, activeFileId: fileId };
          }),

        closeFile: (fileId) =>
          set((state) => {
            const openFiles = state.openFiles.filter((id) => id !== fileId);
            const activeFileId =
              state.activeFileId === fileId
                ? openFiles.length > 0
                  ? openFiles[openFiles.length - 1]
                  : null
                : state.activeFileId;
            return { openFiles, activeFileId };
          }),

        saveFile: (fileId, content) =>
          set((state) => {
            const updateNode = (node: FileNode): FileNode => {
              if (node.id === fileId) {
                return {
                  ...node,
                  content: content || node.content,
                  isModified: false,
                };
              }
              if (node.children) {
                return {
                  ...node,
                  children: node.children.map(updateNode),
                };
              }
              return node;
            };
            return { fileTree: updateNode(state.fileTree) };
          }),

        saveAllFiles: () => {
          const { fileStates, fileTree } = get();
          const updateAllNodes = (node: FileNode): FileNode => {
            if (node.type === "file" && node.isModified) {
              const editorState = fileStates.get(node.id);
              if (editorState) {
                return {
                  ...node,
                  content: editorState.content,
                  isModified: false,
                };
              }
            }
            if (node.children) {
              return {
                ...node,
                children: node.children.map(updateAllNodes),
              };
            }
            return node;
          };
          set({ fileTree: updateAllNodes(fileTree) });
        },

        createFile: (parentId, name, type) =>
          set((state) => {
            const newId = Date.now().toString();
            const extension =
              type === "file" ? name.split(".").pop() || "" : undefined;

            const newNode: FileNode = {
              id: newId,
              name,
              type,
              content: type === "file" ? "" : undefined,
              children: type === "directory" ? [] : undefined,
              isOpen: false,
              extension,
              isModified: false,
            };

            const addToTree = (node: FileNode): FileNode => {
              if (node.id === parentId && node.type === "directory") {
                return {
                  ...node,
                  children: [...(node.children || []), newNode],
                  isOpen: true,
                };
              }
              if (node.children) {
                return {
                  ...node,
                  children: node.children.map(addToTree),
                };
              }
              return node;
            };

            return { fileTree: addToTree(state.fileTree) };
          }),

        deleteFile: (fileId) =>
          set((state) => {
            const removeFromTree = (node: FileNode): FileNode | null => {
              if (node.id === fileId) return null;
              if (node.children) {
                return {
                  ...node,
                  children: node.children
                    .map(removeFromTree)
                    .filter(Boolean) as FileNode[],
                };
              }
              return node;
            };

            const newTree = removeFromTree(state.fileTree)!;
            const openFiles = state.openFiles.filter((id) => id !== fileId);
            const activeFileId =
              state.activeFileId === fileId
                ? openFiles.length > 0
                  ? openFiles[0]
                  : null
                : state.activeFileId;

            return { fileTree: newTree, openFiles, activeFileId };
          }),

        renameFile: (fileId, newName) =>
          set((state) => {
            const extension = newName.split(".").pop();
            const updateNode = (node: FileNode): FileNode => {
              if (node.id === fileId) {
                return {
                  ...node,
                  name: newName,
                  extension: node.type === "file" ? extension : undefined,
                };
              }
              if (node.children) {
                return {
                  ...node,
                  children: node.children.map(updateNode),
                };
              }
              return node;
            };
            return { fileTree: updateNode(state.fileTree) };
          }),

        toggleDirectory: (nodeId) =>
          set((state) => {
            const updateNode = (node: FileNode): FileNode => {
              if (node.id === nodeId && node.type === "directory") {
                return { ...node, isOpen: !node.isOpen };
              }
              if (node.children) {
                return {
                  ...node,
                  children: node.children.map(updateNode),
                };
              }
              return node;
            };
            return { fileTree: updateNode(state.fileTree) };
          }),

        updateFileContent: (fileId, content) =>
          set((state) => {
            const newFileStates = new Map(state.fileStates);
            const currentState = newFileStates.get(fileId) || {
              content: "",
              cursorPosition: 0,
              scrollPosition: 0,
            };
            newFileStates.set(fileId, { ...currentState, content });

            // Mark file as modified
            const updateNode = (node: FileNode): FileNode => {
              if (node.id === fileId) {
                return { ...node, isModified: true };
              }
              if (node.children) {
                return {
                  ...node,
                  children: node.children.map(updateNode),
                };
              }
              return node;
            };

            return {
              fileStates: newFileStates,
              fileTree: updateNode(state.fileTree),
            };
          }),

        getFileContent: (fileId) => {
          const state = get();
          const editorState = state.fileStates.get(fileId);
          if (editorState) return editorState.content;

          const node = state.findNodeById(fileId);
          return node?.content || "";
        },

        isFileModified: (fileId) => {
          const state = get();
          const node = state.findNodeById(fileId);
          return node?.isModified || false;
        },

        updateEditorState: (fileId, stateUpdate) =>
          set((state) => {
            const newFileStates = new Map(state.fileStates);
            const currentState = newFileStates.get(fileId) || {
              content: "",
              cursorPosition: 0,
              scrollPosition: 0,
            };
            newFileStates.set(fileId, { ...currentState, ...stateUpdate });
            return { fileStates: newFileStates };
          }),

        getEditorState: (fileId) => {
          const state = get();
          return (
            state.fileStates.get(fileId) || {
              content: "",
              cursorPosition: 0,
              scrollPosition: 0,
            }
          );
        },

        setSearchQuery: (query) => set({ searchQuery: query }),
        toggleSearch: () =>
          set((state) => ({ isSearchOpen: !state.isSearchOpen })),

        findNodeById: (nodeId) => {
          const searchNode = (node: FileNode): FileNode | null => {
            if (node.id === nodeId) return node;
            if (node.children) {
              for (const child of node.children) {
                const found = searchNode(child);
                if (found) return found;
              }
            }
            return null;
          };
          return searchNode(get().fileTree);
        },

        getFileExtension: (filename) => filename.split(".").pop() || "",

        getModifiedFiles: () => {
          const collectModified = (
            node: FileNode,
            result: FileNode[] = []
          ): FileNode[] => {
            if (node.type === "file" && node.isModified) {
              result.push(node);
            }
            if (node.children) {
              node.children.forEach((child) => collectModified(child, result));
            }
            return result;
          };
          return collectModified(get().fileTree);
        },
      }),
      {
        name: "file-store",
        partialize: (state) => ({
          fileTree: state.fileTree,
          openFiles: state.openFiles,
          activeFileId: state.activeFileId,
        }),
      }
    )
  )
);

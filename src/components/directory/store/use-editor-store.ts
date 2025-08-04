import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface EditorState {
  content: string;
  cursorPosition: number;
  scrollPosition: number;
  selection?: { start: number; end: number };
  isModified?: boolean;
}

type EditorListener = (fileId: string, state: EditorState) => void;
type FileOperationListener = (
  operation: "open" | "close" | "delete",
  fileId: string
) => void;

interface EditorStore {
  fileStates: Record<string, EditorState>;
  activeFileId: string | null;

  editorListeners: Set<EditorListener>;
  fileOperationListeners: Set<FileOperationListener>;

  updateEditorState: (fileId: string, state: Partial<EditorState>) => void;
  getEditorState: (fileId: string) => EditorState;
  updateFileContent: (fileId: string, content: string) => void;
  getFileContent: (fileId: string) => string;
  setActiveFile: (fileId: string | null) => void;

  openFile: (fileId: string, initialContent?: string) => void;
  closeFile: (fileId: string) => void;
  deleteFile: (fileId: string) => void;

  subscribeToEditorChanges: (listener: EditorListener) => () => void;
  subscribeToFileOperations: (listener: FileOperationListener) => () => void;

  getModifiedFiles: () => Array<{ fileId: string; state: EditorState }>;
  isFileModified: (fileId: string) => boolean;
  clearFileState: (fileId: string) => void;
}

export const useEditorStore = create<EditorStore>()(
  devtools(
    (set, get) => ({
      fileStates: new Map(),
      activeFileId: null,
      editorListeners: new Set(),
      fileOperationListeners: new Set(),

      updateEditorState: (fileId, stateUpdate) => {
        set((state) => {
          const newFileStates = { ...state.fileStates };
          const currentState = newFileStates[fileId] || {
            content: "",
            cursorPosition: 0,
            scrollPosition: 0,
            isModified: false,
          };

          const newState = { ...currentState, ...stateUpdate };
          newFileStates[fileId] = newState;
          state.editorListeners.forEach((listener) => {
            listener(fileId, newState);
          });

          return { fileStates: newFileStates };
        });
      },

      getEditorState: (fileId) => {
        const state = get();
        return (
          state.fileStates[fileId] || {
            content: "",
            cursorPosition: 0,
            scrollPosition: 0,
            isModified: false,
          }
        );
      },

      updateFileContent: (fileId, content) => {
        const { updateEditorState } = get();
        const currentState = get().getEditorState(fileId);

        updateEditorState(fileId, {
          content,
          isModified:
            content !== currentState.content || currentState.isModified,
        });
      },

      getFileContent: (fileId) => {
        const state = get();
        const editorState = state.fileStates[fileId];
        return editorState?.content || "";
      },

      setActiveFile: (fileId) => {
        set({ activeFileId: fileId });
      },

      // File lifecycle management
      openFile: (fileId, initialContent = "") => {
        const state = get();

        // Create editor state if it doesn't exist
        if (!state.fileStates[fileId]) {
          const newFileStates = { ...state.fileStates };
          newFileStates[fileId] = {
            content: initialContent,
            cursorPosition: 0,
            scrollPosition: 0,
            isModified: false,
          };

          set({ fileStates: newFileStates, activeFileId: fileId });
        } else {
          set({ activeFileId: fileId });
        }

        // Notify file operation listeners
        state.fileOperationListeners.forEach((listener) => {
          listener("open", fileId);
        });
      },

      closeFile: (fileId) => {
        const state = get();

        // Notify file operation listeners before closing
        state.fileOperationListeners.forEach((listener) => {
          listener("close", fileId);
        });

        // Don't remove the file state - keep it for when the file is reopened
        // Just update active file if this was the active one
        if (state.activeFileId === fileId) {
          set({ activeFileId: null });
        }
      },

      deleteFile: (fileId) => {
        const state = get();

        // Remove editor state for deleted file
        const newFileStates = { ...state.fileStates };
        delete newFileStates[fileId];

        const newActiveFileId =
          state.activeFileId === fileId ? null : state.activeFileId;

        set({ fileStates: newFileStates, activeFileId: newActiveFileId });

        // Notify file operation listeners
        state.fileOperationListeners.forEach((listener) => {
          listener("delete", fileId);
        });
      },

      // Subscription management
      subscribeToEditorChanges: (listener) => {
        const state = get();
        const newListeners = new Set(state.editorListeners);
        newListeners.add(listener);
        set({ editorListeners: newListeners });

        // Return unsubscribe function
        return () => {
          const currentState = get();
          const updatedListeners = new Set(currentState.editorListeners);
          updatedListeners.delete(listener);
          set({ editorListeners: updatedListeners });
        };
      },

      subscribeToFileOperations: (listener) => {
        const state = get();
        const newListeners = new Set(state.fileOperationListeners);
        newListeners.add(listener);
        set({ fileOperationListeners: newListeners });

        // Return unsubscribe function
        return () => {
          const currentState = get();
          const updatedListeners = new Set(currentState.fileOperationListeners);
          updatedListeners.delete(listener);
          set({ fileOperationListeners: updatedListeners });
        };
      },

      // Utilities
      getModifiedFiles: () => {
        const state = get();
        const modifiedFiles: Array<{ fileId: string; state: EditorState }> = [];

        Object.entries(state.fileStates).forEach(([fileId, editorState]) => {
          if (editorState.isModified) {
            modifiedFiles.push({ fileId, state: editorState });
          }
        });

        return modifiedFiles;
      },

      isFileModified: (fileId) => {
        const state = get();
        const editorState = state.fileStates[fileId];
        return editorState?.isModified || false;
      },

      clearFileState: (fileId) => {
        set((state) => {
          const newFileStates = { ...state.fileStates };
          delete newFileStates[fileId];
          return { fileStates: newFileStates };
        });
      },
    }),
    { name: "editor-store" }
  )
);

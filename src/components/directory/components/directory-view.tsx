import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FilePlus, FolderPlus } from "lucide-react";
import { CreateItemDialog, RenameItemDialog } from "./file-operations";
import { useFileStore } from "../store/use-file-store";
import FileTree from "./file-tree";

const DirectoryView: React.FC = () => {
  const {
    fileTree,
    createFile,
    renameFile,
    toggleDirectory,
    initializeFileTree,
    activeFileId,
    closeFile,
    setActiveFile,
  } = useFileStore();

  useEffect(() => {
    initializeFileTree();
  }, []);

  const [createDialog, setCreateDialog] = useState<{
    isOpen: boolean;
    parentId: string;
    type: "file" | "directory";
  }>({ isOpen: false, parentId: "", type: "file" });

  const [renameDialog, setRenameDialog] = useState<{
    isOpen: boolean;
    nodeId: string;
    currentName: string;
  }>({ isOpen: false, nodeId: "", currentName: "" });

  const [newItemName, setNewItemName] = useState("");

  const handleCreateItem = () => {
    if (!newItemName.trim()) return;
    createFile(createDialog.parentId, newItemName.trim(), createDialog.type);
    setCreateDialog({ isOpen: false, parentId: "", type: "file" });
    setNewItemName("");
  };

  const handleRename = () => {
    if (!newItemName.trim()) return;
    renameFile(renameDialog.nodeId, newItemName.trim());
    setRenameDialog({ isOpen: false, nodeId: "", currentName: "" });
    setNewItemName("");
  };

  const openCreateDialog = (parentId: string, type: "file" | "directory") => {
    setCreateDialog({ isOpen: true, parentId, type });
    setNewItemName("");
  };

  const openRenameDialog = (nodeId: string, currentName: string) => {
    setRenameDialog({ isOpen: true, nodeId, currentName });
    setNewItemName(currentName);
  };

  return (
    <div className="h-full flex flex-col bg-sidebar">
      {/* Header */}
      <div className="px-3 py-2 border-b border-sidebar-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-sidebar-foreground">
          Explorer
        </h2>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openCreateDialog("root", "file")}
            className="h-7 w-7 p-0 hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-accent-foreground"
            title="New File"
          >
            <FilePlus size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openCreateDialog("root", "directory")}
            className="h-7 w-7 p-0 hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-accent-foreground"
            title="New Folder"
          >
            <FolderPlus size={14} />
          </Button>
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-auto p-2">
        <FileTree
          node={fileTree}
          depth={0}
          selectedFileId={activeFileId || ""}
          toggleDirectory={toggleDirectory}
          handleFileSelect={setActiveFile}
          openCreateDialog={openCreateDialog}
          openRenameDialog={openRenameDialog}
          handleDelete={closeFile}
        />
      </div>

      <CreateItemDialog
        isOpen={createDialog.isOpen}
        onOpenChange={(open) =>
          setCreateDialog((prev) => ({ ...prev, isOpen: open }))
        }
        type={createDialog.type}
        newItemName={newItemName}
        setNewItemName={setNewItemName}
        handleCreateItem={handleCreateItem}
      />
      <RenameItemDialog
        isOpen={renameDialog.isOpen}
        onOpenChange={(open) =>
          setRenameDialog((prev) => ({ ...prev, isOpen: open }))
        }
        newItemName={newItemName}
        setNewItemName={setNewItemName}
        handleRename={handleRename}
      />
    </div>
  );
};

export default DirectoryView;

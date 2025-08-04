import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CreateItemDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  type: "file" | "directory";
  newItemName: string;
  setNewItemName: (name: string) => void;
  handleCreateItem: () => void;
}
export const CreateItemDialog: React.FC<CreateItemDialogProps> = ({
  isOpen,
  onOpenChange,
  type,
  newItemName,
  setNewItemName,
  handleCreateItem,
}: CreateItemDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Create New {type === "file" ? "File" : "Folder"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder={`Enter ${type} name`}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleCreateItem()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateItem} disabled={!newItemName.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface RenameItemDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  newItemName: string;
  setNewItemName: (name: string) => void;
  handleRename: () => void;
}
export const RenameItemDialog: React.FC<RenameItemDialogProps> = ({
  isOpen,
  onOpenChange,
  newItemName,
  setNewItemName,
  handleRename,
}: RenameItemDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Enter new name"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleRename()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={!newItemName.trim()}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

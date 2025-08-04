export type FileNode = {
  id: string;
  name: string;
  type: "file" | "directory";
  content?: string;
  children?: FileNode[];
  isOpen?: boolean;
  isModified?: boolean;
  extension?: string;
};

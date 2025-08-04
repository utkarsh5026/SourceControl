import { Code, File, Settings, FileText, Image, Folder } from "lucide-react";

export const getFileIcon = (fileName: string, isDirectory: boolean) => {
  if (isDirectory) return <Folder size={16} className="text-blue-600" />;

  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
      return <Code size={16} className="text-yellow-600" />;
    case "json":
      return <Settings size={16} className="text-orange-600" />;
    case "md":
    case "txt":
      return <FileText size={16} className="text-blue-600" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
      return <Image size={16} className="text-purple-600" />;
    default:
      return <File size={16} className="text-gray-600" />;
  }
};

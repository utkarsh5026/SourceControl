import React, { useState, useMemo } from "react";
import { create } from "zustand";
import {
  GitBranch,
  GitCommit,
  GitMerge,
  Database,
  Clock,
  FileText,
  Plus,
  Minus,
  Circle,
  CheckCircle,
  AlertCircle,
  Eye,
  Hash,
  TreePine,
  Users,
  Calendar,
  MoreHorizontal,
  RefreshCw,
  Network,
  Copy,
  Trash2,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Types
interface GitObject {
  sha: string;
  type: "blob" | "tree" | "commit" | "tag";
  size: number;
  content: string;
  compressed?: boolean;
  references?: string[];
}

interface GitCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  tree: string;
  parents: string[];
  timestamp: number;
}

interface GitBranch {
  name: string;
  commit: string;
  isActive: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
}

interface GitStatus {
  staged: Array<{ path: string; status: "A" | "M" | "D" | "R" }>;
  unstaged: Array<{ path: string; status: "M" | "D" }>;
  untracked: string[];
  conflicted: string[];
  ignored: string[];
}

interface GitStoreState {
  objects: Map<string, GitObject>;
  commits: GitCommit[];
  branches: GitBranch[];
  status: GitStatus;
  currentBranch: string;
  head: string;

  // Actions
  addObject: (object: GitObject) => void;
  addCommit: (commit: GitCommit) => void;
  stageFile: (path: string) => void;
  unstageFile: (path: string) => void;
  switchBranch: (name: string) => void;
  createBranch: (name: string) => void;
  reset: () => void;
}

// Create the Zustand store
const useGitStore = create<GitStoreState>((set, get) => ({
  objects: new Map(),
  commits: [
    {
      sha: "a1b2c3d4e5f6789012345678901234567890abcd",
      message: "Initial commit: Setup project structure",
      author: {
        name: "John Developer",
        email: "john@example.com",
        date: "2023-12-01T10:00:00Z",
      },
      committer: {
        name: "John Developer",
        email: "john@example.com",
        date: "2023-12-01T10:00:00Z",
      },
      tree: "tree123456789012345678901234567890",
      parents: [],
      timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
    },
    {
      sha: "b2c3d4e5f67890123456789012345678901abcde",
      message: "Add: User authentication system",
      author: {
        name: "Jane Smith",
        email: "jane@example.com",
        date: "2023-12-02T14:30:00Z",
      },
      committer: {
        name: "Jane Smith",
        email: "jane@example.com",
        date: "2023-12-02T14:30:00Z",
      },
      tree: "tree234567890123456789012345678901",
      parents: ["a1b2c3d4e5f6789012345678901234567890abcd"],
      timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000,
    },
    {
      sha: "c3d4e5f67890123456789012345678901abcdef0",
      message: "Fix: Resolve login validation bug",
      author: {
        name: "Bob Johnson",
        email: "bob@example.com",
        date: "2023-12-03T09:15:00Z",
      },
      committer: {
        name: "Bob Johnson",
        email: "bob@example.com",
        date: "2023-12-03T09:15:00Z",
      },
      tree: "tree345678901234567890123456789012",
      parents: ["b2c3d4e5f67890123456789012345678901abcde"],
      timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
    },
  ],
  branches: [
    {
      name: "main",
      commit: "c3d4e5f67890123456789012345678901abcdef0",
      isActive: true,
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
    },
    {
      name: "feature/user-profile",
      commit: "b2c3d4e5f67890123456789012345678901abcde",
      isActive: false,
      upstream: "origin/feature/user-profile",
      ahead: 2,
      behind: 1,
    },
    {
      name: "hotfix/security-patch",
      commit: "c3d4e5f67890123456789012345678901abcdef0",
      isActive: false,
      ahead: 0,
      behind: 0,
    },
  ],
  status: {
    staged: [
      { path: "src/auth/login.ts", status: "M" },
      { path: "src/components/Button.tsx", status: "A" },
    ],
    unstaged: [
      { path: "src/utils/validation.ts", status: "M" },
      { path: "README.md", status: "M" },
    ],
    untracked: ["src/temp/debug.log", "config/local.env"],
    conflicted: [],
    ignored: ["node_modules/", ".env", "dist/"],
  },
  currentBranch: "main",
  head: "c3d4e5f67890123456789012345678901abcdef0",

  addObject: (object) =>
    set((state) => ({
      objects: new Map(state.objects).set(object.sha, object),
    })),

  addCommit: (commit) =>
    set((state) => ({
      commits: [commit, ...state.commits],
    })),

  stageFile: (path) =>
    set((state) => {
      const unstaged = state.status.unstaged.filter((f) => f.path !== path);
      const untracked = state.status.untracked.filter((p) => p !== path);

      const existingFile = state.status.unstaged.find((f) => f.path === path);

      const newStagedFile = existingFile
        ? existingFile
        : { path, status: "A" as const };

      return {
        status: {
          ...state.status,
          staged: [...state.status.staged, newStagedFile],
          unstaged,
          untracked,
        },
      };
    }),

  unstageFile: (path) =>
    set((state) => {
      const staged = state.status.staged.filter((f) => f.path !== path);
      const stagedFile = state.status.staged.find((f) => f.path === path);

      if (stagedFile && stagedFile.status !== "A") {
        return {
          status: {
            ...state.status,
            staged,
            unstaged: [...state.status.unstaged, stagedFile],
          },
        };
      } else if (stagedFile && stagedFile.status === "A") {
        return {
          status: {
            ...state.status,
            staged,
            untracked: [...state.status.untracked, path],
          },
        };
      }

      return { status: { ...state.status, staged } };
    }),

  switchBranch: (name) =>
    set((state) => ({
      currentBranch: name,
      branches: state.branches.map((branch) => ({
        ...branch,
        isActive: branch.name === name,
      })),
    })),

  createBranch: (name) =>
    set((state) => {
      const newBranch: GitBranch = {
        name,
        commit: state.head,
        isActive: false,
        ahead: 0,
        behind: 0,
      };
      return {
        branches: [...state.branches, newBranch],
      };
    }),

  reset: () =>
    set(() => ({
      objects: new Map(),
      commits: [],
      branches: [],
      status: {
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        ignored: [],
      },
      currentBranch: "main",
      head: "",
    })),
}));

// Populate some sample objects
const sampleObjects: GitObject[] = [
  {
    sha: "blob1234567890123456789012345678901234567890",
    type: "blob",
    size: 1024,
    content:
      "export const greet = (name: string) => {\n  return `Hello, ${name}!`;\n};",
    compressed: true,
    references: ["src/utils/greet.ts"],
  },
  {
    sha: "tree2345678901234567890123456789012345678901",
    type: "tree",
    size: 256,
    content:
      "100644 blob blob1234567890123456789012345678901234567890\tgreet.ts\n040000 tree tree3456789012345678901234567890123456789012\tcomponents",
    references: ["src/", "src/utils/"],
  },
  {
    sha: "commit345678901234567890123456789012345678901234",
    type: "commit",
    size: 512,
    content:
      "tree tree2345678901234567890123456789012345678901\nauthor John Developer <john@example.com> 1701432000 +0000\ncommitter John Developer <john@example.com> 1701432000 +0000\n\nInitial commit: Setup project structure",
  },
];

// Initialize sample data
sampleObjects.forEach((obj) => {
  useGitStore.getState().addObject(obj);
});

// Status View Component
const GitStatusView: React.FC = () => {
  const { status, stageFile, unstageFile } = useGitStore();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "A":
        return <Plus size={14} style={{ color: "var(--github-git-added)" }} />;
      case "M":
        return (
          <Circle size={14} style={{ color: "var(--github-git-modified)" }} />
        );
      case "D":
        return (
          <Minus size={14} style={{ color: "var(--github-git-removed)" }} />
        );
      case "R":
        return (
          <RefreshCw size={14} style={{ color: "var(--github-git-renamed)" }} />
        );
      default:
        return (
          <Circle size={14} style={{ color: "var(--github-git-ignored)" }} />
        );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "A":
        return "github-git-status-added";
      case "M":
        return "github-git-status-modified";
      case "D":
        return "github-git-status-removed";
      case "R":
        return "github-git-status-renamed";
      default:
        return "github-git-status-default";
    }
  };

  return (
    <div className="space-y-6">
      {/* Repository Status Summary */}
      <div className="github-card-subtle p-4 rounded-lg border github-border-default">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold github-fg-default">Repository Status</h3>
          <Badge variant="secondary" className="github-badge-neutral">
            main
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div
              className="text-lg font-bold"
              style={{ color: "var(--github-git-added)" }}
            >
              {status.staged.length}
            </div>
            <div className="github-fg-muted">Staged</div>
          </div>
          <div className="text-center">
            <div
              className="text-lg font-bold"
              style={{ color: "var(--github-git-modified)" }}
            >
              {status.unstaged.length}
            </div>
            <div className="github-fg-muted">Modified</div>
          </div>
          <div className="text-center">
            <div
              className="text-lg font-bold"
              style={{ color: "var(--github-git-untracked)" }}
            >
              {status.untracked.length}
            </div>
            <div className="github-fg-muted">Untracked</div>
          </div>
        </div>
      </div>

      {/* Staging Area Visualization */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: "var(--github-git-added)" }}
          ></div>
          <h4
            className="font-medium"
            style={{ color: "var(--github-git-added)" }}
          >
            Staged Changes
          </h4>
          <Badge variant="outline" className="text-xs github-badge-neutral">
            {status.staged.length} files
          </Badge>
        </div>

        <div className="github-success-subtle border rounded-lg github-border-subtle">
          {status.staged.length === 0 ? (
            <div className="p-6 text-center github-fg-muted">
              <CheckCircle size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No staged changes</p>
              <p className="text-xs">Files ready for commit will appear here</p>
            </div>
          ) : (
            <div className="divide-y github-border-muted">
              {status.staged.map((file) => (
                <div
                  key={file.path}
                  className="p-3 flex items-center justify-between group hover:github-neutral-subtle"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(file.status)}
                    <span className="text-sm font-mono github-fg-default">
                      {file.path}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStatusColor(file.status)}`}
                    >
                      {file.status === "A"
                        ? "Added"
                        : file.status === "M"
                        ? "Modified"
                        : "Deleted"}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unstageFile(file.path)}
                    className="opacity-0 group-hover:opacity-100 text-xs github-btn-ghost"
                  >
                    Unstage
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modified Files */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: "var(--github-git-modified)" }}
          ></div>
          <h4
            className="font-medium"
            style={{ color: "var(--github-git-modified)" }}
          >
            Modified Files
          </h4>
          <Badge variant="outline" className="text-xs github-badge-neutral">
            {status.unstaged.length} files
          </Badge>
        </div>

        <div className="github-warning-subtle border rounded-lg github-border-subtle">
          {status.unstaged.length === 0 ? (
            <div className="p-6 text-center github-fg-muted">
              <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No modified files</p>
            </div>
          ) : (
            <div className="divide-y github-border-muted">
              {status.unstaged.map((file) => (
                <div
                  key={file.path}
                  className="p-3 flex items-center justify-between group hover:github-neutral-subtle"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(file.status)}
                    <span className="text-sm font-mono github-fg-default">
                      {file.path}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStatusColor(file.status)}`}
                    >
                      {file.status === "M" ? "Modified" : "Deleted"}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => stageFile(file.path)}
                    className="opacity-0 group-hover:opacity-100 text-xs github-btn-ghost"
                  >
                    Stage
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Untracked Files */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: "var(--github-git-untracked)" }}
          ></div>
          <h4
            className="font-medium"
            style={{ color: "var(--github-git-untracked)" }}
          >
            Untracked Files
          </h4>
          <Badge variant="outline" className="text-xs github-badge-neutral">
            {status.untracked.length} files
          </Badge>
        </div>

        <div className="github-info-subtle border rounded-lg github-border-subtle">
          {status.untracked.length === 0 ? (
            <div className="p-6 text-center github-fg-muted">
              <Eye size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No untracked files</p>
            </div>
          ) : (
            <div className="divide-y github-border-muted">
              {status.untracked.map((path) => (
                <div
                  key={path}
                  className="p-3 flex items-center justify-between group hover:github-neutral-subtle"
                >
                  <div className="flex items-center gap-3">
                    <Circle
                      size={14}
                      style={{ color: "var(--github-git-untracked)" }}
                    />
                    <span className="text-sm font-mono github-fg-default">
                      {path}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs github-git-status-untracked"
                    >
                      Untracked
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => stageFile(path)}
                    className="opacity-0 group-hover:opacity-100 text-xs github-btn-ghost"
                  >
                    Stage
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Objects View Component
const GitObjectsView: React.FC = () => {
  const { objects } = useGitStore();
  const [selectedObject, setSelectedObject] = useState<string>("");
  const [filter, setFilter] = useState<
    "all" | "blob" | "tree" | "commit" | "tag"
  >("all");

  const filteredObjects = useMemo(() => {
    const objectList = Array.from(objects.entries());
    if (filter === "all") return objectList;
    return objectList.filter(([, obj]) => obj.type === filter);
  }, [objects, filter]);

  const getObjectIcon = (type: string) => {
    switch (type) {
      case "blob":
        return (
          <FileText size={16} style={{ color: "var(--github-git-added)" }} />
        );
      case "tree":
        return (
          <Folder size={16} style={{ color: "var(--github-git-modified)" }} />
        );
      case "commit":
        return (
          <GitCommit size={16} style={{ color: "var(--github-accent-fg)" }} />
        );
      case "tag":
        return (
          <Hash size={16} style={{ color: "var(--github-brand-purple)" }} />
        );
      default:
        return (
          <Database size={16} style={{ color: "var(--github-fg-muted)" }} />
        );
    }
  };

  const getObjectColor = (type: string) => {
    switch (type) {
      case "blob":
        return "github-success-muted github-border-subtle";
      case "tree":
        return "github-warning-muted github-border-subtle";
      case "commit":
        return "github-info-muted github-border-subtle";
      case "tag":
        return "github-object-tag github-border-subtle";
      default:
        return "github-neutral-muted github-border-subtle";
    }
  };

  const formatContent = (obj: GitObject) => {
    const lines = obj.content.split("\n");
    const preview = lines.slice(0, 5).join("\n");
    return lines.length > 5 ? preview + "\n..." : preview;
  };

  return (
    <div className="space-y-4">
      {/* Header with Statistics */}
      <div className="github-card-subtle p-4 rounded-lg border github-border-default">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold github-fg-default">Object Database</h3>
          <Badge variant="secondary" className="github-badge-neutral">
            {objects.size} objects
          </Badge>
        </div>
        <div className="grid grid-cols-4 gap-2 text-sm">
          {["blob", "tree", "commit", "tag"].map((type) => {
            const count = Array.from(objects.values()).filter(
              (obj) => obj.type === type
            ).length;
            return (
              <div key={type} className="text-center">
                <div className="text-lg font-bold github-accent-fg">
                  {count}
                </div>
                <div className="github-fg-muted capitalize">{type}s</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "blob", "tree", "commit", "tag"] as const).map((type) => (
          <Button
            key={type}
            variant={filter === type ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(type)}
            className="text-xs github-btn-primary"
          >
            {type === "all"
              ? "All Objects"
              : `${type.charAt(0).toUpperCase()}${type.slice(1)}s`}
          </Button>
        ))}
      </div>

      {/* Objects List */}
      <div className="space-y-2">
        {filteredObjects.map(([sha, obj]) => (
          <div
            key={sha}
            className={`border rounded-lg p-4 cursor-pointer transition-all ${
              selectedObject === sha
                ? `${getObjectColor(obj.type)} border-2`
                : "github-border-default hover:github-neutral-subtle"
            }`}
            onClick={() => setSelectedObject(selectedObject === sha ? "" : sha)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                {getObjectIcon(obj.type)}
                <code className="text-sm font-mono github-neutral-muted px-2 py-1 rounded">
                  {obj.sha.substring(0, 12)}...
                </code>
                <Badge
                  variant="outline"
                  className="text-xs github-badge-neutral"
                >
                  {obj.type.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs github-fg-muted">
                <span>{obj.size}b</span>
                {obj.compressed && (
                  <Badge
                    variant="secondary"
                    className="text-xs github-badge-neutral"
                  >
                    compressed
                  </Badge>
                )}
              </div>
            </div>

            {selectedObject === sha && (
              <div className="space-y-3 pt-3 border-t github-border-muted">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium github-fg-muted">SHA-1:</span>
                    <code className="block text-xs github-neutral-muted p-2 rounded mt-1 font-mono">
                      {obj.sha}
                    </code>
                  </div>
                  <div>
                    <span className="font-medium github-fg-muted">Header:</span>
                    <code className="block text-xs github-neutral-muted p-2 rounded mt-1 font-mono">
                      {obj.type} {obj.size}\0
                    </code>
                  </div>
                </div>

                {obj.references && (
                  <div>
                    <span className="font-medium github-fg-muted text-sm">
                      References:
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {obj.references.map((ref) => (
                        <code
                          key={ref}
                          className="text-xs github-info-muted px-2 py-1 rounded"
                        >
                          {ref}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium github-fg-muted text-sm">
                      Content:
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs github-btn-ghost"
                    >
                      <Copy size={12} className="mr-1" />
                      Copy
                    </Button>
                  </div>
                  <pre className="text-xs github-neutral-muted p-3 rounded mt-1 overflow-auto max-h-32 font-mono">
                    {formatContent(obj)}
                  </pre>
                </div>

                {obj.type === "commit" && (
                  <div className="github-info-subtle p-3 rounded border github-border-subtle">
                    <h5 className="font-medium github-fg-default mb-2">
                      Commit Details
                    </h5>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <TreePine
                          size={12}
                          style={{ color: "var(--github-accent-fg)" }}
                        />
                        <span>
                          Tree:{" "}
                          {obj.content
                            .match(/tree ([a-f0-9]+)/)?.[1]
                            ?.substring(0, 8)}
                          ...
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users
                          size={12}
                          style={{ color: "var(--github-accent-fg)" }}
                        />
                        <span>
                          Author: {obj.content.match(/author (.+) \d+/)?.[1]}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredObjects.length === 0 && (
        <div className="text-center py-8 github-fg-muted">
          <Database size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            No {filter === "all" ? "" : filter} objects found
          </p>
        </div>
      )}
    </div>
  );
};

// History View Component
const GitHistoryView: React.FC = () => {
  const { commits } = useGitStore();
  const [selectedCommit, setSelectedCommit] = useState<string>("");

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCommitIcon = (commit: GitCommit) => {
    if (commit.parents.length === 0) {
      return (
        <Circle
          size={12}
          className="fill-current"
          style={{ color: "var(--github-git-added)" }}
        />
      );
    } else if (commit.parents.length > 1) {
      return (
        <GitMerge size={12} style={{ color: "var(--github-brand-purple)" }} />
      );
    } else {
      return (
        <Circle
          size={12}
          className="fill-current"
          style={{ color: "var(--github-accent-fg)" }}
        />
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="github-card-subtle p-4 rounded-lg border github-border-default">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold github-fg-default">Commit History</h3>
          <Badge variant="secondary" className="github-badge-neutral">
            {commits.length} commits
          </Badge>
        </div>
        <div className="text-sm github-fg-muted">
          Showing commits on{" "}
          <code className="github-neutral-muted px-2 py-1 rounded">main</code>{" "}
          branch
        </div>
      </div>

      {/* Commit Graph */}
      <div className="space-y-1">
        {commits.map((commit, index) => (
          <div key={commit.sha} className="relative">
            {/* Connection Line */}
            {index < commits.length - 1 && (
              <div className="absolute left-3 top-8 w-0.5 h-6 github-border-default"></div>
            )}

            <div
              className={`flex gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                selectedCommit === commit.sha
                  ? "github-info-subtle border github-border-subtle"
                  : "hover:github-neutral-subtle"
              }`}
              onClick={() =>
                setSelectedCommit(
                  selectedCommit === commit.sha ? "" : commit.sha
                )
              }
            >
              {/* Commit Icon */}
              <div className="flex-shrink-0 mt-1">{getCommitIcon(commit)}</div>

              {/* Commit Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-medium github-fg-default truncate">
                      {commit.message}
                    </h4>
                    <div className="flex items-center gap-3 mt-1 text-xs github-fg-muted">
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {commit.author.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(commit.author.date)}
                      </span>
                    </div>
                  </div>
                  <code className="text-xs github-neutral-muted px-2 py-1 rounded font-mono">
                    {commit.sha.substring(0, 7)}
                  </code>
                </div>

                {/* Expanded Details */}
                {selectedCommit === commit.sha && (
                  <div className="mt-4 pt-4 border-t github-border-muted space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium github-fg-muted">
                          Full SHA:
                        </span>
                        <code className="block text-xs github-neutral-muted p-2 rounded mt-1 font-mono">
                          {commit.sha}
                        </code>
                      </div>
                      <div>
                        <span className="font-medium github-fg-muted">
                          Tree:
                        </span>
                        <code className="block text-xs github-neutral-muted p-2 rounded mt-1 font-mono">
                          {commit.tree.substring(0, 12)}...
                        </code>
                      </div>
                    </div>

                    {commit.parents.length > 0 && (
                      <div>
                        <span className="font-medium github-fg-muted text-sm">
                          Parents:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {commit.parents.map((parent) => (
                            <code
                              key={parent}
                              className="text-xs github-object-tag px-2 py-1 rounded"
                              style={{
                                backgroundColor: "var(--github-brand-purple)",
                                color: "white",
                              }}
                            >
                              {parent.substring(0, 7)}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="github-neutral-subtle p-3 rounded border github-border-muted">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="font-medium github-fg-muted">
                            Author:
                          </span>
                          <div className="mt-1">
                            <div className="github-fg-default">
                              {commit.author.name}
                            </div>
                            <div className="github-fg-muted">
                              {commit.author.email}
                            </div>
                            <div className="github-fg-muted">
                              {formatDate(commit.author.date)}
                            </div>
                          </div>
                        </div>
                        <div>
                          <span className="font-medium github-fg-muted">
                            Committer:
                          </span>
                          <div className="mt-1">
                            <div className="github-fg-default">
                              {commit.committer.name}
                            </div>
                            <div className="github-fg-muted">
                              {commit.committer.email}
                            </div>
                            <div className="github-fg-muted">
                              {formatDate(commit.committer.date)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {commits.length === 0 && (
        <div className="text-center py-8 github-fg-muted">
          <Clock size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No commits yet</p>
          <p className="text-xs">Make your first commit to see history</p>
        </div>
      )}
    </div>
  );
};

// Branches View Component
const GitBranchesView: React.FC = () => {
  const { branches, currentBranch, switchBranch, createBranch } = useGitStore();
  const [newBranchName, setNewBranchName] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const handleCreateBranch = () => {
    if (newBranchName.trim()) {
      createBranch(newBranchName.trim());
      setNewBranchName("");
      setShowCreateDialog(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="github-success-subtle p-4 rounded-lg border github-border-subtle">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold github-fg-default">Branch Management</h3>
          <Button
            size="sm"
            onClick={() => setShowCreateDialog(true)}
            className="github-btn-primary"
            style={{
              backgroundColor: "var(--github-git-added)",
              color: "white",
            }}
          >
            <Plus size={14} className="mr-1" />
            New Branch
          </Button>
        </div>
        <div className="text-sm github-fg-muted">
          Current branch:{" "}
          <code className="github-success-muted px-2 py-1 rounded">
            {currentBranch}
          </code>
        </div>
      </div>

      {/* Branch List */}
      <div className="space-y-2">
        {branches.map((branch) => (
          <div
            key={branch.name}
            className={`p-4 rounded-lg border transition-all cursor-pointer ${
              branch.isActive
                ? "github-success-subtle border-2 github-border-subtle"
                : "github-border-default hover:github-neutral-subtle"
            }`}
            onClick={() => !branch.isActive && switchBranch(branch.name)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch
                  size={16}
                  style={{
                    color: branch.isActive
                      ? "var(--github-git-added)"
                      : "var(--github-fg-muted)",
                  }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium ${
                        branch.isActive
                          ? "github-fg-default"
                          : "github-fg-default"
                      }`}
                    >
                      {branch.name}
                    </span>
                    {branch.isActive && (
                      <Badge
                        variant="secondary"
                        className="github-success-muted text-xs"
                        style={{ color: "var(--github-git-added)" }}
                      >
                        current
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm github-fg-muted mt-1">
                    <code className="text-xs">
                      {branch.commit.substring(0, 7)}
                    </code>
                    {branch.upstream && (
                      <span className="ml-2">→ {branch.upstream}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(branch.ahead > 0 || branch.behind > 0) && (
                  <div className="flex items-center gap-1 text-xs">
                    {branch.ahead > 0 && (
                      <Badge
                        variant="outline"
                        className="github-success-muted github-border-subtle"
                        style={{ color: "var(--github-git-added)" }}
                      >
                        ↑{branch.ahead}
                      </Badge>
                    )}
                    {branch.behind > 0 && (
                      <Badge
                        variant="outline"
                        className="github-danger-muted github-border-subtle"
                        style={{ color: "var(--github-git-removed)" }}
                      >
                        ↓{branch.behind}
                      </Badge>
                    )}
                  </div>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 github-btn-ghost"
                    >
                      <MoreHorizontal size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="github-dropdown-bg github-border-default"
                  >
                    {!branch.isActive && (
                      <DropdownMenuItem
                        onClick={() => switchBranch(branch.name)}
                        className="github-fg-default hover:github-neutral-subtle"
                      >
                        <GitBranch size={14} className="mr-2" />
                        Checkout
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="github-fg-default hover:github-neutral-subtle">
                      <GitMerge size={14} className="mr-2" />
                      Merge into main
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="github-border-muted" />
                    <DropdownMenuItem
                      className="hover:github-neutral-subtle"
                      style={{ color: "var(--github-git-removed)" }}
                    >
                      <Trash2 size={14} className="mr-2" />
                      Delete Branch
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Branch Network Visualization */}
      <div className="github-neutral-subtle p-4 rounded-lg border github-border-muted">
        <h4 className="font-medium github-fg-default mb-3 flex items-center gap-2">
          <Network size={16} />
          Branch Network
        </h4>
        <div className="text-center py-8 github-fg-muted">
          <Network size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Visual branch graph</p>
          <p className="text-xs">
            Interactive network visualization coming soon
          </p>
        </div>
      </div>

      {/* Create Branch Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md github-canvas-default github-border-default">
          <DialogHeader>
            <DialogTitle className="github-fg-default">
              Create New Branch
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Enter branch name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleCreateBranch()}
              autoFocus
              className="github-input-bg github-border-default github-fg-default"
            />
            <div className="text-sm github-fg-muted">
              Branch will be created from:{" "}
              <code className="github-neutral-muted px-2 py-1 rounded">
                {currentBranch}
              </code>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="github-btn-ghost"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim()}
              className="github-btn-primary"
              style={{
                backgroundColor: "var(--github-git-added)",
                color: "white",
              }}
            >
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Main Git View Component
const GitView: React.FC = () => {
  const [activeTab, setActiveTab] = useState("status");

  return (
    <div className="h-full flex flex-col github-canvas-default border-l github-border-default">
      {/* Header */}
      <div className="p-4 border-b github-border-default">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="github-accent-fg" size={20} />
            <h2 className="text-lg font-semibold github-fg-default">
              Git Visualization
            </h2>
          </div>
          <Badge variant="secondary" className="github-badge-neutral">
            Interactive Learning
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 github-neutral-subtle">
            <TabsTrigger value="status" className="text-xs github-fg-default">
              <AlertCircle size={14} className="mr-1" />
              Status
            </TabsTrigger>
            <TabsTrigger value="objects" className="text-xs github-fg-default">
              <Database size={14} className="mr-1" />
              Objects
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs github-fg-default">
              <Clock size={14} className="mr-1" />
              History
            </TabsTrigger>
            <TabsTrigger value="branches" className="text-xs github-fg-default">
              <GitBranch size={14} className="mr-1" />
              Branches
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} className="h-full">
          <TabsContent value="status" className="p-4 h-full">
            <GitStatusView />
          </TabsContent>
          <TabsContent value="objects" className="p-4 h-full">
            <GitObjectsView />
          </TabsContent>
          <TabsContent value="history" className="p-4 h-full">
            <GitHistoryView />
          </TabsContent>
          <TabsContent value="branches" className="p-4 h-full">
            <GitBranchesView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default GitView;

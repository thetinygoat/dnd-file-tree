import { File, FolderOpen } from "lucide-react";
import type { TTreeNode } from "./types";

export function GhostNode({ node }: { node: TTreeNode }) {
  return (
    <div className="flex items-center  text-slate-200 px-2">
      {node.type === "directory" ? <FolderOpen /> : <File />}
      <p className="pl-2">{node.name}</p>
    </div>
  );
}

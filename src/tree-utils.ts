import type { TTree, TTreeNode } from "./types";

export function findNodeById(tree: TTree, id: string): TTreeNode | null {
  return findInNodes(tree.children, id);
}

function findInNodes(
  nodes: TTreeNode[] | undefined,
  id: string
): TTreeNode | null {
  if (!nodes) return null;

  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findInNodes(node.children, id);
    if (found) return found;
  }

  return null;
}

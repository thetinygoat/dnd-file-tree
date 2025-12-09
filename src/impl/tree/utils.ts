import type { TTree, TTreeNode } from "../../types";
import type { InternalTreeNode, SelectableTreeNode } from "./types";

// =============================================================================
// BUILD INTERNAL TREE
// =============================================================================
//
// Converts your flat TTree/TTreeNode structure into InternalTreeNode with:
//   - parent: backlink to parent node
//   - depth: nesting level
//
// This is called ONCE when tree data changes (in a useMemo), not on every render.
//
// Example transformation:
//
//   Input (TTree):
//   {
//     id: "root",
//     children: [
//       { id: "folder-1", children: [{ id: "file-1" }] },
//       { id: "file-2" }
//     ]
//   }
//
//   Output (InternalTreeNode):
//   {
//     item: { id: "root", ... },
//     depth: 0,
//     parent: null,
//     children: [
//       {
//         item: { id: "folder-1", ... },
//         depth: 1,
//         parent: <reference to root>,
//         children: [
//           {
//             item: { id: "file-1", ... },
//             depth: 2,
//             parent: <reference to folder-1>
//           }
//         ]
//       },
//       {
//         item: { id: "file-2", ... },
//         depth: 1,
//         parent: <reference to root>
//       }
//     ]
//   }
//
// =============================================================================

export function buildInternalTree(
  node: TTree | TTreeNode,
  parent: InternalTreeNode | null = null,
  depth: number = 0
): InternalTreeNode {
  // Create the internal node with parent and depth
  const internalNode: InternalTreeNode = {
    item: node as TTreeNode,
    parent,
    depth,
    children: undefined,
  };

  // Recursively process children, linking them back to this node
  if (node.children && node.children.length > 0) {
    internalNode.children = node.children.map((child) =>
      buildInternalTree(child, internalNode, depth + 1)
    );
  }

  return internalNode;
}

// =============================================================================
// HAS ANCESTOR
// =============================================================================
//
// Checks if a node has a specific ancestor by walking UP the parent chain.
//
// Why is this needed?
//   - PREVENT INVALID DROPS: You can't drop a folder into itself or its children
//
// Example scenario:
//   FolderA
//     └── FolderB
//           └── FileC
//
//   If you're dragging FolderA and hovering over FolderB:
//     hasAncestor(FolderB, "FolderA") → true → INVALID DROP
//
//   If you're dragging FileC and hovering over FolderA:
//     hasAncestor(FolderA, "FileC") → false → VALID DROP
//
// =============================================================================

export function hasAncestor(
  node: InternalTreeNode | null,
  ancestorId: string
): boolean {
  // Walk up the parent chain
  let current = node;

  while (current !== null) {
    // Check if current node IS the ancestor we're looking for
    if (current.item.id === ancestorId) {
      return true;
    }
    // Move up to parent
    current = current.parent;
  }

  // Reached root without finding ancestor
  return false;
}

// =============================================================================
// GET CHILD INDEX
// =============================================================================
//
// Finds the position of a node within its parent's children array.
//
// Why is this needed?
//   - COMPUTE DROP childIndex: "insert at position X in parent's children"
//
// Example:
//   Parent has children: [FileA, FileB, FileC]
//   getChildIndex(FileB) → 1
//
// If the node has no parent (it's the root), returns 0.
//
// =============================================================================

export function getChildIndex(node: InternalTreeNode): number {
  // Root node has no parent
  if (!node.parent) {
    return 0;
  }

  // Find this node's position in parent's children array
  const siblings = node.parent.children ?? [];
  const index = siblings.findIndex((child) => child.item.id === node.item.id);

  // Return found index, or 0 if not found (shouldn't happen in valid tree)
  return index === -1 ? 0 : index;
}

// =============================================================================
// FIND NODE BY ID
// =============================================================================
//
// Searches the tree for a node with a specific ID.
// Returns the InternalTreeNode if found, null otherwise.
//
// This is a recursive depth-first search.
//
// =============================================================================

export function findNodeById(
  root: InternalTreeNode,
  id: string
): InternalTreeNode | null {
  // Check if this is the node we're looking for
  if (root.item.id === id) {
    return root;
  }

  // Recursively search children
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, id);
      if (found) {
        return found;
      }
    }
  }

  // Not found in this subtree
  return null;
}

// =============================================================================
// GET SELECTED ITEMS
// =============================================================================
//
// Resolves an array of selected IDs to their actual TTreeNode objects.
//
// Why?
//   - Store holds string IDs (lightweight)
//   - But callbacks need actual node objects
//
// We use the flat selectableItems array for lookup because:
//   1. It only contains VISIBLE items (important for drag)
//   2. O(n*m) but n and m are typically small
//
// =============================================================================

export function getSelectedItems(
  selectableItems: SelectableTreeNode[],
  selectedIds: string[]
): TTreeNode[] {
  return selectedIds
    .map((id) => {
      const found = selectableItems.find((s) => s.node.item.id === id);
      return found?.node.item ?? null;
    })
    .filter((item): item is TTreeNode => item !== null);
}

// =============================================================================
// REMOVE NODE FROM TREE (MUTATING)
// =============================================================================
//
// Removes a node with the given ID from anywhere in the tree.
// This MUTATES the tree structure (removes from parent's children array).
//
// Used in the drag-end handler when moving items:
//   1. Remove items from their current locations
//   2. Insert them at the new location
//
// Returns true if node was found and removed, false otherwise.
//
// =============================================================================

export function removeNodeFromTree(root: TTree | TTreeNode, id: string): boolean {
  // Can't remove the root itself
  if (root.id === id) {
    return false;
  }

  // Check if any direct children match
  if (root.children) {
    const index = root.children.findIndex((child) => child.id === id);

    if (index !== -1) {
      // Found it! Remove from array
      root.children.splice(index, 1);
      return true;
    }

    // Not a direct child, recursively check grandchildren
    for (const child of root.children) {
      if (removeNodeFromTree(child, id)) {
        return true;
      }
    }
  }

  return false;
}

// =============================================================================
// FIND PARENT OF NODE
// =============================================================================
//
// Finds the parent node of a given node ID in the external tree structure.
// (This is for TTree/TTreeNode, not InternalTreeNode which already has parent)
//
// Returns { parent, childIndex } or null if not found.
//
// =============================================================================

export function findParentOf(
  root: TTree | TTreeNode,
  id: string
): { parent: TTree | TTreeNode; childIndex: number } | null {
  if (root.children) {
    const index = root.children.findIndex((child) => child.id === id);

    if (index !== -1) {
      return { parent: root, childIndex: index };
    }

    // Recursively search
    for (const child of root.children) {
      const found = findParentOf(child, id);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

import { useMemo } from "react";
import type { InternalTreeNode, SelectableTreeNode } from "./types";

// =============================================================================
// USE SELECTABLE ITEMS HOOK
// =============================================================================
//
// This hook is the KEY ABSTRACTION that makes everything else possible.
//
// PROBLEM:
//   The tree is a recursive structure, but many operations need LINEAR access:
//     - Keyboard nav: "what's the item after this one?"
//     - Range select: "select everything between A and B"
//     - Drop marker: "show indicator at position 5"
//
// SOLUTION:
//   Walk the tree once and produce a FLAT ARRAY of visible items.
//   Each item knows its position (index) in the flattened list.
//
// EXAMPLE:
//
//   Tree structure:           Collapsed state:        Flat result:
//   FolderA                   { "FolderB": true }     [
//     FileA1                                            { node: FolderA,  index: 0 },
//     FileA2                                            { node: FileA1,   index: 1 },
//   FolderB (collapsed)                                 { node: FileA2,   index: 2 },
//     FileB1 (hidden!)                                  { node: FolderB,  index: 3 },
//     FileB2 (hidden!)                                  // B's children SKIPPED!
//   FileC                                               { node: FileC,    index: 4 },
//                                                     ]
//
// Note: FolderB ITSELF is in the list (you can click/select it),
//       but its CHILDREN are skipped because it's collapsed.
//
// HOW IT'S USED:
//
//   1. KEYBOARD NAVIGATION
//      Arrow-down from FolderA (index 0) → move to FileA1 (index 1)
//      Arrow-up from FileC (index 4) → move to FolderB (index 3)
//
//   2. RANGE SELECTION
//      Click FileA1 (index 1), then Shift+click FolderB (index 3)
//      → Select indices 1, 2, 3 → [FileA1, FileA2, FolderB]
//
//   3. DROP POSITIONING
//      Hovering between FileA2 and FolderB
//      → hoveredParent.index = 3 (marker appears at index 3)
//
// PERFORMANCE:
//   - Recomputes only when `root` or `collapsed` changes
//   - O(n) walk through the tree, where n = total nodes
//   - Typically runs ~0-2ms for trees with hundreds of items
//
// =============================================================================

export function useSelectableItems(
  root: InternalTreeNode,
  collapsed: Record<string, boolean>
): SelectableTreeNode[] {
  return useMemo(() => {
    const items: SelectableTreeNode[] = [];
    let index = 0;

    // ---------------------------------------------------------------------------
    // RECURSIVE WALK FUNCTION
    // ---------------------------------------------------------------------------
    //
    // Walk the tree in depth-first order (parent, then children).
    // For each node:
    //   1. Add it to the flat array (with current index)
    //   2. If it has children AND is not collapsed, recurse into children
    //
    // ---------------------------------------------------------------------------

    function walk(node: InternalTreeNode) {
      // Skip the root node itself (depth 0) - we only want its children
      // The root is an invisible container, not a real tree item
      if (node.depth > 0) {
        items.push({ node, index: index++ });
      }

      // Process children if:
      //   1. Node has children
      //   2. Node is NOT collapsed (or is root which is always "expanded")
      const isCollapsed = collapsed[node.item.id] ?? false;
      const shouldShowChildren = node.children && (node.depth === 0 || !isCollapsed);

      if (shouldShowChildren) {
        for (const child of node.children!) {
          walk(child);
        }
      }
    }

    // Start walking from root
    walk(root);

    return items;
  }, [root, collapsed]);
  // Dependencies:
  //   - root: tree structure changed (items added/removed/moved)
  //   - collapsed: collapse state changed (items shown/hidden)
}

// =============================================================================
// WHY IS THIS A HOOK?
// =============================================================================
//
// Q: Why not just a plain function?
// A: useMemo caches the result until dependencies change.
//
// Without memoization:
//   - Every render would re-walk the entire tree
//   - Expensive for large trees
//   - Would cause unnecessary re-renders downstream
//
// With useMemo:
//   - Walk only when tree or collapse state actually changes
//   - Returns same array reference otherwise
//   - Components depending on this can use reference equality checks
//
// =============================================================================

// =============================================================================
// ALTERNATIVE: WHY NOT STORE THIS IN ZUSTAND?
// =============================================================================
//
// Q: Why compute this in a hook instead of storing in the global store?
// A: The flat array is DERIVED STATE.
//
// Derived state = computed from other state (tree + collapsed)
// Storing it would mean:
//   1. Keeping it in sync manually (error-prone)
//   2. More state to manage
//   3. Risk of inconsistency
//
// React's useMemo handles derived state perfectly:
//   - Automatic recomputation when dependencies change
//   - Caching when nothing changed
//   - No risk of stale data
//
// =============================================================================

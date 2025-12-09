import { useState } from "react";
import { data } from "../data";
import { Tree } from "./tree/Tree";
import type { TTree, TTreeNode } from "../types";
import type { DragEndPayload } from "./tree/types";

// =============================================================================
// IMPL APP
// =============================================================================
//
// This is the new implementation's entry point.
// It demonstrates how to use the Tree component with proper data mutation.
//
// KEY DIFFERENCES FROM YOUR CURRENT App.tsx:
//
//   BEFORE:
//     - Just renders Tree, no onDragEnd handler
//     - Dragging has no effect on data
//
//   AFTER:
//     - Handles onDragEnd callback
//     - Actually updates tree data when items are moved
//
// TO TEST:
//   1. In main.tsx, import and render ImplApp instead of App
//   2. Drag items around - they should actually move!
//
// =============================================================================

export function ImplApp() {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  //
  // We hold the tree data in state so React re-renders when it changes.
  // The Tree component receives this and renders it.
  // When the user drags items, we update this state.
  //
  // ---------------------------------------------------------------------------

  const [tree, setTree] = useState<TTree>(data as TTree);

  // ---------------------------------------------------------------------------
  // DRAG END HANDLER
  // ---------------------------------------------------------------------------
  //
  // This is where the magic happens! When a drag completes, the Tree component
  // gives us a structured payload telling us exactly what to do:
  //
  //   {
  //     items: [{ id: "file-1", ... }],     // What's being moved
  //     parent: { id: "folder-2", ... },    // Where it's going
  //     children: [{ id: "other", ... }],   // Parent's current children
  //     insertAt: 1                          // Position to insert
  //   }
  //
  // We then:
  //   1. Clone the tree (to avoid mutating state directly)
  //   2. Remove the items from their current locations
  //   3. Insert them at the new location
  //
  // ---------------------------------------------------------------------------

  const handleDragEnd = (payload: DragEndPayload) => {
    const { items, parent, insertAt } = payload;

    console.log("Drag ended:", {
      moving: items.map((i) => i.name),
      into: parent.name,
      atPosition: insertAt,
    });

    setTree((prevTree) => {
      // -----------------------------------------------------------------------
      // STEP 1: Deep clone the tree
      // -----------------------------------------------------------------------
      //
      // React state should be immutable. We can't just modify the existing tree.
      // structuredClone creates a deep copy that's safe to mutate.
      //
      // -----------------------------------------------------------------------

      const newTree = structuredClone(prevTree);

      // -----------------------------------------------------------------------
      // STEP 2: Remove items from their current locations
      // -----------------------------------------------------------------------
      //
      // Before we can add items to the new location, we need to remove them
      // from wherever they currently are. This handles:
      //   - Moving within the same folder (reordering)
      //   - Moving between folders
      //
      // -----------------------------------------------------------------------

      for (const item of items) {
        removeNodeFromTree(newTree, item.id);
      }

      // -----------------------------------------------------------------------
      // STEP 3: Find the target parent in the new tree
      // -----------------------------------------------------------------------

      const targetParent = findNodeByIdMutable(newTree, parent.id);

      if (!targetParent) {
        console.error("Target parent not found:", parent.id);
        return prevTree; // Abort - return unchanged tree
      }

      // -----------------------------------------------------------------------
      // STEP 4: Insert items at the new location
      // -----------------------------------------------------------------------
      //
      // Ensure the parent has a children array, then splice in the items.
      //
      // -----------------------------------------------------------------------

      if (!targetParent.children) {
        targetParent.children = [];
      }

      // Insert at the computed position
      targetParent.children.splice(insertAt, 0, ...items);

      return newTree;
    });
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <main className="grid grid-cols-6 h-screen">
      {/* Tree takes 2 columns */}
      <div className="col-span-2">
        <Tree data={tree} onDragEnd={handleDragEnd} />
      </div>

      {/* Placeholder for other content */}
      <section className="col-span-4 bg-slate-800 p-4">
        <h1 className="text-slate-200 text-xl mb-4">New Implementation</h1>
        <p className="text-slate-400 mb-2">
          This is the new tree implementation with:
        </p>
        <ul className="text-slate-400 list-disc list-inside space-y-1">
          <li>Zustand store for shared state</li>
          <li>Multi-selection (Cmd/Ctrl+click, Shift+click)</li>
          <li>Structural drop targets</li>
          <li>Actual data mutation on drop</li>
          <li>Auto-expand folders on hover</li>
        </ul>

        <div className="mt-6">
          <h2 className="text-slate-300 font-medium mb-2">Current Tree State:</h2>
          <pre className="text-xs text-slate-500 bg-slate-900 p-3 rounded overflow-auto max-h-96">
            {JSON.stringify(tree, null, 2)}
          </pre>
        </div>
      </section>
    </main>
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
//
// These functions help us manipulate the tree data.
// They MUTATE the tree, so only use them on cloned data!
//
// =============================================================================

/**
 * Recursively remove a node with the given ID from the tree.
 * MUTATES the tree structure.
 */
function removeNodeFromTree(root: TTree | TTreeNode, id: string): boolean {
  if (!root.children) return false;

  // Check direct children
  const index = root.children.findIndex((child) => child.id === id);
  if (index !== -1) {
    root.children.splice(index, 1);
    return true;
  }

  // Recursively check grandchildren
  for (const child of root.children) {
    if (removeNodeFromTree(child, id)) {
      return true;
    }
  }

  return false;
}

/**
 * Find a node by ID in the tree.
 * Returns a reference that can be mutated.
 */
function findNodeByIdMutable(
  root: TTree | TTreeNode,
  id: string
): TTreeNode | null {
  if (root.id === id) {
    return root as TTreeNode;
  }

  if (root.children) {
    for (const child of root.children) {
      const found = findNodeByIdMutable(child, id);
      if (found) return found;
    }
  }

  return null;
}

export default ImplApp;

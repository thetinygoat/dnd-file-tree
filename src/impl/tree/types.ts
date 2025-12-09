import type { TTreeNode } from "../../types";

// =============================================================================
// INTERNAL TREE NODE
// =============================================================================
//
// Your original TTreeNode is "flat" - each node only knows about its children,
// not its parent or how deep it is in the tree:
//
//   { id: "1", name: "folder", children: [...] }
//
// This is fine for simple rendering, but breaks down when you need to:
//   1. Check if an ancestor is collapsed (to determine visibility)
//   2. Prevent dropping a folder into itself (need to walk UP)
//   3. Compute proper indentation for drop markers
//
// InternalTreeNode adds the missing context:
//   - `parent`: backlink to walk UP the tree
//   - `depth`: nesting level (0 = root, 1 = first level, etc.)
//
// We build this structure once from your TTree data, then use it everywhere.
// =============================================================================

export interface InternalTreeNode {
  /** The original domain object (your TTreeNode) */
  item: TTreeNode;

  /** Child nodes (same structure, recursive) */
  children?: InternalTreeNode[];

  /**
   * Backlink to parent node.
   * - null for root node
   * - Allows walking UP the tree to check ancestors
   * - Essential for: visibility checks, drop validation, finding siblings
   */
  parent: InternalTreeNode | null;

  /**
   * How deep is this node in the tree?
   * - 0 = root (the invisible container)
   * - 1 = top-level items
   * - 2 = children of top-level folders
   * - etc.
   *
   * Used for:
   * - Indenting tree items (depth * paddingPerLevel)
   * - Indenting drop markers to correct level
   */
  depth: number;
}

// =============================================================================
// SELECTABLE TREE NODE (FLATTENED VIEW)
// =============================================================================
//
// The recursive tree structure is great for rendering, but terrible for:
//   - Keyboard navigation (what's the "next" item after this one?)
//   - Range selection (what items are "between" A and B?)
//   - Drop positioning (what does "position 7" mean?)
//
// Solution: Flatten the tree into a linear array of visible items:
//
//   [
//     { node: FolderA,  index: 0 },
//     { node: FileA1,   index: 1 },
//     { node: FileA2,   index: 2 },
//     { node: FolderB,  index: 3 },  // collapsed, so children hidden
//     { node: FileC,    index: 4 },
//   ]
//
// Now:
//   - Arrow-down from index 2 → go to index 3
//   - Shift+click from 1 to 4 → select [1, 2, 3, 4]
//   - Drop at index 3 → insert between FileA2 and FolderB
//
// This array is recomputed whenever the tree or collapse state changes.
// =============================================================================

export interface SelectableTreeNode {
  /** The internal node (with parent/depth info) */
  node: InternalTreeNode;

  /**
   * Position in the flattened visible list.
   * Changes when items are collapsed/expanded.
   * Used for: navigation, range selection, drop marker positioning.
   */
  index: number;
}

// =============================================================================
// HOVERED PARENT (DROP TARGET)
// =============================================================================
//
// Your current implementation stores drop position as viewport coordinates:
//   { y: 150, depth: 2 }
//
// Problems:
//   1. Scroll the container → line stays at same viewport Y (wrong!)
//   2. Can't answer: "which folder will this drop INTO?"
//   3. Can't answer: "at which position in that folder's children?"
//
// Solution: Store STRUCTURAL information instead:
//   - parentId: "folder-1" → drop INTO this folder
//   - childIndex: 2 → at position 2 in folder-1's children array
//   - index: 5 → render drop marker at position 5 in flat list
//   - parentDepth: 1 → indent drop marker by 1 level
//
// Now the drop marker:
//   - Scrolls with the content (it's in document flow)
//   - Knows exactly where to insert
//   - Indents correctly based on target parent
// =============================================================================

export interface HoveredParent {
  /**
   * ID of the folder we'd drop INTO.
   * null means no valid drop target.
   */
  parentId: string | null;

  /**
   * Depth of the target parent.
   * Used to indent the drop marker correctly.
   * e.g., dropping into a depth-2 folder → marker indented 2 levels
   */
  parentDepth: number | null;

  /**
   * Position in the FLAT visible list where drop marker appears.
   * This is different from childIndex!
   *
   * Example: If flat list is [A, B, C, D, E] and we're dropping
   * between C and D, index = 3 (marker appears before D).
   */
  index: number | null;

  /**
   * Position within parent.children where items will be inserted.
   *
   * Example: If parent folder has children [X, Y, Z] and we're
   * dropping between X and Y, childIndex = 1.
   *
   * This is what we use in the actual splice operation.
   */
  childIndex: number | null;

  /**
   * Drop intent for folders - distinguishes between dropping:
   *   - "above": before the folder (as sibling)
   *   - "inside": into the folder (as child)
   *   - "below": after the folder (as sibling)
   *   - null: not hovering over a folder, or no valid target
   *
   * This is used to:
   *   1. Show the correct visual indicator (line vs ring)
   *   2. Prevent showing BOTH line AND ring simultaneously
   *
   * For folders, we divide the hover area into 3 zones:
   *   - Top 25%: "above" → show drop line above folder
   *   - Middle 50%: "inside" → show ring around folder
   *   - Bottom 25%: "below" → show drop line below folder
   */
  dropIntent: "above" | "below" | "inside" | null;
}

// =============================================================================
// DRAG END PAYLOAD
// =============================================================================
//
// When a drag ends, we don't mutate the tree directly. Instead, we emit
// a structured payload that tells the parent component exactly what happened.
//
// Why?
//   1. Tree component doesn't own the data (App.tsx does)
//   2. Parent might want to: make API call, show confirmation, animate, etc.
//   3. Keeps the Tree component pure and predictable
//
// The payload contains everything needed to perform the move:
//   - items: what's being moved
//   - parent: where it's going
//   - children: current children of target (so you can splice)
//   - insertAt: position to insert
// =============================================================================

export interface DragEndPayload {
  /** The items being moved (in drag order) */
  items: TTreeNode[];

  /** The target parent folder */
  parent: TTreeNode;

  /**
   * Current children of target parent, EXCLUDING the dragged items.
   * (We pre-remove them so you don't have to handle duplicates)
   */
  children: TTreeNode[];

  /**
   * Index to insert at within parent.children.
   * Already adjusted for any removed items.
   *
   * Usage: parent.children.splice(insertAt, 0, ...items)
   */
  insertAt: number;
}

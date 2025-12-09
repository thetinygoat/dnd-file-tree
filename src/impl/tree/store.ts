import { create } from "zustand";
import type { HoveredParent } from "./types";

// =============================================================================
// WHY A GLOBAL STORE?
// =============================================================================
//
// Your current implementation has STATE SCATTERED across components:
//
//   TreeNode A → useState(collapsed: false)
//   TreeNode B → useState(collapsed: true)
//   Tree.tsx   → useState(dropIntent), useState(dropLine)
//
// Problems:
//   1. TreeNode A can't know if TreeNode B is collapsed
//   2. Can't compute "which items are visible?" without traversing everything
//   3. Selection across nodes is impossible (each node is isolated)
//
// Solution: ONE store that holds ALL tree state:
//   - collapsed: which folders are collapsed
//   - selectedIds: which items are selected
//   - draggingIds: which items are being dragged
//   - hoveredParent: where would a drop land
//
// Now ANY component can:
//   - Read: "is folder X collapsed?" → store.collapsed["X"]
//   - Write: "collapse folder X" → store.toggleCollapsed("X")
//   - React to changes: component re-renders when relevant state changes
//
// =============================================================================

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface TreeStore {
  // ---------------------------------------------------------------------------
  // SELECTION STATE
  // ---------------------------------------------------------------------------
  //
  // Tracks which items are currently selected. Can be multiple items
  // (multi-select with Cmd/Ctrl+click or Shift+click).
  //
  // selectedIds: ["item-1", "item-3", "item-5"]  → 3 items selected
  // anchorId: "item-1"                           → shift-click anchor point
  //
  // The anchor is important for RANGE selection:
  //   1. Click "item-1" → anchorId = "item-1", selectedIds = ["item-1"]
  //   2. Shift+click "item-5" → select everything from anchor to click
  //      → selectedIds = ["item-1", "item-2", "item-3", "item-4", "item-5"]
  //
  // ---------------------------------------------------------------------------

  /** Array of currently selected item IDs */
  selectedIds: string[];

  /**
   * The "anchor" for shift-click range selection.
   * When you shift+click, we select from anchorId to the clicked item.
   * Set when you single-click (without shift).
   */
  anchorId: string | null;

  // ---------------------------------------------------------------------------
  // COLLAPSE STATE
  // ---------------------------------------------------------------------------
  //
  // Tracks which FOLDERS are collapsed (children hidden).
  //
  // collapsed: { "folder-1": true, "folder-3": true }
  //   → folder-1 and folder-3 are collapsed
  //   → all other folders are expanded (default)
  //
  // We use a Record<string, boolean> instead of a Set because:
  //   1. Easier to persist to localStorage if needed
  //   2. Works better with Zustand's equality checks
  //
  // ---------------------------------------------------------------------------

  /**
   * Map of folder ID → collapsed state.
   * true = collapsed (children hidden)
   * false or missing = expanded (children visible)
   */
  collapsed: Record<string, boolean>;

  // ---------------------------------------------------------------------------
  // DRAG STATE
  // ---------------------------------------------------------------------------
  //
  // Tracks the current drag operation:
  //   - draggingIds: which items are being dragged (can be multiple!)
  //   - hoveredParent: where would a drop land
  //
  // Multi-drag works like this:
  //   1. Select items 2, 4, 6 (with Cmd+click)
  //   2. Start dragging item 4 → draggingIds = ["2", "4", "6"]
  //   3. All three items move together
  //
  // If you drag an unselected item:
  //   1. Items 2, 4 selected
  //   2. Start dragging item 7 → selection changes to just 7
  //   3. draggingIds = ["7"]
  //
  // ---------------------------------------------------------------------------

  /** IDs of items currently being dragged */
  draggingIds: string[];

  /**
   * Current drop target information.
   * Updated during drag as mouse moves.
   * See types.ts for detailed explanation of each field.
   */
  hoveredParent: HoveredParent;

  // ---------------------------------------------------------------------------
  // ACTIONS
  // ---------------------------------------------------------------------------
  //
  // Functions to update the store state.
  // Components call these instead of directly mutating state.
  //
  // ---------------------------------------------------------------------------

  /** Replace the entire selection with new IDs */
  setSelectedIds: (ids: string[]) => void;

  /** Set the anchor point for shift-click selection */
  setAnchorId: (id: string | null) => void;

  /** Toggle a folder's collapsed state */
  toggleCollapsed: (id: string) => void;

  /** Explicitly set a folder's collapsed state */
  setCollapsed: (id: string, collapsed: boolean) => void;

  /** Set which items are being dragged */
  setDraggingIds: (ids: string[]) => void;

  /** Update the current drop target */
  setHoveredParent: (hp: HoveredParent) => void;

  /** Clear all drag-related state (called on drop or cancel) */
  clearDragState: () => void;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialHoveredParent: HoveredParent = {
  parentId: null,
  parentDepth: null,
  index: null,
  childIndex: null,
  dropIntent: null,
};

// =============================================================================
// CREATE THE STORE
// =============================================================================
//
// Zustand's `create` function returns a hook that components use to access
// the store. Components automatically re-render when the state they're
// subscribed to changes.
//
// Example usage in a component:
//
//   function TreeNode({ id }) {
//     // Only re-renders when THIS item's selection changes
//     const isSelected = useTreeStore(state => state.selectedIds.includes(id));
//
//     // Only re-renders when THIS folder's collapse state changes
//     const isCollapsed = useTreeStore(state => state.collapsed[id] ?? false);
//
//     // Get action to toggle collapse
//     const toggleCollapsed = useTreeStore(state => state.toggleCollapsed);
//
//     return (
//       <div onClick={() => toggleCollapsed(id)}>
//         {isSelected ? "SELECTED" : "not selected"}
//       </div>
//     );
//   }
//
// =============================================================================

export const useTreeStore = create<TreeStore>((set) => ({
  // Initial state
  selectedIds: [],
  anchorId: null,
  collapsed: {},
  draggingIds: [],
  hoveredParent: initialHoveredParent,

  // Actions
  setSelectedIds: (ids) => set({ selectedIds: ids }),

  setAnchorId: (id) => set({ anchorId: id }),

  toggleCollapsed: (id) =>
    set((state) => ({
      collapsed: {
        ...state.collapsed,
        // Toggle: if it was true, make it false (or remove); if false/missing, make it true
        [id]: !state.collapsed[id],
      },
    })),

  setCollapsed: (id, collapsed) =>
    set((state) => ({
      collapsed: {
        ...state.collapsed,
        [id]: collapsed,
      },
    })),

  setDraggingIds: (ids) => set({ draggingIds: ids }),

  setHoveredParent: (hp) => set({ hoveredParent: hp }),

  clearDragState: () =>
    set({
      draggingIds: [],
      hoveredParent: initialHoveredParent,
    }),
}));

// =============================================================================
// STORE ACCESS OUTSIDE REACT
// =============================================================================
//
// Sometimes you need to read/write store state outside of React components
// (e.g., in event handlers, drag callbacks, etc.).
//
// Zustand provides getState() and setState() for this:
//
//   // Read current state
//   const currentSelection = useTreeStore.getState().selectedIds;
//
//   // Write new state
//   useTreeStore.getState().setSelectedIds(["item-1"]);
//
// This is useful in drag handlers where we need the latest state
// without causing re-renders.
//
// =============================================================================

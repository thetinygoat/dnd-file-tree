import { memo, useEffect, useRef } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { File, Folder, FolderOpen, ChevronRight } from "lucide-react";
import type { InternalTreeNode, SelectableTreeNode } from "./types";
import { useTreeStore } from "./store";

// =============================================================================
// TREE NODE COMPONENT
// =============================================================================
//
// This component renders a single item in the tree (file or folder).
//
// KEY DIFFERENCES FROM YOUR CURRENT IMPLEMENTATION:
//
//   BEFORE (your current TreeNode.tsx):
//     - Each node has its own useState(collapsed)
//     - No selection awareness
//     - No connection to sibling/parent state
//
//   AFTER (this implementation):
//     - Reads collapsed state from global store
//     - Reads selection state from global store
//     - Can participate in multi-selection
//     - Auto-expands folders during drag hover
//
// =============================================================================

/** Pixels per depth level for indentation */
const DEPTH_PADDING = 20;

/** Delay before auto-expanding a collapsed folder during drag */
const AUTO_EXPAND_DELAY = 800; // ms

interface TreeNodeProps {
  /** The internal node to render (with parent/depth info) */
  node: InternalTreeNode;

  /**
   * The flat array of all visible items.
   * Needed for range selection (shift+click).
   */
  selectableItems: SelectableTreeNode[];
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export const TreeNode = memo(function TreeNode({
  node,
  selectableItems,
}: TreeNodeProps) {
  const { item } = node;
  const isDirectory = item.type === "directory";

  // ===========================================================================
  // STORE SUBSCRIPTIONS
  // ===========================================================================
  //
  // We subscribe to specific slices of the store to minimize re-renders.
  // Each selector only causes re-render when ITS value changes.
  //
  // ===========================================================================

  // Is THIS node collapsed? (only relevant for directories)
  const isCollapsed = useTreeStore(
    (state) => state.collapsed[item.id] ?? false
  );

  // Is THIS node selected?
  const isSelected = useTreeStore((state) =>
    state.selectedIds.includes(item.id)
  );

  // Is THIS node being dragged?
  const isDragging = useTreeStore((state) =>
    state.draggingIds.includes(item.id)
  );

  // Is THIS node the current drop target?
  // (Used for auto-expand and visual feedback)
  const isDropTarget = useTreeStore(
    (state) => state.hoveredParent.parentId === item.id
  );

  // Is the drop intent "inside"? Only show ring when dropping INTO this folder
  // This prevents showing the ring when hovering above/below zones
  const isDropInside = useTreeStore(
    (state) =>
      state.hoveredParent.parentId === item.id &&
      state.hoveredParent.dropIntent === "inside"
  );

  // Get the anchor ID for range selection
  const anchorId = useTreeStore((state) => state.anchorId);

  // Get store actions
  const setSelectedIds = useTreeStore((state) => state.setSelectedIds);
  const setAnchorId = useTreeStore((state) => state.setAnchorId);
  const toggleCollapsed = useTreeStore((state) => state.toggleCollapsed);
  const setCollapsed = useTreeStore((state) => state.setCollapsed);

  // ===========================================================================
  // DND-KIT HOOKS
  // ===========================================================================
  //
  // useDraggable: Makes this node draggable
  // useDroppable: Makes this node a drop target
  //
  // We use the same ID for both, which is the item's unique ID.
  //
  // ===========================================================================

  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging: isDndKitDragging,
  } = useDraggable({
    id: item.id,
    data: {
      type: item.type,
      depth: node.depth,
    },
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: item.id,
    data: {
      type: item.type,
      depth: node.depth,
      collapsed: isCollapsed,
      hasChildren: node.children && node.children.length > 0,
    },
  });

  // Combine refs for element that is both draggable and droppable
  const nodeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nodeRef.current) {
      setDraggableRef(nodeRef.current);
      setDroppableRef(nodeRef.current);
    }
  }, [setDraggableRef, setDroppableRef]);

  // ===========================================================================
  // AUTO-EXPAND ON HOVER
  // ===========================================================================
  //
  // When dragging over a collapsed folder, automatically expand it after
  // a delay. This lets you navigate deep into the tree while dragging.
  //
  // Logic:
  //   1. Start timer when: folder is collapsed + being hovered as drop target
  //   2. After 800ms: expand the folder
  //   3. Clear timer if: hover ends, drop happens, or folder expands
  //
  // ===========================================================================

  const autoExpandTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only auto-expand collapsed directories with children
    const shouldAutoExpand =
      isDirectory &&
      isCollapsed &&
      isDropTarget &&
      node.children &&
      node.children.length > 0;

    if (shouldAutoExpand) {
      // Start countdown to expand
      autoExpandTimeoutRef.current = setTimeout(() => {
        setCollapsed(item.id, false);
      }, AUTO_EXPAND_DELAY);
    }

    // Cleanup: clear timeout when conditions change
    return () => {
      if (autoExpandTimeoutRef.current) {
        clearTimeout(autoExpandTimeoutRef.current);
        autoExpandTimeoutRef.current = null;
      }
    };
  }, [isDirectory, isCollapsed, isDropTarget, node.children, item.id, setCollapsed]);

  // ===========================================================================
  // CLICK HANDLER
  // ===========================================================================
  //
  // Handles all click types:
  //   - Plain click: select this item only
  //   - Shift+click: range selection from anchor to this item
  //   - Cmd/Ctrl+click: toggle this item in selection
  //
  // ===========================================================================

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // -------------------------------------------------------------------------
    // SHIFT+CLICK: Range Selection
    // -------------------------------------------------------------------------
    //
    // Select all items between the anchor and this item.
    //
    // Example:
    //   1. Click "FileA" → anchor = FileA, selection = [FileA]
    //   2. Shift+click "FileD" → selection = [FileA, FileB, FileC, FileD]
    //
    // We use the flat selectableItems array to find the range.
    //
    // -------------------------------------------------------------------------

    if (e.shiftKey && anchorId) {
      // Find indices in the flat array
      const anchorIndex = selectableItems.findIndex(
        (s) => s.node.item.id === anchorId
      );
      const clickIndex = selectableItems.findIndex(
        (s) => s.node.item.id === item.id
      );

      if (anchorIndex !== -1 && clickIndex !== -1) {
        // Determine range bounds (anchor might be before or after click)
        const start = Math.min(anchorIndex, clickIndex);
        const end = Math.max(anchorIndex, clickIndex);

        // Extract IDs from the range
        const rangeIds = selectableItems
          .slice(start, end + 1)
          .map((s) => s.node.item.id);

        setSelectedIds(rangeIds);
        // Don't change anchor - keep it for potential further shift-clicks
        return;
      }
    }

    // -------------------------------------------------------------------------
    // CMD/CTRL+CLICK: Toggle Selection
    // -------------------------------------------------------------------------
    //
    // Add or remove this item from selection without affecting others.
    //
    // Example:
    //   1. Selection = [FileA, FileB]
    //   2. Cmd+click FileC → selection = [FileA, FileB, FileC]
    //   3. Cmd+click FileA → selection = [FileB, FileC]
    //
    // -------------------------------------------------------------------------

    if (e.metaKey || e.ctrlKey) {
      const currentIds = useTreeStore.getState().selectedIds;

      if (currentIds.includes(item.id)) {
        // Already selected → remove it
        setSelectedIds(currentIds.filter((id) => id !== item.id));
      } else {
        // Not selected → add it
        setSelectedIds([...currentIds, item.id]);
      }
      // Don't change anchor
      return;
    }

    // -------------------------------------------------------------------------
    // PLAIN CLICK: Single Selection
    // -------------------------------------------------------------------------
    //
    // Select only this item, clear everything else.
    // Also sets this as the new anchor for future shift-clicks.
    //
    // -------------------------------------------------------------------------

    setSelectedIds([item.id]);
    setAnchorId(item.id);
  };

  // ===========================================================================
  // CHEVRON CLICK (COLLAPSE TOGGLE)
  // ===========================================================================
  //
  // Clicking the chevron toggles the folder's collapsed state.
  // This is separate from item selection.
  //
  // ===========================================================================

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      toggleCollapsed(item.id);
    }
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  // Compute indentation based on depth
  const indent = node.depth * DEPTH_PADDING;

  // Determine which icon to show
  const Icon = isDirectory ? (isCollapsed ? Folder : FolderOpen) : File;

  return (
    <div
      ref={nodeRef}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`
        tree-item flex items-center gap-1 py-1 px-2 cursor-pointer select-none
        rounded-sm transition-colors
        ${isSelected ? "bg-blue-500/20" : "hover:bg-slate-700/50"}
        ${isDragging ? "opacity-50" : ""}
        ${isDropInside && isDirectory ? "ring-2 ring-blue-500 ring-inset" : ""}
      `}
      style={{ paddingLeft: indent }}
    >
      {/* Collapse/expand chevron for directories */}
      {isDirectory ? (
        <button
          onClick={handleChevronClick}
          className="p-0.5 hover:bg-slate-600 rounded transition-transform"
          style={{
            transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
          }}
        >
          <ChevronRight size={14} className="text-slate-400" />
        </button>
      ) : (
        // Spacer for files to align with folders
        <span className="w-5" />
      )}

      {/* File/folder icon */}
      <Icon
        size={16}
        className={isDirectory ? "text-amber-400" : "text-slate-400"}
      />

      {/* Item name */}
      <span className="text-slate-200 truncate">{item.name}</span>
    </div>
  );
});

// =============================================================================
// WHY MEMO?
// =============================================================================
//
// The tree can have hundreds of nodes. Without memo:
//   - ANY state change would re-render ALL nodes
//   - Selecting one item = 100+ re-renders
//
// With memo:
//   - Only re-render if props changed
//   - Store subscriptions only trigger on relevant changes
//   - Much better performance during selection/drag
//
// =============================================================================

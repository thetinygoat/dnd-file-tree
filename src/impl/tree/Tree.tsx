import { Fragment, useEffect, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { TTree } from "../../types";
import type { DragEndPayload, InternalTreeNode } from "./types";
import { useTreeStore } from "./store";
import { buildInternalTree, getChildIndex, hasAncestor, findNodeById } from "./utils";
import { useSelectableItems } from "./useSelectableItems";
import { TreeNode } from "./TreeNode";
import { TreeDropMarker } from "./TreeDropMarker";
import { GhostNode } from "./GhostNode";
import { CatchZone } from "./CatchZone";

// =============================================================================
// TREE COMPONENT
// =============================================================================
//
// This is the main tree component that orchestrates everything:
//   - Converts external data to internal structure
//   - Flattens tree for selection/navigation
//   - Handles all drag-and-drop logic
//   - Renders items with drop markers
//
// KEY DIFFERENCES FROM YOUR CURRENT IMPLEMENTATION:
//
//   BEFORE:
//     - State scattered across components
//     - Viewport-based drop line
//     - No actual data mutation on drop
//
//   AFTER:
//     - Centralized store for all state
//     - Structural drop targets
//     - Emits onDragEnd with structured payload
//
// =============================================================================

interface TreeProps {
  /** The tree data to render */
  data: TTree;

  /**
   * Callback when a drag operation completes.
   * Receives structured payload with:
   *   - items: what's being moved
   *   - parent: target folder
   *   - children: target's current children
   *   - insertAt: index to insert at
   */
  onDragEnd?: (payload: DragEndPayload) => void;
}

export function Tree({ data, onDragEnd }: TreeProps) {
  // ===========================================================================
  // BUILD INTERNAL TREE
  // ===========================================================================
  //
  // Convert the external TTree to InternalTreeNode with parent/depth info.
  // This is memoized to avoid rebuilding on every render.
  //
  // Only rebuilds when `data` reference changes (new tree data).
  //
  // ===========================================================================

  const internalRoot = useMemo(() => buildInternalTree(data), [data]);

  // ===========================================================================
  // SUBSCRIBE TO STORE
  // ===========================================================================

  const collapsed = useTreeStore((state) => state.collapsed);
  const draggingIds = useTreeStore((state) => state.draggingIds);
  const setSelectedIds = useTreeStore((state) => state.setSelectedIds);
  const setAnchorId = useTreeStore((state) => state.setAnchorId);
  const setDraggingIds = useTreeStore((state) => state.setDraggingIds);
  const setHoveredParent = useTreeStore((state) => state.setHoveredParent);
  const clearDragState = useTreeStore((state) => state.clearDragState);

  // ===========================================================================
  // FLATTEN TREE
  // ===========================================================================
  //
  // Flatten the tree into a linear array of visible items.
  // This is the single source of truth for:
  //   - Item ordering
  //   - Range selection
  //   - Drop positioning
  //
  // ===========================================================================

  const selectableItems = useSelectableItems(internalRoot, collapsed);

  // ===========================================================================
  // INITIALIZE SELECTION
  // ===========================================================================
  //
  // On first render, select the first item if nothing is selected.
  // This ensures there's always a visual anchor point.
  //
  // ===========================================================================

  useEffect(() => {
    const currentSelection = useTreeStore.getState().selectedIds;
    if (currentSelection.length === 0 && selectableItems.length > 0) {
      const firstItem = selectableItems[0].node.item;
      setSelectedIds([firstItem.id]);
      setAnchorId(firstItem.id);
    }
  }, [selectableItems, setSelectedIds, setAnchorId]);

  // ===========================================================================
  // DND-KIT SENSORS
  // ===========================================================================
  //
  // Configure how drag operations are activated.
  // We use PointerSensor with a distance constraint to:
  //   - Prevent accidental drags (need to move 8px first)
  //   - Allow click events to work normally
  //
  // ===========================================================================

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Must move 8px before drag activates
      },
    })
  );

  // ===========================================================================
  // DRAG START HANDLER
  // ===========================================================================
  //
  // When a drag starts, determine what's being dragged:
  //
  //   CASE 1: Dragging a SELECTED item
  //     → Drag ALL selected items together (multi-drag)
  //
  //   CASE 2: Dragging an UNSELECTED item
  //     → Change selection to just that item, drag only it
  //
  // ===========================================================================

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id as string;
    const selectedIds = useTreeStore.getState().selectedIds;

    if (selectedIds.includes(activeId)) {
      // Case 1: Dragging a selected item → drag all selected
      setDraggingIds(selectedIds);
    } else {
      // Case 2: Dragging unselected → select it and drag just it
      setDraggingIds([activeId]);
      setSelectedIds([activeId]);
      setAnchorId(activeId);
    }
  };

  // ===========================================================================
  // DRAG MOVE HANDLER
  // ===========================================================================
  //
  // As the drag moves, compute the STRUCTURAL drop target.
  //
  // YOUR CURRENT APPROACH:
  //   - Compute ratio of pointer position in target rect
  //   - Store viewport Y coordinate for drop line
  //
  // NEW APPROACH:
  //   - Compute which PARENT folder we'd drop into
  //   - Compute which CHILD INDEX within that parent
  //   - Store structural info in hoveredParent
  //
  // This enables:
  //   - Correct drop marker indentation
  //   - Scroll-proof positioning
  //   - Actual data updates on drop
  //
  // ===========================================================================

  const handleDragMove = (event: DragMoveEvent) => {
    const { over, active } = event;

    // -------------------------------------------------------------------------
    // No valid drop target
    // -------------------------------------------------------------------------
    if (!over) {
      setHoveredParent({
        parentId: null,
        parentDepth: null,
        index: null,
        childIndex: null,
        dropIntent: null,
      });
      return;
    }

    // -------------------------------------------------------------------------
    // Handle catch zones (start/end of list)
    // -------------------------------------------------------------------------
    //
    // Catch zones are special droppable areas at the top and bottom of the list.
    // They make it easier to drop items at the very start or end.
    //
    // -------------------------------------------------------------------------

    const overId = over.id as string;

    if (overId === "__catch_zone_start__") {
      // Dropping at the very start of the list
      setHoveredParent({
        parentId: internalRoot.item.id,
        parentDepth: internalRoot.depth,
        index: 0,
        childIndex: 0,
        dropIntent: "above",
      });
      return;
    }

    if (overId === "__catch_zone_end__") {
      // Dropping at the very end of the list
      const lastIndex = selectableItems.length;
      const rootChildCount = internalRoot.children?.length ?? 0;
      setHoveredParent({
        parentId: internalRoot.item.id,
        parentDepth: internalRoot.depth,
        index: lastIndex,
        childIndex: rootChildCount,
        dropIntent: "below",
      });
      return;
    }

    // -------------------------------------------------------------------------
    // Find the node being hovered over
    // -------------------------------------------------------------------------
    const overItem = selectableItems.find(
      (s) => s.node.item.id === over.id
    );
    if (!overItem) return;

    // -------------------------------------------------------------------------
    // Compute position ratio within the hovered item
    // -------------------------------------------------------------------------
    //
    // For FILES: Simple 50/50 split (above/below)
    // For FOLDERS: 3-zone detection (25% above / 50% inside / 25% below)
    //
    // This fixes the issue where hovering over a folder shows BOTH the
    // drop line AND the "drop inside" ring simultaneously.
    //
    // -------------------------------------------------------------------------

    const overRect = over.rect;
    const activeRect = active.rect.current.translated;

    if (!activeRect) return;

    // Use the center of the dragged item to determine position
    const activeCenter = activeRect.top + activeRect.height / 2;
    const relativeY = activeCenter - overRect.top;
    const ratio = relativeY / overRect.height;

    const overNode = overItem.node;
    const isOverDirectory = overNode.item.type === "directory";
    const isOverCollapsed = collapsed[overNode.item.id] ?? false;
    const isOverExpanded = isOverDirectory && !isOverCollapsed;
    const hasChildren = overNode.children && overNode.children.length > 0;

    // -------------------------------------------------------------------------
    // Determine drop intent and target
    // -------------------------------------------------------------------------
    //
    // FOR FILES (simple 50/50 split):
    //   - Top 50%: "above" → insert before file
    //   - Bottom 50%: "below" → insert after file
    //
    // FOR FOLDERS (3-zone detection):
    //   - Top 25%: "above" → insert before folder (as sibling)
    //   - Middle 50%: "inside" → insert into folder (as child)
    //   - Bottom 25%: "below" → insert after folder (as sibling)
    //
    // EXCEPTION: Expanded folders with children
    //   - When hovering bottom zone of expanded folder, we DON'T show "below"
    //   - Instead, the first child handles that position
    //   - So expanded folders only have: top 25% = above, rest = inside
    //
    // -------------------------------------------------------------------------

    let targetParent: InternalTreeNode | null;
    let targetChildIndex: number;
    let dropIntent: "above" | "below" | "inside";
    let flatIndex: number;

    if (!isOverDirectory) {
      // -----------------------------------------------------------------------
      // FILE: Simple above/below
      // -----------------------------------------------------------------------
      if (ratio < 0.5) {
        dropIntent = "above";
        targetParent = overNode.parent;
        targetChildIndex = getChildIndex(overNode);
        flatIndex = overItem.index;
      } else {
        dropIntent = "below";
        targetParent = overNode.parent;
        targetChildIndex = getChildIndex(overNode) + 1;
        flatIndex = overItem.index + 1;
      }
    } else {
      // -----------------------------------------------------------------------
      // FOLDER: 3-zone detection
      // -----------------------------------------------------------------------
      if (ratio < 0.25) {
        // Top 25%: drop ABOVE folder (as sibling)
        dropIntent = "above";
        targetParent = overNode.parent;
        targetChildIndex = getChildIndex(overNode);
        flatIndex = overItem.index;
      } else if (ratio > 0.75 && !isOverExpanded) {
        // Bottom 25% of COLLAPSED folder: drop BELOW folder (as sibling)
        // Note: expanded folders don't have a "below" zone - their children handle that
        dropIntent = "below";
        targetParent = overNode.parent;
        targetChildIndex = getChildIndex(overNode) + 1;
        flatIndex = overItem.index + 1;
      } else {
        // Middle 50% (or bottom of expanded folder): drop INSIDE folder
        dropIntent = "inside";
        targetParent = overNode;
        // If expanded with children, insert at start; otherwise at position 0
        targetChildIndex = 0;
        // For inside drops, we don't show a line marker (flatIndex doesn't matter)
        // but we still need a valid value for the store
        flatIndex = isOverExpanded && hasChildren ? overItem.index + 1 : overItem.index;
      }
    }

    // -------------------------------------------------------------------------
    // Validate: prevent dropping into self or descendant
    // -------------------------------------------------------------------------
    //
    // You can't drop FolderA into FolderA or any of its children.
    // This would create a circular structure or just be nonsensical.
    //
    // -------------------------------------------------------------------------

    if (targetParent) {
      const currentDraggingIds = useTreeStore.getState().draggingIds;
      for (const dragId of currentDraggingIds) {
        if (hasAncestor(targetParent, dragId)) {
          // Invalid drop target - dragging into self/descendant
          // Keep previous hover state or clear it
          return;
        }
      }
    }

    // -------------------------------------------------------------------------
    // Update store with new drop target
    // -------------------------------------------------------------------------

    setHoveredParent({
      parentId: targetParent?.item.id ?? null,
      parentDepth: targetParent?.depth ?? null,
      index: flatIndex,
      childIndex: targetChildIndex,
      dropIntent,
    });
  };

  // ===========================================================================
  // DRAG END HANDLER
  // ===========================================================================
  //
  // When the drag ends, compute the final move and emit the onDragEnd callback.
  //
  // YOUR CURRENT APPROACH:
  //   - Just clears state, doesn't update data
  //
  // NEW APPROACH:
  //   - Resolve dragged items
  //   - Validate the drop
  //   - Compute new children array with correct insert position
  //   - Emit payload for parent to handle
  //
  // ===========================================================================

  const handleDragEnd = (event: DragEndEvent) => {
    // Get current drag state
    const { hoveredParent } = useTreeStore.getState();
    const currentDraggingIds = useTreeStore.getState().draggingIds;

    // Clear drag state first (before any early returns)
    clearDragState();

    // -------------------------------------------------------------------------
    // Validate we have a drop target
    // -------------------------------------------------------------------------

    if (!event.over || !hoveredParent.parentId || hoveredParent.childIndex === null) {
      return;
    }

    // -------------------------------------------------------------------------
    // Find the target parent node
    // -------------------------------------------------------------------------

    const targetParent = findNodeById(internalRoot, hoveredParent.parentId);
    if (!targetParent) return;

    // -------------------------------------------------------------------------
    // Resolve dragged items
    // -------------------------------------------------------------------------

    const draggedNodes = currentDraggingIds
      .map((id) => selectableItems.find((s) => s.node.item.id === id)?.node)
      .filter((node): node is InternalTreeNode => node !== undefined);

    if (draggedNodes.length === 0) return;

    // -------------------------------------------------------------------------
    // Filter out invalid drops
    // -------------------------------------------------------------------------

    const validNodes = draggedNodes.filter(
      (node) =>
        node.item.id !== targetParent.item.id &&
        !hasAncestor(targetParent, node.item.id)
    );

    if (validNodes.length === 0) return;

    // -------------------------------------------------------------------------
    // Compute final children array and insert position
    // -------------------------------------------------------------------------
    //
    // We need to:
    //   1. Start with target parent's current children
    //   2. Remove any dragged items that are already in this parent
    //   3. Adjust insertAt if removed items were before insert position
    //
    // -------------------------------------------------------------------------

    const currentChildren = [...(targetParent.children ?? [])];
    let insertAt = hoveredParent.childIndex;

    // Remove dragged items if they're already children of target
    for (const node of validNodes) {
      const existingIndex = currentChildren.findIndex(
        (child) => child.item.id === node.item.id
      );
      if (existingIndex !== -1) {
        currentChildren.splice(existingIndex, 1);
        // If removed item was before insert position, adjust
        if (existingIndex < insertAt) {
          insertAt--;
        }
      }
    }

    // -------------------------------------------------------------------------
    // Emit callback
    // -------------------------------------------------------------------------

    onDragEnd?.({
      items: validNodes.map((n) => n.item),
      parent: targetParent.item,
      children: currentChildren.map((c) => c.item),
      insertAt,
    });
  };

  // ===========================================================================
  // DRAG CANCEL HANDLER
  // ===========================================================================

  const handleDragCancel = () => {
    clearDragState();
  };

  // ===========================================================================
  // GET PRIMARY DRAG ITEM FOR OVERLAY
  // ===========================================================================

  const primaryDragItem = useMemo(() => {
    if (draggingIds.length === 0) return null;
    const found = selectableItems.find(
      (s) => s.node.item.id === draggingIds[0]
    );
    return found?.node.item ?? null;
  }, [draggingIds, selectableItems]);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-screen bg-slate-900 overflow-y-auto p-2">
        {/* Catch zone at start - makes it easier to drop at the very top */}
        <CatchZone id="__catch_zone_start__" position="start" />

        {/* Initial drop marker (before first item) */}
        <TreeDropMarker index={0} />

        {/* Render flattened items with drop markers between them */}
        {selectableItems.map((item, index) => (
          <Fragment key={item.node.item.id}>
            <TreeNode
              node={item.node}
              selectableItems={selectableItems}
            />
            {/* Drop marker after this item */}
            <TreeDropMarker index={index + 1} />
          </Fragment>
        ))}

        {/* Catch zone at end - makes it easier to drop at the very bottom */}
        <CatchZone id="__catch_zone_end__" position="end" />
      </div>

      {/* Drag overlay - follows cursor */}
      <DragOverlay dropAnimation={null}>
        {primaryDragItem && (
          <GhostNode node={primaryDragItem} count={draggingIds.length} />
        )}
      </DragOverlay>
    </DndContext>
  );
}

// =============================================================================
// ARCHITECTURE NOTES
// =============================================================================
//
// WHY USE A FLAT RENDERING APPROACH?
//
//   Your current approach renders recursively:
//     <TreeNode>
//       <TreeNode>
//         <TreeNode />
//       </TreeNode>
//     </TreeNode>
//
//   This new approach renders flat:
//     <TreeNode />  (depth 1)
//     <TreeNode />  (depth 2)
//     <TreeNode />  (depth 2)
//     <TreeNode />  (depth 1)
//
//   Benefits:
//     1. Drop markers can be inserted BETWEEN any items easily
//     2. Flat array makes range operations trivial
//     3. No need to recurse for visibility checks
//
//   The VISUAL nesting is achieved through CSS padding (node.depth * DEPTH_PADDING),
//   not through DOM nesting.
//
// =============================================================================

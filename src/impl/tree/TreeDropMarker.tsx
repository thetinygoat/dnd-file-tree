import { memo } from "react";
import { useTreeStore } from "./store";

// =============================================================================
// TREE DROP MARKER
// =============================================================================
//
// PROBLEM WITH YOUR CURRENT APPROACH:
//
//   Your current code renders a single absolutely-positioned line:
//
//     <div
//       className="absolute h-[2px] bg-amber-700"
//       style={{ top: dropLine.y }}  // ← viewport Y coordinate
//     />
//
//   Issues:
//     1. SCROLLING BREAKS IT: y is viewport-relative, so scrolling moves content
//        but the line stays fixed. Line ends up in wrong place.
//     2. NO STRUCTURAL INFO: Just a Y position, can't answer "drop into which folder?"
//     3. WRONG INDENTATION: depth is set but not tied to actual target parent.
//
// SOLUTION:
//
//   Render drop markers BETWEEN items in the document flow:
//
//     <TreeDropMarker index={0} />  ← before first item
//     <TreeNode />
//     <TreeDropMarker index={1} />  ← between 1st and 2nd item
//     <TreeNode />
//     <TreeDropMarker index={2} />  ← between 2nd and 3rd item
//     ...
//
//   Each marker:
//     - Only renders if hoveredParent.index matches its index
//     - Indents based on hoveredParent.parentDepth
//     - Is IN the document flow, so scrolling works automatically
//
// =============================================================================

/** Pixels per depth level for indentation */
const DEPTH_PADDING = 20;

interface TreeDropMarkerProps {
  /**
   * Position in the flat item list.
   * Marker at index N appears BEFORE the item at index N.
   * (So index 0 is before the first item, index length is after the last)
   */
  index: number;
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
//
// This component is rendered for EVERY position in the list, but only
// SHOWS when the current drop target matches this position.
//
// We use memo() to prevent unnecessary re-renders:
//   - Only re-renders when `index` prop or store state changes
//   - Most markers will return null and skip DOM updates
//
// ---------------------------------------------------------------------------

export const TreeDropMarker = memo(function TreeDropMarker({
  index,
}: TreeDropMarkerProps) {
  // Subscribe to hoveredParent state from the store
  // This component re-renders whenever hoveredParent changes
  const hoveredParent = useTreeStore((state) => state.hoveredParent);

  // ---------------------------------------------------------------------------
  // SHOULD WE SHOW THE MARKER?
  // ---------------------------------------------------------------------------
  //
  // Only show if:
  //   1. There IS a hovered parent (something is being dragged)
  //   2. The hovered index matches THIS marker's index
  //   3. The drop intent is NOT "inside" (inside shows ring, not line)
  //
  // Most of the time this returns null (no marker shown).
  // Only ONE marker in the entire tree will render at a time.
  //
  // The dropIntent check is KEY to fixing the issue where both
  // the drop line AND the folder ring were showing simultaneously.
  //
  // ---------------------------------------------------------------------------

  if (hoveredParent.index !== index || hoveredParent.dropIntent === "inside") {
    return null;
  }

  // ---------------------------------------------------------------------------
  // COMPUTE INDENTATION
  // ---------------------------------------------------------------------------
  //
  // The marker should be indented to match the TARGET PARENT's depth.
  //
  // Example:
  //   Dropping INTO a depth-2 folder → marker indented 2 levels
  //   Dropping as sibling of depth-2 item → marker indented 2 levels
  //
  // We add 1 to parentDepth because:
  //   - parentDepth 0 = root (invisible)
  //   - Items at depth 1 need some left padding
  //   - We want the marker to align with where the item would be
  //
  // ---------------------------------------------------------------------------

  const indent = ((hoveredParent.parentDepth ?? 0) + 1) * DEPTH_PADDING;

  // ---------------------------------------------------------------------------
  // RENDER THE MARKER
  // ---------------------------------------------------------------------------
  //
  // A simple horizontal line:
  //   - 2px tall
  //   - Blue/accent color
  //   - Left margin based on target depth
  //   - Full width from indent to edge
  //
  // The marker is IN document flow (not position: absolute), so:
  //   - It pushes content down when shown
  //   - Scrolling works correctly
  //   - No z-index fighting
  //
  // ---------------------------------------------------------------------------

  return (
    <div
      className="h-[2px] bg-blue-500 pointer-events-none"
      style={{ marginLeft: indent }}
      // pointer-events-none: don't interfere with drop detection
    />
  );
});

// =============================================================================
// WHY MEMO?
// =============================================================================
//
// Without memo():
//   - Every marker would re-render on ANY store change
//   - With 100 items = 101 markers re-rendering
//   - Most would return null anyway = wasted work
//
// With memo():
//   - React does shallow comparison of props + state
//   - If index didn't change and hoveredParent didn't change, skip render
//   - Much more efficient during drag operations
//
// =============================================================================

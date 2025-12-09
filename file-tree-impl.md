# File Tree Implementation Design

This document describes what is missing from the current `src/Tree.tsx` implementation compared to the reference `reference/components/core/tree/Tree.tsx`, and lays out a step‑by‑step plan for bringing your tree closer to the reference feature set and behavior.

The focus is on concepts, data flow, and UI behaviors, not on concrete code. Examples are given in prose or pseudo‑code.

---

## 1. Overall Architecture and Data Model

### 1.1. Current vs reference

- **Current (`src/Tree.tsx`, `src/TreeNode.tsx`)**
  - The tree is rendered recursively starting from `data.children`.
  - Each `TreeNode` manages its own collapsed state locally via `useState`.
  - Drag‑and‑drop is handled at the top level with `DndContext`; each node is draggable/droppable, but there is no shared “flattened” view of the tree.
  - There is no shared selection/focus/collapse state; no concept of “current” item across the tree.

- **Reference**
  - Uses a structured `TreeNode<T>` type with:
    - `item` (your domain object),
    - `children` (subnodes),
    - `parent`,
    - `depth`,
    - flags such as `hidden`, `draggable`, `localDrag`.
  - Builds a **flattened array** of `SelectableTreeNode` objects via `useSelectableItems(root)` – each entry knows its `depth` and `index` in the visible tree.
  - Shared state is in a store (Jotai families), keyed by `treeId`:
    - selection, focus, collapsed ids, drag hover parent/index, dragging ids, etc.

### 1.2. Design goals

- Introduce a **tree model** that:
  - Can be rendered recursively as you do now.
  - Can also be flattened into a list for drag, selection, and keyboard operations.
- Introduce **centralized state** for:
  - Which items are selected.
  - Which item has focus.
  - Which items are collapsed.
  - Which items are currently being dragged.
  - Where the current drop target is (parent, index, depth).

### 1.3. Implementation steps

1. **Define an internal tree node shape**
   - Keep your domain types (`TTree`, `TTreeNode`) as the external data shape.
   - Create an internal shape (similar to the reference `TreeNode<T>`) that adds `parent`, `depth`, and optional flags:
     - Example: a node that knows its parent and depth so you can easily traverse up and down.

2. **Build a tree of internal nodes from the external data**
   - Given your current `TTree` root, recursively create internal nodes and link `parent` and `depth`.
   - This structure will be used by:
     - Rendering (TreeNode),
     - Flattening (for selection and DnD),
     - Drag/dropping computations (parent/ancestor checks).

3. **Flatten the tree into a “selectable items” array**
   - Similar to `useSelectableItems`, walk the internal tree and collect each visible node into an array of `{ node, index, depth }`.
   - This array becomes the **single source of ordering** for:
     - Keyboard up/down navigation,
     - Drop index computation,
     - Multi‑selection ranges.

**Why?**

- A flattened view gives you stable indexes and a linear order across nested nodes, which is essential to:
  - Move up/down with keyboard.
  - Insert dragged items before/after any node.
  - Show between‑item drop markers.

---

## 2. Collapse State and Visibility

### 2.1. Current vs reference

- **Current**
  - Each `TreeNode` has its own `collapsed` `useState`.
  - Only the node itself knows whether it is collapsed.
  - Visibility is checked only locally when rendering children.

- **Reference**
  - Collapse state is tracked in `collapsedFamily(treeId)`, a map of `itemId -> boolean`.
  - Visibility is computed by checking all ancestors of a node:
    - If any ancestor is collapsed, the node is considered hidden.
  - Utility helpers like `isVisibleNode` and `closestVisibleNode` operate on the global state.

### 2.2. Design goals

- Move from per‑component collapse state to **shared collapse state**.
- Compute visibility from the tree + shared collapse state to:
  - Filter selectable items.
  - Keep selection/focus on visible items when collapse changes.

### 2.3. Implementation steps

1. **Store collapsed state in a shared structure**
   - Introduce a shared object (or atom/store) keyed by `treeId`:
     - Map of `itemId -> boolean` (true means collapsed).

2. **Make `TreeNode` read collapse state from shared store**
   - Instead of `useState(false)` inside the component, read from the shared map using `data.id`.
   - Toggle by updating the shared map (e.g., toggling `collapsed[id]`).

3. **Compute visibility per node**
   - Implement logic similar to `isVisibleNode(treeId, node)`:
     - Start with the node.
     - Walk up `parent` links.
     - If any ancestor is collapsed, node is hidden.
   - Use this:
     - When building the flattened list (skip hidden nodes).
     - When deciding if a `TreeNode` should render at all.

4. **Ensure there is always a visible selected item**
   - On collapse changes, if the selected item becomes hidden, choose a “closest” visible node (like `closestVisibleNode`) and move selection to it.

**Why?**

- Without shared collapse state, other tree features (selection, keyboard nav, drag) can’t know which nodes are reachable. Centralizing this makes the whole tree behave consistently.

---

## 3. Selection, Focus, and Keyboard Navigation

### 3.1. Current vs reference

- **Current**
  - No selection concept.
  - No focus management or keyboard navigation (tree is mouse‑only).

- **Reference**
  - Selection:
    - Uses `selectedIdsFamily(treeId)` and `focusIdsFamily(treeId)` to track:
      - Currently selected ids (can be multiple),
      - Anchor id (for shift‑range selection),
      - Last focused id.
  - Keyboard:
    - Arrow up/down / j/k to move selection up/down through the flattened items.
    - Arrow right / l to expand folders or move to next item.
    - Arrow left / h to collapse folders or move to parent.
    - Escape to clean up drag state and reset selection.
  - Focus:
    - Tree maintains a ref (`treeRef`) and ensures there’s always one tabbable button.
    - When an item is selected or focus moves, the corresponding button receives `tabIndex=0` and is scrolled into view.

### 3.2. Design goals

- Add **tree‑wide selection** (single and multi).
- Add **keyboard navigation** across visible items.
- Keep **focus** on the tree and on a specific item, not on arbitrary DOM.

### 3.3. Implementation steps

#### Step 3.1: Basic single selection

1. Introduce a shared selection state per tree:
   - `selectedIds` (array of ids; initially a single id).
   - `focusIds` for anchor and last focused id (anchor and last are useful once you add range selection).

2. On first render:
   - If nothing is selected, choose the first visible item in your flattened array.
   - Set both `selectedIds` and `focusIds` to this item’s id.

3. In `TreeNode`:
   - Determine if the node is selected by checking `selectedIds` for its id.
   - Apply selected styling accordingly (e.g., background).

4. On click:
   - Update `selectedIds` to contain only that id.
   - Update `focusIds` to mark this as the anchor and last.
   - Optionally call an `onActivate` callback (like the reference does).

**Why?**

- Single selection is the foundation for keyboard navigation and multi‑selection.

#### Step 3.2: Keyboard navigation (up/down, left/right)

With a flattened `selectableItems` array:

1. Hook global key handlers when the tree is focused (similar to `useKey` in the reference):
   - `ArrowUp` / `k`: move selection to the previous visible item.
   - `ArrowDown` / `j`: move selection to the next visible item.

2. For each key:
   - Find the index of the current `lastId` in `selectableItems`.
   - Move to index `index - 1` or `index + 1` as appropriate.
   - Update selection/focus state accordingly.

3. For `ArrowRight`:
   - If selected item is a collapsed folder:
     - Expand it (set collapsed false).
   - Else:
     - Move to the next visible item.

4. For `ArrowLeft`:
   - If selected item is an expanded folder:
     - Collapse it.
   - Else:
     - Move selection to its parent.

5. Ensure the selected item’s DOM element is:
   - `tabIndex=0` when it’s the current focus,
   - Focused programmatically (call `.focus()`),
   - Scrolled into view (scroll into nearest).

**Why?**

- This makes the tree accessible and efficient to navigate without the mouse.

#### Step 3.3: Multi‑selection (optional to start)

1. Support `shift+click` selection range:
   - Use the flattened `selectableItems` to compute a contiguous subarray between the anchor item and the clicked item.
   - Set `selectedIds` to the ids of those items.

2. Support modifier multi‑select (`meta` on macOS, `ctrl` on Windows/Linux):
   - When meta/ctrl is pressed:
     - Toggle the presence of the clicked id in `selectedIds`.

3. Keep `focusIds`:
   - `anchorId`: the first item in a range.
   - `lastId`: the most recently selected item (used for further range selection).

**Why?**

- Multi‑selection is essential if you want to drag multiple items or apply bulk actions via context menus.

---

## 4. Drag‑and‑Drop Behavior and Drop Targets

### 4.1. Current vs reference

- **Current**
  - Drag behavior:
    - `Tree` listens to `onDragMove`, `onDragStart`, `onDragEnd`, `onDragCancel`.
    - It computes a `dropIntent` (`before`, `after`, `inside`) based on the pointer’s vertical position inside the hovered node.
    - It stores a `dropLine` with `y` (from viewport coordinates) and `depth`.
    - It does **not** update the underlying tree data on drag end.
  - Visuals:
    - A single drop line is drawn as an absolutely positioned div inside the tree container with `top: dropLine.y`.
    - This `y` is in viewport coordinates, so it doesn’t align correctly if the tree is not top‑aligned or is scrolled.

- **Reference**
  - Uses `hoveredParentFamily(treeId)` to track:
    - `parentId`, `parentDepth`, `index` (flattened index), `childIndex`.
  - `handleDragMove`:
    - Determines which node the pointer is over.
    - Computes a “side” based on pointer position (`above`/`below`).
    - Derives `hoveredParent`, `hoveredIndex`, `hoveredChildIndex` and updates the store.
  - `TreeDropMarker`:
    - Renders a drop marker *between* items based on `hoveredIndex` and `hoveredParentDepth`.
  - `handleDragEnd`:
    - Resolves the dragged nodes and target parent/index.
    - Calls `onDragEnd` with a structured payload so the caller can update the tree model.

### 4.2. Design goals

- Make drag targets **semantic**, not purely positional:
  - Decide which parent node and child index the drop will insert into.
  - Prevent illegal moves (e.g., moving a folder into itself or its descendants).
- Make drop visuals **rooted in the tree structure**:
  - Mark specific indexes between items rather than using raw viewport coordinates.
- Actually update tree **data** (or at least emit an event to do so).

### 4.3. Implementation steps

#### Step 4.1: Represent drag state

1. Introduce shared drag state per tree:
   - `draggingIds` (ids being dragged).
   - `hoveredParent` (`parentId`, `parentDepth`, `index`, `childIndex`).

2. When drag starts:
   - If the active id is part of the current selection:
     - `draggingIds = selectedIds`.
   - Otherwise:
     - `draggingIds = [active.id]` and update selection to that one id.

**Why?**

- This allows dragging multiple items at once and ensures drag state is in sync with selection.

#### Step 4.2: Compute drop targets on move

1. In `handleDragMove`:
   - If `over` is null:
     - Clear hovered parent info and return.
   - Find the corresponding `SelectableTreeNode` in `selectableItems` for the `over.id`.
   - If none found, return.

2. Derive a “side” for the move:
   - Use pointer vertical position relative to the hovered node’s rect (like your current ratio).
   - Optionally implement a helper similar to `computeSideForDragMove`.
   - Determine if we’re effectively “above” or “below” the hovered node.

3. Decide the hovered parent and child index:
   - Let `hoveredNode` be the node under the pointer.
   - If side is `above`:
     - Use `hoveredNode.parent` as the parent.
     - Child index is the index of `hoveredNode` in its parent’s children.
   - If side is `below`:
     - If `hoveredNode` is an expanded folder with children:
       - Use `hoveredNode` as the parent.
       - Child index `0`.
     - Else:
       - Use `hoveredNode.parent` as the parent.
       - Child index is `index of hoveredNode in parent + 1`.

4. Map this to `hoveredParent` structure:
   - Store:
     - `parentId` (id of the parent),
     - `parentDepth` (for indenting the drop marker),
     - `index` (flattened index after which you would insert),
     - `childIndex` (position within the parent’s `children` array).

5. Update the shared `hoveredParent` state *only when it actually changes* to avoid jitter.

**Why?**

- This logic is what makes the drop zones align with the tree structure instead of being arbitrary lines in the viewport.

#### Step 4.3: Show drop markers between items

1. Render a list component (similar to `TreeItemList`) that:
   - Renders a drop marker before the first item.
   - For each item:
     - Renders the node.
     - Renders a drop marker after it.

2. `TreeDropMarker` behavior:
   - For a given `(treeId, node, index)`:
     - Check if `index` is currently hovered via shared state.
     - Check if the node is valid to drop under (e.g., not just below a collapsed empty folder).
     - If valid, render a visual marker:
       - Horizontal line with left padding corresponding to `parentDepth`.

3. Remove existing `dropLine` using viewport `y` and replace it completely with these structural markers.

**Why?**

- This ensures the drop marker is always aligned with the tree item edges, handles scrolling correctly, and supports multiple nested depths easily.

#### Step 4.4: Handle drag end and update data

1. On drag end:
   - Read `hoveredParent` and `draggingIds` from shared state.
   - If `over` is null or `hoveredParent` is incomplete, clear drag state and return.

2. Resolve dragged nodes:
   - Map `draggingIds` to actual internal nodes via `selectableItems`.
   - Filter out:
     - Any nodes that are not found.
     - Any nodes that would be moved into their own descendant:
       - Check ancestors of `hoveredParent` against each dragged node’s id.

3. Prepare the target children:
   - Create a copy of the target parent’s `children` array.
   - Remove the dragged nodes from that array if they are already present.
   - Adjust `insertAt` index to account for removed elements before that position.

4. Emit a semantic result:
   - Call an `onDragEnd` prop with:
     - `items` (the moved nodes’ `item`s),
     - `parent` (the target parent’s `item`),
     - `children` (the parent’s children after the move, by `item`),
     - `insertAt` (child index where they should be inserted).

5. Let the parent component handle updating the external `TTree` data structure based on this payload:
   - For example, splice into the children array, move nodes between parents, etc.

**Why?**

- Keeping the tree itself “dumb” and emitting an `onDragEnd` payload gives you:
  - Full control over how to update your actual data (maybe you have server actions or additional constraints).
  - Testability of the drag logic independent of the UI.

---

## 5. Drag UX Enhancements: Auto‑expand and Ghost Overlay

### 5.1. Current vs reference

- **Current**
  - Shows a ghost node overlay using `DragOverlay` and `GhostNode`.
  - No auto‑expand of folders when hovering a collapsed folder during drag.
  - No special handling for empty folders or delayed expansion.

- **Reference**
  - Uses `useDndMonitor` inside each `TreeItem` to:
    - Detect drag moves over that item.
    - Start a timeout when hovering over the lower portion of a collapsed folder.
    - After a delay, expand the folder and re‑measure droppable containers.
  - Shows a special “drop hover” state for collapsed folders with no children.

### 5.2. Design goals

- Preserve your existing ghost overlay.
- Add improved UX when dragging over folders:
  - Delayed auto‑expand for collapsed folders.
  - Visual hints when hovering over empty folders as drop targets.

### 5.3. Implementation steps

1. Keep `DragOverlay` + `GhostNode`:
   - Continue to compute `activeNode` by id and render a light representation as you already do.

2. Add per‑item drag monitor logic:
   - Inside each `TreeNode` (or a wrapper), listen to drag events for your node.
   - When a drag move occurs:
     - Compute side (`above`/`below`) relative to this node.
     - If node is a folder:
       - If it is collapsed, has children, and side is “below”:
         - Start a timeout (`HOVER_CLOSED_FOLDER_DELAY`) to expand it.
         - Mark a visual state (`dropHover` or similar).
       - If it is empty and side is below:
         - Show a “drop here” highlight without auto‑expanding.
     - On other moves or drag end:
       - Clear the timeout and drop hover state.

3. On timed expansion:
   - When the timeout fires:
     - Update the shared collapse state to expand the folder.
     - Clear the drop hover state.
     - Trigger re‑measurement of droppable containers (so the DnD library knows the new layout).

**Why?**

- This gives a more intuitive drag experience, especially when reorganizing deeply nested trees.

---

## 6. Context Menus, Editing, and Imperative API (Optional, Advanced)

These are advanced features present in the reference tree that you may or may not want to implement immediately, but they are worth planning for.

### 6.1. Context menus

- **Reference**
  - Accepts `getContextMenu` prop that can return items synchronously or asynchronously.
  - Supports:
    - Item‑level context menu (right‑click on an item).
    - Root‑level context menu (right‑click on empty area).
  - Differentiates between:
    - Right‑click on a selected item (acts on the full selection).
    - Right‑click on a non‑selected item (acts only on that item and updates selection).

### 6.2. Editing / rename

- **Reference**
  - `getEditOptions` prop defines:
    - Default text.
    - Placeholder.
    - `onChange` callback to persist changes.
  - When editing:
    - Tree item renders an `<input>` instead of the default label.
    - Enter saves, Escape cancels.

### 6.3. Imperative API

- **Reference**
  - Exposes an imperative handle (`TreeHandle`) via `forwardRef`:
    - Methods like `focus`, `hasFocus`, `selectItem`, `renameItem`, `showContextMenu`.

### 6.4. Design goals

- Provide hooks for:
  - Context actions (add, delete, rename, etc).
  - Inline rename.
  - Programmatic focus and selection (for parent components).

### 6.5. Implementation steps (high‑level)

1. Add optional `onContextMenu`/`getContextMenu` props to your `Tree`:
   - When an item is right‑clicked:
     - Decide if you’re operating on just that item or on the current selection.
     - Ask the parent component for menu items.
     - Render a menu at the click coordinates.

2. Add rename support:
   - For items that support renaming, add a mode toggle “editing”.
   - When in editing:
     - Render an input pre‑filled with the current name.
     - On blur or Enter, call a parent callback to apply the new name.

3. Add an imperative ref to `Tree`:
   - Use `forwardRef` to expose a small API:
     - `focus`, `selectItem(id, focus)`, maybe `renameItem(id)`.
   - Internally, call the same state update functions you use for user interactions.

**Why?**

- These features give your tree the flexibility and polish found in the reference component and make it easier to integrate into larger apps.

---

## 7. Migration Strategy and Incremental Implementation

Given the breadth of changes, it is best to proceed in **small, verifiable steps**.

### 7.1. Suggested implementation order

1. **Internal tree model + flattening**
   - Implement internal `TreeNode` structure with `parent` and `depth`.
   - Add a `useSelectableItems`‑style hook to flatten the tree.
   - Use the flattened list for rendering (even if you keep the current recursive `TreeNode` for now).

2. **Shared collapse state and visibility**
   - Replace local `collapsed` state in `TreeNode` with shared map.
   - Add `isVisibleNode` and use it to filter the flattened list.

3. **Basic selection + keyboard navigation**
   - Implement single selection shared state.
   - Add up/down arrow key handlers to move selection.
   - Ensure focus management (tabIndex and scroll into view).

4. **Drag state and drop markers**
   - Introduce `draggingIds` and `hoveredParent` shared state.
   - Rewrite `handleDragMove` to compute structural drop targets.
   - Replace the single `dropLine` with between‑item `TreeDropMarker` components.

5. **Drag end semantics**
   - Implement data resolution and `onDragEnd` payload.
   - Wire parent updates to actually reorder/move items.

6. **Drag UX enhancements**
   - Add auto‑expand on hover for collapsed folders.
   - Add improved visuals for empty folders.

7. **Optional advanced features**
   - Context menus, editing/rename support, imperative API.

### 7.2. Testing and validation

For each step:

- Test basic scenarios:
  - Small tree with folders/files, nested several levels deep.
- Edge cases:
  - Dragging first/last items.
  - Collapsing nodes with selected children.
  - Dragging into/around collapsed parents.
  - Horizontal scrolling / vertical scrolling and viewport changes.

---

## 8. Summary

What you are primarily missing compared to the reference implementation is not individual effects or visuals, but the **structural architecture**:

- A shared, tree‑wide state model for:
  - Collapse,
  - Selection & focus,
  - Dragging & drop targets.
- A flattened representation of the tree to:
  - Drive keyboard navigation,
  - Compute drag insert positions,
  - Render between‑item drop markers.
- A clear contract for drag results (`onDragEnd`) to update your real data.

By following the steps in this document incrementally, you can evolve your current `Tree` into a much more robust, feature‑rich component that behaves similarly to the reference while remaining tailored to your own data types and UI.


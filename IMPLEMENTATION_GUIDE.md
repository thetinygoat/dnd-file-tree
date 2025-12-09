# File Tree Implementation Guide

A step-by-step guide to transform the current basic tree implementation into a production-grade component matching the reference architecture.

## Executive Summary

The core changes are:

1. **Zustand store** for shared tree state (replacing per-component useState)
2. **Flattened tree representation** for selection, navigation, and drop positioning
3. **Structural drag-and-drop** with semantic targets and visual drop markers
4. **Multi-selection** with shift/ctrl modifiers

Keyboard navigation is deprioritized.

---

## Understanding Your Current Implementation's Problems

Before diving into the solution, let's understand **why** your current implementation doesn't work like the reference.

### Problem 1: Fragmented State (The Root Cause)

**What's happening now:**

```
TreeNode A (collapsed: useState(false))
  └── TreeNode B (collapsed: useState(true))
      └── TreeNode C (collapsed: useState(false))
```

Each node manages its own `collapsed` state independently. Node A doesn't know if Node B is collapsed. Node C doesn't know if its grandparent A is collapsed.

**Why this breaks things:**

- **Selection ranges**: To select items 3-7, you need to know the order of ALL visible items. But with fragmented state, there's no single place that knows "item 5 is actually hidden because its parent is collapsed."
- **Drop positioning**: When you drag over item 10, you need to know "where in the tree structure is position 10?" But each node only knows about itself.
- **Keyboard navigation**: Arrow-down from item 4 should go to item 5, but which node IS item 5? No single component knows the answer.

**The fix**: Centralize all tree state (collapsed, selection, drag) in a Zustand store that every component reads from.

---

### Problem 2: Viewport-Based Drop Line

**What's happening now:**

```typescript
// Your current code
const y = intent === "before" ? overRect.top : overRect.bottom;
setDropLine({ y, depth });

// Then rendered as:
<div style={{ top: dropLine.y }} />;
```

You're storing the drop line position as a viewport Y coordinate (`overRect.top` is pixels from the top of the viewport).

**Why this breaks things:**

- Scroll the tree container and the line stays at the same viewport position (wrong!)
- The position is "dumb" - it's just a number, not "between item 3 and 4"
- You can't ask "which parent folder would this drop into?" because you only have a Y coordinate

**The fix**: Store the drop target as structural data: `{ parentId: "folder-1", childIndex: 2, flatIndex: 5 }`. Then render drop markers between specific items based on that index.

---

### Problem 3: No Flattened View

**What's happening now:**
Your tree renders recursively:

```
Tree renders → TreeNode A
                  TreeNode A renders → TreeNode B
                                          TreeNode B renders → TreeNode C
```

There's no single array like `[A, B, C, D, E, F]` that represents the visible items in order.

**Why this breaks things:**

- Shift+click from item 2 to item 6: Which items are in between? You'd have to traverse the recursive structure to find out.
- Arrow-down from item 4: What's item 5? You'd have to traverse again.
- Drag item to position 7: What does "position 7" even mean in a recursive structure?

**The fix**: Create a `useSelectableItems` hook that walks the tree once and produces a flat array: `[{node: A, index: 0}, {node: B, index: 1}, ...]`. This becomes the single source of truth for ordering.

---

### Problem 4: No Selection Model

**What's happening now:**
Nothing. There's no concept of "selected items."

**Why you need it:**

- Visual feedback (highlight selected rows)
- Multi-drag (drag all selected items together)
- Context menus (right-click shows actions for selected items)
- Keyboard navigation (arrow keys move through selection)

**The fix**: Add `selectedIds: string[]` to the store. Track `anchorId` (where shift-selection started) and `lastFocusedId` (most recently clicked item).

---

## Step-by-Step Implementation Guide

### Step 1: Install Zustand

**What:** Add Zustand as a dependency.

**Why:** You need a state management solution that:

- Lives outside React's component tree
- Can be accessed by any component without prop drilling
- Doesn't cause unnecessary re-renders

```bash
npm install zustand
```

---

### Step 2: Create Internal Tree Types

**What:** Create `src/tree/types.ts` with enriched node types.

**Why:** Your current `TTreeNode` type is "flat" - it doesn't know its parent or depth:

```typescript
// Current - no parent reference, no depth
type TTreeNode = {
  name: string;
  id: string;
  type: TreeNodeType;
  children?: TTreeNode[];
};
```

The reference has nodes that know their context:

```typescript
// What we need
interface InternalTreeNode<T> {
  item: T; // Your original data
  children?: InternalTreeNode<T>[];
  parent: InternalTreeNode<T> | null; // Can walk UP the tree
  depth: number; // Know nesting level
}
```

**Why parent matters:** When you collapse a folder, you need to check "is MY ancestor collapsed?" This requires walking UP the tree.

**Why depth matters:** Drop markers need to be indented to the correct level. Selection highlighting needs consistent indentation.

---

### Step 3: Create the Zustand Store

**What:** Create `src/tree/store.ts` with all shared state.

**Why:** This replaces all the scattered `useState` calls:

| Current Location | Current State            | New Store Location    |
| ---------------- | ------------------------ | --------------------- |
| Each TreeNode    | `collapsed`              | `store.collapsed[id]` |
| Tree.tsx         | `dropIntent`, `dropLine` | `store.hoveredParent` |
| Tree.tsx         | `active`, `over`         | `store.draggingIds`   |
| Nowhere          | -                        | `store.selectedIds`   |

**Store shape:**

```typescript
interface TreeStore {
  // Which items are selected (can be multiple)
  selectedIds: string[];

  // For shift-click: where did selection start?
  anchorId: string | null;

  // Which folders are collapsed (true = collapsed)
  collapsed: Record<string, boolean>;

  // What's being dragged right now
  draggingIds: string[];

  // Where would a drop land?
  hoveredParent: {
    parentId: string | null; // Drop INTO this folder
    childIndex: number | null; // At this position in children array
    index: number | null; // Visual position in flat list
    parentDepth: number | null; // For indenting the drop marker
  };
}
```

---

### Step 4: Create Tree Utilities

**What:** Create `src/tree/utils.ts` with helper functions.

**Why:** Several operations need to be performed in multiple places:

**`buildInternalTree(externalNode, parent, depth)`**

- Converts your `TTreeNode` to `InternalTreeNode`
- Recursively adds `parent` and `depth` to each node
- Called once when tree data changes

**`hasAncestor(node, ancestorId)`**

- Walks UP the parent chain looking for a specific ID
- Used to prevent dropping a folder into itself or its children
- Example: Dragging "Folder A" over "Folder A/Subfolder" should be invalid

**`isVisibleNode(node, collapsedMap)`**

- Checks if ANY ancestor is collapsed
- If parent is collapsed, this node is hidden
- Used when building the flattened list

**`getChildIndex(node)`**

- Finds this node's position in its parent's children array
- Used for computing drop `childIndex`

---

### Step 5: Create the Flattening Hook

**What:** Create `src/tree/useSelectableItems.ts`.

**Why:** This is the key abstraction that makes everything else possible.

**How it works:**

```typescript
function useSelectableItems(root, collapsed) {
  return useMemo(() => {
    const items = [];
    let index = 0;

    function walk(node) {
      // Skip if any ancestor is collapsed (node is hidden)
      if (!isVisibleNode(node, collapsed)) return;

      items.push({ node, index: index++ });

      // Recurse into children (if not collapsed)
      if (node.children && !collapsed[node.item.id]) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }

    walk(root);
    return items;
  }, [root, collapsed]);
}
```

**What you get:**

```
[
  { node: FolderA,    index: 0 },
  { node: FileA1,     index: 1 },
  { node: FileA2,     index: 2 },
  { node: FolderB,    index: 3 },  // FolderB is collapsed
  // FolderB's children are NOT in the list
  { node: FileC,      index: 4 },
]
```

**Why this enables everything:**

- Shift+click from index 1 to index 4 → select indexes 1,2,3,4
- Arrow-down from index 2 → go to index 3
- Drop at index 3 → insert between index 2 and 3 in the visual order

---

### Step 6: Refactor TreeNode to Use Store

**What:** Modify `src/TreeNode.tsx` to read from the store instead of local state.

**Current code:**

```typescript
const [collapsed, setCollapsed] = useState(false);
```

**New code:**

```typescript
const collapsed = useTreeStore((state) => state.collapsed[data.id] ?? false);
const toggleCollapsed = useTreeStore((state) => state.toggleCollapsed);
const isSelected = useTreeStore((state) => state.selectedIds.includes(data.id));
```

**Why:** Now when you collapse a folder:

1. The store updates `collapsed[folderId] = true`
2. `useSelectableItems` recomputes (it depends on `collapsed`)
3. The flattened list no longer includes hidden children
4. All components reading from the store update together

---

### Step 7: Implement Selection

**What:** Add click handlers that update `selectedIds` in the store.

**Plain click:**

```typescript
function handleClick(e) {
  store.setSelectedIds([item.id]);
  store.setAnchorId(item.id);
}
```

**Shift+click (range selection):**

```typescript
function handleClick(e) {
  if (e.shiftKey) {
    const anchorIndex = selectableItems.findIndex(
      (s) => s.node.item.id === anchorId
    );
    const clickIndex = selectableItems.findIndex(
      (s) => s.node.item.id === item.id
    );

    const start = Math.min(anchorIndex, clickIndex);
    const end = Math.max(anchorIndex, clickIndex);

    const rangeIds = selectableItems
      .slice(start, end + 1)
      .map((s) => s.node.item.id);

    store.setSelectedIds(rangeIds);
  }
}
```

**Why shift+click needs the flattened list:** You can't compute "all items between A and B" without knowing the linear order. The flattened `selectableItems` array gives you exactly that.

**Ctrl/Cmd+click (toggle):**

```typescript
function handleClick(e) {
  if (e.metaKey || e.ctrlKey) {
    const currentIds = store.selectedIds;
    if (currentIds.includes(item.id)) {
      store.setSelectedIds(currentIds.filter((id) => id !== item.id));
    } else {
      store.setSelectedIds([...currentIds, item.id]);
    }
  }
}
```

---

### Step 8: Refactor Drag Start

**What:** Update `handleDragStart` to set `draggingIds` from selection.

**Current behavior:** You track `active` but don't connect it to selection.

**New behavior:**

```typescript
function handleDragStart(event) {
  const activeId = event.active.id;
  const selectedIds = store.selectedIds;

  if (selectedIds.includes(activeId)) {
    // Dragging a selected item → drag ALL selected items
    store.setDraggingIds(selectedIds);
  } else {
    // Dragging an unselected item → drag just that one
    store.setDraggingIds([activeId]);
    store.setSelectedIds([activeId]); // Also select it
  }
}
```

**Why:** This enables multi-drag. If you have items 2, 4, 6 selected and start dragging item 4, all three items should move together.

---

### Step 9: Refactor Drag Move (The Big One)

**What:** Replace viewport-based `dropIntent` with structural `hoveredParent`.

**Current code (simplified):**

```typescript
function handleDragMove(event) {
  const ratio = pointerY / overRect.height;
  if (ratio < 0.3) intent = "before";
  else if (ratio > 0.7) intent = "after";
  else intent = "inside";

  setDropLine({ y: overRect.top, depth });
}
```

**Problems:**

1. `y: overRect.top` is viewport coordinates (breaks on scroll)
2. "before"/"after" doesn't tell you WHICH parent to insert into
3. No validation (could drop folder into itself)

**New code (conceptual):**

```typescript
function handleDragMove(event) {
  const over = event.over;
  if (!over) {
    store.clearHoveredParent();
    return;
  }

  // Find the node we're hovering over in our flat list
  const overItem = selectableItems.find(s => s.node.item.id === over.id);
  if (!overItem) return;

  // Compute: are we in the top half or bottom half?
  const rect = over.rect;
  const pointerY = /* get from event */;
  const side = pointerY < rect.top + rect.height / 2 ? 'above' : 'below';

  // Determine the structural target
  let targetParent: InternalTreeNode;
  let childIndex: number;

  if (side === 'above') {
    // Insert BEFORE this node → same parent, same position
    targetParent = overItem.node.parent;
    childIndex = getChildIndex(overItem.node);
  } else {
    // Insert AFTER this node
    if (overItem.node.children && !collapsed[overItem.node.item.id]) {
      // It's an EXPANDED folder → insert as FIRST child
      targetParent = overItem.node;
      childIndex = 0;
    } else {
      // It's a file or collapsed folder → insert after it in parent
      targetParent = overItem.node.parent;
      childIndex = getChildIndex(overItem.node) + 1;
    }
  }

  // CRITICAL: Validate the drop
  for (const dragId of store.draggingIds) {
    if (hasAncestor(targetParent, dragId)) {
      // Can't drop a folder into itself or its children!
      return;
    }
  }

  // Store the structural target
  store.setHoveredParent({
    parentId: targetParent?.item.id ?? null,
    parentDepth: targetParent?.depth ?? 0,
    index: overItem.index + (side === 'below' ? 1 : 0),
    childIndex
  });
}
```

**Why this is better:**

1. `parentId` + `childIndex` tells you exactly where in the tree structure to insert
2. `index` tells you where to render the drop marker (between which visible items)
3. `parentDepth` tells you how much to indent the drop marker
4. The validation prevents impossible drops

---

### Step 10: Create Drop Markers

**What:** Create `src/tree/TreeDropMarker.tsx` and render between items.

**Why:** Instead of one absolutely-positioned line, you render a marker component in the item list:

```typescript
// In your list rendering
{selectableItems.map((item, i) => (
  <Fragment key={item.node.item.id}>
    <TreeDropMarker index={i} />  {/* Marker BEFORE this item */}
    <TreeNode node={item.node} />
  </Fragment>
))}
<TreeDropMarker index={selectableItems.length} /> {/* Marker at end */}
```

**TreeDropMarker component:**

```typescript
function TreeDropMarker({ index }) {
  const hoveredParent = useTreeStore((state) => state.hoveredParent);

  // Only show if this is the hovered index
  if (hoveredParent.index !== index) return null;

  // Indent based on target parent depth
  const indent = (hoveredParent.parentDepth ?? 0) * DEPTH_PADDING;

  return <div className="h-[2px] bg-blue-500" style={{ marginLeft: indent }} />;
}
```

**Why this works better:**

- The marker is IN the document flow, not absolutely positioned
- Scrolling works automatically
- Indent is based on structural depth, not pixel guessing

---

### Step 11: Implement Drag End

**What:** Compute the final move and emit `onDragEnd` callback.

**Current code:**

```typescript
function handleDragEnd(event) {
  setDropIntent(null);
  setOver(null);
  // Does nothing with the data!
}
```

**New code:**

```typescript
function handleDragEnd(event) {
  const { hoveredParent, draggingIds } = store.getState();
  store.clearDragState();

  // Bail if no valid drop target
  if (!event.over || !hoveredParent.parentId) return;

  // Find the target parent node
  const targetParent = findNodeById(internalRoot, hoveredParent.parentId);
  if (!targetParent) return;

  // Resolve dragged items to actual nodes
  const draggedNodes = draggingIds
    .map((id) => selectableItems.find((s) => s.node.item.id === id)?.node)
    .filter(Boolean);

  // Filter out invalid drops (into self/descendant)
  const validNodes = draggedNodes.filter(
    (node) => !hasAncestor(targetParent, node.item.id)
  );

  if (validNodes.length === 0) return;

  // Compute the new children array
  const newChildren = [...(targetParent.children ?? [])];
  let insertAt = hoveredParent.childIndex ?? 0;

  // Remove items that are already in this parent (reordering case)
  for (const node of validNodes) {
    const existingIndex = newChildren.findIndex(
      (c) => c.item.id === node.item.id
    );
    if (existingIndex !== -1) {
      newChildren.splice(existingIndex, 1);
      if (existingIndex < insertAt) insertAt--; // Adjust for removal
    }
  }

  // Emit callback - let parent handle the actual mutation
  onDragEnd?.({
    items: validNodes.map((n) => n.item), // What's being moved
    parent: targetParent.item, // Move INTO this folder
    children: newChildren.map((c) => c.item), // Current children (without dragged)
    insertAt, // Insert at this index
  });
}
```

**Why emit instead of mutate:** The Tree component doesn't own the data. Your `App.tsx` does. By emitting a structured payload, the parent can:

- Update its state
- Make an API call
- Show a confirmation dialog
- Whatever it needs

---

### Step 12: Handle the Callback in App.tsx

**What:** Implement the actual tree mutation in your parent component.

```typescript
function App() {
  const [tree, setTree] = useState(initialData);

  function handleDragEnd({ items, parent, children, insertAt }) {
    setTree((prevTree) => {
      // Deep clone to avoid mutation
      const newTree = structuredClone(prevTree);

      // 1. Remove dragged items from their current parents
      for (const item of items) {
        removeNodeFromTree(newTree, item.id);
      }

      // 2. Find the target parent in the new tree
      const targetParent = findNodeById(newTree, parent.id);

      // 3. Insert items at the specified position
      targetParent.children = targetParent.children ?? [];
      targetParent.children.splice(insertAt, 0, ...items);

      return newTree;
    });
  }

  return <Tree data={tree} onDragEnd={handleDragEnd} />;
}
```

---

### Step 13: Add Auto-Expand on Hover

**What:** When dragging over a collapsed folder for 800ms, expand it.

**Where:** In `TreeNode`, add a `useDndMonitor` or effect that:

```typescript
function TreeNode({ node }) {
  const [hoverTimeout, setHoverTimeout] = useState(null);
  const isCollapsed = useTreeStore((state) => state.collapsed[node.item.id]);
  const hoveredParent = useTreeStore((state) => state.hoveredParent);

  const isBeingHoveredAsDropTarget = hoveredParent.parentId === node.item.id;

  useEffect(() => {
    if (isBeingHoveredAsDropTarget && isCollapsed && node.children?.length) {
      // Start timer to expand
      const timeout = setTimeout(() => {
        store.setCollapsed(node.item.id, false);
      }, 800);
      setHoverTimeout(timeout);
    } else {
      // Clear timer
      if (hoverTimeout) clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }

    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
    };
  }, [isBeingHoveredAsDropTarget, isCollapsed]);
}
```

**Why:** When you're dragging a file and hover over a collapsed folder, you want to drop it INSIDE that folder. But you can't see inside. Auto-expanding after a delay lets you navigate deep into the tree while dragging.

---

### Step 14: Update Visual Styling

**What:** Add proper selection and drag styling.

**Selection styling in TreeNode:**

```typescript
const isSelected = useTreeStore(state => state.selectedIds.includes(node.item.id));

<div className={cn(
  "tree-node",
  isSelected && "bg-blue-500/20"
)}>
```

**Drag overlay with count:**

```typescript
// In Tree.tsx
<DragOverlay>
  {draggingIds.length > 0 && (
    <div className="relative">
      <GhostNode node={primaryDragNode} />
      {draggingIds.length > 1 && (
        <span className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full px-2">
          {draggingIds.length}
        </span>
      )}
    </div>
  )}
</DragOverlay>
```

---

## File Summary

| File                             | Action   | Purpose                                                              |
| -------------------------------- | -------- | -------------------------------------------------------------------- |
| `src/tree/types.ts`              | Create   | `InternalTreeNode`, `SelectableTreeNode`, `HoveredParent` types      |
| `src/tree/store.ts`              | Create   | Zustand store with selection, collapse, drag state                   |
| `src/tree/utils.ts`              | Create   | `buildInternalTree`, `hasAncestor`, `isVisibleNode`, `getChildIndex` |
| `src/tree/useSelectableItems.ts` | Create   | Hook to flatten tree based on collapse state                         |
| `src/tree/TreeDropMarker.tsx`    | Create   | Drop indicator rendered between items                                |
| `src/Tree.tsx`                   | Refactor | Use store, new drag handlers, emit onDragEnd                         |
| `src/TreeNode.tsx`               | Refactor | Read from store, selection styling, auto-expand                      |
| `src/App.tsx`                    | Update   | Handle onDragEnd callback to mutate data                             |
| `package.json`                   | Update   | Add zustand                                                          |

---

## Testing Checklist

- [ ] Single click selects item
- [ ] Shift+click selects range
- [ ] Ctrl/Cmd+click toggles item in selection
- [ ] Drag single item shows correct drop markers
- [ ] Drag multiple selected items together
- [ ] Drop marker appears between items at correct depth
- [ ] Cannot drop folder into itself or descendant
- [ ] Hovering collapsed folder for 800ms expands it
- [ ] onDragEnd receives correct payload
- [ ] Parent can update tree data based on payload
- [ ] Collapsing folder hides descendants from flat list
- [ ] Scrolling doesn't break drop marker position

---

## Low Priority: Keyboard Navigation

When you're ready to add this:

- Arrow up/down: move through `selectableItems` by index
- Arrow right: if on collapsed folder, expand; else move to next
- Arrow left: if on expanded folder, collapse; else move to parent
- Home/End: first/last item in `selectableItems`
- Escape: collapse selection to single `lastFocusedId`

This requires focus management (`tabIndex`, `ref.focus()`) which adds complexity.

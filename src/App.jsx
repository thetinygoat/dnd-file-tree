import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

const fileTree = {
  name: "payments-api",
  id: "aa08e7a1-2bba-4c30-a969-da0fece2480f",
  children: [
    {
      name: "transactions",
      id: "5de55936-3b4e-432a-af6c-2e7e3bdde88b",
      children: [
        {
          name: "initiate transaction",
          id: "08f6a5cd-1650-45a6-8772-eca3af6f95d9",
        },
        {
          name: "cancel transaction",
          id: "d997f233-42c0-48af-8f09-66540b5d7363",
        },
      ],
    },
    {
      name: "refunds",
      id: "7c1456dc-12ca-4217-8eff-70f700ba932c",
      children: [
        {
          name: "initiate refund",
          id: "dc611e32-47a2-4843-b63f-d56615ac0c8ds",
        },
      ],
    },
    {
      name: "webhook",
      id: "703ce4e3-098d-4d48-861f-a24ad5ca45f1",
    },
  ],
};

function findNode(tree, id) {
  if (!tree) {
    return null;
  }
  for (let node of tree) {
    if (node.id === id) {
      return node;
    }

    const found = findNode(node.children, id);
    if (found) return found;
  }

  return null;
}

function removeNode(tree, id) {
  const newTree = [];
  for (const node of tree) {
    if (node.id === id) {
      continue;
    }
    let newNode = node;
    if (node.children && node.children.length > 0) {
      newNode = { ...node, children: removeNode(node.children, id) };
    }

    newTree.push(newNode);
  }

  return newTree;
}

function insertNode(tree, activeNode, overId, dropIntent) {
  let newTree = structuredClone(tree);

  function traverse(node) {
    // check if we are the current node where drop is happening
    // and we are dropping inside
    if (node.id == overId && dropIntent == "inside") {
      if (!node.children) {
        node.children = [];
      }
      node.children.push(activeNode);
      return true;
    }

    if (node.children) {
      const index = node.children.findIndex((c) => c.id == overId);
      if (index !== -1) {
        if (dropIntent == "before") {
          node.children.splice(index, 0, activeNode);
          return true;
        } else if (dropIntent == "after") {
          node.children.splice(index + 1, 0, activeNode);
          return true;
        }
        // If dropIntent is "inside", let recursion handle it
      }
    }

    if (node.children) {
      for (const child of node.children) {
        if (traverse(child)) return true;
      }
    }
  }

  if (newTree.id == overId && dropIntent == "inside") {
    if (!newTree.children) {
      newTree.children = [];
    }
    newTree.children.push(activeNode);
  } else {
    traverse(newTree);
  }

  return newTree;
}

function hasChild(node, targetId) {
  if (!node.children) return false;
  for (let child of node.children) {
    if (child.id === targetId) return true;
    if (hasChild(child, targetId)) return true;
  }
  return false;
}

function TreeItem({ node, depth, dropIntent, activeId, overId }) {
  const {
    listeners,
    attributes,
    setNodeRef: setDraggableNodeRef,
    transform,
  } = useDraggable({ id: node.id });

  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    id: node.id,
  });

  const isDragging = activeId === node.id;
  const isOver = overId === node.id;

  const isDroppingBefore = isOver && dropIntent == "before";
  const isDroppingAfter = isOver && dropIntent == "after";
  const isDroppingInside = isOver && dropIntent == "inside";

  const indentPixels = depth * 20;
  const isDirectory = !!node.children;
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    paddingBottom: "10px",
    paddingRight: "10px",
    paddingTop: "10px",
    paddingLeft: `${indentPixels}px`,
    backgroundColor:
      isDirectory && isDroppingInside && !isDragging
        ? "rgba(0, 0, 255, 0.1)"
        : "transparent",
    cursor: "grab",
    position: "relative",
  };

  return (
    <>
      <div
        {...attributes}
        {...listeners}
        ref={(node) => {
          setDraggableNodeRef(node);
          setDroppableNodeRef(node);
        }}
        style={style}
      >
        {isDroppingBefore && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: indentPixels, // Match indentation
              right: 0,
              height: "2px",
              backgroundColor: "#007fd4", // Ayu Blue-ish
              borderRadius: "2px",
              pointerEvents: "none",
            }}
          />
        )}
        {node.name}
        {isDroppingAfter && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: indentPixels,
              right: 0,
              height: "2px",
              backgroundColor: "#007fd4",
              borderRadius: "2px",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      {node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <div>
              <TreeItem
                node={child}
                key={child.id}
                depth={depth + 1}
                dropIntent={dropIntent}
                activeId={activeId}
                overId={overId}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function App() {
  let [tree, setTree] = useState(fileTree);
  let [activeId, setActiveId] = useState(null);
  let [overId, setOverId] = useState(null);
  let [dropIntent, setDropIntent] = useState(null);

  let sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    setDropIntent(null);

    if (!over || !dropIntent || active.id === over.id) return;

    const activeNode = findNode(tree.children, active.id);
    if (!activeNode) return;

    const remainingChildren = removeNode(tree.children, active.id);

    const pruneTree = { ...tree, children: remainingChildren };

    const finalTree = insertNode(pruneTree, activeNode, over.id, dropIntent);

    setTree(finalTree);
  };

  const handleDragMove = (event) => {
    const { active, over } = event;
    if (!over) {
      setOverId(null);
      setDropIntent(null);
      return;
    }

    const activeNode = findNode(tree.children, active.id);
    // self ref paradox
    if (activeNode && hasChild(activeNode, over.id)) {
      setOverId(null);
      setDropIntent(null);
      return;
    }

    setOverId(over.id);

    const activeRect = active.rect.current.translated;
    const overRect = over.rect;

    const activeCenterY = activeRect.top + activeRect.height / 2;
    const offsetY = activeCenterY - overRect.top;

    const overNode = findNode(tree.children, over.id);

    const isDirectory = !!overNode?.children;

    if (isDirectory) {
      let zoneHeight = overRect.height;
      let topZone = zoneHeight * 0.25;
      let bottomZone = zoneHeight * 0.75;

      if (offsetY < topZone) {
        setDropIntent("before");
      } else if (offsetY > bottomZone) {
        setDropIntent("after");
      } else {
        setDropIntent("inside");
      }
    } else {
      let zoneHeight = overRect.height;
      let topZone = zoneHeight * 0.5;

      if (offsetY < topZone) {
        setDropIntent("before");
      } else {
        setDropIntent("after");
      }
    }
  };

  return (
    <>
      <main>
        <section>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
          >
            {tree.children.map((node) => (
              <TreeItem
                node={node}
                depth={0}
                key={node.id}
                dropIntent={dropIntent}
                activeId={activeId}
                overId={overId}
              />
            ))}
          </DndContext>
        </section>
        <section></section>
      </main>
    </>
  );
}

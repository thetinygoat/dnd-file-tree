import { type DropIntent, type TTree } from "./types";
import { TreeNode } from "./TreeNode";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type Active,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import { useState } from "react";
import { findNodeById } from "./tree-utils";
import { GhostNode } from "./GhostNode";

type DropLine = { y: number; depth: number };

export function Tree({ data }: { data: TTree }) {
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [dropLine, setDropLine] = useState<DropLine | null>(null);
  const depthPadding = 10;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragMove = (event: DragMoveEvent) => {
    const { active, over } = event;

    if (!over) {
      setDropIntent(null);
      setOver(null);
      setActive(null);
      setDropLine(null);
      return;
    }

    const activeRect = active.rect.current.translated;
    const overRect = over.rect;

    if (!activeRect || !overRect) {
      return;
    }

    setOver(over);
    setActive(active);

    const activeCenter = activeRect.top + activeRect.height / 2;
    const activeOffset = activeCenter - overRect.top;
    const ratio = activeOffset / overRect.height;

    const droppableData = (over.data?.current ?? {}) as {
      depth?: number;
      type?: string;
      collapsed?: boolean;
      hasChildren?: boolean;
    };

    const isDirectory = droppableData.type === "directory";
    const isExpandedFolder =
      isDirectory && droppableData.hasChildren && !droppableData.collapsed;

    let intent: DropIntent;
    if (ratio < 0.3) {
      intent = "before";
    } else if (ratio > 0.7 && !isExpandedFolder) {
      intent = "after";
    } else {
      intent = "inside";
    }

    setDropIntent(intent);

    if (intent === "before" || intent === "after") {
      const depth = droppableData.depth ?? 1;
      const y = intent === "before" ? overRect.top : overRect.bottom;
      setDropLine({ y, depth });
    } else {
      setDropLine(null);
    }

    console.log({ dropIntent, ratio });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDropIntent(null);
    setOver(null);
    setActive(null);
    setDropLine(null);
  };

  const handleDragstart = (event: DragStartEvent) => {
    setActive(event.active);
  };

  const handleDragCancel = (event: DragCancelEvent) => {
    setDropIntent(null);
    setOver(null);
    setActive(null);
    setDropLine(null);
  };

  const activeNode = active ? findNodeById(data, active.id as string) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragstart}
      onDragCancel={handleDragCancel}
    >
      <div className="h-screen bg-slate-900 col-span-1 md:col-span-2 relative">
        {data?.children.map((child) => {
          return (
            <TreeNode
              data={child}
              key={child.id}
              depth={1}
              dropIntent={dropIntent}
              over={over}
              active={active}
            />
          );
        })}
        {dropLine && (
          <div
            className="pointer-events-none absolute h-[2px] bg-amber-700"
            style={{
              top: dropLine.y,
              left: dropLine.depth * depthPadding,
              right: 0,
            }}
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeNode && <GhostNode node={activeNode} />}
      </DragOverlay>
    </DndContext>
  );
}

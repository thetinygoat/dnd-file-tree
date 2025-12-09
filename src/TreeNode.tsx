import {
  useDraggable,
  useDroppable,
  type Active,
  type Over,
} from "@dnd-kit/core";
import type { DropIntent, TTreeNode } from "./types";
import { File, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";

export function TreeNode({
  data,
  depth,
  dropIntent,
  over,
  active,
}: {
  data: TTreeNode;
  depth: number;
  dropIntent: DropIntent | null;
  over: Over | null;
  active: Active | null;
}) {
  const depthPadding = 10;
  const [collapsed, setCollapsed] = useState(false);
  const {
    setNodeRef: setDraggableNodeRef,
    attributes,
    listeners,
  } = useDraggable({
    id: data.id,
  });

  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    id: data.id,
    data: {
      depth,
      type: data.type,
      collapsed,
      hasChildren: !!data.children?.length,
    },
  });

  const isOver = over?.id == data.id;
  const isActive = active?.id == data.id;
  const currentDropIntent = isOver ? dropIntent : null;

  const style: React.CSSProperties = {
    paddingTop: "10px",
    paddingBottom: "10px",
    paddingLeft: `${depth * depthPadding}px`,
    backgroundColor: isActive ? "slate" : undefined,
    border:
      currentDropIntent === "inside" && data.type === "directory"
        ? "1px solid red"
        : "1px solid transparent",
  };

  return (
    <>
      <div
        ref={setDroppableNodeRef}
        className="text-slate-200 cursor-default relative"
        onClick={() => setCollapsed(!collapsed)}
      >
        {/* {currentDropIntent == "before" && (
          <div
            className="h-1 bg-amber-700 absolute top-0 right-0"
            style={{
              left: `${depth * depthPadding}px`, // Match the text indentation
            }}
          />
        )} */}
        <div
          ref={setDraggableNodeRef}
          style={style}
          {...attributes}
          {...listeners}
        >
          <div className="flex">
            {data.type === "directory" ? (
              collapsed ? (
                <Folder />
              ) : (
                <FolderOpen />
              )
            ) : (
              <File />
            )}
            <p className="pl-2">{data.name}</p>
          </div>
        </div>
        {/* {currentDropIntent == "after" && (
          <div
            className="h-1 bg-amber-700 absolute bottom-0 right-0"
            style={{
              left: `${depth * depthPadding}px`, // Match the text indentation
            }}
          />
        )} */}
      </div>

      {/* <div /> */}
      {!collapsed &&
        data.children &&
        data.children.length > 0 &&
        data.children.map((child) => {
          return (
            <TreeNode
              data={child}
              key={child.id}
              depth={depth + 1}
              dropIntent={dropIntent}
              over={over}
              active={active}
            />
          );
        })}
    </>
  );
}

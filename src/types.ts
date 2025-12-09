export type TreeNodeType = "directory" | "file";

export type TTree = {
  name: string;
  id: string;
  type: TreeNodeType;
  children: TTreeNode[];
};

export type TTreeNode = {
  name: string;
  id: string;
  type: TreeNodeType;
  children?: TTreeNode[];
};

export type DropIntent = "before" | "after" | "inside";

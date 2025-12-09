import { useState } from "react";
import { data } from "./data";
import { Tree } from "./Tree";
import type { TTree } from "./types";

function App() {
  const [tree, setTree] = useState(data);

  return (
    <>
      <main className="grid grid-cols-6">
        <Tree data={tree as TTree} />
        <section></section>
      </main>
    </>
  );
}

export default App;

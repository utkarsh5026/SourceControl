import DirectoryView from "./components/directory/components/directory-view";
import TextEditor from "./components/text-editor/components/text-editor";
import GitView from "./components/git-view/components/git-view";
import { useEffect } from "react";

const App = () => {
  useEffect(() => {
    document.body.classList.add("dark");
  }, []);

  return (
    <div className="h-screen flex bg-background ">
      <div className="w-80 border-r ">
        <DirectoryView />
      </div>
      <div className="flex-1">
        <TextEditor />
      </div>
      <div className="w-120 border-r">
        <GitView />
      </div>
    </div>
  );
};

export default App;

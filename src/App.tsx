import DirectoryView from "./components/directory/components/directory-view";
import TextEditor from "./components/text-editor/components/text-editor";
import { useEffect } from "react";

const App = () => {
  useEffect(() => {
    document.body.classList.add("dark");
  }, []);

  return (
    <div className="h-screen flex bg-background">
      <div className="w-80 border-r ">
        <DirectoryView />
      </div>
      <div className="flex-1">
        <TextEditor />
      </div>
    </div>
  );
};

export default App;

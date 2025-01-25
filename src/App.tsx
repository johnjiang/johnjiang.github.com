import "./App.css";
import Terminal from "./terminal";

function App() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#F1A031]">
      <div className="h-[433px] max-h-screen w-[600px] max-w-screen">
        <Terminal />
      </div>
    </div>
  );
}

export default App;

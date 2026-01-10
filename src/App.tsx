import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Terminal from "./terminal";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/terminal"
        element={
          <div className="h-screen w-full">
            <Terminal />
          </div>
        }
      />
    </Routes>
  );
}

export default App;

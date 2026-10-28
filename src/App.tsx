import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";

const Terminal = lazy(() => import("./terminal"));

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/terminal"
        element={
          <div className="h-screen w-full bg-[#0c0c0c]">
            <Suspense>
              <Terminal />
            </Suspense>
          </div>
        }
      />
    </Routes>
  );
}

export default App;

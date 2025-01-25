import { useState } from "react";
import { ReactTerminal } from "react-terminal";
import "./App.css";
import { SHELL } from "./terminal/constants";
import { FILESYSTEM, FileSystemNode } from "./terminal/filesystem";

function App() {
  const [currentDirectory, setCurrentDirectory] = useState("/home/johnjiang");

  // Helper function to get node at path
  const getNodeAtPath = (path: string): FileSystemNode | null => {
    if (path === "/")
      return { type: "directory", name: "/", children: FILESYSTEM };

    const parts = path.split("/").filter(Boolean);
    let current: Record<string, FileSystemNode> = FILESYSTEM;

    for (const part of parts) {
      if (!current[part] || current[part].type !== "directory") return null;
      current = current[part].children || {};
    }

    return {
      type: "directory",
      name: parts[parts.length - 1],
      children: current,
    };
  };

  const commands = {
    whoami: "johnjiang",
    pwd: () => currentDirectory,
    ls: () => {
      const node = getNodeAtPath(currentDirectory);
      if (!node || !node.children) return "Invalid directory";

      const entries = Object.entries(node.children);
      if (entries.length === 0) return "(empty directory)";

      return entries.map(([name, node]) => {
        const isDirectory = node.type === "directory";
        const displayName = isDirectory ? (
          <span className="text-blue-500">{name}/</span>
        ) : (
          <span className="text-gray-200">{name}</span>
        );
        return displayName;
      });
    },
    cd: (directory: string) => {
      // Handle absolute paths
      if (directory.startsWith("/")) {
        const node = getNodeAtPath(directory);
        if (!node) return `cd: no such directory: ${directory}`;
        setCurrentDirectory(directory);
        return `Changed directory to ${directory}`;
      }

      // Handle parent directory
      if (directory === "..") {
        const newDir =
          currentDirectory.split("/").slice(0, -1).join("/") || "/";
        setCurrentDirectory(newDir);
        return `Changed directory to ${newDir}`;
      }

      // Handle current directory
      if (directory === ".") {
        return `Current directory is ${currentDirectory}`;
      }

      // Handle relative paths
      const newDir = `${currentDirectory}/${directory}`.replace(/\/+/g, "/");
      const node = getNodeAtPath(newDir);
      if (!node) return `cd: no such directory: ${directory}`;
      setCurrentDirectory(newDir);
      return `Changed directory to ${newDir}`;
    },
    cat: (filename: string) => {
      const dir = getNodeAtPath(currentDirectory);
      if (!dir || !dir.children) return "Invalid directory";

      const file = dir.children[filename];
      if (!file) return `cat: ${filename}: No such file or directory`;
      if (file.type === "directory") return `cat: ${filename}: Is a directory`;

      return file.content || "";
    },
    open: (filename: string) => {
      const dir = getNodeAtPath(currentDirectory);
      if (!dir || !dir.children) return "Invalid directory";

      const file = dir.children[filename];
      if (!file) return `open: no such file: ${filename}`;

      if (filename.endsWith(".url")) {
        window.open(file.content, "_blank");
        return `Opening ${filename}...`;
      }

      return `open: cannot open ${filename}`;
    },
  };

  const welcomeMessage = (
    <span>
      Hello, friend
      <br />
      <br />
    </span>
  );

  return (
    <div className="flex h-screen items-center justify-center bg-[#F1A031]">
      <div className="h-[433px] max-h-screen w-[600px] max-w-screen">
        <ReactTerminal
          commands={commands}
          welcomeMessage={welcomeMessage}
          prompt={"$"}
          theme={"dark"}
          errorMessage={(command: string) =>
            `${SHELL}: command not found: ${command}`
          }
        />
      </div>
    </div>
  );
}

export default App;

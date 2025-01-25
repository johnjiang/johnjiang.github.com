import { ReactTerminal, TerminalContextProvider } from "react-terminal";
import { useState } from "react";
import "./App.css";
import { SHELL } from "./terminal/constants";

// Define types for our virtual filesystem
type FileSystemNode = {
  type: "file" | "directory";
  name: string;
  content?: string;
  children?: Record<string, FileSystemNode>;
};

function App() {
  const [currentDirectory, setCurrentDirectory] = useState("/home/johnjiang");

  // Create a virtual filesystem
  const fileSystem: Record<string, FileSystemNode> = {
    home: {
      type: "directory",
      name: "home",
      children: {
        johnjiang: {
          type: "directory",
          name: "johnjiang",
          children: {
            documents: {
              type: "directory",
              name: "documents",
              children: {
                "hello.txt": {
                  type: "file",
                  name: "hello.txt",
                  content: "Hello, World!",
                },
              },
            },
            "notes.txt": {
              type: "file",
              name: "notes.txt",
              content: "Important notes go here",
            },
          },
        },
      },
    },
  };

  // Helper function to get node at path
  const getNodeAtPath = (path: string): FileSystemNode | null => {
    if (path === "/")
      return { type: "directory", name: "/", children: fileSystem };

    const parts = path.split("/").filter(Boolean);
    let current: Record<string, FileSystemNode> = fileSystem;

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
          <span className="text-blue-500">${name}/</span>
        ) : (
          <span className="text-gray-200">${name}</span>
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
  };

  const welcomeMessage = (
    <span>
      Hello, friend
      <br />
      <br />
    </span>
  );

  return (
    <TerminalContextProvider>
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
    </TerminalContextProvider>
  );
}

export default App;

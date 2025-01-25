export type FileSystemNode = {
  type: "file" | "directory";
  name: string;
  content?: string;
  children?: Record<string, FileSystemNode>;
};

export const FILESYSTEM: Record<string, FileSystemNode> = {
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
            name: "resume",
            children: {
              "about.md": {
                type: "file",
                name: "about.md",
                content: "Hello, World!",
              },
              "education.md": {
                type: "file",
                name: "education.md",
                content: "Hello, World!",
              },
              "career.md": {
                type: "file",
                name: "career.md",
                content: "Hello, World!",
              },
            },
          },
          "notes.txt": {
            type: "file",
            name: "notes.txt",
            content: "Important notes go here",
          },
          "github.url": {
            type: "file",
            name: "github.url",
            content: "https://github.com/johnjiang",
          },
          "linkedin.url": {
            type: "file",
            name: "linkedin.url",
            content: "https://linkedin.com/in/johnjiang101",
          },
        },
      },
    },
  },
};

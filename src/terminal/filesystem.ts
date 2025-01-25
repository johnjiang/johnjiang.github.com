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

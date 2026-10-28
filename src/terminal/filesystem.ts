import { HOME, USER } from "./constants";
import {
  ABOUT,
  ATLASSIAN,
  CLARIFY,
  CONTACT,
  EDUCATION,
  MACQUARIE,
  SLACK,
} from "./resume";

export type FileNode = {
  type: "file";
  name: string;
  content: string;
  mtime: Date;
};

export type DirectoryNode = {
  type: "directory";
  name: string;
  children: Record<string, FileSystemNode>;
  mtime: Date;
};

export type FileSystemNode = FileNode | DirectoryNode;

export class FsError extends Error {}

export const fsErrors = {
  notFound: "No such file or directory",
  isDirectory: "Is a directory",
  notDirectory: "Not a directory",
  exists: "File exists",
  notEmpty: "Directory not empty",
};

/** Resolves `path` against `cwd` into a normalized absolute path. */
export function resolvePath(path: string, cwd: string): string {
  if (path === "~" || path.startsWith("~/")) path = HOME + path.slice(1);
  const absolute = path.startsWith("/") ? path : `${cwd}/${path}`;
  const parts: string[] = [];
  for (const part of absolute.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return "/" + parts.join("/");
}

export function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "/";
}

function dirname(path: string): string {
  return "/" + path.split("/").filter(Boolean).slice(0, -1).join("/");
}

function file(name: string, content: string): FileNode {
  return { type: "file", name, content, mtime: new Date() };
}

function dir(name: string, entries: FileSystemNode[] = []): DirectoryNode {
  return {
    type: "directory",
    name,
    children: Object.fromEntries(entries.map((e) => [e.name, e])),
    mtime: new Date(),
  };
}

function clone(node: FileSystemNode, name = node.name): FileSystemNode {
  if (node.type === "file") return { ...node, name, mtime: new Date() };
  return dir(
    name,
    Object.values(node.children).map((child) => clone(child)),
  );
}

export class FileSystem {
  root: DirectoryNode;

  constructor(binaries: string[]) {
    this.root = dir("/", [
      dir(
        "bin",
        binaries.map((name) =>
          file(name, `#!/bin/jsh\n# ${name}: jsh builtin\n`),
        ),
      ),
      dir("etc", [
        file("hostname", "johnos\n"),
        file("motd", "Welcome to JohnOS. Type `help` to get started.\n"),
      ]),
      dir("home", [
        dir(USER, [
          file(
            ".jshrc",
            "# jsh configuration\nalias ll='ls -l'\nalias la='ls -a'\nalias l='ls -la'\n",
          ),
          dir("resume", [
            file("about.md", ABOUT),
            file("contact.md", CONTACT),
            file("education.md", EDUCATION),
            dir("experience", [
              file("clarify.md", CLARIFY),
              file("slack.md", SLACK),
              file("atlassian.md", ATLASSIAN),
              file("macquarie.md", MACQUARIE),
            ]),
          ]),
          file("notes.txt", "Important notes go here\n"),
          file("github.url", "https://github.com/johnjiang\n"),
          file("linkedin.url", "https://linkedin.com/in/johnjiang101\n"),
        ]),
      ]),
      dir("tmp"),
    ]);
  }

  get(path: string): FileSystemNode | null {
    let node: FileSystemNode = this.root;
    for (const part of path.split("/").filter(Boolean)) {
      if (node.type !== "directory") return null;
      const child: FileSystemNode | undefined = node.children[part];
      if (!child) return null;
      node = child;
    }
    return node;
  }

  getDirectory(path: string): DirectoryNode {
    const node = this.get(path);
    if (!node) throw new FsError(fsErrors.notFound);
    if (node.type !== "directory") throw new FsError(fsErrors.notDirectory);
    return node;
  }

  readFile(path: string): string {
    const node = this.get(path);
    if (!node) throw new FsError(fsErrors.notFound);
    if (node.type === "directory") throw new FsError(fsErrors.isDirectory);
    return node.content;
  }

  writeFile(path: string, content: string, append = false) {
    const node = this.get(path);
    if (node?.type === "directory") throw new FsError(fsErrors.isDirectory);
    if (node) {
      node.content = append ? node.content + content : content;
      node.mtime = new Date();
      return;
    }
    const parent = this.getDirectory(dirname(path));
    parent.children[basename(path)] = file(basename(path), content);
    parent.mtime = new Date();
  }

  touch(path: string) {
    const node = this.get(path);
    if (node) node.mtime = new Date();
    else this.writeFile(path, "");
  }

  mkdir(path: string, parents = false) {
    if (!parents) {
      if (this.get(path)) throw new FsError(fsErrors.exists);
      const parent = this.getDirectory(dirname(path));
      parent.children[basename(path)] = dir(basename(path));
      return;
    }
    let current = this.root;
    for (const part of path.split("/").filter(Boolean)) {
      const child: FileSystemNode | undefined = current.children[part];
      if (child && child.type !== "directory")
        throw new FsError(fsErrors.notDirectory);
      current = child ?? (current.children[part] = dir(part));
    }
  }

  remove(path: string, recursive = false) {
    const node = this.get(path);
    if (!node || path === "/") throw new FsError(fsErrors.notFound);
    if (node.type === "directory" && !recursive)
      throw new FsError(fsErrors.isDirectory);
    delete this.getDirectory(dirname(path)).children[node.name];
  }

  rmdir(path: string) {
    const node = this.getDirectory(path);
    if (Object.keys(node.children).length > 0)
      throw new FsError(fsErrors.notEmpty);
    this.remove(path, true);
  }

  /** Copies or moves `src` to `dest`, placing it inside `dest` if that is a directory. */
  transfer(src: string, dest: string, move: boolean) {
    const node = this.get(src);
    if (!node) throw new FsError(fsErrors.notFound);
    const target = this.get(dest);
    const destPath =
      target?.type === "directory"
        ? `${dest}/${node.name}`.replace("//", "/")
        : dest;
    if (destPath === src) return;
    if (destPath.startsWith(src + "/"))
      throw new FsError("cannot copy a directory into itself");
    if (this.get(destPath)?.type === "directory")
      throw new FsError(fsErrors.isDirectory);
    const parent = this.getDirectory(dirname(destPath));
    if (move) this.remove(src, true);
    parent.children[basename(destPath)] = move
      ? { ...node, name: basename(destPath) }
      : clone(node, basename(destPath));
  }
}

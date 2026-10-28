import {
  HOME,
  HOST,
  OS_NAME,
  OS_VERSION,
  SHELL,
  USER,
  ansi,
  visibleLength,
} from "./constants";
import { FsError, basename, type FileSystemNode } from "./filesystem";
import { RESUME_FILES } from "./resume";
import type { Command, CommandContext } from "./shell";

type Options = { flags: Record<string, string | true>; operands: string[] };

/**
 * Minimal getopt: `spec` lists single-letter flags, with `:` after flags that take
 * a value (e.g. "n:"). Combined flags (`-la`) and `--` are supported.
 * Returns null after reporting an invalid option.
 */
function getopt(ctx: CommandContext, spec: string): Options | null {
  const flags: Options["flags"] = {};
  const operands: string[] = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const arg = ctx.args[i];
    if (arg === "--") {
      operands.push(...ctx.args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      operands.push(arg);
      continue;
    }
    for (let j = 1; j < arg.length; j++) {
      const flag = arg[j];
      const index = spec.indexOf(flag);
      if (index < 0) {
        ctx.err(`invalid option -- '${flag}'`);
        ctx.err(`usage: ${commands[ctx.name].usage}`);
        return null;
      }
      if (spec[index + 1] !== ":") {
        flags[flag] = true;
        continue;
      }
      const value = arg.slice(j + 1) || ctx.args[++i];
      if (value === undefined) {
        ctx.err(`option requires an argument -- '${flag}'`);
        return null;
      }
      flags[flag] = value;
      break;
    }
  }
  return { flags, operands };
}

/** Lays items out in columns, top-to-bottom then left-to-right, like `ls`. */
export function columnize(items: string[], width: number): string {
  if (items.length === 0) return "";
  const widths = items.map(visibleLength);
  const gap = 2;
  for (let columns = items.length; columns >= 1; columns--) {
    const rows = Math.ceil(items.length / columns);
    const used = Math.ceil(items.length / rows);
    const columnWidths = Array.from({ length: used }, (_, c) =>
      Math.max(...widths.slice(c * rows, (c + 1) * rows)),
    );
    const total = columnWidths.reduce((a, b) => a + b, 0) + gap * (used - 1);
    if (total > width && columns > 1) continue;
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      let line = "";
      for (let c = 0; c < used; c++) {
        const i = c * rows + r;
        if (i >= items.length) break;
        const isLastInRow =
          c === used - 1 || (c + 1) * rows + r >= items.length;
        line += isLastInRow
          ? items[i]
          : items[i] + " ".repeat(columnWidths[c] - widths[i] + gap);
      }
      lines.push(line);
    }
    return lines.join("\n") + "\n";
  }
  return "";
}

function colorName(node: FileSystemNode, name: string, isTTY: boolean) {
  if (!isTTY) return name;
  if (node.type === "directory") return `${ansi.boldBlue}${name}${ansi.reset}`;
  if (name.endsWith(".url")) return `${ansi.cyan}${name}${ansi.reset}`;
  if (node.content.startsWith("#!"))
    return `${ansi.boldGreen}${name}${ansi.reset}`;
  return name;
}

function formatDate(date: Date) {
  const month = date.toLocaleString("en-US", { month: "short" });
  const time = date.toTimeString().slice(0, 5);
  return `${month} ${String(date.getDate()).padStart(2)} ${time}`;
}

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return `${Math.floor(ms / 1000)} secs`;
  const hours = Math.floor(minutes / 60);
  const mins = `${minutes % 60} min${minutes % 60 === 1 ? "" : "s"}`;
  return hours > 0 ? `${hours} hour${hours === 1 ? "" : "s"}, ${mins}` : mins;
}

/** Reads each operand (or stdin when there are none / for `-`). */
function readInputs(
  ctx: CommandContext,
  operands: string[],
): { name: string; content: string }[] | null {
  if (operands.length === 0) {
    if (ctx.stdin === null) {
      ctx.err("missing file operand");
      return null;
    }
    return [{ name: "-", content: ctx.stdin }];
  }
  const inputs: { name: string; content: string }[] = [];
  for (const name of operands) {
    if (name === "-") {
      inputs.push({ name, content: ctx.stdin ?? "" });
      continue;
    }
    try {
      inputs.push({ name, content: ctx.fs.readFile(ctx.resolve(name)) });
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
      ctx.err(`${name}: ${error.message}`);
    }
  }
  return inputs;
}

function lines(text: string): string[] {
  const result = text.split("\n");
  if (result[result.length - 1] === "") result.pop();
  return result;
}

function walk(
  node: FileSystemNode,
  path: string,
  visit: (node: FileSystemNode, path: string) => void,
) {
  visit(node, path);
  if (node.type !== "directory") return;
  for (const child of Object.values(node.children).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    walk(
      child,
      path.endsWith("/") ? path + child.name : `${path}/${child.name}`,
      visit,
    );
  }
}

function globToRegex(pattern: string, ignoreCase: boolean) {
  const source = pattern
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${source}$`, ignoreCase ? "i" : "");
}

const cat: Command = {
  summary: "print file contents",
  usage: "cat [-n] [file ...]",
  run(ctx) {
    const options = getopt(ctx, "n");
    if (!options) return 2;
    const inputs = readInputs(ctx, options.operands);
    if (!inputs) return 1;
    const text = inputs.map((input) => input.content).join("");
    if (!options.flags.n) ctx.out(text);
    else
      ctx.out(
        lines(text)
          .map((line, i) => `${String(i + 1).padStart(6)}\t${line}\n`)
          .join(""),
      );
    return inputs.length === Math.max(options.operands.length, 1) ? 0 : 1;
  },
};

const notAvailable = (alternative: string): Command => ({
  summary: "not installed",
  usage: "",
  hidden: true,
  run(ctx) {
    ctx.err(`not available on ${OS_NAME}. Try \`${alternative}\` instead.`);
    return 127;
  },
});

export const commands: Record<string, Command> = {
  help: {
    summary: "list available commands and keyboard shortcuts",
    usage: "help [command]",
    complete: "commands",
    run(ctx) {
      if (ctx.args[0]) return commands.man.run(ctx);
      const visible = Object.entries(commands).filter(([, c]) => !c.hidden);
      const width = Math.max(...visible.map(([name]) => name.length)) + 2;
      const heading = (text: string) =>
        ctx.isTTY ? `${ansi.bold}${text}${ansi.reset}` : text;
      ctx.out(`${heading("Commands")}\n`);
      for (const [name, command] of visible) {
        ctx.out(
          `  ${(ctx.isTTY ? ansi.cyan : "") + name.padEnd(width) + (ctx.isTTY ? ansi.reset : "")}${command.summary}\n`,
        );
      }
      ctx.out(`
${heading("Shell features")}
  pipes (ls | grep md), redirects (> >> <), chaining (; && ||),
  globs (*.md), quotes, $VARIABLES, ~, aliases, !! and !n history

${heading("Keyboard shortcuts")}
  Tab                 complete commands, files and $VARIABLES
  Up / Down, ^P / ^N  previous / next command in history
  ^R                  reverse search history (^R again for older)
  ^A / ^E, Home/End   jump to start / end of line
  ^B / ^F, ←/→        move back / forward one character
  Alt+B / Alt+F       move back / forward one word
  ^U / ^K             delete to start / end of line
  ^W, Alt+Backspace   delete previous word
  Alt+D               delete next word
  ^Y                  paste last deleted text
  ^T                  swap the two characters before the cursor
  Alt+.               insert last argument of previous command
  ^L, Cmd+K           clear the screen
  ^C                  cancel the current line
  ^D                  delete character, or exit on an empty line

Run \`man <command>\` for details, or start with \`cat resume/about.md\`.
`);
      return 0;
    },
  },

  man: {
    summary: "show the manual for a command",
    usage: "man <command>",
    complete: "commands",
    run(ctx) {
      const name = ctx.args[0];
      if (!name) {
        ctx.err("What manual page do you want?");
        return 1;
      }
      const command = commands[name];
      if (!command) {
        ctx.err(`No manual entry for ${name}`);
        return 1;
      }
      const b = (text: string) =>
        ctx.isTTY ? `${ansi.bold}${text}${ansi.reset}` : text;
      ctx.out(
        `${b("NAME")}\n    ${name} - ${command.summary}\n\n${b("SYNOPSIS")}\n    ${command.usage}\n`,
      );
      return 0;
    },
  },

  ls: {
    summary: "list directory contents",
    usage: "ls [-a] [-l] [-1] [-d] [path ...]",
    run(ctx) {
      const options = getopt(ctx, "al1dA");
      if (!options) return 2;
      const { flags } = options;
      const targets = options.operands.length > 0 ? options.operands : ["."];
      let status = 0;

      const format = (entries: [string, FileSystemNode][]) => {
        if (flags.l) {
          const sizes = entries.map(([, node]) =>
            String(node.type === "directory" ? 4096 : node.content.length),
          );
          const sizeWidth = Math.max(...sizes.map((s) => s.length));
          return entries
            .map(([name, node], i) => {
              const mode =
                node.type === "directory" ? "drwxr-xr-x" : "-rw-r--r--";
              const linkCount =
                node.type === "directory"
                  ? Object.keys(node.children).length + 2
                  : 1;
              return `${mode} ${String(linkCount).padStart(2)} ${USER} staff ${sizes[i].padStart(sizeWidth)} ${formatDate(node.mtime)} ${colorName(node, name, ctx.isTTY)}\n`;
            })
            .join("");
        }
        const names = entries.map(([name, node]) =>
          colorName(node, name, ctx.isTTY),
        );
        if (flags["1"] || !ctx.isTTY)
          return names.map((n) => n + "\n").join("");
        return columnize(names, ctx.shell.columns);
      };

      const files: [string, FileSystemNode][] = [];
      const directories: [string, FileSystemNode][] = [];
      for (const target of targets) {
        const path = ctx.resolve(target);
        const node = ctx.fs.get(path);
        if (!node) {
          ctx.err(`cannot access '${target}': No such file or directory`);
          status = 2;
        } else if (node.type === "file" || flags.d) files.push([target, node]);
        else directories.push([target, node]);
      }

      const sections: string[] = [];
      if (files.length > 0) sections.push(format(files));
      for (const [target, node] of directories) {
        if (node.type !== "directory") continue;
        let entries = Object.entries(node.children).sort(([a], [b]) =>
          a.localeCompare(b),
        );
        if (!flags.a && !flags.A)
          entries = entries.filter(([name]) => !name.startsWith("."));
        if (flags.a) {
          const parent = ctx.fs.get(ctx.resolve(`${target}/..`)) ?? node;
          entries = [[".", node], ["..", parent], ...entries];
        }
        const header = targets.length > 1 ? `${target}:\n` : "";
        const total = flags.l ? `total ${entries.length}\n` : "";
        sections.push(header + total + format(entries));
      }
      ctx.out(sections.join("\n"));
      return status;
    },
  },

  cd: {
    summary: "change the working directory",
    usage: "cd [dir | - | ~]",
    complete: "directories",
    run(ctx) {
      const target = ctx.args[0] ?? HOME;
      const path = target === "-" ? ctx.shell.env.OLDPWD : ctx.resolve(target);
      const node = ctx.fs.get(path);
      if (!node) {
        ctx.err(`no such file or directory: ${target}`);
        return 1;
      }
      if (node.type !== "directory") {
        ctx.err(`not a directory: ${target}`);
        return 1;
      }
      ctx.shell.setCwd(path);
      if (target === "-") ctx.out(ctx.shell.displayPath(path) + "\n");
      return 0;
    },
  },

  pwd: {
    summary: "print the working directory",
    usage: "pwd",
    complete: "none",
    run(ctx) {
      ctx.out(ctx.shell.cwd + "\n");
      return 0;
    },
  },

  cat,
  less: {
    ...cat,
    summary: "view a file (same as cat here)",
    usage: "less [file ...]",
  },
  more: {
    ...cat,
    summary: "view a file (same as cat here)",
    usage: "more [file ...]",
    hidden: true,
  },

  head: {
    summary: "print the first lines of a file",
    usage: "head [-n count] [file ...]",
    run(ctx) {
      ctx.args = ctx.args.map((a) =>
        /^-\d+$/.test(a) ? `-n${a.slice(1)}` : a,
      );
      const options = getopt(ctx, "n:");
      if (!options) return 2;
      const count = Number(options.flags.n ?? 10);
      const inputs = readInputs(ctx, options.operands);
      if (!inputs) return 1;
      inputs.forEach((input, i) => {
        if (inputs.length > 1)
          ctx.out(`${i > 0 ? "\n" : ""}==> ${input.name} <==\n`);
        ctx.out(
          lines(input.content)
            .slice(0, count)
            .map((l) => l + "\n")
            .join(""),
        );
      });
      return 0;
    },
  },

  tail: {
    summary: "print the last lines of a file",
    usage: "tail [-n count] [file ...]",
    run(ctx) {
      ctx.args = ctx.args.map((a) =>
        /^-\d+$/.test(a) ? `-n${a.slice(1)}` : a,
      );
      const options = getopt(ctx, "n:");
      if (!options) return 2;
      const count = Number(options.flags.n ?? 10);
      const inputs = readInputs(ctx, options.operands);
      if (!inputs) return 1;
      inputs.forEach((input, i) => {
        if (inputs.length > 1)
          ctx.out(`${i > 0 ? "\n" : ""}==> ${input.name} <==\n`);
        const all = lines(input.content);
        ctx.out(
          all
            .slice(Math.max(all.length - count, 0))
            .map((l) => l + "\n")
            .join(""),
        );
      });
      return 0;
    },
  },

  grep: {
    summary: "search for a pattern in files",
    usage: "grep [-icnlvr] pattern [file ...]",
    run(ctx) {
      const options = getopt(ctx, "icnlvrRE");
      if (!options) return 2;
      const { flags } = options;
      const [pattern, ...targets] = options.operands;
      if (pattern === undefined) {
        ctx.err(`usage: ${commands.grep.usage}`);
        return 2;
      }
      const recursive = flags.r || flags.R;
      const regexFlags = flags.i ? "gi" : "g";
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, regexFlags);
      } catch {
        regex = new RegExp(
          pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          regexFlags,
        );
      }

      const sources: { name: string; content: string }[] = [];
      if (targets.length === 0 && !recursive) {
        if (ctx.stdin === null) {
          ctx.err(`usage: ${commands.grep.usage}`);
          return 2;
        }
        sources.push({ name: "(standard input)", content: ctx.stdin });
      }
      for (const target of targets.length > 0
        ? targets
        : recursive
          ? ["."]
          : []) {
        const node = ctx.fs.get(ctx.resolve(target));
        if (!node) {
          ctx.err(`${target}: No such file or directory`);
          continue;
        }
        if (node.type === "directory" && !recursive) {
          ctx.err(`${target}: Is a directory`);
          continue;
        }
        walk(node, target, (child, path) => {
          if (child.type === "file")
            sources.push({ name: path, content: child.content });
        });
      }

      const showName = sources.length > 1 || recursive;
      let matched = false;
      for (const source of sources) {
        let count = 0;
        lines(source.content).forEach((line, i) => {
          regex.lastIndex = 0;
          if (regex.test(line) === Boolean(flags.v)) return;
          count++;
          matched = true;
          if (flags.c || flags.l) return;
          const name = showName
            ? ctx.isTTY
              ? `${ansi.magenta}${source.name}${ansi.reset}:`
              : `${source.name}:`
            : "";
          const number = flags.n
            ? ctx.isTTY
              ? `${ansi.green}${i + 1}${ansi.reset}:`
              : `${i + 1}:`
            : "";
          const text =
            ctx.isTTY && !flags.v
              ? line.replace(regex, (m) => `${ansi.boldRed}${m}${ansi.reset}`)
              : line;
          ctx.out(`${name}${number}${text}\n`);
        });
        if (flags.l && count > 0) ctx.out(source.name + "\n");
        else if (flags.c)
          ctx.out(`${showName ? source.name + ":" : ""}${count}\n`);
      }
      return matched ? 0 : 1;
    },
  },

  find: {
    summary: "search for files in a directory tree",
    usage: "find [path ...] [-name pattern] [-iname pattern] [-type f|d]",
    run(ctx) {
      const paths: string[] = [];
      let i = 0;
      while (i < ctx.args.length && !ctx.args[i].startsWith("-"))
        paths.push(ctx.args[i++]);
      const tests: ((node: FileSystemNode, name: string) => boolean)[] = [];
      while (i < ctx.args.length) {
        const [flag, value] = [ctx.args[i], ctx.args[i + 1]];
        if (value === undefined) {
          ctx.err(`missing argument to \`${flag}'`);
          return 1;
        }
        if (flag === "-name" || flag === "-iname") {
          const regex = globToRegex(value, flag === "-iname");
          tests.push((_, name) => regex.test(name));
        } else if (flag === "-type") {
          tests.push((node) =>
            value === "d" ? node.type === "directory" : node.type === "file",
          );
        } else {
          ctx.err(`unknown predicate \`${flag}'`);
          return 1;
        }
        i += 2;
      }
      let status = 0;
      for (const path of paths.length > 0 ? paths : ["."]) {
        const node = ctx.fs.get(ctx.resolve(path));
        if (!node) {
          ctx.err(`'${path}': No such file or directory`);
          status = 1;
          continue;
        }
        walk(node, path, (child, childPath) => {
          if (tests.every((test) => test(child, basename(childPath))))
            ctx.out(childPath + "\n");
        });
      }
      return status;
    },
  },

  tree: {
    summary: "show a directory as a tree",
    usage: "tree [-a] [dir]",
    complete: "directories",
    run(ctx) {
      const options = getopt(ctx, "a");
      if (!options) return 2;
      const target = options.operands[0] ?? ".";
      const root = ctx.fs.getDirectory(ctx.resolve(target));
      let directories = 0;
      let files = 0;
      const draw = (node: FileSystemNode, prefix: string) => {
        if (node.type !== "directory") return;
        const children = Object.values(node.children)
          .filter((c) => options.flags.a || !c.name.startsWith("."))
          .sort((a, b) => a.name.localeCompare(b.name));
        children.forEach((child, i) => {
          const last = i === children.length - 1;
          if (child.type === "directory") directories++;
          else files++;
          ctx.out(
            `${prefix}${last ? "└── " : "├── "}${colorName(child, child.name, ctx.isTTY)}\n`,
          );
          draw(child, prefix + (last ? "    " : "│   "));
        });
      };
      ctx.out(colorName(root, target, ctx.isTTY) + "\n");
      draw(root, "");
      ctx.out(
        `\n${directories} director${directories === 1 ? "y" : "ies"}, ${files} file${files === 1 ? "" : "s"}\n`,
      );
      return 0;
    },
  },

  wc: {
    summary: "count lines, words and characters",
    usage: "wc [-lwc] [file ...]",
    run(ctx) {
      const options = getopt(ctx, "lwcm");
      if (!options) return 2;
      const { flags } = options;
      const all = !flags.l && !flags.w && !flags.c && !flags.m;
      const inputs = readInputs(ctx, options.operands);
      if (!inputs) return 1;
      const totals = [0, 0, 0];
      const row = (counts: number[], name: string) => {
        const shown = counts.filter(
          (_, i) => all || [flags.l, flags.w, flags.c || flags.m][i],
        );
        ctx.out(
          shown.map((n) => String(n).padStart(8)).join("") +
            (name === "-" ? "" : ` ${name}`) +
            "\n",
        );
      };
      for (const input of inputs) {
        const counts = [
          (input.content.match(/\n/g) ?? []).length,
          input.content.split(/\s+/).filter(Boolean).length,
          input.content.length,
        ];
        counts.forEach((n, i) => (totals[i] += n));
        row(counts, input.name);
      }
      if (inputs.length > 1) row(totals, "total");
      return 0;
    },
  },

  sort: {
    summary: "sort lines of text",
    usage: "sort [-rnu] [file ...]",
    run(ctx) {
      const options = getopt(ctx, "rnuf");
      if (!options) return 2;
      const { flags } = options;
      const inputs = readInputs(ctx, options.operands);
      if (!inputs) return 1;
      let result = inputs.flatMap((input) => lines(input.content));
      result.sort((a, b) =>
        flags.n
          ? parseFloat(a) - parseFloat(b) || a.localeCompare(b)
          : flags.f
            ? a.toLowerCase().localeCompare(b.toLowerCase())
            : a < b
              ? -1
              : a > b
                ? 1
                : 0,
      );
      if (flags.r) result.reverse();
      if (flags.u) result = [...new Set(result)];
      ctx.out(result.map((l) => l + "\n").join(""));
      return 0;
    },
  },

  uniq: {
    summary: "filter adjacent duplicate lines",
    usage: "uniq [-c] [file]",
    run(ctx) {
      const options = getopt(ctx, "c");
      if (!options) return 2;
      const inputs = readInputs(ctx, options.operands);
      if (!inputs) return 1;
      const groups: [string, number][] = [];
      for (const line of inputs.flatMap((input) => lines(input.content))) {
        const last = groups[groups.length - 1];
        if (last && last[0] === line) last[1]++;
        else groups.push([line, 1]);
      }
      ctx.out(
        groups
          .map(([line, n]) =>
            options.flags.c
              ? `${String(n).padStart(7)} ${line}\n`
              : line + "\n",
          )
          .join(""),
      );
      return 0;
    },
  },

  echo: {
    summary: "print arguments",
    usage: "echo [-n] [-e] [text ...]",
    complete: "none",
    run(ctx) {
      let args = ctx.args;
      let newline = true;
      let escapes = false;
      while (args[0] && /^-[ne]+$/.test(args[0])) {
        if (args[0].includes("n")) newline = false;
        if (args[0].includes("e")) escapes = true;
        args = args.slice(1);
      }
      let text = args.join(" ");
      if (escapes)
        text = text
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\\\/g, "\\");
      ctx.out(text + (newline ? "\n" : ""));
      return 0;
    },
  },

  touch: {
    summary: "create empty files or update timestamps",
    usage: "touch file ...",
    run(ctx) {
      if (ctx.args.length === 0) {
        ctx.err("missing file operand");
        return 1;
      }
      let status = 0;
      for (const target of ctx.args) {
        try {
          ctx.fs.touch(ctx.resolve(target));
        } catch (error) {
          if (!(error instanceof FsError)) throw error;
          ctx.err(`cannot touch '${target}': ${error.message}`);
          status = 1;
        }
      }
      return status;
    },
  },

  mkdir: {
    summary: "make directories",
    usage: "mkdir [-p] dir ...",
    complete: "directories",
    run(ctx) {
      const options = getopt(ctx, "p");
      if (!options) return 2;
      if (options.operands.length === 0) {
        ctx.err("missing operand");
        return 1;
      }
      let status = 0;
      for (const target of options.operands) {
        try {
          ctx.fs.mkdir(ctx.resolve(target), Boolean(options.flags.p));
        } catch (error) {
          if (!(error instanceof FsError)) throw error;
          ctx.err(`cannot create directory '${target}': ${error.message}`);
          status = 1;
        }
      }
      return status;
    },
  },

  rmdir: {
    summary: "remove empty directories",
    usage: "rmdir dir ...",
    complete: "directories",
    run(ctx) {
      let status = 0;
      for (const target of ctx.args) {
        try {
          ctx.fs.rmdir(ctx.resolve(target));
        } catch (error) {
          if (!(error instanceof FsError)) throw error;
          ctx.err(`failed to remove '${target}': ${error.message}`);
          status = 1;
        }
      }
      return status;
    },
  },

  rm: {
    summary: "remove files or directories",
    usage: "rm [-rf] file ...",
    run(ctx) {
      const options = getopt(ctx, "rRfi");
      if (!options) return 2;
      const { flags } = options;
      if (options.operands.length === 0 && !flags.f) {
        ctx.err("missing operand");
        return 1;
      }
      let status = 0;
      for (const target of options.operands) {
        const path = ctx.resolve(target);
        if (path === "/") {
          ctx.err("it is dangerous to operate recursively on '/'");
          return 1;
        }
        const node = ctx.fs.get(path);
        if (!node) {
          if (!flags.f) {
            ctx.err(`cannot remove '${target}': No such file or directory`);
            status = 1;
          }
          continue;
        }
        if (node.type === "directory" && !flags.r && !flags.R) {
          ctx.err(`cannot remove '${target}': Is a directory`);
          status = 1;
          continue;
        }
        ctx.fs.remove(path, true);
      }
      return status;
    },
  },

  cp: {
    summary: "copy files and directories",
    usage: "cp [-r] source ... dest",
    run(ctx) {
      const options = getopt(ctx, "rR");
      if (!options) return 2;
      return transfer(ctx, options, false);
    },
  },

  mv: {
    summary: "move or rename files",
    usage: "mv source ... dest",
    run(ctx) {
      const options = getopt(ctx, "f");
      if (!options) return 2;
      return transfer(ctx, options, true);
    },
  },

  open: {
    summary: "open a .url file or link in a new tab",
    usage: "open <file.url | url> ...",
    run(ctx) {
      if (ctx.args.length === 0) {
        ctx.err(`usage: ${commands.open.usage}`);
        return 1;
      }
      let status = 0;
      for (const target of ctx.args) {
        if (/^https?:\/\//.test(target)) {
          ctx.shell.open(target);
          continue;
        }
        const node = ctx.fs.get(ctx.resolve(target));
        if (!node) {
          ctx.err(`${target}: No such file or directory`);
          status = 1;
        } else if (node.type === "file" && target.endsWith(".url")) {
          ctx.out(`Opening ${node.content.trim()}...\n`);
          ctx.shell.open(node.content.trim());
        } else {
          ctx.err(
            `no application knows how to open ${target}. Try \`cat ${target}\`.`,
          );
          status = 1;
        }
      }
      return status;
    },
  },

  resume: {
    summary: "print my whole resume",
    usage: "resume",
    complete: "none",
    run(ctx) {
      const rule = "─".repeat(Math.min(ctx.shell.columns, 80));
      const sections = RESUME_FILES.map((file) =>
        ctx.fs.get(`${HOME}/resume/${file}`),
      ).flatMap((node) =>
        node?.type === "file" ? [node.content.trimEnd()] : [],
      );
      ctx.out(
        sections.join(
          `\n\n${ctx.isTTY ? ansi.dim + rule + ansi.reset : rule}\n\n`,
        ) + "\n",
      );
      return 0;
    },
  },

  neofetch: {
    summary: "show system information",
    usage: "neofetch",
    complete: "none",
    run(ctx) {
      const c = (color: string, text: string) =>
        ctx.isTTY ? color + text + ansi.reset : text;
      const info = [
        `${c(ansi.boldCyan, USER)}@${c(ansi.boldCyan, HOST)}`,
        "-".repeat(`${USER}@${HOST}`.length),
        ["OS", `${OS_NAME} ${OS_VERSION}`],
        ["Host", "johnjiang.me"],
        ["Kernel", `${SHELL}-${OS_VERSION}`],
        ["Uptime", formatDuration(Date.now() - ctx.shell.startedAt.getTime())],
        ["Shell", SHELL],
        ["Terminal", "xterm.js"],
        ["Role", "Senior Staff Software Engineer @ Clarify"],
        ["Location", "San Francisco, CA"],
      ].map((entry) =>
        typeof entry === "string"
          ? entry
          : `${c(ansi.boldCyan, entry[0])}: ${entry[1]}`,
      );
      const art = [
        "",
        "      ████",
        "        ██",
        "        ██",
        "  ██    ██",
        "   ██████",
        "",
      ];
      if (ctx.shell.columns < 64) {
        ctx.out(info.join("\n") + "\n");
        return 0;
      }
      const height = Math.max(art.length, info.length);
      for (let i = 0; i < height; i++) {
        const left = (art[i] ?? "").padEnd(12);
        ctx.out(`${c(ansi.cyan, left)}  ${info[i] ?? ""}\n`);
      }
      return 0;
    },
  },

  history: {
    summary: "show command history",
    usage: "history [-c] [count]",
    complete: "none",
    run(ctx) {
      const history = ctx.shell.history;
      if (ctx.args[0] === "-c") {
        history.length = 0;
        return 0;
      }
      const count = Number(ctx.args[0] ?? history.length);
      const start = Math.max(history.length - count, 0);
      history.slice(start).forEach((entry, i) => {
        ctx.out(`${String(start + i + 1).padStart(5)}  ${entry}\n`);
      });
      return 0;
    },
  },

  alias: {
    summary: "define or list aliases",
    usage: "alias [name[=value] ...]",
    complete: "none",
    run(ctx) {
      const { aliases } = ctx.shell;
      const show = (name: string) =>
        ctx.out(`alias ${name}='${aliases[name]}'\n`);
      if (ctx.args.length === 0) Object.keys(aliases).sort().forEach(show);
      let status = 0;
      for (const arg of ctx.args) {
        const eq = arg.indexOf("=");
        if (eq > 0) aliases[arg.slice(0, eq)] = arg.slice(eq + 1);
        else if (aliases[arg] !== undefined) show(arg);
        else {
          ctx.err(`${arg}: not found`);
          status = 1;
        }
      }
      return status;
    },
  },

  unalias: {
    summary: "remove aliases",
    usage: "unalias [-a] name ...",
    complete: "none",
    run(ctx) {
      const { aliases } = ctx.shell;
      if (ctx.args[0] === "-a") {
        for (const name of Object.keys(aliases)) delete aliases[name];
        return 0;
      }
      let status = 0;
      for (const name of ctx.args) {
        if (aliases[name] === undefined) {
          ctx.err(`${name}: not found`);
          status = 1;
        }
        delete aliases[name];
      }
      return status;
    },
  },

  env: {
    summary: "print environment variables",
    usage: "env",
    complete: "none",
    run(ctx) {
      for (const [key, value] of Object.entries(ctx.shell.env))
        ctx.out(`${key}=${value}\n`);
      return 0;
    },
  },

  export: {
    summary: "set environment variables",
    usage: "export [NAME=value ...]",
    complete: "none",
    run(ctx) {
      if (ctx.args.length === 0) return commands.env.run(ctx);
      for (const arg of ctx.args) {
        const eq = arg.indexOf("=");
        if (eq > 0) ctx.shell.env[arg.slice(0, eq)] = arg.slice(eq + 1);
        else ctx.shell.env[arg] ??= "";
      }
      return 0;
    },
  },

  unset: {
    summary: "remove environment variables",
    usage: "unset NAME ...",
    complete: "none",
    run(ctx) {
      for (const name of ctx.args) delete ctx.shell.env[name];
      return 0;
    },
  },

  which: {
    summary: "locate a command",
    usage: "which command ...",
    complete: "commands",
    run(ctx) {
      let status = 0;
      for (const name of ctx.args) {
        if (ctx.shell.aliases[name] !== undefined)
          ctx.out(`${name}: aliased to ${ctx.shell.aliases[name]}\n`);
        else if (commands[name]) ctx.out(`/bin/${name}\n`);
        else {
          ctx.out(`${name} not found\n`);
          status = 1;
        }
      }
      return status;
    },
  },

  type: {
    summary: "describe how a name would be interpreted",
    usage: "type name ...",
    complete: "commands",
    run(ctx) {
      let status = 0;
      for (const name of ctx.args) {
        if (ctx.shell.aliases[name] !== undefined)
          ctx.out(`${name} is an alias for ${ctx.shell.aliases[name]}\n`);
        else if (commands[name]) ctx.out(`${name} is /bin/${name}\n`);
        else {
          ctx.err(`${name}: not found`);
          status = 1;
        }
      }
      return status;
    },
  },

  clear: {
    summary: "clear the screen",
    usage: "clear",
    complete: "none",
    run(ctx) {
      ctx.shell.clear();
      return 0;
    },
  },

  date: {
    summary: "print the date and time",
    usage: "date",
    complete: "none",
    run(ctx) {
      const now = new Date();
      const zone =
        new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
          .formatToParts(now)
          .find((part) => part.type === "timeZoneName")?.value ?? "";
      const day = now.toLocaleString("en-US", { weekday: "short" });
      const month = now.toLocaleString("en-US", { month: "short" });
      ctx.out(
        `${day} ${month} ${String(now.getDate()).padStart(2)} ${now.toTimeString().slice(0, 8)} ${zone} ${now.getFullYear()}\n`,
      );
      return 0;
    },
  },

  uptime: {
    summary: "show how long this session has been running",
    usage: "uptime",
    complete: "none",
    run(ctx) {
      const time = new Date().toTimeString().slice(0, 5);
      const up = formatDuration(Date.now() - ctx.shell.startedAt.getTime());
      ctx.out(`${time}  up ${up}, 1 user, load averages: 0.00 0.01 0.05\n`);
      return 0;
    },
  },

  uname: {
    summary: "print system information",
    usage: "uname [-asnrmo]",
    complete: "none",
    run(ctx) {
      const options = getopt(ctx, "asnrmo");
      if (!options) return 2;
      const { flags } = options;
      const parts = [
        [flags.s || flags.a, OS_NAME],
        [flags.n || flags.a, HOST],
        [flags.r || flags.a, OS_VERSION],
        [flags.m || flags.a, "wasm64"],
        [flags.o || flags.a, "JohnOS/jsh"],
      ].flatMap(([on, value]) => (on ? [value] : []));
      ctx.out((parts.length > 0 ? parts.join(" ") : OS_NAME) + "\n");
      return 0;
    },
  },

  whoami: {
    summary: "print the current user",
    usage: "whoami",
    complete: "none",
    run(ctx) {
      ctx.out(USER + "\n");
      return 0;
    },
  },

  hostname: {
    summary: "print the host name",
    usage: "hostname",
    complete: "none",
    run(ctx) {
      ctx.out(HOST + "\n");
      return 0;
    },
  },

  true: {
    summary: "do nothing, successfully",
    usage: "true",
    hidden: true,
    run: () => 0,
  },
  false: {
    summary: "do nothing, unsuccessfully",
    usage: "false",
    hidden: true,
    run: () => 1,
  },

  sudo: {
    summary: "run a command as root",
    usage: "sudo command",
    complete: "commands",
    hidden: true,
    run(ctx) {
      ctx.err(
        `${USER} is not in the sudoers file. This incident will be reported.`,
      );
      return 1;
    },
  },

  vim: notAvailable("cat"),
  vi: notAvailable("cat"),
  nano: notAvailable("cat"),
  emacs: notAvailable("cat"),

  exit: {
    summary: "leave the terminal",
    usage: "exit",
    complete: "none",
    run(ctx) {
      ctx.shell.exit();
      return 0;
    },
  },
};

function transfer(
  ctx: CommandContext,
  options: Options,
  move: boolean,
): number {
  const verb = move ? "mv" : "cp";
  const { operands } = options;
  if (operands.length < 2) {
    ctx.err(
      operands.length === 0
        ? "missing file operand"
        : `missing destination file operand after '${operands[0]}'`,
    );
    return 1;
  }
  const destination = operands[operands.length - 1];
  const destinationPath = ctx.resolve(destination);
  const sources = operands.slice(0, -1);
  if (sources.length > 1 && ctx.fs.get(destinationPath)?.type !== "directory") {
    ctx.err(`target '${destination}' is not a directory`);
    return 1;
  }
  let status = 0;
  for (const source of sources) {
    const node = ctx.fs.get(ctx.resolve(source));
    if (
      node?.type === "directory" &&
      !move &&
      !options.flags.r &&
      !options.flags.R
    ) {
      ctx.err(`-r not specified; omitting directory '${source}'`);
      status = 1;
      continue;
    }
    try {
      ctx.fs.transfer(ctx.resolve(source), destinationPath, move);
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
      ctx.err(
        `cannot ${verb === "mv" ? "move" : "copy"} '${source}': ${error.message}`,
      );
      status = 1;
    }
  }
  return status;
}

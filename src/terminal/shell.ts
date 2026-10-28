import { commands } from "./commands";
import { HOME, HOST, SHELL, USER, ansi, stripAnsi } from "./constants";
import { FileSystem, FsError, resolvePath } from "./filesystem";

export type ShellHooks = {
  write: (text: string) => void;
  clear: () => void;
  exit: () => void;
  open: (url: string) => void;
  columns: () => number;
};

export type CommandContext = {
  name: string;
  args: string[];
  /** Piped or redirected input; null when reading from the terminal. */
  stdin: string | null;
  /** True when stdout goes straight to the terminal (not piped or redirected). */
  isTTY: boolean;
  shell: Shell;
  fs: FileSystem;
  out: (text: string) => void;
  /** Writes `<name>: <message>` to stderr. */
  err: (message: string) => void;
  resolve: (path: string) => string;
};

export type Command = {
  summary: string;
  usage: string;
  /** What tab completion offers for this command's arguments. */
  complete?: "files" | "directories" | "commands" | "none";
  /** Left out of `help`. */
  hidden?: boolean;
  run: (ctx: CommandContext) => number;
};

export type Completion = { value: string; display: string; directory: boolean };

/** A word as lexed; `$VARIABLES` are resolved when its command runs. */
type Word = {
  parts: (string | { variable: string })[];
  glob: boolean;
  quoted: boolean;
};
type ExpandedWord = { text: string; glob: boolean; quoted: boolean };
type Operator = "|" | "||" | "&&" | ";" | ">" | ">>" | "<";
type Token = { type: "word"; word: Word } | { type: "op"; op: Operator };
type Redirect = { op: ">" | ">>" | "<"; target: Word };
type SimpleCommand = { words: Word[]; redirects: Redirect[] };
type Pipeline = { commands: SimpleCommand[]; connector: ";" | "&&" | "||" };

class SyntaxError extends Error {}

const OPERATOR_CHARS = "|&;<>";
const ESCAPE_CHARS = /[\s'"\\|&;<>()$*?#[\]]/g;

export class Shell {
  fs: FileSystem;
  env: Record<string, string>;
  aliases: Record<string, string> = {};
  history: string[] = [];
  lastStatus = 0;
  readonly startedAt = new Date();
  private hooks: ShellHooks;

  constructor(hooks: ShellHooks) {
    this.hooks = hooks;
    this.fs = new FileSystem(Object.keys(commands));
    this.env = {
      HOME,
      USER,
      LOGNAME: USER,
      HOSTNAME: HOST,
      SHELL: `/bin/${SHELL}`,
      PATH: "/bin",
      PWD: HOME,
      OLDPWD: HOME,
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
    };
    this.sourceRc();
  }

  get cwd() {
    return this.env.PWD;
  }

  get columns() {
    return this.hooks.columns();
  }

  setCwd(path: string) {
    this.env.OLDPWD = this.env.PWD;
    this.env.PWD = path;
  }

  displayPath(path: string) {
    if (path === HOME) return "~";
    return path.startsWith(HOME + "/") ? "~" + path.slice(HOME.length) : path;
  }

  prompt() {
    return `${ansi.boldGreen}${USER}@${HOST}${ansi.reset}:${ansi.boldBlue}${this.displayPath(this.cwd)}${ansi.reset}$ `;
  }

  clear() {
    this.hooks.clear();
  }

  exit() {
    this.hooks.exit();
  }

  open(url: string) {
    this.hooks.open(url);
  }

  /** Writes to the terminal, soft-wrapping long lines at word boundaries. */
  write(text: string) {
    const lines = text.split("\n").map((line) => wrap(line, this.columns));
    this.hooks.write(lines.join("\n").replace(/\n/g, "\r\n"));
  }

  execute(input: string) {
    const expanded = this.expandHistory(input);
    if (expanded === null) return;
    if (expanded !== input) this.write(expanded + "\n");
    if (expanded.trim() && !input.startsWith(" ")) {
      if (this.history[this.history.length - 1] !== expanded)
        this.history.push(expanded);
    }
    this.run(expanded);
  }

  /** Runs a command line without touching history. */
  run(input: string) {
    let pipelines: Pipeline[];
    try {
      pipelines = parse(this.lex(input));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      this.write(`${SHELL}: ${error.message}\n`);
      this.lastStatus = 2;
      return;
    }
    for (const pipeline of pipelines) {
      if (pipeline.connector === "&&" && this.lastStatus !== 0) continue;
      if (pipeline.connector === "||" && this.lastStatus === 0) continue;
      this.lastStatus = this.runPipeline(pipeline.commands);
    }
  }

  complete(
    line: string,
    cursor: number,
  ): { start: number; candidates: Completion[] } {
    const before = line.slice(0, cursor);
    let wordStart = 0;
    let quote: string | null = null;
    let words: string[] = [];
    let current = "";
    for (let i = 0; i < before.length; i++) {
      const c = before[i];
      if (quote) {
        if (c === quote) quote = null;
        else current += c;
      } else if (c === "\\") {
        current += before[++i] ?? "";
      } else if (c === "'" || c === '"') {
        quote = c;
      } else if (/\s/.test(c) || OPERATOR_CHARS.includes(c)) {
        if (current) words.push(current);
        if ("|&;".includes(c)) words = [];
        current = "";
        wordStart = i + 1;
      } else {
        current += c;
      }
    }

    const quoteChar = /^['"]/.test(before.slice(wordStart))
      ? before[wordStart]
      : "";
    const escape = (text: string) =>
      quoteChar ? text : text.replace(ESCAPE_CHARS, "\\$&");

    const commandName = words.length > 0 ? this.resolveAlias(words[0]) : null;
    const mode =
      commandName === null
        ? "commands"
        : current.startsWith("$")
          ? "variables"
          : (commands[commandName]?.complete ?? "files");

    if (mode === "commands" && words.length <= 1 && !current.includes("/")) {
      const names = [...Object.keys(commands), ...Object.keys(this.aliases)];
      const matches = [...new Set(names)]
        .filter((name) => name.startsWith(current))
        .sort();
      return {
        start: wordStart,
        candidates: matches.map((name) => ({
          value: quoteChar + escape(name) + quoteChar,
          display: name,
          directory: false,
        })),
      };
    }

    if (mode === "variables") {
      const prefix = current.slice(1);
      return {
        start: wordStart,
        candidates: Object.keys(this.env)
          .filter((name) => name.startsWith(prefix))
          .sort()
          .map((name) => ({
            value: "$" + name,
            display: "$" + name,
            directory: false,
          })),
      };
    }

    if (mode === "none") return { start: wordStart, candidates: [] };

    if (current === "~") {
      return {
        start: wordStart,
        candidates: [{ value: "~/", display: "~/", directory: true }],
      };
    }

    const slash = current.lastIndexOf("/");
    const dirPart = current.slice(0, slash + 1);
    const base = current.slice(slash + 1);
    const directory = this.fs.get(resolvePath(dirPart || ".", this.cwd));
    if (directory?.type !== "directory")
      return { start: wordStart, candidates: [] };

    const candidates = Object.values(directory.children)
      .filter((node) => node.name.startsWith(base))
      .filter((node) => base.startsWith(".") || !node.name.startsWith("."))
      .filter((node) => mode !== "directories" || node.type === "directory")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((node) => {
        const isDir = node.type === "directory";
        // Keep a typed leading "~/" as-is rather than escaping the tilde.
        const path = dirPart.startsWith("~/")
          ? "~/" + escape(dirPart.slice(2) + node.name)
          : escape(dirPart + node.name);
        return {
          value: quoteChar + path + (isDir ? "/" : quoteChar),
          display: node.name + (isDir ? "/" : ""),
          directory: isDir,
        };
      });
    return { start: wordStart, candidates };
  }

  resolveAlias(name: string) {
    const alias = this.aliases[name];
    return alias ? (alias.trim().split(/\s+/)[0] ?? name) : name;
  }

  private sourceRc() {
    const rc = this.fs.get(`${HOME}/.jshrc`);
    if (rc?.type !== "file") return;
    for (const line of rc.content.split("\n")) this.run(line);
  }

  /** Expands `!!`, `!$`, `!n`, `!-n` and `!prefix`. Returns null on a missing event. */
  private expandHistory(input: string): string | null {
    let failed: string | null = null;
    const expanded = input.replace(
      /!(!|\$|-?\d+|[A-Za-z][\w-]*)/g,
      (match, event: string) => {
        let entry: string | undefined;
        const history = this.history;
        if (event === "!") entry = history[history.length - 1];
        else if (event === "$")
          entry = history[history.length - 1]?.trim().split(/\s+/).pop();
        else if (/^-\d+$/.test(event))
          entry = history[history.length + Number(event)];
        else if (/^\d+$/.test(event)) entry = history[Number(event) - 1];
        else entry = [...history].reverse().find((h) => h.startsWith(event));
        if (entry === undefined) failed ??= match;
        return entry ?? match;
      },
    );
    if (failed) {
      this.write(`${SHELL}: ${failed}: event not found\n`);
      this.lastStatus = 1;
      return null;
    }
    return expanded;
  }

  private lexVariable(
    input: string,
    i: number,
  ): [string | { variable: string }, number] {
    const next = input[i + 1];
    if (next === "?" || next === "$") return [{ variable: next }, i + 2];
    if (next === "{") {
      const end = input.indexOf("}", i);
      if (end < 0) throw new SyntaxError("bad substitution");
      return [{ variable: input.slice(i + 2, end) }, end + 1];
    }
    const name = /^[A-Za-z_]\w*/.exec(input.slice(i + 1))?.[0];
    if (!name) return ["$", i + 1];
    return [{ variable: name }, i + 1 + name.length];
  }

  private expand(word: Word): ExpandedWord {
    const text = word.parts
      .map((part) => {
        if (typeof part === "string") return part;
        if (part.variable === "?") return String(this.lastStatus);
        if (part.variable === "$") return "1337";
        return this.env[part.variable] ?? "";
      })
      .join("");
    return { text, glob: word.glob, quoted: word.quoted };
  }

  lex(input: string): Token[] {
    const tokens: Token[] = [];
    let word: Word | null = null;
    const start = () => (word ??= { parts: [], glob: false, quoted: false });
    const append = (w: Word, part: Word["parts"][number]) => {
      const last = w.parts.length - 1;
      if (typeof part === "string" && typeof w.parts[last] === "string")
        w.parts[last] += part;
      else w.parts.push(part);
    };
    const push = () => {
      if (word && (word.parts.length > 0 || word.quoted))
        tokens.push({ type: "word", word });
      word = null;
    };

    let i = 0;
    while (i < input.length) {
      const c = input[i];
      if (/\s/.test(c)) {
        push();
        i++;
      } else if (c === "#" && word === null) {
        break;
      } else if (OPERATOR_CHARS.includes(c)) {
        push();
        const two = input.slice(i, i + 2);
        if (two === "||" || two === "&&" || two === ">>") {
          tokens.push({ type: "op", op: two });
          i += 2;
        } else {
          // Background jobs aren't supported, so a lone `&` just separates commands.
          tokens.push({ type: "op", op: c === "&" ? ";" : (c as Operator) });
          i++;
        }
      } else if (c === "\\") {
        append(start(), input[i + 1] ?? "");
        i += 2;
      } else if (c === "'") {
        const end = input.indexOf("'", i + 1);
        if (end < 0)
          throw new SyntaxError(
            "unexpected EOF while looking for matching `''",
          );
        const w = start();
        append(w, input.slice(i + 1, end));
        w.quoted = true;
        i = end + 1;
      } else if (c === '"') {
        const w = start();
        w.quoted = true;
        i++;
        while (i < input.length && input[i] !== '"') {
          if (input[i] === "\\" && '"\\$`'.includes(input[i + 1] ?? "")) {
            append(w, input[i + 1]);
            i += 2;
          } else if (input[i] === "$") {
            const [part, next] = this.lexVariable(input, i);
            append(w, part);
            i = next;
          } else {
            append(w, input[i++]);
          }
        }
        if (i >= input.length)
          throw new SyntaxError(
            "unexpected EOF while looking for matching `\"'",
          );
        i++;
      } else if (c === "$") {
        const [part, next] = this.lexVariable(input, i);
        append(start(), part);
        i = next;
      } else if (
        c === "~" &&
        word === null &&
        (i + 1 >= input.length ||
          /[\s/]/.test(input[i + 1]) ||
          OPERATOR_CHARS.includes(input[i + 1]))
      ) {
        append(start(), HOME);
        i++;
      } else {
        const w = start();
        if ("*?[".includes(c)) w.glob = true;
        append(w, c);
        i++;
      }
    }
    push();
    return tokens;
  }

  private runPipeline(pipeline: SimpleCommand[]): number {
    let stdin: string | null = null;
    let status = 0;
    pipeline.forEach((command, index) => {
      const output = command.redirects.find((r) => r.op !== "<");
      const isLast = index === pipeline.length - 1;
      const result = this.runCommand(command, stdin, isLast && !output);
      status = result.status;
      stdin = result.stdout;
      if (!isLast) return;
      if (!output) {
        if (result.stdout) {
          this.write(
            result.stdout.endsWith("\n") ? result.stdout : result.stdout + "\n",
          );
        }
        return;
      }
      const target = this.expand(output.target).text;
      try {
        this.fs.writeFile(
          resolvePath(target, this.cwd),
          result.stdout,
          output.op === ">>",
        );
      } catch (error) {
        if (!(error instanceof FsError)) throw error;
        this.write(`${SHELL}: ${target}: ${error.message}\n`);
        status = 1;
      }
    });
    return status;
  }

  private runCommand(
    command: SimpleCommand,
    pipedInput: string | null,
    isTTY: boolean,
  ): { status: number; stdout: string } {
    const expand = (words: Word[]) =>
      words
        .map((word) => this.expand(word))
        .filter((word) => word.text || word.quoted);
    let words = expand(command.words);
    const first = words[0];
    if (first && !first.quoted && this.aliases[first.text] !== undefined) {
      const aliasWords = expand(
        this.lex(this.aliases[first.text]).flatMap((t) =>
          t.type === "word" ? [t.word] : [],
        ),
      );
      words = [...aliasWords, ...words.slice(1)];
    }
    const argv = words.flatMap((word) => this.expandGlob(word));

    let stdin = pipedInput;
    for (const redirect of command.redirects.filter((r) => r.op === "<")) {
      const target = this.expand(redirect.target).text;
      try {
        stdin = this.fs.readFile(resolvePath(target, this.cwd));
      } catch (error) {
        if (!(error instanceof FsError)) throw error;
        this.write(`${SHELL}: ${target}: ${error.message}\n`);
        return { status: 1, stdout: "" };
      }
    }

    if (argv.length === 0) return { status: 0, stdout: stdin ?? "" };
    const [name, ...args] = argv;
    const implementation = commands[name];
    if (!implementation) {
      this.write(`${SHELL}: command not found: ${name}\n`);
      return { status: 127, stdout: "" };
    }

    let stdout = "";
    const ctx: CommandContext = {
      name,
      args,
      stdin,
      isTTY,
      shell: this,
      fs: this.fs,
      out: (text) => (stdout += text),
      err: (message) => this.write(`${name}: ${message}\n`),
      resolve: (path) => resolvePath(path, this.cwd),
    };

    if (args.includes("--help")) {
      ctx.out(`usage: ${implementation.usage}\n${implementation.summary}\n`);
      return { status: 0, stdout };
    }
    try {
      return { status: implementation.run(ctx), stdout };
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
      ctx.err(error.message);
      return { status: 1, stdout };
    }
  }

  private expandGlob(word: ExpandedWord): string[] {
    if (!word.glob) return [word.text];
    const absolute = word.text.startsWith("/");
    let matches = [absolute ? "/" : ""];
    for (const segment of word.text.split("/").filter(Boolean)) {
      const join = (prefix: string, name: string) =>
        prefix === ""
          ? name
          : prefix.endsWith("/")
            ? prefix + name
            : `${prefix}/${name}`;
      const pattern = /[*?[]/.test(segment) ? globToRegex(segment) : null;
      matches = matches.flatMap((prefix) => {
        if (!pattern) {
          const path = join(prefix, segment);
          return this.fs.get(resolvePath(path, this.cwd)) ? [path] : [];
        }
        const directory = this.fs.get(resolvePath(prefix || ".", this.cwd));
        if (directory?.type !== "directory") return [];
        return Object.keys(directory.children)
          .filter((name) => segment.startsWith(".") || !name.startsWith("."))
          .filter((name) => pattern.test(name))
          .sort()
          .map((name) => join(prefix, name));
      });
    }
    return matches.length > 0 ? matches : [word.text];
  }
}

function parse(tokens: Token[]): Pipeline[] {
  const pipelines: Pipeline[] = [];
  let connector: Pipeline["connector"] = ";";
  let pipeline: SimpleCommand[] = [];
  let command: SimpleCommand = { words: [], redirects: [] };
  const unexpected = (op: string) =>
    new SyntaxError(`syntax error near unexpected token \`${op}'`);
  const isEmpty = (c: SimpleCommand) =>
    c.words.length === 0 && c.redirects.length === 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "word") {
      command.words.push(token.word);
    } else if (token.op === ">" || token.op === ">>" || token.op === "<") {
      const target = tokens[++i];
      if (target?.type !== "word") throw unexpected(target?.op ?? "newline");
      command.redirects.push({ op: token.op, target: target.word });
    } else if (token.op === "|") {
      if (isEmpty(command)) throw unexpected("|");
      pipeline.push(command);
      command = { words: [], redirects: [] };
    } else {
      if (isEmpty(command)) {
        if (pipeline.length > 0 || token.op !== ";") throw unexpected(token.op);
        continue;
      }
      pipelines.push({ commands: [...pipeline, command], connector });
      connector = token.op;
      pipeline = [];
      command = { words: [], redirects: [] };
    }
  }
  if (isEmpty(command)) {
    if (pipeline.length > 0) throw unexpected("newline");
    if (connector !== ";") throw unexpected("newline");
  } else {
    pipelines.push({ commands: [...pipeline, command], connector });
  }
  return pipelines;
}

function globToRegex(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") source += ".*";
    else if (c === "?") source += ".";
    else if (c === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end < 0) {
        source += "\\[";
        continue;
      }
      const set = glob
        .slice(i + 1, end)
        .replace(/^!/, "^")
        .replace(/\\/g, "\\\\");
      source += `[${set}]`;
      i = end;
    } else source += c.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/** Soft-wraps a line at spaces, keeping any ANSI color codes intact. */
function wrap(line: string, cols: number): string {
  const plain = stripAnsi(line);
  if (plain.length <= cols) return line;
  const indent = /^\s*(?:[-*•]\s+|\d+\.\s+)?/.exec(plain)?.[0].length ?? 0;
  const hanging = " ".repeat(indent < cols / 2 ? indent : 0);

  // Raw index of each visible character, so breaks found in `plain` map back onto `line`.
  const rawIndex: number[] = [];
  for (let i = 0; i < line.length;) {
    // eslint-disable-next-line no-control-regex
    const escape = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(line.slice(i));
    if (escape) {
      i += escape[0].length;
    } else {
      rawIndex.push(i++);
    }
  }

  let output = "";
  let rawStart = 0;
  let rowStart = 0;
  let width = cols;
  while (plain.length - rowStart > width) {
    const space = plain.lastIndexOf(" ", rowStart + width);
    const breakAt = space > rowStart ? space : rowStart + width;
    output += line.slice(rawStart, rawIndex[breakAt]) + "\n" + hanging;
    rawStart = rawIndex[breakAt] + (space > rowStart ? 1 : 0);
    rowStart = breakAt + (space > rowStart ? 1 : 0);
    width = cols - hanging.length;
  }
  return output + line.slice(rawStart);
}

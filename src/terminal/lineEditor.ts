import type { Terminal } from "@xterm/xterm";
import { columnize } from "./commands";
import { ansi, visibleLength } from "./constants";
import type { Shell } from "./shell";

type Action =
  | "enter"
  | "backspace"
  | "delete"
  | "left"
  | "right"
  | "wordLeft"
  | "wordRight"
  | "home"
  | "end"
  | "up"
  | "down"
  | "tab"
  | "interrupt"
  | "eof"
  | "clearScreen"
  | "killToStart"
  | "killToEnd"
  | "killWordBack"
  | "killAlnumWordBack"
  | "killWordForward"
  | "yank"
  | "transpose"
  | "reverseSearch"
  | "lastArgument"
  | "abort"
  | "escape";

const CONTROL_KEYS: Record<string, Action> = {
  "\r": "enter",
  "\n": "enter",
  "\t": "tab",
  "\x7f": "backspace",
  "\b": "backspace",
  "\x01": "home",
  "\x02": "left",
  "\x03": "interrupt",
  "\x04": "eof",
  "\x05": "end",
  "\x06": "right",
  "\x07": "abort",
  "\x0b": "killToEnd",
  "\x0c": "clearScreen",
  "\x0e": "down",
  "\x10": "up",
  "\x12": "reverseSearch",
  "\x14": "transpose",
  "\x15": "killToStart",
  "\x17": "killWordBack",
  "\x19": "yank",
  "\x1b": "escape",
};

const ESCAPE_SEQUENCES: Record<string, Action> = {
  "\x1b[A": "up",
  "\x1bOA": "up",
  "\x1b[B": "down",
  "\x1bOB": "down",
  "\x1b[C": "right",
  "\x1bOC": "right",
  "\x1b[D": "left",
  "\x1bOD": "left",
  "\x1b[H": "home",
  "\x1bOH": "home",
  "\x1b[1~": "home",
  "\x1b[F": "end",
  "\x1bOF": "end",
  "\x1b[4~": "end",
  "\x1b[3~": "delete",
  "\x1b[1;5C": "wordRight",
  "\x1b[1;3C": "wordRight",
  "\x1b[1;5D": "wordLeft",
  "\x1b[1;3D": "wordLeft",
  "\x1bf": "wordRight",
  "\x1bb": "wordLeft",
  "\x1bd": "killWordForward",
  "\x1b\x7f": "killAlnumWordBack",
  "\x1b\b": "killAlnumWordBack",
  "\x1b.": "lastArgument",
  "\x1b_": "lastArgument",
};

// Actions reverse search handles itself; anything else accepts the match first.
const SEARCH_ACTIONS = new Set<Action>([
  "enter",
  "backspace",
  "reverseSearch",
  "interrupt",
  "abort",
  "escape",
]);

const isAlnum = (c: string) => /\w/.test(c);
const isNonSpace = (c: string) => /\S/.test(c);

type Search = {
  query: string;
  match: number;
  failed: boolean;
  original: string;
};

/** Readline-style line editing for a shell running in an xterm.js terminal. */
export class LineEditor {
  private term: Terminal;
  private shell: Shell;
  private line = "";
  private cursor = 0;
  /** Where the terminal cursor sits, as an offset from the start of the prompt. */
  private renderedCursor = 0;
  private historyIndex = 0;
  private draft = "";
  private killed = "";
  private search: Search | null = null;

  constructor(term: Terminal, shell: Shell) {
    this.term = term;
    this.shell = shell;
  }

  prompt() {
    this.line = "";
    this.cursor = 0;
    this.renderedCursor = 0;
    this.historyIndex = this.shell.history.length;
    this.draft = "";
    this.render();
  }

  clearScreen() {
    this.term.write("\x1b[H\x1b[2J\x1b[3J");
    this.renderedCursor = 0;
    this.render();
  }

  handleData = (data: string) => {
    if (data.length > 1 && data.startsWith("\x1b")) {
      const action = ESCAPE_SEQUENCES[data];
      if (action) this.dispatch(action);
      return;
    }
    let text = "";
    const flush = () => {
      if (text) this.insert(text);
      text = "";
    };
    for (const char of data) {
      if (char >= " " && char !== "\x7f") {
        text += char;
        continue;
      }
      flush();
      const action = CONTROL_KEYS[char];
      if (action) this.dispatch(action);
    }
    flush();
  };

  private dispatch(action: Action): void {
    if (this.search) {
      if (SEARCH_ACTIONS.has(action)) return this.handleSearch(action);
      this.acceptSearch();
    }

    const { line, cursor } = this;
    switch (action) {
      case "enter":
        return this.submit();
      case "backspace":
        if (cursor > 0)
          this.edit(line.slice(0, cursor - 1) + line.slice(cursor), cursor - 1);
        return;
      case "delete":
        if (cursor < line.length)
          this.edit(line.slice(0, cursor) + line.slice(cursor + 1), cursor);
        return;
      case "left":
        return this.moveTo(cursor - 1);
      case "right":
        return this.moveTo(cursor + 1);
      case "wordLeft":
        return this.moveTo(this.wordStart(isAlnum));
      case "wordRight":
        return this.moveTo(this.wordEnd(isAlnum));
      case "home":
        return this.moveTo(0);
      case "end":
        return this.moveTo(line.length);
      case "up":
        return this.recall(this.historyIndex - 1);
      case "down":
        return this.recall(this.historyIndex + 1);
      case "tab":
        return this.complete();
      case "interrupt":
        this.finishLine("^C");
        this.shell.lastStatus = 130;
        return this.prompt();
      case "eof":
        if (line.length > 0) return this.dispatch("delete");
        this.finishLine("exit");
        return this.shell.exit();
      case "clearScreen":
        return this.clearScreen();
      case "killToStart":
        return this.kill(0, cursor);
      case "killToEnd":
        return this.kill(cursor, line.length);
      case "killWordBack":
        return this.kill(this.wordStart(isNonSpace), cursor);
      case "killAlnumWordBack":
        return this.kill(this.wordStart(isAlnum), cursor);
      case "killWordForward":
        return this.kill(cursor, this.wordEnd(isAlnum));
      case "yank":
        return this.insert(this.killed);
      case "transpose": {
        if (line.length < 2 || cursor === 0) return;
        const at = cursor === line.length ? cursor - 1 : cursor;
        return this.edit(
          line.slice(0, at - 1) + line[at] + line[at - 1] + line.slice(at + 1),
          at + 1,
        );
      }
      case "reverseSearch":
        this.search = { query: "", match: -1, failed: false, original: line };
        return this.render();
      case "lastArgument": {
        const previous = this.shell.history[this.shell.history.length - 1];
        const argument = previous?.trim().split(/\s+/).pop();
        if (argument) this.insert(argument);
        return;
      }
      case "abort":
      case "escape":
        return;
    }
  }

  private insert(text: string) {
    if (this.search) {
      this.search.query += text;
      this.findMatch(
        this.search.match >= 0
          ? this.search.match
          : this.shell.history.length - 1,
      );
      return this.render();
    }
    const { line, cursor } = this;
    this.edit(
      line.slice(0, cursor) + text + line.slice(cursor),
      cursor + text.length,
    );
  }

  private edit(line: string, cursor: number) {
    this.line = line;
    this.cursor = cursor;
    this.render();
  }

  private moveTo(cursor: number) {
    this.cursor = Math.max(0, Math.min(cursor, this.line.length));
    this.render();
  }

  private kill(from: number, to: number) {
    if (from >= to) return;
    this.killed = this.line.slice(from, to);
    this.edit(this.line.slice(0, from) + this.line.slice(to), from);
  }

  private wordStart(isWord: (c: string) => boolean) {
    let i = this.cursor;
    while (i > 0 && !isWord(this.line[i - 1])) i--;
    while (i > 0 && isWord(this.line[i - 1])) i--;
    return i;
  }

  private wordEnd(isWord: (c: string) => boolean) {
    let i = this.cursor;
    while (i < this.line.length && !isWord(this.line[i])) i++;
    while (i < this.line.length && isWord(this.line[i])) i++;
    return i;
  }

  private recall(index: number) {
    const { history } = this.shell;
    if (index < 0 || index > history.length) return;
    if (this.historyIndex === history.length) this.draft = this.line;
    this.historyIndex = index;
    const line = index === history.length ? this.draft : history[index];
    this.edit(line, line.length);
  }

  private submit() {
    const line = this.line;
    this.finishLine();
    this.shell.execute(line);
    this.prompt();
  }

  /** Moves past the current input (optionally appending a marker like ^C) onto a fresh line. */
  private finishLine(suffix = "") {
    this.cursor = this.line.length;
    this.render();
    const end = visibleLength(this.shell.prompt()) + this.line.length;
    const atWrap = end > 0 && end % this.term.cols === 0;
    this.term.write(suffix + (atWrap && !suffix ? "" : "\r\n"));
  }

  private complete() {
    const { start, candidates } = this.shell.complete(this.line, this.cursor);
    if (candidates.length === 0) return;
    const word = this.line.slice(start, this.cursor);
    const replace = (value: string) =>
      this.edit(
        this.line.slice(0, start) + value + this.line.slice(this.cursor),
        start + value.length,
      );

    if (candidates.length === 1) {
      const [only] = candidates;
      return replace(only.value + (only.directory ? "" : " "));
    }
    const prefix = commonPrefix(candidates.map((c) => c.value));
    if (prefix.length > word.length) return replace(prefix);

    const names = candidates.map((c) =>
      c.directory ? `${ansi.boldBlue}${c.display}${ansi.reset}` : c.display,
    );
    const saved = { line: this.line, cursor: this.cursor };
    this.finishLine();
    this.term.write(columnize(names, this.term.cols).replace(/\n/g, "\r\n"));
    this.renderedCursor = 0;
    this.edit(saved.line, saved.cursor);
  }

  private findMatch(from: number) {
    const search = this.search!;
    const { history } = this.shell;
    for (let i = Math.min(from, history.length - 1); i >= 0; i--) {
      if (history[i].includes(search.query)) {
        search.match = i;
        search.failed = false;
        return;
      }
    }
    search.failed = true;
  }

  private handleSearch(action: Action) {
    const search = this.search!;
    switch (action) {
      case "reverseSearch":
        if (search.match > 0) this.findMatch(search.match - 1);
        else search.failed = search.query !== "";
        return this.render();
      case "backspace":
        search.query = search.query.slice(0, -1);
        search.match = -1;
        if (search.query) this.findMatch(this.shell.history.length - 1);
        else search.failed = false;
        return this.render();
      case "enter":
        this.acceptSearch();
        return this.submit();
      case "escape":
        this.acceptSearch();
        return this.render();
      default:
        // ^C / ^G restore the line as it was before searching.
        this.line = search.original;
        this.cursor = this.line.length;
        this.search = null;
        return this.render();
    }
  }

  private acceptSearch() {
    const search = this.search!;
    if (search.match >= 0) {
      this.line = this.shell.history[search.match];
      this.cursor = Math.max(this.line.indexOf(search.query), 0);
    }
    this.search = null;
  }

  private view(): { prompt: string; text: string; cursor: number } {
    if (!this.search)
      return {
        prompt: this.shell.prompt(),
        text: this.line,
        cursor: this.cursor,
      };
    const { query, match, failed, original } = this.search;
    const text = match >= 0 ? this.shell.history[match] : original;
    return {
      prompt: `(${failed ? "failed " : ""}reverse-i-search)\`${query}': `,
      text,
      cursor: match >= 0 ? Math.max(text.indexOf(query), 0) : 0,
    };
  }

  /** Redraws the prompt and input in place, handling lines that wrap. */
  private render() {
    const cols = this.term.cols;
    const { prompt, text, cursor } = this.view();
    const promptLength = visibleLength(prompt);
    const end = promptLength + text.length;
    const target = promptLength + cursor;

    let output = "";
    const currentRow = Math.floor(this.renderedCursor / cols);
    if (currentRow > 0) output += `\x1b[${currentRow}A`;
    output += "\r\x1b[J" + prompt + text;
    // xterm leaves the cursor on the last column after filling a row; force the wrap.
    if (end > 0 && end % cols === 0) output += "\r\n";
    const rowsUp = Math.floor(end / cols) - Math.floor(target / cols);
    if (rowsUp > 0) output += `\x1b[${rowsUp}A`;
    output += "\r";
    if (target % cols > 0) output += `\x1b[${target % cols}C`;

    this.term.write(output);
    this.renderedCursor = target;
  }
}

function commonPrefix(values: string[]): string {
  let prefix = values[0] ?? "";
  for (const value of values) {
    while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

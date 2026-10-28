import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { ansi } from "./constants";
import { LineEditor } from "./lineEditor";
import { Shell } from "./shell";

const BACKGROUND = "#0c0c0c";

function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily:
        'Menlo, Monaco, "Cascadia Mono", Consolas, "Courier New", monospace',
      fontSize: window.innerWidth < 640 ? 12 : 14,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: {
        background: BACKGROUND,
        foreground: "#e5e5e5",
        cursor: "#e5e5e5",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(
      new WebLinksAddon((_, uri) => window.open(uri, "_blank", "noopener")),
    );
    term.open(container);
    fit.fit();

    const shell = new Shell({
      write: (text) => term.write(text),
      clear: () => term.write("\x1b[H\x1b[2J\x1b[3J"),
      exit: () => setTimeout(() => navigate("/"), 0),
      open: (url) => window.open(url, "_blank", "noopener"),
      columns: () => term.cols,
    });
    const editor = new LineEditor(term, shell);

    term.attachCustomKeyEventHandler((event) => {
      // Cmd+K clears the screen, like macOS Terminal and iTerm.
      if (event.type === "keydown" && event.metaKey && event.key === "k") {
        editor.clearScreen();
        return false;
      }
      // Let Ctrl+C copy when text is selected (Windows/Linux).
      if (event.ctrlKey && event.key === "c" && term.hasSelection())
        return false;
      return true;
    });
    const dataListener = term.onData(editor.handleData);

    // Wait until the container has a usable width; output written while it is
    // hidden or still laying out would be wrapped to a couple of columns.
    let started = false;
    const start = () => {
      if (started || term.cols < 20) return;
      started = true;
      shell.run("neofetch");
      shell.write(
        `\nWelcome! Type ${ansi.cyan}help${ansi.reset} to see what you can do, ` +
          `${ansi.cyan}resume${ansi.reset} to read my resume, or press ${ansi.cyan}Tab${ansi.reset} to autocomplete.\n\n`,
      );
      editor.prompt();
      term.focus();
    };
    start();

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      start();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      dataListener.dispose();
      term.dispose();
    };
  }, [navigate]);

  return (
    <div className="h-full w-full p-2" style={{ background: BACKGROUND }}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

export default Terminal;

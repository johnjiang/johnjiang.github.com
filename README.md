# johnjiang.me

Source for [johnjiang.me](https://johnjiang.me): a GeoCities-style homepage and
JohnOS, a terminal you can use to browse my resume.

Built with React, TypeScript, Vite and Tailwind CSS. The terminal runs on
[xterm.js](https://xtermjs.org/) with a small custom shell.

## Development

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The terminal is at `/#/terminal`.

| Script                 | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                                      |
| `npm run build`        | Type-check and build to `dist/`                                |
| `npm run preview`      | Serve the production build locally                             |
| `npm run lint`         | Lint with [oxlint](https://oxc.rs/docs/guide/usage/linter)     |
| `npm run format`       | Format with [oxfmt](https://oxc.rs/docs/guide/usage/formatter) |
| `npm run format:check` | Check formatting without writing                               |

## Project layout

```
src/
  pages/Home.tsx          The homepage
  terminal/
    index.tsx             Mounts xterm.js and wires it to the shell
    lineEditor.ts         Line editing: shortcuts, history, reverse search, tab completion
    shell.ts              Lexer, parser and executor: pipes, redirects, globs, $VARS, aliases
    commands.ts           Command implementations (ls, cd, cat, grep, ...)
    filesystem.ts         In-memory filesystem the shell runs against
    resume.ts             Resume content, served as files under ~/resume
    constants.ts          User/host names and ANSI colour helpers
```

## The terminal

Type `help` for the full list of commands and keyboard shortcuts. Highlights:

- Common commands: `ls`, `cd`, `cat`, `grep`, `find`, `tree`, `head`, `tail`,
  `wc`, `sort`, `uniq`, `mkdir`, `rm`, `cp`, `mv`, `history`, `alias`, `man`, ...
- Shell features: pipes, `>`/`>>`/`<` redirects, `;`/`&&`/`||`, globs, quotes,
  `$VARIABLES`, `~`, and `!!`/`!n` history expansion
- Readline shortcuts (Ctrl+A/E/U/K/W/R/L/C/D, Alt+B/F/D/.) and tab completion
  for commands, paths and variables
- `resume` prints the whole resume; `open github.url` opens a link

The filesystem lives in memory, so changes reset on reload.

### Updating the resume

Edit [`src/terminal/resume.ts`](src/terminal/resume.ts). Each export becomes a
file under `~/resume` (wired up in [`filesystem.ts`](src/terminal/filesystem.ts)),
and `RESUME_FILES` sets the order the `resume` command prints them in.

### Adding a command

Add an entry to `commands` in [`src/terminal/commands.ts`](src/terminal/commands.ts).
It shows up automatically in `help`, tab completion and `/bin`.

## Deployment

Pushing to `main` builds the site and deploys it to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The custom
domain and HTTPS are configured in the repo's Pages settings.

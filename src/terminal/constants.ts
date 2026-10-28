export const SHELL = "jsh";
export const USER = "johnjiang";
export const HOST = "johnos";
export const HOME = `/home/${USER}`;
export const OS_NAME = "JohnOS";
export const OS_VERSION = "2.0.0";

export const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  boldRed: "\x1b[1;31m",
  boldGreen: "\x1b[1;32m",
  boldBlue: "\x1b[1;34m",
  boldCyan: "\x1b[1;36m",
};

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

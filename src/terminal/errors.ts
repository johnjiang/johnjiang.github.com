export const terminalError = {
  notFound: (command: string, target: string) =>
    `${command}: no such file or directory: ${target}`,
  isDirectory: (command: string, target: string) =>
    `${command}: ${target}: Is a directory`,
  invalidDirectory: () => "Invalid directory",
  cannotOpen: (target: string) => `open: cannot open ${target}`,
  commandNotFound: (shell: string, command: string) =>
    `${shell}: command not found: ${command}`,
};

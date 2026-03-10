export interface Logger {
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(enabled: boolean): Logger {
  const p = "[SNP]";
  return {
    debug: (...args) => { if (enabled) console.debug(p, ...args); },
    error: (...args) => console.error(p, ...args),
  };
}

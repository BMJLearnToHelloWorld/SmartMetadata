declare module 'js-yaml' {
  export function dump(obj: unknown, opts?: unknown): string;
  export function load(str: string, opts?: unknown): unknown;
}

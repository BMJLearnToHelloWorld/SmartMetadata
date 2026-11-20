/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Shared quote-aware FQN splitter (moved out of the incident-manager
 * feature so catalog helpers can use it without a catalog→features
 * import). This module imports nothing: it is a leaf in the import
 * graph, so no cycle can pass through it.
 */

/**
 * Split an FQN on dots, keeping double-quoted segments whole —
 * the same rule official's Fqn.split applies, so a table named
 * `"a.b"` does not split into two parts.
 */
export function splitFqn(fqn: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of fqn) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
    } else if (char === '.' && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.filter((part) => part.length > 0);
}

/**
 * Strip one pair of surrounding double quotes from an FQN part, the
 * inverse of official's Fqn.quoteName for a single segment: `splitFqn`
 * keeps quoting on each part (so `"a.b"` survives as one part), and
 * display sites need the bare name. A part without surrounding quotes
 * passes through unchanged; a lone quote is left alone rather than
 * tearing the name apart.
 */
export function unquoteFqnPart(part: string): string {
  if (part.length >= 2 && part.startsWith('"') && part.endsWith('"')) {
    return part.slice(1, -1);
  }
  return part;
}

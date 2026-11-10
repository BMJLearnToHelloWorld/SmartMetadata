/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/** Protocols a user-supplied URL may use — a port of official StringUtils. */
const SAFE_URL_PROTOCOLS = ['http:', 'https:'];

/**
 * Returns the URL only when it parses and uses http(s); anything else
 * (javascript:, data:, a relative path, a malformed string) is not a
 * safe external link.
 */
export function getSafeHttpUrl(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return SAFE_URL_PROTOCOLS.includes(new URL(url).protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

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
 * Lodash `capitalize` equivalent. The product carries no lodash
 * dependency; the pin renders resource names, effect values, event types,
 * and change labels through `startCase` (now the shared `@/utils/text`)
 * and `capitalize` (kept here), so the Access partition ports their exact
 * word splitting instead of hand-rolling per-call-site casing.
 */

/** Lodash `capitalize`: first letter upper, the rest lowercased. */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

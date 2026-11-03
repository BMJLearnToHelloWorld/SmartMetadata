/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/** Epoch millis to a locale date-time string; empty when absent. */
export function formatEpoch(epoch?: number): string {
  if (!epoch) {
    return '';
  }
  return new Date(epoch).toLocaleString();
}

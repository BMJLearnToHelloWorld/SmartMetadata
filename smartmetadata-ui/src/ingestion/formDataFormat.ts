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
 * Port of the portable step of official `formatFormDataForSubmit`
 * (pin a3012259ca, utils/JSONSchemaFormUtils.ts:18-33, 87-94):
 * recursively replace the two-character sequence backslash + `n`
 * with a real newline in every string value. The other two steps
 * are RJSF-specific and have no product equivalent — the `newKey`
 * placeholder cleanup belongs to the RJSF additional-properties
 * editor (out of scope per t364 Q5), and the `connectionArguments`
 * formatting is covered on the connection side by the static
 * builder's JSON-map parsing. Applied by FiltersConfigForm on
 * submit, where the pin applies the full transform and the product
 * has no competing transform; the connection submit keeps the
 * established `buildServiceConnection` transform (residual: the
 * pin escapes `\\n` sequences in connection strings too).
 */
export function escapeBackwardSlashChar<T>(formData: T): T {
  if (typeof formData !== 'object' || formData === null) {
    return formData;
  }
  const record = formData as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === 'object' && value !== null) {
      escapeBackwardSlashChar(value);
    } else if (typeof value === 'string') {
      record[key] = value.replace(/\\n/g, '\n');
    }
  }
  return formData;
}

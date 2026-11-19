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
 * Port of official utils/JSONSchemaFormUtils.ts (pin a3012259ca). The
 * product has no lodash, so cloneDeep is structuredClone with a JSON
 * fallback (form data is JSON-only).
 */
function cloneFormData<T>(formData: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(formData);
    } catch {
      // Vue reactive proxies cannot be structured-cloned; form data is
      // JSON-shaped, so the JSON round-trip below is equivalent.
    }
  }
  return JSON.parse(JSON.stringify(formData)) as T;
}

/**
 * Official escapeBackwardSlashChar: literal backslash-n sequences in
 * strings become real newlines, recursively (arrays included, via for-in
 * over indices). Mutates its input; callers clone first.
 */
export function escapeBackwardSlashChar<T>(formData: T): T {
  for (const key in formData) {
    const value = (formData as Record<string, unknown>)[key];
    if (typeof value === 'object') {
      escapeBackwardSlashChar(value);
    } else if (typeof value === 'string') {
      (formData as Record<string, unknown>)[key] = value.replace(/\\n/g, '\n');
    }
  }
  return formData;
}

/**
 * Official formatAdditionalProperties: drops map rows the user added but
 * never filled in, recognised by RJSF's default key ('newKey…') and value
 * ('New Value' for strings, {} / [] for coerced rows). The empty-structure
 * check runs before recursing, otherwise an empty object/array has no keys
 * to visit and the row would survive as schema-invalid data.
 */
export function formatAdditionalProperties<T>(formData: T): T {
  for (const key in formData) {
    const data = (formData as Record<string, unknown>)[key];
    if (typeof data === 'object' && data !== null) {
      const isEmptyStructure = Array.isArray(data)
        ? data.length === 0
        : Object.keys(data).length === 0;
      if (key.startsWith('newKey') && isEmptyStructure) {
        delete (formData as Record<string, unknown>)[key];
        continue;
      }
      formatAdditionalProperties(data);
    } else if (key.startsWith('newKey') && data === 'New Value') {
      delete (formData as Record<string, unknown>)[key];
    }
  }
  return formData;
}

function formatConnectionFields<T>(formData: T, field: string): T {
  const section = (formData as Record<string, unknown> | null)?.[field];
  if (formData && section && typeof section === 'object') {
    const options = section as Record<string, unknown>;
    for (const key in options) {
      try {
        options[key] = JSON.parse(options[key] as string);
      } catch {
        // ignore exception (pin behavior: unparseable values stay strings)
      }
    }
  }
  return formData;
}

function formatConnectionFieldsForRender<T extends object>(
  formData: T,
  field: string,
): T {
  const section = (formData as Record<string, unknown> | null)?.[field];
  if (formData && section && typeof section === 'object') {
    const options = section as Record<string, unknown>;
    for (const key in options) {
      const value = options[key];
      if (typeof value === 'object') {
        options[key] = JSON.stringify(value);
      }
    }
  }
  return formData;
}

/**
 * Official formatFormDataForSubmit: clone, unescape, drop empty map rows,
 * then parse connectionArguments values. The three-transform order is
 * load-bearing; keep it.
 */
export function formatFormDataForSubmit<T>(formData: T): T {
  let result = cloneFormData(formData);
  result = escapeBackwardSlashChar(result);
  result = formatAdditionalProperties(result);
  result = formatConnectionFields(result, 'connectionArguments');
  return result;
}

/** Official formatFormDataForRender: clone, then stringify connectionArguments objects. */
export function formatFormDataForRender<T extends object>(formData: T): T {
  let result = cloneFormData(formData);
  result = formatConnectionFieldsForRender(result, 'connectionArguments');
  return result;
}

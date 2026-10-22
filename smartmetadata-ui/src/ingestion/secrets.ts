/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

const ENV_PLACEHOLDER = /^\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[\s\S]*)?\}$/;
const MASKED = /^\*+$/;

export function isEnvPlaceholder(value: string): boolean {
  return ENV_PLACEHOLDER.test(value.trim());
}

export function isMaskedSecret(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  return MASKED.test(trimmed) || trimmed.toLowerCase() === 'hidden';
}

/** Password fields stay empty in forms so the UI never echoes a stored secret. */
export function displaySecret(_value: string | undefined): string {
  return '';
}

export function shouldPersistSecret(value: string | undefined, storeConnectionSecrets: boolean): boolean {
  if (!value || !value.trim() || isMaskedSecret(value)) {
    return false;
  }
  if (isEnvPlaceholder(value)) {
    return true;
  }
  return storeConnectionSecrets;
}

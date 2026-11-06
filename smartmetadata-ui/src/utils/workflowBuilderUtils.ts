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
 * Official WorkflowBuilderUtils (pin a3012259ca): `isValidString` guards
 * the per-form save buttons; `createNodeConfig` stamps every node-config
 * save with `lastSaved` / `userModified` (the start-node config read
 * in useWorkflowState / getInitialNodeConfig keys off those fields).
 */
export function isValidString(value: string | undefined | null): boolean {
  return Boolean(value && value.trim() !== '');
}

export function createNodeConfig(
  baseConfig: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...baseConfig,
    lastSaved: new Date().toISOString(),
    userModified: true,
  };
}

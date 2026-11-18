/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { AdminEntityRef, PolicyRule } from '@/types/admin';

/**
 * Full-reference PATCH value. The pin builds reverse/remove PATCHes with
 * `compare`, which carries the entity's own reference objects verbatim;
 * only defined fields are sent, so a reference never gains invented keys.
 * This is deliberately not `entityRefValue` ({id, type}): that shape is
 * for references being added fresh, see newPatchReference.
 */
export function toPatchReference(ref: AdminEntityRef): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  if (ref.id !== undefined) {
    value.id = ref.id;
  }
  if (ref.type !== undefined) {
    value.type = ref.type;
  }
  if (ref.name !== undefined) {
    value.name = ref.name;
  }
  if (ref.displayName !== undefined) {
    value.displayName = ref.displayName;
  }
  if (ref.fullyQualifiedName !== undefined) {
    value.fullyQualifiedName = ref.fullyQualifiedName;
  }
  if (ref.description !== undefined) {
    value.description = ref.description;
  }
  if (ref.deleted !== undefined) {
    value.deleted = ref.deleted;
  }
  return value;
}

/** Fresh reference for an id with no existing reference: the pin maps it to {id, type}. */
export function newPatchReference(id: string, type: string): Record<string, unknown> {
  return { id, type };
}

/**
 * Rule PATCH value. fullyQualifiedName is carried through unchanged when
 * the loaded rule has one (P6j future-write preservation); it is never
 * rebuilt from the name, and new rules carry no FQN key at all.
 */
export function toRulePatchValue(rule: PolicyRule): Record<string, unknown> {
  const value: Record<string, unknown> = {
    name: rule.name,
    operations: [...rule.operations],
    resources: [...rule.resources],
  };
  if (rule.effect !== undefined) {
    value.effect = rule.effect;
  }
  if (rule.description !== undefined) {
    value.description = rule.description;
  }
  if (rule.condition !== undefined) {
    value.condition = rule.condition;
  }
  if (rule.fullyQualifiedName !== undefined) {
    value.fullyQualifiedName = rule.fullyQualifiedName;
  }
  return value;
}

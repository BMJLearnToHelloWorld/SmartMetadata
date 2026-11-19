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
 * Rule-form value model shared by AccessControlRuleForm and the rule pages.
 * Mirrors AccessControl.constants INITIAL_RULE: every field empty except
 * effect, whose non-empty default is Effect.Allow ('allow'). The form state
 * also carries fullyQualifiedName when an existing rule is loaded (the pin
 * form holds the whole reset rule, including unrendered fields); the edit
 * page returns it unchanged on save, which is the P6j future-write
 * preservation. New rules carry no FQN and must never have one rebuilt
 * from the name.
 */
export interface RuleFormValue {
  name: string;
  description: string;
  effect: string;
  operations: string[];
  resources: string[];
  condition: string;
  fullyQualifiedName?: string;
}

export const INITIAL_RULE: RuleFormValue = {
  condition: '',
  description: '',
  effect: 'allow',
  name: '',
  operations: [],
  resources: [],
};

/** Deduplicated condition examples, in first-seen order (AccessControl.utils buildConditionOptions). */
export function buildConditionOptions(examples: string[]): Array<{ id: string; label: string }> {
  return [...new Set(examples)].map((example) => ({ id: example, label: example }));
}

export interface SerializedRuleFormValue {
  name: string;
  description: string;
  effect: string;
  operations: string[];
  resources: string[];
  condition?: string;
  fullyQualifiedName?: string;
}

/**
 * Page-level rule serialisation, shared by the add-policy page and the
 * add/edit rule pages (pin AddPolicyPage/AddRulePage/EditRulePage): only
 * the name is trimmed, the condition is carried untrimmed and omitted
 * when empty, the description is included verbatim (even empty), and an
 * existing FQN is carried through unchanged.
 */
export function serializeRuleFormValue(value: RuleFormValue): SerializedRuleFormValue {
  const serialized: SerializedRuleFormValue = {
    name: value.name.trim(),
    description: value.description,
    effect: value.effect,
    operations: [...value.operations],
    resources: [...value.resources],
  };
  if (value.condition) {
    serialized.condition = value.condition;
  }
  if (value.fullyQualifiedName !== undefined) {
    serialized.fullyQualifiedName = value.fullyQualifiedName;
  }
  return serialized;
}

/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RouteLocationRaw } from 'vue-router';

/**
 * Access route locations (03 §1.2/§2.1). The D-11 transition has
 * landed: the detail/rule segments are `:fqn` in the router table
 * and the add-role/add-policy routes exist, so every location below
 * navigates with the `fqn` param. All Access link and navigation
 * sites go through this module so the router landing touched one
 * file. Route names follow the existing `admin-*` convention.
 *
 * `resolveDetailFqn` reads the single `fqn` prop the detail/rule
 * views now declare; the transitional `id` arm was removed with
 * the `:fqn` landing.
 */
export function rolesListLocation(): RouteLocationRaw {
  return { name: 'admin-roles' };
}

export function policiesListLocation(): RouteLocationRaw {
  return { name: 'admin-policies' };
}

export function settingsHubLocation(): RouteLocationRaw {
  return { name: 'admin-settings' };
}

export function roleDetailLocation(fqn: string): RouteLocationRaw {
  return { name: 'admin-role', params: { fqn } };
}

export function policyDetailLocation(fqn: string): RouteLocationRaw {
  return { name: 'admin-policy', params: { fqn } };
}

export function addRoleLocation(): RouteLocationRaw {
  return { name: 'admin-role-add' };
}

export function addPolicyLocation(): RouteLocationRaw {
  return { name: 'admin-policy-add' };
}

export function addRuleLocation(fqn: string): RouteLocationRaw {
  return { name: 'admin-policy-rule-add', params: { fqn } };
}

export function editRuleLocation(fqn: string, ruleName: string): RouteLocationRaw {
  return { name: 'admin-policy-rule-edit', params: { fqn, ruleName } };
}

/** Team detail on the final members face (D8). */
export function teamDetailLocation(fqn: string): RouteLocationRaw {
  return { name: 'settings-members-team', params: { fqn } };
}

export function resolveDetailFqn(props: { fqn?: string }): string {
  return props.fqn ?? '';
}

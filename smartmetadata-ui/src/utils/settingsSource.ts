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
 * Deployment-managed settings predicates (PAT-MANAGED, 00-systemic D9).
 *
 * Ported from official `utils/platform/settingsSource.utils.ts` at pin
 * a3012259ca (392b3efd object tree), with the generated
 * `generated/system/settingsSourceResponse.ts` shapes. Only ENV mode
 * manages fields. `configType` is a plain string here (the SSO-scoped
 * port in `@/admin/ssoSettingsSource` uses the same shape, so the two
 * source types are structurally identical).
 *
 * Intentionally not ported: `applyManagedPathsToUiSchema` (RJSF
 * `UiSchema`-specific; the product has no RJSF renderer — Vue callers
 * check `isPointerManaged` per field instead, the same
 * ancestor-or-self semantics; the SSO port records the same decision).
 */

export const WHOLE_SETTING_PATH = '/';

const POINTER_SEPARATOR = '/';

export type ConfigSourceMode = 'AUTO' | 'DB' | 'ENV';

export interface OverriddenField {
  envVariable?: string;
  path: string;
}

export interface SettingSource {
  configType: string;
  editable: boolean;
  lastReloadError?: string;
  managedPaths?: string[];
  overriddenFields?: OverriddenField[];
  source: ConfigSourceMode;
  sourceVariable?: string;
}

export interface OverriddenSettingField extends OverriddenField {
  configType: string;
}

const encodePointerSegment = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

const decodePointerSegment = (segment: string): string =>
  segment.replaceAll('~1', '/').replaceAll('~0', '~');

/** Builds the JSON pointer of a field from its property names, outermost first. */
export const toJsonPointer = (...segments: string[]): string =>
  segments
    .map((segment) => `${POINTER_SEPARATOR}${encodePointerSegment(segment)}`)
    .join('');

export const getPointerSegments = (pointer: string): string[] =>
  pointer
    .split(POINTER_SEPARATOR)
    .slice(1)
    .filter((segment) => segment !== '')
    .map(decodePointerSegment);

const isUnderPointer = (pointer: string, ancestor: string): boolean =>
  pointer === ancestor || pointer.startsWith(`${ancestor}${POINTER_SEPARATOR}`);

export const isManagedByDeployment = (source?: SettingSource): boolean =>
  source?.source === 'ENV';

const getReportedManagedPaths = (source?: SettingSource): string[] =>
  isManagedByDeployment(source) ? (source?.managedPaths ?? []) : [];

/**
 * Whether no field of the setting can be changed here. `editable: false`
 * without a field list is treated the same way: the server refuses edits
 * but did not say which fields it owns.
 */
export const isWholeSettingManaged = (source?: SettingSource): boolean => {
  const managedPaths = getReportedManagedPaths(source);

  return (
    isManagedByDeployment(source) &&
    (managedPaths.includes(WHOLE_SETTING_PATH) ||
      (source?.editable === false && managedPaths.length === 0))
  );
};

/**
 * Pointers of the fields the deployment configuration owns, or just the
 * root pointer when it owns the whole setting. Only ENV mode makes a
 * field read-only.
 */
export const getManagedPaths = (source?: SettingSource): string[] =>
  isWholeSettingManaged(source)
    ? [WHOLE_SETTING_PATH]
    : getReportedManagedPaths(source);

/** Whether the field at `pointer`, or an object enclosing it, is among `managedPaths`. */
export const isPointerManaged = (
  managedPaths: string[],
  pointer: string,
): boolean =>
  managedPaths.some(
    (managedPath) =>
      managedPath === WHOLE_SETTING_PATH || isUnderPointer(pointer, managedPath),
  );

/** Whether the field at `pointer`, or an object enclosing it, is owned by the deployment. */
export const isPathManaged = (
  source: SettingSource | undefined,
  pointer: string,
): boolean => isPointerManaged(getManagedPaths(source), pointer);

export const areAllPathsManaged = (
  source: SettingSource | undefined,
  pointers: string[],
): boolean =>
  pointers.length > 0 && pointers.every((pointer) => isPathManaged(source, pointer));

export const findSettingSource = (
  sources: SettingSource[],
  configType: string,
): SettingSource | undefined =>
  sources.find((source) => source.configType === configType);

/**
 * Deployment values the stored settings override. ENV mode never reports
 * any: there the deployment value is applied on every start.
 */
export const getOverriddenFields = (
  sources: SettingSource[],
): OverriddenSettingField[] =>
  sources
    .filter((source) => !isManagedByDeployment(source))
    .flatMap((source) =>
      (source.overriddenFields ?? []).map((field) => ({
        ...field,
        configType: source.configType,
      })),
    );

/** One entry per variable, since several settings can share the variable that selects ENV. */
export const getEnvSourceVariables = (sources: SettingSource[]): string[] => [
  ...new Set(
    sources
      .filter(isManagedByDeployment)
      .map((source) => source.sourceVariable ?? ''),
  ),
];

function cloneDeepValue<T>(value: T): T {
  return structuredClone(value);
}

function getAtPath(source: unknown, segments: string[]): unknown {
  let current: unknown = source;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setAtPath(target: Record<string, unknown>, segments: string[], value: unknown): void {
  let current: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const next = segments[i + 1];
    const existing = current[segment];
    if (typeof existing !== 'object' || existing === null) {
      // Lodash `set` creates an array when the next key is index-like.
      current[segment] = /^\d+$/.test(next) ? [] : {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

function unsetAtPath(target: Record<string, unknown>, segments: string[]): void {
  let current: unknown = target;
  for (let i = 0; i < segments.length - 1; i++) {
    if (typeof current !== 'object' || current === null) {
      return;
    }
    current = (current as Record<string, unknown>)[segments[i]];
  }
  if (typeof current === 'object' && current !== null) {
    delete (current as Record<string, unknown>)[segments[segments.length - 1]];
  }
}

/**
 * Copies the saved value of every deployment-owned field into `candidate`,
 * removing the field where nothing is saved. A diff of the result against
 * `saved` then never touches those fields: the form fills schema defaults
 * into fields the user cannot edit, and the server rejects any change to
 * them.
 *
 * Deep clone / path access are hand-rolled (the product has no lodash
 * dependency); the control flow mirrors official `pinManagedFields`
 * exactly, including the whole-setting early return.
 */
export const pinManagedFields = <T extends object>(
  candidate: T,
  saved: T,
  managedPaths: string[],
  rootKey?: string,
): T => {
  const pinned = cloneDeepValue(candidate);

  for (const pointer of managedPaths) {
    const segments = [
      ...(rootKey ? [rootKey] : []),
      ...getPointerSegments(pointer),
    ];
    if (segments.length === 0) {
      return cloneDeepValue(saved);
    }
    const savedValue = getAtPath(saved, segments);
    if (savedValue === undefined) {
      unsetAtPath(pinned as Record<string, unknown>, segments);
    } else {
      setAtPath(pinned as Record<string, unknown>, segments, cloneDeepValue(savedValue));
    }
  }

  return pinned;
};

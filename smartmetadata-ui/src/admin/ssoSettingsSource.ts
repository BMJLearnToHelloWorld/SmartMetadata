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
 * Settings-source predicates and pin-back, ported from pin
 * `utils/platform/settingsSource.utils.ts`,
 * `hooks/platform/useSettingsSource.ts` and
 * `components/SettingsSso/useSecuritySettingsSource.ts`.
 *
 * Only ENV mode manages fields. A failed source request yields no
 * sources, so callers render as if the settings were stored only in the
 * database (failure unlock — the composable implements it by catching).
 *
 * Intentionally not ported: `applyManagedPathsToUiSchema` (RJSF-specific;
 * the Vue renderer checks `isSsoPointerManaged` per field instead, which
 * is the same ancestor-or-self semantics) and `areAllPathsManaged`
 * (no SSO caller).
 */

export const SSO_WHOLE_SETTING_PATH = '/';

export type SsoConfigSourceMode = 'AUTO' | 'DB' | 'ENV';

export interface SsoOverriddenField {
  envVariable?: string;
  path: string;
}

export interface SsoSettingSource {
  configType: string;
  editable: boolean;
  lastReloadError?: string;
  managedPaths?: string[];
  overriddenFields?: SsoOverriddenField[];
  source: SsoConfigSourceMode;
  sourceVariable?: string;
}

export interface SsoOverriddenSettingField extends SsoOverriddenField {
  configType: string;
}

export const SSO_SECURITY_SETTING_TYPES = [
  'authenticationConfiguration',
  'authorizerConfiguration',
] as const;

function encodeSsoPointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function decodeSsoPointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

/** Builds a JSON pointer from property names, outermost first. */
export function toSsoJsonPointer(...segments: string[]): string {
  return segments
    .map((segment) => `/${encodeSsoPointerSegment(segment)}`)
    .join('');
}

export function getSsoPointerSegments(pointer: string): string[] {
  return pointer
    .split('/')
    .slice(1)
    .filter((segment) => segment !== '')
    .map(decodeSsoPointerSegment);
}

function isUnderSsoPointer(pointer: string, ancestor: string): boolean {
  return pointer === ancestor || pointer.startsWith(`${ancestor}/`);
}

export function isSsoManagedByDeployment(
  source?: SsoSettingSource,
): boolean {
  return source?.source === 'ENV';
}

function getReportedSsoManagedPaths(source?: SsoSettingSource): string[] {
  return isSsoManagedByDeployment(source) ? (source?.managedPaths ?? []) : [];
}

/**
 * Whether no field of the setting can be changed here. `editable: false`
 * without a field list counts the same way.
 */
export function isSsoWholeSettingManaged(source?: SsoSettingSource): boolean {
  const managedPaths = getReportedSsoManagedPaths(source);
  return (
    isSsoManagedByDeployment(source) &&
    (managedPaths.includes(SSO_WHOLE_SETTING_PATH) ||
      (source?.editable === false && managedPaths.length === 0))
  );
}

/** Managed pointers, or just the root pointer when the whole setting is owned. */
export function getSsoManagedPaths(source?: SsoSettingSource): string[] {
  return isSsoWholeSettingManaged(source)
    ? [SSO_WHOLE_SETTING_PATH]
    : getReportedSsoManagedPaths(source);
}

/** Whether the field at `pointer`, or an enclosing object, is managed. */
export function isSsoPointerManaged(
  managedPaths: string[],
  pointer: string,
): boolean {
  return managedPaths.some(
    (managedPath) =>
      managedPath === SSO_WHOLE_SETTING_PATH ||
      isUnderSsoPointer(pointer, managedPath),
  );
}

/** Whether the field at `pointer` is owned by the deployment for one source. */
export function isSsoPathManaged(
  source: SsoSettingSource | undefined,
  pointer: string,
): boolean {
  return isSsoPointerManaged(getSsoManagedPaths(source), pointer);
}

export function findSsoSettingSource(
  sources: SsoSettingSource[],
  configType: string,
): SsoSettingSource | undefined {
  return sources.find((source) => source.configType === configType);
}

/** Deployment values the stored settings override (never reported in ENV mode). */
export function getSsoOverriddenFields(
  sources: SsoSettingSource[],
): SsoOverriddenSettingField[] {
  return sources
    .filter((source) => !isSsoManagedByDeployment(source))
    .flatMap((source) =>
      (source.overriddenFields ?? []).map((field) => ({
        ...field,
        configType: source.configType,
      })),
    );
}

/** One entry per variable; `''` when a source reports no variable. */
export function getSsoEnvSourceVariables(sources: SsoSettingSource[]): string[] {
  return [
    ...new Set(
      sources
        .filter(isSsoManagedByDeployment)
        .map((source) => source.sourceVariable ?? ''),
    ),
  ];
}

function getSsoPathValue(
  data: unknown,
  segments: string[],
): unknown {
  let current: unknown = data;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setSsoPathValue(
  data: Record<string, unknown>,
  segments: string[],
  value: unknown,
): void {
  let current: Record<string, unknown> = data;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = current[segments[i]];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[segments[i]] = {};
    }
    current = current[segments[i]] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

function unsetSsoPathValue(
  data: Record<string, unknown>,
  segments: string[],
): void {
  let current: Record<string, unknown> | undefined = data;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = current?.[segments[i]];
    if (!next || typeof next !== 'object') {
      return;
    }
    current = next as Record<string, unknown>;
  }
  if (current) {
    delete current[segments[segments.length - 1]];
  }
}

function isPlainSsoObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Deep clone for JSON-shaped values. `structuredClone` cannot clone Vue
 * reactive proxies (`DataCloneError`), and this module's inputs come
 * from reactive form state — so the clone walks plain objects and arrays
 * by property access, which reads through proxies. Non-plain values
 * cannot occur in form data and pass through untouched.
 */
function cloneSsoValue<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneSsoValue(item)) as T;
  }
  if (isPlainSsoObject(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      cloned[key] = cloneSsoValue(child);
    }
    return cloned as T;
  }
  return value;
}

/**
 * Copies the saved value of every deployment-owned field into `candidate`,
 * removing the field where nothing is saved (pin `pinManagedFields`). A
 * root pointer with no `rootKey` replaces the whole document with the
 * saved one and returns immediately. The candidate is never mutated.
 */
export function pinSsoManagedFields<T extends object>(
  candidate: T,
  saved: T,
  managedPaths: string[],
  rootKey?: string,
): T {
  const pinned = cloneSsoValue(candidate);

  for (const pointer of managedPaths) {
    const segments = [
      ...(rootKey ? [rootKey] : []),
      ...getSsoPointerSegments(pointer),
    ];
    if (segments.length === 0) {
      return cloneSsoValue(saved);
    }
    const savedValue = getSsoPathValue(saved, segments);
    if (savedValue === undefined) {
      unsetSsoPathValue(pinned as Record<string, unknown>, segments);
    } else {
      setSsoPathValue(
        pinned as Record<string, unknown>,
        segments,
        cloneSsoValue(savedValue),
      );
    }
  }

  return pinned;
}

export interface SsoSecuritySources {
  managedPaths: {
    authenticationConfiguration: string[];
    authorizerConfiguration: string[];
  };
  /** The deployment owns both settings whole, so the form only displays. */
  isReadOnly: boolean;
  isProviderManaged: boolean;
  isSelfSignupManaged: boolean;
}

/** The three security predicates over the two section sources (pin hook). */
export function resolveSsoSecuritySources(
  sources: SsoSettingSource[],
): SsoSecuritySources {
  const authenticationSource = findSsoSettingSource(
    sources,
    'authenticationConfiguration',
  );
  const authorizerSource = findSsoSettingSource(
    sources,
    'authorizerConfiguration',
  );

  return {
    managedPaths: {
      authenticationConfiguration: getSsoManagedPaths(authenticationSource),
      authorizerConfiguration: getSsoManagedPaths(authorizerSource),
    },
    isReadOnly:
      isSsoWholeSettingManaged(authenticationSource) &&
      isSsoWholeSettingManaged(authorizerSource),
    isProviderManaged: isSsoPathManaged(authenticationSource, '/provider'),
    isSelfSignupManaged: isSsoPathManaged(
      authenticationSource,
      '/enableSelfSignup',
    ),
  };
}

/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { ssoStartCase } from './ssoProviders';
import type { SsoJsonSchema } from './ssoSchemas';
import {
  getSsoUiEntry,
  isSsoUiHidden,
  SSO_ADVANCED_PROPERTIES,
  type SsoUiSchemaResolution,
} from './ssoUiSchema';

/**
 * Validation pipeline, ported from pin `utils/formPureUtils.ts`
 * (`transformErrors`, `createScrollToErrorHandler`), `utils/SSOUtils.ts`
 * (`parseValidationErrors`, `clearFieldError`, `findChangedFields`,
 * `hasFieldValidationErrors`), `utils/ToastUtils.ts` + `utils/StringUtils.ts`
 * (`getErrorText`) and the `useSsoConfiguration` error handling.
 *
 * The client pipeline is an AJV8 adapter, not RJSF: AJV errors are mapped
 * to the RJSF `property` shape, then filtered/rewritten by the verbatim
 * `transformErrors` rules (DOM-presence gate + required/minimum/maximum
 * only). Save never consults this pipeline — there is no client save gate.
 *
 * The SSO schemas contain no `$ref`s (audited), so the adapter compiles
 * them as-is, like pin's RJSF validator; the ingestion
 * `neutralizeUnresolvableRefs` step has nothing to neutralize here.
 * AJV runs without `ajv-formats`, so `format` keywords never produce
 * errors — unobservable, because `transformErrors` discards `format`
 * errors anyway.
 */

export interface SsoErrorSchema {
  __errors?: string[];
  [key: string]: SsoErrorSchema | string[] | undefined;
}

export interface SsoValidationIssue {
  field: string;
  error: string;
}

/** Dot-path nesting with later-error overwrite (pin `parseValidationErrors`). */
export function parseSsoValidationErrors(
  errors: SsoValidationIssue[],
): SsoErrorSchema {
  const errorSchema: SsoErrorSchema = {};

  for (const error of errors) {
    const pathParts = error.field.split('.');
    let current: SsoErrorSchema = errorSchema;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (i === pathParts.length - 1) {
        current[part] ??= {};
        (current[part] as SsoErrorSchema).__errors = [error.error];
      } else {
        current[part] ??= {};
        current = current[part] as SsoErrorSchema;
      }
    }
  }

  return errorSchema;
}

function navigateToTargetField(
  errorSchema: SsoErrorSchema,
  pathParts: string[],
): { parent: SsoErrorSchema; targetKey: string } | null {
  let current = errorSchema;

  const parentParts = pathParts.slice(0, -1);
  for (const part of parentParts) {
    if (!current[part]) {
      return null;
    }
    current = current[part] as SsoErrorSchema;
  }

  const targetKey = pathParts.at(-1);
  if (!targetKey || !current[targetKey]) {
    return null;
  }

  return { parent: current, targetKey };
}

function cleanupEmptyParents(
  errorSchema: SsoErrorSchema,
  pathParts: string[],
): void {
  let current = errorSchema;

  for (const part of pathParts) {
    if (!current[part] || typeof current[part] !== 'object') {
      break;
    }

    const obj = current[part] as SsoErrorSchema;
    if (Object.keys(obj).length === 0) {
      delete current[part];
      break;
    }

    current = obj;
  }
}

/**
 * Deletes one field's errors and the first empty ancestor (pin
 * `clearFieldError`). Takes the error object directly; pin takes a ref
 * wrapper around the same object. Mutates in place.
 */
export function clearSsoFieldError(
  fieldErrors: SsoErrorSchema,
  fieldPath: string,
): void {
  if (!fieldErrors || Object.keys(fieldErrors).length === 0) {
    return;
  }

  const pathParts = fieldPath.replace(/^root\//, '').split('/');
  const navigation = navigateToTargetField(fieldErrors, pathParts);

  if (!navigation) {
    return;
  }

  delete navigation.parent[navigation.targetKey];

  const parentPaths = pathParts.slice(0, -1);
  cleanupEmptyParents(fieldErrors, parentPaths);
}

/**
 * Changed-field detection (pin `findChangedFields`): JSON.stringify deep
 * compare, objects recurse, arrays/scalars compare whole, paths are
 * `root/...`. Returns [] when either side is falsy or not a plain object —
 * so a newly added object block yields no changed paths.
 */
export function findSsoChangedFields(
  oldData: unknown,
  newData: unknown,
  path: string[] = [],
): string[] {
  const changedFields: string[] = [];

  if (!oldData || !newData) {
    return changedFields;
  }

  const isObject = (val: unknown): val is Record<string, unknown> =>
    typeof val === 'object' && val !== null && !Array.isArray(val);

  if (!isObject(oldData) || !isObject(newData)) {
    return changedFields;
  }

  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const currentPath = [...path, key];
    const oldValue = oldData[key];
    const newValue = newData[key];

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      if (isObject(newValue)) {
        changedFields.push(
          ...findSsoChangedFields(oldValue, newValue, currentPath),
        );
      } else {
        changedFields.push('root/' + currentPath.join('/'));
      }
    }
  }

  return changedFields;
}

/** Looks up the `__errors` array at a slash-path inside an error schema. */
export function getSsoFieldErrors(
  fieldErrors: SsoErrorSchema,
  path: string[],
): string[] {
  let current: SsoErrorSchema | undefined = fieldErrors;
  for (const segment of path) {
    const next = current?.[segment];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      return [];
    }
    current = next as SsoErrorSchema;
  }
  return current?.__errors ?? [];
}

/** The `liveValidate` gate input: any key present, including `general`. */
export function hasSsoFieldErrors(fieldErrors: SsoErrorSchema): boolean {
  return Object.keys(fieldErrors).length > 0;
}

/**
 * The backend split (pin `handleValidationErrors`): non-blank `field`
 * errors go to field backfill; blank/missing `field` errors go to verbatim
 * toasts. Both lists can be non-empty in one response.
 */
export function splitSsoValidationErrors(errors: SsoValidationIssue[]): {
  fieldErrors: SsoValidationIssue[];
  genericErrors: SsoValidationIssue[];
} {
  const fieldErrors: SsoValidationIssue[] = [];
  const genericErrors: SsoValidationIssue[] = [];
  for (const error of errors) {
    if (typeof error.field === 'string' && error.field.trim() !== '') {
      fieldErrors.push(error);
    } else {
      genericErrors.push(error);
    }
  }
  return { fieldErrors, genericErrors };
}

/** RJSF-shaped validation error, as produced from an AJV error object. */
export interface SsoRjsfError {
  property: string;
  params?: Record<string, unknown>;
  name: string;
  message?: string;
}

/**
 * Maps an AJV error to the RJSF `property` shape: dot-form instance path
 * ('' at the root). The combined SSO schema has no root `required`, so the
 * empty case is unreachable here, but the mapping is total.
 */
export function toSsoRjsfError(ajvError: ErrorObject): SsoRjsfError {
  const instancePath = ajvError.instancePath;
  return {
    property:
      instancePath === ''
        ? ''
        : '.' + instancePath.slice(1).replaceAll('/', '.'),
    params: ajvError.params as Record<string, unknown> | undefined,
    name: ajvError.keyword,
    message: ajvError.message,
  };
}

/**
 * Verbatim port of pin `transformErrors`: builds the DOM id from `property`,
 * drops the error when the element is absent, rewrites only
 * required/minimum/maximum (and only when `params` is present), drops
 * everything else. The DOM check and the message formatter are injected;
 * the formatter receives the pin template keys.
 *
 * NOTE on the minimum `field` text: the formula applies `startCase` to the
 * whole dotted `property` (the `/`-split yields one segment), so nested
 * fields name the full path, e.g.
 * `Authentication Configuration Oidc Configuration Token Validity`.
 * The fixture doc's shorter derivation for F-A8 is an unvalidated guess;
 * the code formula governs.
 */
export function transformSsoValidationErrors(
  errors: SsoRjsfError[],
  context: {
    isElementPresent: (id: string) => boolean;
    formatMessage: (key: string, params: Record<string, unknown>) => string;
  },
): SsoRjsfError[] {
  const transformed: SsoRjsfError[] = [];

  for (const error of errors) {
    const { property, params, name } = error;
    const id = property?.startsWith('.')
      ? 'root' + property.replaceAll('.', '/')
      : `root/${property}`;

    if (!context.isElementPresent(id)) {
      continue;
    }

    const fieldName = ssoStartCase(property?.split('/').pop() ?? '');
    let message: string | undefined;
    if (name === 'required') {
      message = context.formatMessage('message.field-text-is-required', {
        fieldText: ssoStartCase(
          (params?.missingProperty as string | undefined) ?? '',
        ),
      });
    } else if (name === 'minimum') {
      message = context.formatMessage('message.value-must-be-greater-than', {
        field: fieldName,
        minimum: params?.limit,
      });
    } else if (name === 'maximum') {
      message = context.formatMessage(
        'message.value-must-be-less-than-or-equal',
        { field: fieldName, maximum: params?.limit },
      );
    }

    if (message !== undefined && params) {
      transformed.push({ ...error, message });
    }
  }

  return transformed;
}

/**
 * Converts transformed client errors to a display map keyed by `root/...`
 * field path. `required` errors attach to the missing field (parent path +
 * `missingProperty`); minimum/maximum errors attach to their own path.
 * Messages keep their order; duplicates are removed at merge time.
 */
export function buildSsoClientErrorMap(
  errors: SsoRjsfError[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const error of errors) {
    if (error.message === undefined) {
      continue;
    }
    const segments = error.property
      ? error.property.replace(/^\./, '').split('.')
      : [];
    if (error.name === 'required' && error.params?.missingProperty) {
      segments.push(error.params.missingProperty as string);
    }
    const path = 'root/' + segments.join('/');
    const existing = map.get(path) ?? [];
    existing.push(error.message);
    map.set(path, existing);
  }
  return map;
}

/** Merges client-first + backend messages for one field, deduped in order. */
export function mergeSsoDisplayErrors(
  clientMessages: string[],
  backendMessages: string[],
): string[] {
  return [...new Set([...clientMessages, ...backendMessages])];
}

const SSO_AJV = new Ajv({ allErrors: true, strict: false });
const SSO_VALIDATOR_CACHE = new WeakMap<object, ValidateFunction>();

function getSsoValidator(schema: SsoJsonSchema): ValidateFunction {
  let validator = SSO_VALIDATOR_CACHE.get(schema);
  if (!validator) {
    validator = SSO_AJV.compile(schema as Record<string, unknown>);
    SSO_VALIDATOR_CACHE.set(schema, validator);
  }
  return validator;
}

/** Runs AJV against the (surgered) schema; returns the raw error objects. */
export function validateSsoFormData(
  schema: SsoJsonSchema,
  data: unknown,
): ErrorObject[] {
  const validator = getSsoValidator(schema);
  validator(data);
  return validator.errors ?? [];
}

export interface SsoScrollToErrorOptions {
  scrollContainer?: string;
  errorSelector?: string;
  offsetTop?: number;
  delay?: number;
  behavior?: ScrollBehavior;
}

/** Port of pin `createScrollToErrorHandler`. */
export function createSsoScrollToErrorHandler(
  options: SsoScrollToErrorOptions = {},
): () => void {
  const {
    scrollContainer = '.drawer-form-content',
    errorSelector = '[aria-invalid="true"], [data-invalid="true"]',
    offsetTop = 100,
    delay = 100,
    behavior = 'smooth',
  } = options;

  return () => {
    setTimeout(() => {
      const firstError = document.querySelector(errorSelector);
      if (firstError) {
        const scrollableContainer = firstError.closest(scrollContainer);
        if (scrollableContainer) {
          const errorRect = firstError.getBoundingClientRect();
          const containerRect = scrollableContainer.getBoundingClientRect();
          const scrollTop =
            scrollableContainer.scrollTop +
            errorRect.top -
            containerRect.top -
            offsetTop;
          scrollableContainer.scrollTo({
            top: Math.max(0, scrollTop),
            behavior,
          });
        } else {
          firstError.scrollIntoView({
            behavior,
            block: 'center',
            inline: 'nearest',
          });
        }
      }
    }, delay);
  };
}

/** The SSO-configured scroll handler (pin `scrollToFirstError` options). */
export function createSsoFormScrollHandler(): () => void {
  return createSsoScrollToErrorHandler({
    scrollContainer: '.resizable-first-panel >.overflow-y-auto',
    errorSelector: '.field-error.has-error,.form-field-error',
    offsetTop: 100,
    delay: 100,
    behavior: 'smooth',
  });
}

/**
 * Whether an error carries field-level validation errors (pin
 * `hasFieldValidationErrors`, adapted to `ApiError` whose body is raw
 * text). NARROWING (documented): pin only requires the `errors` key to be
 * present; this port additionally requires an array, matching the
 * product's fail-closed `parseSecurityValidationResponse`. A non-array
 * `errors` value falls through to the generic toast — the same visible
 * outcome as pin, whose `.filter` on a non-array throws into the same
 * generic-toast catch.
 */
export function hasSsoFieldValidationErrors(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const body = (error as { body?: unknown }).body;
  if (typeof body !== 'string') {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      'errors' in parsed &&
      Array.isArray((parsed as { errors: unknown }).errors)
    );
  } catch {
    return false;
  }
}

export interface SsoErrorResolution {
  message: string;
  kind: 'error' | 'warning';
  suppressed: boolean;
}

/**
 * The server's own reason for a failed call (pin `getErrorText` chain),
 * without toast resolution: the message chain is `response.data.message`
 * → `responseMessage` → the body itself when it is a string → the
 * fallback. Strings render verbatim. Test Login problems use this raw
 * chain — they are listed in the modal, never toasted, so the
 * 401/403 suppression and rule-violation kind do not apply.
 */
export function getSsoErrorText(error: unknown, fallbackText: string): string {
  if (typeof error === 'string') {
    return error;
  }
  if (
    error &&
    typeof error === 'object' &&
    typeof (error as { body?: unknown }).body === 'string'
  ) {
    const body = (error as { body: string }).body;
    const { parsed, parsedString, parseFailed } = parseSsoErrorBodyObject(body);
    if (parsed) {
      const message = parsed.message;
      const responseMessage = parsed.responseMessage;
      if (typeof message === 'string' && message) {
        return message;
      }
      if (typeof responseMessage === 'string' && responseMessage) {
        return responseMessage;
      }
    } else if (parsedString) {
      return parsedString;
    } else if (parseFailed && body) {
      // Unparseable body: pin's `data` is the raw string itself.
      return body;
    }
  }
  return fallbackText;
}

function parseSsoErrorBodyObject(body: string): {
  parsed: Record<string, unknown> | null;
  parsedString: string | null;
  parseFailed: boolean;
} {
  let parsed: Record<string, unknown> | null = null;
  let parsedString: string | null = null;
  let parseFailed = false;
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>;
    } else if (typeof value === 'string') {
      parsedString = value;
    }
  } catch {
    parseFailed = true;
  }
  return { parsed, parsedString, parseFailed };
}

/**
 * Toast resolution (pin `resolveErrorDetails` + `resolveAxiosErrorMessage`
 * + `getErrorText`), adapted to `ApiError` (raw-text body, no method).
 * The HTTP method is passed explicitly by call sites because `ApiError`
 * does not carry one. Strings render verbatim and are never suppressed;
 * anything else falls back to `fallbackText`.
 */
export function resolveSsoErrorDetails(
  error: unknown,
  fallbackText: string,
  method?: string,
): SsoErrorResolution {
  if (typeof error === 'string') {
    return { message: error, kind: 'error', suppressed: false };
  }

  if (
    error &&
    typeof error === 'object' &&
    typeof (error as { body?: unknown }).body === 'string'
  ) {
    const apiError = error as { status?: unknown; body: string };
    const { parsed } = parseSsoErrorBodyObject(apiError.body);
    const message = getSsoErrorText(error, fallbackText);

    const isRuleViolation = parsed?.errorType === 'RULE_VIOLATION';
    const normalizedMethod = method?.toUpperCase();
    const isUnauthorizedOrForbiddenGet =
      apiError.status === 401 ||
      (apiError.status === 403 && normalizedMethod === 'GET');
    const suppressed = Boolean(
      isUnauthorizedOrForbiddenGet && !message.includes('principal domain'),
    );

    return {
      message,
      kind: isRuleViolation ? 'warning' : 'error',
      suppressed,
    };
  }

  return { message: fallbackText, kind: 'error', suppressed: false };
}

/** Parses a field-error response body into `{field, error}` issues. */
export function parseSsoErrorBody(body: string): SsoValidationIssue[] {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as { errors?: unknown }).errors)
    ) {
      return (
        (parsed as { errors: unknown[] }).errors.filter(
          (entry): entry is SsoValidationIssue =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { field?: unknown }).field === 'string' &&
            typeof (entry as { error?: unknown }).error === 'string',
        )
      );
    }
  } catch {
    // Fall through to the empty list.
  }
  return [];
}

/**
 * The set of RJSF-style field ids (`root/<slash-path>`) present in the
 * rendered form, computed from the surgered schema and the resolved UI
 * schema — the Vue equivalent of pin `transformErrors`' live
 * `document.getElementById` gate. A node is present unless it is hidden
 * and not advanced: hidden normal fields are filtered out of their group
 * entirely, while hidden advanced fields still render as hidden divs
 * inside the (mounted) Advanced accordion. A hidden object prunes its
 * whole subtree; no SSO object name is advanced, so the prune is exact.
 * Array fields contribute only their own wrapper id — their items carry
 * no separate field ids. The renderer must render exactly this set.
 */
export function computeSsoDomPresentIds(
  schema: SsoJsonSchema,
  resolution: SsoUiSchemaResolution | Record<string, never>,
): Set<string> {
  const ids = new Set<string>();

  const walk = (node: SsoJsonSchema, path: string[]): void => {
    const entry = getSsoUiEntry(resolution, path);
    const hidden = isSsoUiHidden(entry);
    const advanced = SSO_ADVANCED_PROPERTIES.includes(path[path.length - 1]);
    if (hidden && !advanced) {
      return;
    }
    ids.add(`root/${path.join('/')}`);
    const properties = node.properties;
    if (properties && typeof properties === 'object') {
      for (const name of Object.keys(properties)) {
        walk(properties[name], [...path, name]);
      }
    }
  };

  const properties = schema.properties;
  if (properties && typeof properties === 'object') {
    for (const name of Object.keys(properties)) {
      walk(properties[name], [name]);
    }
  }
  return ids;
}

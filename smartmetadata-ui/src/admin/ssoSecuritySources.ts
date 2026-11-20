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
 * Which parts of the SSO configuration the deployment owns, for every
 * SSO settings screen — the product counterpart of pin
 * `components/SettingsSso/useSecuritySettingsSource.ts`, as pure
 * functions over the shared `SettingSource` module (the product has no
 * react-query hook; pages fetch via `getSettingsSource` themselves).
 * This is the only SSO-scoped SettingSource code left after the II-6
 * unify: the predicates themselves live in `@/utils/settingsSource`
 * and are reused here, not duplicated.
 */
import {
  findSettingSource,
  getManagedPaths,
  isPathManaged,
  isWholeSettingManaged,
  type SettingSource,
} from '@/utils/settingsSource';

export const SSO_SECURITY_SETTING_TYPES = [
  'authenticationConfiguration',
  'authorizerConfiguration',
] as const;

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
  sources: SettingSource[],
): SsoSecuritySources {
  const authenticationSource = findSettingSource(
    sources,
    'authenticationConfiguration',
  );
  const authorizerSource = findSettingSource(
    sources,
    'authorizerConfiguration',
  );

  return {
    managedPaths: {
      authenticationConfiguration: getManagedPaths(authenticationSource),
      authorizerConfiguration: getManagedPaths(authorizerSource),
    },
    isReadOnly:
      isWholeSettingManaged(authenticationSource) &&
      isWholeSettingManaged(authorizerSource),
    isProviderManaged: isPathManaged(authenticationSource, '/provider'),
    isSelfSignupManaged: isPathManaged(
      authenticationSource,
      '/enableSelfSignup',
    ),
  };
}

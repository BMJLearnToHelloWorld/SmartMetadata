/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { watch } from 'vue';
import type { Ref } from 'vue';
import type { RouteLocationNormalized, Router } from 'vue-router';
import { NAV_ENTRIES, selectedNavKey } from '@/layouts/nav';
import { RESIDUAL_PAGES } from '@/layouts/residualPages';

/**
 * Browser tab title follows the current page. Resolution order, first hit wins,
 * and every key is an existing i18n key (no new copy is invented here):
 * 1. route.meta.titleKey — explicit per-route override (extension point);
 * 2. special routes that never appear in the sidebar (auth forms, errors);
 * 3. residual shells, which render their own title, not the nav overview name;
 * 4. the sidebar entry for the route, via selectedNavKey, so detail pages
 *    fall back to their list page (domain detail -> domains, asset -> Explore).
 * Nothing matches (login included) -> the product name alone, no suffix.
 */
const PRODUCT_TITLE = 'iSmart';

const SPECIAL_TITLES: Record<string, string> = {
  signup: 'auth.signUpTitle',
  'forgot-password': 'auth.forgotTitle',
  'reset-password': 'auth.resetTitle',
  'saml-callback': 'auth.samlTitle',
  'sso-signup': 'auth.ssoSignUpTitle',
  'registration-confirmation': 'auth.registrationTitle',
  logout: 'auth.logoutTitle',
  forbidden: 'errors.forbidden',
  'not-found': 'errors.notFound',
};

type TitleRoute = Pick<RouteLocationNormalized, 'name' | 'meta'>;

function navTitleKey(routeName: string | symbol | null | undefined): string | undefined {
  const selected = selectedNavKey(routeName);
  for (const entry of NAV_ENTRIES) {
    if (entry.kind === 'section') {
      const item = entry.items.find((child) => child.key === selected);
      if (item) {
        return item.titleKey;
      }
    } else if (entry.key === selected) {
      return entry.titleKey;
    }
  }
  return undefined;
}

export function resolveDocumentTitleKey(route: TitleRoute): string | undefined {
  const metaKey = route.meta?.titleKey;
  if (typeof metaKey === 'string' && metaKey) {
    return metaKey;
  }
  const name = String(route.name ?? '');
  if (SPECIAL_TITLES[name]) {
    return SPECIAL_TITLES[name];
  }
  const residual = RESIDUAL_PAGES.find((page) => page.name === name);
  if (residual) {
    return residual.titleKey;
  }
  return navTitleKey(route.name);
}

export function documentTitleFor(
  route: TitleRoute,
  translate: (key: string) => string,
): string {
  const key = resolveDocumentTitleKey(route);
  return key ? `${translate(key)} - ${PRODUCT_TITLE}` : PRODUCT_TITLE;
}

interface TitleI18n {
  global: {
    t: (key: string) => string;
    locale: Ref<unknown>;
  };
}

export function installDocumentTitle(router: Router, i18n: TitleI18n): void {
  const apply = (): void => {
    document.title = documentTitleFor(
      router.currentRoute.value,
      (key: string) => i18n.global.t(key),
    );
  };
  router.afterEach(apply);
  // Navigation alone misses locale switches (no route change), so re-apply
  // when the language changes and the tab text follows the new locale.
  watch(() => i18n.global.locale.value, apply);
}

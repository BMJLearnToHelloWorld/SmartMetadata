/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { useAuthStore } from '@/stores/auth';
import {
  readConnectionsViewMode,
  writeConnectionsViewMode,
} from '@/utils/userPageSizePreference';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * The Connections grid/list mode, mirroring official
 * `useConnectionsViewMode` (pin a3012259ca): `?viewMode=` wins, else
 * the user's stored preference, else the pin default `'grid'`.
 * `setViewMode` writes both the URL parameter and the preference.
 *
 * Product adaptation: pin stores the preference server-side via
 * `useCurrentUserStore.setPreference`; the product stores it locally
 * in the per-user `sm.userPreferences.v1` document (see
 * `readConnectionsViewMode`) — no server field is invented.
 */

export type ConnectionsViewMode = 'grid' | 'list';

function isConnectionsViewMode(value: string | null | undefined): value is ConnectionsViewMode {
  return value === 'grid' || value === 'list';
}

export function useConnectionsViewMode() {
  const route = useRoute();
  const router = useRouter();
  const auth = useAuthStore();

  const viewMode = computed<ConnectionsViewMode>(() => {
    const param = route.query.viewMode;
    const rawParam = Array.isArray(param) ? param[0] : param;
    if (isConnectionsViewMode(typeof rawParam === 'string' ? rawParam : undefined)) {
      return rawParam as ConnectionsViewMode;
    }
    return (
      readConnectionsViewMode(window.localStorage, auth.user?.name) ?? 'grid'
    );
  });

  function setViewMode(nextViewMode: ConnectionsViewMode): void {
    void router.replace({
      query: { ...route.query, viewMode: nextViewMode },
    });
    writeConnectionsViewMode(window.localStorage, auth.user?.name, nextViewMode);
  }

  return { setViewMode, viewMode };
}

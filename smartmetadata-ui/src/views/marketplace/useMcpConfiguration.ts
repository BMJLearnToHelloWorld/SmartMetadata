/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { message } from 'ant-design-vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError } from '@/api/client';
import { getMcpConfig, updateMcpConfig, type MCPConfiguration } from '@/api/mcpConfig';
import { getSettingsSource } from '@/api/system';
import {
  findSettingSource,
  isPathManaged,
  toJsonPointer,
  type SettingSource,
} from '@/utils/settingsSource';

/**
 * The three fields an operator may correct from the product (pin
 * useMcpConfiguration.ts). Everything else in the stored
 * `mcpConfiguration` stays out of the form but is merged back on save,
 * because the PUT replaces the whole setting.
 */
export const EDITABLE_MCP_CONFIG_FIELDS: Array<keyof MCPConfiguration> = [
  'baseUrl',
  'allowedOrigins',
  'maxResponseChars',
];

const MCP_CONFIG_TYPE = 'mcpConfiguration';

/**
 * Official useMcpConfiguration (components/Settings/Applications/
 * McpApplicationConfiguration/useMcpConfiguration.ts, pin a3012259ca):
 * the MCP app entity holds no configuration of its own; the form talks
 * to `/system/mcp/config` directly. A 404 means the setting was never
 * written and falls back to the schema defaults without an error.
 * Managed fields come from the shared settings-source predicates; a
 * failed sources fetch yields no sources (database-only rendering).
 */
export function useMcpConfiguration() {
  const { t } = useI18n();
  const formConfig = ref<MCPConfiguration>({});
  const isFetching = ref(true);
  const isSaving = ref(false);
  const sources = ref<SettingSource[]>([]);
  // Fields outside the form never affect rendering; held in a plain
  // variable because they only matter at save time.
  let storedConfig: MCPConfiguration = {};

  const managedFields = computed(() => {
    const mcpSource = findSettingSource(sources.value, MCP_CONFIG_TYPE);
    return EDITABLE_MCP_CONFIG_FIELDS.filter((field) =>
      isPathManaged(mcpSource, toJsonPointer(field)),
    );
  });

  const isEveryFieldManaged = computed(
    () => managedFields.value.length === EDITABLE_MCP_CONFIG_FIELDS.length,
  );

  function applyConfig(config: MCPConfiguration): void {
    storedConfig = config;
    const picked: MCPConfiguration = {};
    for (const field of EDITABLE_MCP_CONFIG_FIELDS) {
      if (config[field] !== undefined) {
        (picked as Record<string, unknown>)[field] = config[field];
      }
    }
    formConfig.value = picked;
  }

  async function fetchMcpConfig(): Promise<void> {
    isFetching.value = true;
    try {
      applyConfig(await getMcpConfig());
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        applyConfig({});
      } else {
        message.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      isFetching.value = false;
    }
  }

  async function refetchSources(): Promise<void> {
    try {
      const all = await getSettingsSource();
      sources.value = all.filter((source) => source.configType === MCP_CONFIG_TYPE);
    } catch {
      sources.value = [];
    }
  }

  async function saveMcpConfig(formData: MCPConfiguration): Promise<void> {
    isSaving.value = true;
    try {
      const payload = { ...storedConfig, ...formData };
      applyConfig(await updateMcpConfig(payload));
      message.success(
        t('message.entity-saved-successfully', { entity: t('label.configuration') }),
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      isSaving.value = false;
    }
  }

  onMounted(() => {
    void fetchMcpConfig();
    void refetchSources();
  });

  return {
    formConfig,
    managedFields,
    isEveryFieldManaged,
    isFetching,
    isSaving,
    sources,
    fetchMcpConfig,
    refetchSources,
    saveMcpConfig,
  };
}

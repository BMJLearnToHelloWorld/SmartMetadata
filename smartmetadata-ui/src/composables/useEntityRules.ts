/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official useEntityRules for the ContractDetail form surface only.
 * Fetches GET /v1/system/settings/entityRulesSettings/{entityType} and
 * returns getEntityRulesValidation hints. Does not invent a product-wide
 * RuleEnforcementProvider.
 */
import { computed, ref, unref, watch, type MaybeRef, type Ref } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { getEntityRules } from '@/api/system';
import {
  getEntityRulesValidation,
  parseRule,
  toEntityRule,
  type DataAssetRuleValidation,
  type ParsedRule,
} from '@/catalog/entityRules';
import { getErrorText } from '@/views/admin/accessApiErrors';

export function useEntityRules(entityType: MaybeRef<string>): {
  rules: Ref<ParsedRule[]>;
  entityRules: Ref<DataAssetRuleValidation>;
  isRulesLoaded: Ref<boolean>;
  isLoading: Ref<boolean>;
} {
  const { t } = useI18n();
  const rules = ref<ParsedRule[]>([]);
  const isLoading = ref(false);
  const isRulesLoaded = ref(false);

  const entityRules = computed(() => getEntityRulesValidation(rules.value, unref(entityType)));

  async function fetchRulesForEntity(type: string): Promise<void> {
    if (!type) {
      return;
    }
    isLoading.value = true;
    try {
      const response = await getEntityRules(type);
      rules.value = response.map((item) => parseRule(toEntityRule(item)));
      isRulesLoaded.value = true;
    } catch (error) {
      message.error(getErrorText(error, t('server.unexpected-error')));
    } finally {
      isLoading.value = false;
    }
  }

  watch(
    () => unref(entityType),
    (type) => {
      rules.value = [];
      isRulesLoaded.value = false;
      void fetchRulesForEntity(type);
    },
    { immediate: true },
  );

  return {
    rules,
    entityRules,
    isRulesLoaded,
    isLoading,
  };
}

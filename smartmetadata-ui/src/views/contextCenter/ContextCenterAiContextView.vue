<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  List,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'ant-design-vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { EntityListColumn } from '@/features/crud/types';
import FormModal from '@/components/shared/FormModal.vue';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import {
  createPersonaAiContextRule,
  deletePersonaAiContextRule,
  getPersonaAiContext,
  listPersonaAiContextStatuses,
  listPersonas,
  refreshPersonaAiContextDocument,
  updatePersonaAiContext,
  updatePersonaAiContextRule,
} from '@/api/contextCenter';
import type {
  PersonaAiContext,
  PersonaAiContextRule,
  PersonaAiContextStatus,
} from '@/types/contextCenter';
import ContextCenterNav from './ContextCenterNav.vue';
import { formatEpoch } from './time';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const errorMessage = ref('');
const personas = ref<PersonaAiContext[]>([]);
const statuses = ref<Map<string, PersonaAiContextStatus>>(new Map());
const total = ref<number | undefined>();
const after = ref<string | undefined>();
const before = ref<string | undefined>();

const detail = ref<PersonaAiContext | null>(null);
const detailLoading = ref(false);
const settingsForm = reactive({
  enabled: true,
  characterBudget: undefined as number | undefined,
  cacheTtlMinutes: undefined as number | undefined,
  prompt: '',
});
const showRuleModal = ref(false);
const editingRule = ref<PersonaAiContextRule | null>(null);
const ruleForm = reactive({
  entityType: '',
  description: '',
  enabled: true,
  alwaysInContext: false,
  filteredInSearch: true,
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('contextCenter.persona'), dataIndex: 'name', key: 'name' },
  { title: t('contextCenter.users'), dataIndex: 'usersCount', key: 'usersCount' },
  { title: t('contextCenter.rules'), dataIndex: 'rulesCount', key: 'rulesCount' },
  { title: t('contextCenter.entities'), dataIndex: 'entitiesCount', key: 'entitiesCount' },
  { title: t('contextCenter.budget'), dataIndex: 'budgetLabel', key: 'budgetLabel' },
  { title: t('contextCenter.freshness'), dataIndex: 'freshnessLabel', key: 'freshnessLabel' },
  { title: t('contextCenter.enabled'), dataIndex: 'enabled', key: 'enabled' },
]);

function freshnessLabel(persona: PersonaAiContext): string {
  const status = statuses.value.get(persona.id);
  const rules = persona.rules ?? [];
  if (status?.lastError) {
    return t('contextCenter.freshnessError');
  }
  if (rules.length === 0) {
    return t('contextCenter.freshnessNoRules');
  }
  if (status?.lastGeneratedAt) {
    return `${t('contextCenter.freshnessFresh')} ${formatEpoch(status.lastGeneratedAt)}`;
  }
  return t('contextCenter.freshnessStale');
}

async function load(cursor?: { after?: string; before?: string }): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listPersonas({
      limit: 25,
      fields: 'users,contextDefinition',
      after: cursor?.after,
      before: cursor?.before,
    });
    personas.value = page.data;
    total.value = page.total;
    after.value = page.after;
    before.value = page.before;
    // The status endpoint is admin-only upstream; a failure here must not
    // take down the persona list, so it is tolerated with empty statuses.
    try {
      const statusList = await listPersonaAiContextStatuses({ limit: 25 });
      statuses.value = new Map(statusList.map((status) => [status.personaId, status]));
    } catch {
      statuses.value = new Map();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    personas.value = [];
    total.value = undefined;
  } finally {
    loading.value = false;
  }
}

async function openDetail(persona: PersonaAiContext): Promise<void> {
  detail.value = persona;
  detailLoading.value = true;
  try {
    const definition = await getPersonaAiContext(persona.id);
    if (definition) {
      detail.value = {
        ...persona,
        rules: definition.rules ?? persona.rules,
        characterBudget: definition.characterBudget ?? persona.characterBudget,
        cacheTtlMinutes: definition.cacheTtlMinutes ?? persona.cacheTtlMinutes,
        enabled: definition.enabled ?? persona.enabled,
        prompt: definition.prompt ?? persona.prompt,
      };
    }
  } catch {
    // The list row already carries rules and settings; detail still opens.
  } finally {
    detailLoading.value = false;
  }
  const current = detail.value;
  settingsForm.enabled = current.enabled ?? true;
  settingsForm.characterBudget = current.characterBudget;
  settingsForm.cacheTtlMinutes = current.cacheTtlMinutes;
  settingsForm.prompt = current.prompt ?? '';
}

function openDetailRoute(persona: PersonaAiContext): void {
  void router.push({
    name: 'context-center-ai-context-detail',
    params: { fqn: persona.fullyQualifiedName ?? persona.name },
  });
  void openDetail(persona);
}

function openDetailForRoute(): void {
  const param = route.params.fqn;
  const fqn = Array.isArray(param) ? param[0] : param;
  if (!fqn) {
    return;
  }
  const persona = personas.value.find(
    (item) => item.fullyQualifiedName === fqn || item.name === fqn,
  );
  if (persona) {
    void openDetail(persona);
  }
}

async function onToggleEnabled(persona: PersonaAiContext, enabled: boolean): Promise<void> {
  const previous = persona.enabled;
  // The table row is a mapped copy, so the source row must flip too, or the
  // switch reverts on the next render.
  const source = personas.value.find((item) => item.id === persona.id);
  if (source) {
    source.enabled = enabled;
  }
  persona.enabled = enabled;
  try {
    // The endpoint overwrites all settings from the body, so the untouched
    // values ride along unchanged, matching official's update flow.
    await updatePersonaAiContext(persona.id, {
      cacheTtlMinutes: persona.cacheTtlMinutes,
      characterBudget: persona.characterBudget,
      enabled,
      prompt: persona.prompt,
    });
  } catch (error) {
    if (source) {
      source.enabled = previous;
    }
    persona.enabled = previous;
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onSaveSettings(): Promise<void> {
  if (!detail.value) {
    return;
  }
  try {
    await updatePersonaAiContext(detail.value.id, {
      cacheTtlMinutes: settingsForm.cacheTtlMinutes,
      characterBudget: settingsForm.characterBudget,
      enabled: settingsForm.enabled,
      prompt: settingsForm.prompt || undefined,
    });
    message.success(t('contextCenter.saved'));
    detail.value = {
      ...detail.value,
      enabled: settingsForm.enabled,
      characterBudget: settingsForm.characterBudget,
      cacheTtlMinutes: settingsForm.cacheTtlMinutes,
      prompt: settingsForm.prompt,
    };
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onRefreshDocument(): Promise<void> {
  if (!detail.value) {
    return;
  }
  try {
    await refreshPersonaAiContextDocument(detail.value.id);
    message.success(t('contextCenter.refreshed'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

function openRuleModal(rule?: PersonaAiContextRule): void {
  editingRule.value = rule ?? null;
  ruleForm.entityType = rule?.entityType ?? '';
  ruleForm.description = rule?.description ?? '';
  ruleForm.enabled = rule?.enabled ?? true;
  ruleForm.alwaysInContext = rule?.alwaysInContext ?? false;
  ruleForm.filteredInSearch = rule?.filteredInSearch ?? true;
  showRuleModal.value = true;
}

async function onSaveRule(): Promise<void> {
  if (!detail.value) {
    return;
  }
  const payload = {
    entityType: ruleForm.entityType.trim(),
    description: ruleForm.description.trim() || undefined,
    enabled: ruleForm.enabled,
    alwaysInContext: ruleForm.alwaysInContext,
    filteredInSearch: ruleForm.filteredInSearch,
  };
  try {
    if (editingRule.value?.id) {
      await updatePersonaAiContextRule(detail.value.id, editingRule.value.id, payload);
    } else {
      await createPersonaAiContextRule(detail.value.id, payload);
    }
    showRuleModal.value = false;
    message.success(t('contextCenter.saved'));
    void openDetail(detail.value);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onDeleteRule(rule: PersonaAiContextRule): Promise<void> {
  if (!detail.value || !rule.id) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('contextCenter.deleteRule'),
    content: rule.entityType,
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deletePersonaAiContextRule(detail.value.id, rule.id);
    message.success(t('contextCenter.deleted'));
    void openDetail(detail.value);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

watch(
  () => route.params.fqn,
  () => {
    openDetailForRoute();
  },
);

onMounted(async () => {
  await load();
  openDetailForRoute();
});
</script>

<template>
  <div data-testid="context-center-ai-context">
    <ContextCenterNav />
    <EntityListShell
      :title="t('contextCenter.aiContext')"
      :lead="t('contextCenter.aiContextLead')"
      :loading="loading"
      :error="errorMessage"
      :columns="columns"
      :data-source="
        personas.map((persona) => {
          const status = statuses.get(persona.id);
          return {
            ...persona,
            usersCount: persona.users?.length ?? 0,
            rulesCount: persona.rules?.length ?? 0,
            entitiesCount: status?.entitiesIncluded ?? 0,
            budgetLabel:
              persona.characterBudget !== undefined
                ? `${status?.tokensEst ?? 0} / ${persona.characterBudget}`
                : '',
            freshnessLabel: freshnessLabel(persona),
          };
        })
      "
      row-key="id"
      table-test-id="ai-context-table"
      :total="total"
      :has-next="!!after"
      :has-prev="!!before"
      :empty-text="t('contextCenter.emptyPersonas')"
      @refresh="load()"
      @next="load({ after: after })"
      @prev="load({ before: before })"
      @view="openDetailRoute($event as PersonaAiContext)"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <Button type="link" @click="openDetailRoute(record as PersonaAiContext)">
            {{ (record as PersonaAiContext).displayName || (record as PersonaAiContext).name }}
          </Button>
        </template>
        <template v-else-if="column.key === 'enabled'">
          <Switch
            :checked="(record as PersonaAiContext).enabled ?? true"
            :data-testid="`ai-context-enabled-${(record as PersonaAiContext).name}`"
            @change="onToggleEnabled(record as PersonaAiContext, $event as boolean)"
          />
        </template>
        <template v-else-if="column.key === 'freshnessLabel'">
          <Tag>{{ (record as Record<string, unknown>)[String(column.dataIndex ?? '')] }}</Tag>
        </template>
        <template v-else>
          {{ (record as Record<string, unknown>)[String(column.dataIndex ?? '')] }}
        </template>
      </template>
    </EntityListShell>
    <SmDrawer
      :open="!!detail"
      :title="detail?.displayName || detail?.name || ''"
      :show-ok="false"
      test-id="ai-context-detail-drawer"
      @cancel="detail = null"
      @update:open="detail = $event ? detail : null"
    >
      <div v-if="detail">
        <Typography.Paragraph v-if="detail.description">
          {{ detail.description }}
        </Typography.Paragraph>
        <Form layout="vertical" data-testid="ai-context-settings-form">
          <Form.Item :label="t('contextCenter.enabled')">
            <Switch v-model:checked="settingsForm.enabled" data-testid="ai-context-detail-enabled" />
          </Form.Item>
          <Form.Item :label="t('contextCenter.characterBudget')">
            <InputNumber
              v-model:value="settingsForm.characterBudget"
              data-testid="ai-context-detail-budget"
              style="width: 100%"
            />
          </Form.Item>
          <Form.Item :label="t('contextCenter.cacheTtlMinutes')">
            <InputNumber
              v-model:value="settingsForm.cacheTtlMinutes"
              data-testid="ai-context-detail-ttl"
              style="width: 100%"
            />
          </Form.Item>
          <Form.Item :label="t('contextCenter.prompt')">
            <Input.TextArea
              v-model:value="settingsForm.prompt"
              data-testid="ai-context-detail-prompt"
              :rows="4"
            />
          </Form.Item>
          <Space>
            <Button
              type="primary"
              data-testid="ai-context-save-settings"
              @click="onSaveSettings"
            >
              {{ t('crud.save') }}
            </Button>
            <Button data-testid="ai-context-refresh-document" @click="onRefreshDocument">
              {{ t('contextCenter.refreshDocument') }}
            </Button>
          </Space>
        </Form>
        <Typography.Title :level="5" style="margin-top: 24px">
          {{ t('contextCenter.rules') }}
        </Typography.Title>
        <List
          :data-source="detail.rules ?? []"
          :locale="{ emptyText: t('contextCenter.emptyRules') }"
          :loading="detailLoading"
        >
          <template #renderItem="{ item }">
            <List.Item>
              <Space wrap>
                <span>{{ (item as PersonaAiContextRule).entityType }}</span>
                <span v-if="(item as PersonaAiContextRule).description">
                  {{ (item as PersonaAiContextRule).description }}
                </span>
                <Button type="link" @click="openRuleModal(item as PersonaAiContextRule)">
                  {{ t('crud.edit') }}
                </Button>
                <Button
                  type="link"
                  danger
                  @click="onDeleteRule(item as PersonaAiContextRule)"
                >
                  {{ t('crud.delete') }}
                </Button>
              </Space>
            </List.Item>
          </template>
        </List>
        <Button
          style="margin-top: 12px"
          data-testid="ai-context-create-rule"
          @click="openRuleModal()"
        >
          {{ t('contextCenter.createRule') }}
        </Button>
      </div>
    </SmDrawer>
    <FormModal
      :open="showRuleModal"
      :title="editingRule ? t('contextCenter.editRule') : t('contextCenter.createRule')"
      :ok-disabled="!ruleForm.entityType.trim()"
      test-id="ai-context-rule-modal"
      @ok="onSaveRule"
      @cancel="showRuleModal = false"
      @update:open="showRuleModal = $event"
    >
      <Form layout="vertical">
        <Form.Item :label="t('contextCenter.ruleEntityType')" required>
          <Input
            v-model:value="ruleForm.entityType"
            data-testid="ai-context-rule-entity-type"
            :placeholder="t('contextCenter.ruleEntityTypeHint')"
          />
        </Form.Item>
        <Form.Item :label="t('contextCenter.description')">
          <Input.TextArea
            v-model:value="ruleForm.description"
            data-testid="ai-context-rule-description"
            :rows="2"
          />
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="ruleForm.enabled">
            {{ t('contextCenter.enabled') }}
          </Checkbox>
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="ruleForm.alwaysInContext">
            {{ t('contextCenter.alwaysInContext') }}
          </Checkbox>
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="ruleForm.filteredInSearch">
            {{ t('contextCenter.filteredInSearch') }}
          </Checkbox>
        </Form.Item>
      </Form>
    </FormModal>
  </div>
</template>

<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Card,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import {
  FORMAT_EXTENSIONS,
  fetchRdfConfig,
  getAvailableSparqlInferences,
  getSavedSparqlQueries,
  getSparqlQueryTemplates,
  getTermDisplayText,
  replaceSavedSparqlQueries,
  replaceSparqlQueryTemplates,
  resolveSparqlInference,
  runSparqlQuery,
  DEFAULT_SPARQL_PREFIXES,
  DEFAULT_SPARQL_QUERY,
  type RDFTerm,
  type SavedSparqlQuery,
  type SparqlPlaygroundFormat,
  type SparqlPlaygroundInference,
  type SparqlPlaygroundResult,
} from '@/api/sparql';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{ initialQuery?: string }>();

const { t } = useI18n();
const authStore = useAuthStore();

/**
 * Reusable, page-chrome-free SPARQL query interface, mirroring the
 * official SparqlQueryConsole: editor, format/inference controls,
 * results (tabular for JSON SELECT/ASK, chips for a single-variable
 * SELECT, raw otherwise), and sample/saved query lists. The official
 * editor is a CodeMirror SPARQL editor; the product ships no code
 * editor, so the query box is a monospace textarea (recorded gap).
 * Saved queries and templates are server-backed; the official legacy
 * localStorage migration has no product counterpart to migrate from.
 */
const FORMAT_OPTIONS: Array<{ value: SparqlPlaygroundFormat; labelKey: string }> = [
  { value: 'json', labelKey: 'sparql.formats.json' },
  { value: 'csv', labelKey: 'sparql.formats.csv' },
  { value: 'tsv', labelKey: 'sparql.formats.tsv' },
  { value: 'xml', labelKey: 'sparql.formats.xml' },
  { value: 'turtle', labelKey: 'sparql.formats.turtle' },
  { value: 'jsonld', labelKey: 'sparql.formats.jsonld' },
  { value: 'ntriples', labelKey: 'sparql.formats.ntriples' },
  { value: 'rdfxml', labelKey: 'sparql.formats.rdfxml' },
];

const INFERENCE_OPTIONS: Array<{ value: SparqlPlaygroundInference; labelKey: string }> = [
  { value: 'none', labelKey: 'sparql.inferences.none' },
  { value: 'rdfs', labelKey: 'sparql.inferences.rdfs' },
  { value: 'owl', labelKey: 'sparql.inferences.owl' },
  { value: 'custom', labelKey: 'sparql.inferences.custom' },
];

const isAdminUser = computed(() => authStore.user?.isAdmin === true);

const query = ref(props.initialQuery || DEFAULT_SPARQL_QUERY);
const format = ref<SparqlPlaygroundFormat>('json');
const inference = ref<SparqlPlaygroundInference>('none');
const availableInferences = ref<SparqlPlaygroundInference[]>(['none']);
const running = ref(false);
const result = ref<SparqlPlaygroundResult | null>(null);
const errorMessage = ref<string | null>(null);
const activeTemplateId = ref<string | undefined>(undefined);

const libraryLoading = ref(true);
const queryTemplates = ref<SavedSparqlQuery[]>([]);
const savedQueries = ref<SavedSparqlQuery[]>([]);

const saveModalOpen = ref(false);
const saveName = ref('');
const saveTarget = ref<'personal' | 'template'>('personal');

const inferenceOptions = computed(() =>
  INFERENCE_OPTIONS.filter((option) => availableInferences.value.includes(option.value)),
);

// Derived rather than clamped on load, so a level loaded before the RDF
// status arrives is kept.
const effectiveInference = computed(() =>
  resolveSparqlInference(inference.value, availableInferences.value),
);

const tabularResult = computed(() => {
  const current = result.value;
  if (!current || current.format !== 'json' || !current.parsed) {
    return null;
  }
  const vars = current.parsed.head?.vars ?? [];
  const rows = current.parsed.results?.bindings ?? [];
  return {
    keyedRows: rows.map((row, index) => ({ key: `${index}`, row })),
    rows,
    vars,
  };
});

// A single-variable SELECT is a list of concepts — render them as chips
// rather than a one-column table, like the official design.
const conceptChips = computed(() => {
  const tabular = tabularResult.value;
  if (!tabular || tabular.vars.length !== 1) {
    return null;
  }
  const variable = tabular.vars[0];
  return tabular.keyedRows.map(({ key, row }) => ({
    key,
    value: getTermDisplayText(row[variable]),
  }));
});

function termText(term: RDFTerm | undefined): string {
  return getTermDisplayText(term);
}

async function loadLibrary(): Promise<void> {
  libraryLoading.value = true;
  try {
    const [serverSaved, templates] = await Promise.all([
      getSavedSparqlQueries(),
      getSparqlQueryTemplates(),
    ]);
    savedQueries.value = serverSaved;
    queryTemplates.value = templates;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    libraryLoading.value = false;
  }
}

async function handleRun(): Promise<void> {
  if (!query.value.trim()) {
    errorMessage.value = t('sparql.emptyQuery');
    return;
  }
  running.value = true;
  errorMessage.value = null;
  result.value = null;
  try {
    result.value = await runSparqlQuery({
      query: query.value,
      format: format.value,
      inference: effectiveInference.value,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : t('crud.loadFailed');
    errorMessage.value = text;
    message.error(text);
  } finally {
    running.value = false;
  }
}

function handleInjectPrefixes(): void {
  if (query.value.includes('PREFIX om:')) {
    return;
  }
  query.value = `${DEFAULT_SPARQL_PREFIXES}\n\n${query.value}`;
}

function handleLoadSaved(saved: SavedSparqlQuery): void {
  query.value = saved.query;
  format.value = saved.format;
  inference.value = saved.inference;
  activeTemplateId.value = undefined;
}

function handleLoadTemplate(template: SavedSparqlQuery): void {
  query.value = template.query;
  format.value = template.format;
  inference.value = template.inference;
  activeTemplateId.value = template.id;
}

function upsertQuery(list: SavedSparqlQuery[], next: SavedSparqlQuery): SavedSparqlQuery[] {
  const index = list.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    return list.map((item, current) => (current === index ? next : item));
  }
  return [...list, next];
}

async function handleCommitSave(): Promise<void> {
  const name = saveName.value.trim();
  if (!name) {
    return;
  }
  const id =
    saveTarget.value === 'template' && activeTemplateId.value
      ? activeTemplateId.value
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const savedQuery: SavedSparqlQuery = {
    id,
    name,
    query: query.value,
    format: format.value,
    inference: effectiveInference.value,
    savedAt: Date.now(),
  };
  try {
    if (saveTarget.value === 'template') {
      queryTemplates.value = await replaceSparqlQueryTemplates(
        upsertQuery(queryTemplates.value, savedQuery),
      );
      activeTemplateId.value = id;
    } else {
      savedQueries.value = await replaceSavedSparqlQueries(
        upsertQuery(savedQueries.value, savedQuery),
      );
    }
    saveModalOpen.value = false;
    message.success(t('sparql.querySaved'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function handleDeleteTemplate(id: string): Promise<void> {
  try {
    queryTemplates.value = await replaceSparqlQueryTemplates(
      queryTemplates.value.filter((item) => item.id !== id),
    );
    if (activeTemplateId.value === id) {
      activeTemplateId.value = undefined;
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function handleDeleteSaved(id: string): Promise<void> {
  try {
    savedQueries.value = await replaceSavedSparqlQueries(
      savedQueries.value.filter((item) => item.id !== id),
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

function handleDownload(): void {
  if (!result.value) {
    return;
  }
  const filename = `sparql-result.${FORMAT_EXTENSIONS[result.value.format]}`;
  const blob = new Blob([result.value.body], { type: result.value.contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, 100);
}

onMounted(() => {
  void loadLibrary();
  void fetchRdfConfig()
    .then((status) => {
      availableInferences.value = getAvailableSparqlInferences(
        status.inference?.availableLevels,
      );
    })
    // Without the RDF status the playground still runs queries without inference.
    .catch(() => undefined);
});
</script>

<template>
  <div style="display: grid; grid-template-columns: 220px 1fr; gap: 12px" data-testid="sparql-console">
    <Card style="order: 1">
      <Typography.Text type="secondary" strong style="text-transform: uppercase; font-size: 12px">
        {{ t('sparql.installationQueries') }}
      </Typography.Text>
      <div style="margin-top: 8px">
        <Typography.Text v-if="libraryLoading" type="secondary">{{ t('shared.loading') }}</Typography.Text>
        <Typography.Text v-else-if="queryTemplates.length === 0" type="secondary">
          {{ t('sparql.noQueryAvailable') }}
        </Typography.Text>
        <ul v-else style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px">
          <li
            v-for="template in queryTemplates"
            :key="template.id"
            style="display: flex; align-items: center; justify-content: space-between; gap: 4px"
          >
            <Button
              type="link"
              size="small"
              class="sparql-library-name"
              :data-testid="`sparql-template-${template.id}`"
              :title="template.name"
              style="flex: 1; justify-content: flex-start; min-width: 0"
              @click="handleLoadTemplate(template)"
            >
              {{ template.name }}
            </Button>
            <template v-if="isAdminUser">
              <Button
                type="link"
                size="small"
                :data-testid="`sparql-template-edit-${template.id}`"
                :aria-label="`${t('crud.edit')} ${template.name}`"
                @click="handleLoadTemplate(template)"
              >
                {{ t('crud.edit') }}
              </Button>
              <Button
                type="link"
                danger
                size="small"
                :data-testid="`sparql-template-delete-${template.id}`"
                :aria-label="`${t('crud.delete')} ${template.name}`"
                @click="handleDeleteTemplate(template.id)"
              >
                {{ t('crud.delete') }}
              </Button>
            </template>
          </li>
        </ul>
      </div>
      <Typography.Text type="secondary" strong style="text-transform: uppercase; font-size: 12px; display: block; margin-top: 16px">
        {{ t('sparql.savedQueries') }}
      </Typography.Text>
      <Typography.Paragraph type="secondary" style="font-size: 12px">
        {{ t('sparql.privateQueriesDescription') }}
      </Typography.Paragraph>
      <Typography.Text v-if="savedQueries.length === 0" type="secondary">
        {{ t('sparql.noSavedQueries') }}
      </Typography.Text>
      <ul v-else style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px" data-testid="sparql-saved-list">
        <li
          v-for="saved in savedQueries"
          :key="saved.id"
          style="display: flex; align-items: center; justify-content: space-between; gap: 8px"
        >
          <Button
            type="link"
            size="small"
            class="sparql-library-name"
            :data-testid="`sparql-saved-${saved.id}`"
            :title="saved.name"
            @click="handleLoadSaved(saved)"
          >
            {{ saved.name }}
          </Button>
          <Button
            type="link"
            size="small"
            :data-testid="`sparql-saved-delete-${saved.id}`"
            @click="handleDeleteSaved(saved.id)"
          >
            {{ t('crud.delete') }}
          </Button>
        </li>
      </ul>
    </Card>
    <Card style="order: 2">
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px">
        <Space wrap>
          <Select
            v-model:value="format"
            data-testid="sparql-format-select"
            :aria-label="t('sparql.format')"
            style="width: 220px"
          >
            <Select.Option v-for="option in FORMAT_OPTIONS" :key="option.value" :value="option.value">
              {{ t(option.labelKey) }}
            </Select.Option>
          </Select>
          <Select
            v-model:value="inference"
            data-testid="sparql-inference-select"
            :aria-label="t('sparql.inference')"
            style="width: 140px"
          >
            <Select.Option v-for="option in inferenceOptions" :key="option.value" :value="option.value">
              {{ t(option.labelKey) }}
            </Select.Option>
          </Select>
          <Button data-testid="sparql-inject-prefixes" @click="handleInjectPrefixes">
            {{ t('sparql.injectPrefixes') }}
          </Button>
          <Button
            data-testid="sparql-save-query"
            @click="() => { saveTarget = 'personal'; saveName = ''; saveModalOpen = true; }"
          >
            {{ t('sparql.saveQuery') }}
          </Button>
          <Button
            v-if="isAdminUser"
            data-testid="sparql-save-template"
            @click="() => { saveTarget = 'template'; saveName = queryTemplates.find((item) => item.id === activeTemplateId)?.name ?? ''; saveModalOpen = true; }"
          >
            {{ activeTemplateId ? t('sparql.updateSampleQuery') : t('sparql.saveAsSampleQuery') }}
          </Button>
        </Space>
        <Button
          type="primary"
          data-testid="sparql-run"
          :disabled="running"
          @click="handleRun"
        >
          {{ running ? t('sparql.running') : t('sparql.runQuery') }}
        </Button>
      </div>
      <div style="margin-top: 12px; border: 1px solid #f0f0f0; border-radius: 6px" data-testid="sparql-editor">
        <Input.TextArea
          v-model:value="query"
          :rows="12"
          style="font-family: monospace"
        />
      </div>
      <div
        v-if="errorMessage"
        data-testid="sparql-error"
        style="margin-top: 12px; border: 1px solid #ffccc7; background: #fff2f0; padding: 12px; border-radius: 6px; color: #cf1322"
      >
        {{ errorMessage }}
      </div>
      <div v-if="result" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px" data-testid="sparql-result">
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
          <Typography.Text
            type="secondary"
            data-testid="sparql-result-status"
            style="font-size: 12px"
          >
            {{
              tabularResult
                ? `✓ ${tabularResult.rows.length} ${t('sparql.results')} · ${result.durationMs} ms`
                : `${result.format} · ${result.durationMs} ms`
            }}
          </Typography.Text>
          <Button size="small" data-testid="sparql-download" @click="handleDownload">
            {{ t('sparql.download') }}
          </Button>
        </div>
        <div v-if="conceptChips" style="display: flex; flex-wrap: wrap; gap: 8px" data-testid="sparql-chips">
          <Tag v-for="chip in conceptChips" :key="chip.key">{{ chip.value }}</Tag>
          <Typography.Text v-if="conceptChips.length === 0" type="secondary" style="font-size: 12px">
            {{ t('sparql.noRows') }}
          </Typography.Text>
        </div>
        <div v-else-if="tabularResult" style="max-height: 420px; overflow: auto" data-testid="sparql-table">
          <Table
            :columns="tabularResult.vars.map((name) => ({ title: name, key: name, dataIndex: name }))"
            :data-source="tabularResult.keyedRows.map(({ key, row }) => ({ key, ...Object.fromEntries(tabularResult.vars.map((name) => [name, termText(row[name])])) }))"
            :pagination="false"
            size="small"
            row-key="key"
          />
          <div v-if="tabularResult.rows.length === 0" style="padding: 12px; color: rgba(0, 0, 0, 0.45)">
            {{ t('sparql.noRows') }}
          </div>
        </div>
        <pre
          v-else
          data-testid="sparql-raw"
          style="max-height: 420px; overflow: auto; border: 1px solid #f0f0f0; border-radius: 6px; background: #fafafa; padding: 12px; font-size: 12px"
        >{{ result.body }}</pre>
      </div>
    </Card>
  </div>
  <FormModal
    :get-container="false"
    :open="saveModalOpen"
    :title="saveTarget === 'template' ? (activeTemplateId ? t('sparql.updateSampleQuery') : t('sparql.saveAsSampleQuery')) : t('sparql.saveQuery')"
    :ok-text="saveTarget === 'template' && activeTemplateId ? t('crud.update') : t('crud.save')"
    :cancel-text="t('crud.cancel')"
    @ok="handleCommitSave"
    @cancel="saveModalOpen = false"
  >
    <Input
      v-model:value="saveName"
      data-testid="sparql-save-name-input"
      :placeholder="t('sparql.savePrompt')"
      @press-enter="() => { if (saveName.trim()) { void handleCommitSave(); } }"
    />
  </FormModal>
</template>

<style scoped>
/*
 * The 220px library column holds unbroken query names; without an
 * ellipsis the Ant link-button text (nowrap by default) spills out of
 * its box and paints over the Edit/Delete buttons. Truncate with an
 * ellipsis and keep the full name on hover via the title attribute.
 */
.sparql-library-name {
  flex: 1;
  min-width: 0;
}

.sparql-library-name > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

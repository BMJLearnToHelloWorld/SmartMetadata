<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Card, Select, Space, Typography } from 'ant-design-vue';
import { listOntologies } from '@/api/ontology';
import { releaseOntologyEditLock } from '@/api/ontologyEdit';
import type { Ontology } from '@/types/ontology';
import type { OntologyEditLock } from '@/types/ontologyEdit';
import { usePermissionStore } from '@/stores/permissions';
import AiSuggestionsPanel from '@/features/ontology/AiSuggestionsPanel.vue';
import BulkAuthoringPanel from '@/features/ontology/BulkAuthoringPanel.vue';
import ChangeSetPanel from '@/features/ontology/ChangeSetPanel.vue';
import ConceptEditorPanel from '@/features/ontology/ConceptEditorPanel.vue';
import OntologyCanvasPanel from '@/features/ontology/OntologyCanvasPanel.vue';
import EditLockBar from '@/features/ontology/EditLockBar.vue';
import PackInstallPanel from '@/features/ontology/PackInstallPanel.vue';
import PublicationPanel from '@/features/ontology/PublicationPanel.vue';
import ReasoningPanel from '@/features/ontology/ReasoningPanel.vue';
import ReviewTasksPanel from '@/features/ontology/ReviewTasksPanel.vue';

const { t } = useI18n();
const route = useRoute();
const permissionStore = usePermissionStore();

/**
 * Ontology studio, edit mode (E2). Browse stays on OntologyExplorerView;
 * this page is the edit side: the authoring lease (edit lock), draft
 * change sets with undo/redo/submit/apply, direct concept/property/axiom
 * writes, bulk authoring, AI suggestions, reasoning explanations, pack
 * install, release capture/activation and release reviews. The visual
 * graph canvas (official G6 canvas + useOntologyGraphEdit, ported as
 * OntologyGraphCanvas + OntologyCanvasPanel) renders concepts with G6;
 * confirmed canvas relations and canvas-added concepts are appended to
 * the selected DRAFT change set as ADD_RELATIONSHIP / UPSERT_CONCEPT
 * operations — never local-only graph mutations. Node dragging only
 * repositions nodes on the canvas. Writes are real and echoed back;
 * gates are P1 both lines, fail-closed.
 */
const ontologies = ref<Ontology[]>([]);
const selectedId = ref<string | undefined>(undefined);
const ontology = ref<Ontology | null>(null);
const ops = ref<Record<string, boolean>>({});
const lock = ref<OntologyEditLock | null>(null);
const sessionId = ref('');
const errorMessage = ref('');

const canEdit = computed(
  () => permissionStore.isAdminUser || ops.value.EditAll === true || ops.value.EditGlossaryTerms === true,
);
const canApply = computed(() => permissionStore.isAdminUser || ops.value.EditAll === true);

const lease = computed(() => {
  if (!lock.value || lock.value.sessionId !== sessionId.value || lock.value.version === undefined) {
    return null;
  }
  return { sessionId: sessionId.value, version: lock.value.version };
});

const mine = computed(() => !!lock.value && lock.value.sessionId === sessionId.value && !!sessionId.value);

async function loadOntologies(): Promise<void> {
  try {
    const page = await listOntologies({ limit: 100 });
    ontologies.value = page.data;
    // Stage 2: the explorer's inspector Edit action deep-links here with
    // ?ontology=<id>; preselect it when it is in the loaded page.
    const requested = typeof route.query.ontology === 'string' ? route.query.ontology : undefined;
    if (requested && page.data.some((item) => item.id === requested)) {
      selectedId.value = requested;
      return;
    }
    if (!selectedId.value && page.data.length) {
      selectedId.value = page.data[0]?.id;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.studioFailed');
  }
}

async function loadPermissions(): Promise<void> {
  ops.value = {};
  if (!ontology.value?.fullyQualifiedName) {
    return;
  }
  try {
    ops.value = await permissionStore.getEntityPermissionByFqn('ontology', ontology.value.fullyQualifiedName);
  } catch {
    // Fail-closed: no grant on permission-query failure, editing disabled.
    ops.value = {};
  }
}

watch(selectedId, () => {
  ontology.value = ontologies.value.find((item) => item.id === selectedId.value) ?? null;
  lock.value = null;
  sessionId.value = '';
  void loadPermissions();
});

onMounted(() => {
  void loadOntologies();
});

onBeforeUnmount(() => {
  // Best-effort release of our own lease when leaving the studio; a
  // failure here only leaves the lease to expire server-side.
  if (mine.value && ontology.value) {
    void releaseOntologyEditLock('ontology', ontology.value.id, sessionId.value).catch(() => undefined);
  }
});
</script>

<template>
  <div data-testid="ontology-studio" data-tour-step="ontology-studio" data-tour-page>
    <Space direction="vertical" style="width: 100%">
      <Typography.Title :level="3">{{ t('ontology.edit.studioTitle') }}</Typography.Title>
      <Typography.Text>{{ t('ontology.edit.studioLead') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Select
        v-model:value="selectedId"
        style="width: 320px"
        :placeholder="t('ontology.selectPlaceholder')"
        data-testid="ontology-studio-select"
      >
        <Select.Option v-for="item in ontologies" :key="item.id" :value="item.id">
          {{ item.displayName || item.name }}
        </Select.Option>
      </Select>
      <div v-if="ontology" data-testid="ontology-studio-detail">
        <EditLockBar
          v-model:lock="lock"
          v-model:session-id="sessionId"
          :ontology-id="ontology.id"
          :ontology-name="ontology.displayName || ontology.name"
          :can-edit="canEdit"
        />
        <div style="margin-top: 16px">
          <ChangeSetPanel
            :ontology-id="ontology.id"
            :ontology-fqn="ontology.fullyQualifiedName || ontology.name"
            :lease="lease"
            :can-edit="canEdit"
            :can-apply="canApply"
          />
          <OntologyCanvasPanel
            :ontology-id="ontology.id"
            :ontology-fqn="ontology.fullyQualifiedName || ontology.name"
            :lease="lease"
            :can-edit="canEdit"
          />
          <ConceptEditorPanel :ontology-fqn="ontology.fullyQualifiedName || ontology.name" :can-edit="canEdit" @term-deleted="loadOntologies" />
          <BulkAuthoringPanel :can-edit="canEdit" />
          <AiSuggestionsPanel :can-edit="canEdit" />
          <ReasoningPanel :can-edit="canEdit" />
          <PackInstallPanel :can-edit="canEdit" />
          <PublicationPanel :ontology-id="ontology.id" :ontology-name="ontology.displayName || ontology.name" :can-apply="canApply" />
          <ReviewTasksPanel />
        </div>
      </div>
      <Card v-else>
        <Typography.Text>{{ t('ontology.empty') }}</Typography.Text>
      </Card>
    </Space>
  </div>
</template>

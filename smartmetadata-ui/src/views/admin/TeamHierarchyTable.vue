<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Skeleton, Switch, Tooltip } from 'ant-design-vue';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { splitTransElement } from '@/utils/emptyPlaceholder';
import { getTeamsWithFqnPath } from '@/utils/fqnPaths';
import type { AdminTeam } from '@/types/admin';
import { teamHierarchyColumns } from './membersColumns';
import { shouldShowTeamsEmptyState } from './teamLogic';

/**
 * Team hierarchy tree table (pin TeamHierarchy.tsx, 394 lines, plus
 * the teams-tab container in TeamDetailsV1:713-793). Six columns;
 * count/asset cells skeleton while their fetch runs; search debounced
 * 500ms and scoped by the parent (parents.id + not Organization);
 * deleted Toggle is two-state; no pagination; the header Add button
 * is visibility-gated (raw Create AND not deleted); rows drag to
 * re-parent (drop on a row) or to the root (drop zone above the
 * table, shown while dragging); expansion lazy-loads via the parent
 * and only renders an expander when childrenCount > 0.
 */

const props = defineProps<{
  teams: AdminTeam[];
  team: AdminTeam;
  assetCounts: Record<string, number>;
  assetsLoading: boolean;
  advancedLoading: boolean;
  basicLoading: boolean;
  canCreateTeam: boolean;
  isTeamDeleted: boolean;
}>();

const emit = defineEmits<{
  search: [term: string];
  'toggle-deleted': [value: boolean];
  expand: [fqn: string];
  drop: [payload: { dragged: AdminTeam; target: AdminTeam | null }];
  'add-team': [];
}>();

const { t } = useI18n();

const searchTerm = ref('');
const showDeleted = ref(false);
const expandedKeys = ref<string[]>([]);
const draggedTeam = ref<AdminTeam | undefined>();
const dropTargetId = ref<string | undefined>();

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchTerm, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    emit('search', value.trim());
  }, 500);
});

const columns = computed(() =>
  teamHierarchyColumns({
    teams: t('label.team-plural'),
    type: t('label.type'),
    subTeams: t('label.sub-team-plural'),
    users: t('label.user-plural'),
    assets: t('label.asset-plural'),
    description: t('label.description'),
  }),
);

const showEmptyState = computed(() =>
  shouldShowTeamsEmptyState({
    searchTerm: searchTerm.value,
    childCount: props.teams.length,
    childrenCount: props.team.childrenCount ?? 0,
    basicLoading: props.basicLoading,
  }),
);
const showSearchEmpty = computed(
  () => !showEmptyState.value && searchTerm.value.trim().length > 0 && props.teams.length === 0,
);

const addButtonTitle = computed(() => {
  if (props.isTeamDeleted) {
    return t('message.this-action-is-not-allowed-for-deleted-entities');
  }
  return props.canCreateTeam
    ? t('label.add-entity', { entity: t('label.team') })
    : t('message.no-permission-for-action');
});

const docMessage = computed(() =>
  t('message.refer-to-our-doc', { doc: t('label.doc-plural-lowercase') }),
);
const docParts = computed(() => splitTransElement(docMessage.value));

function onExpand(expanded: boolean, record: unknown): void {
  const team = record as AdminTeam;
  if (expanded) {
    if (!expandedKeys.value.includes(team.id)) {
      expandedKeys.value = [...expandedKeys.value, team.id];
    }
    if (!team.children?.length) {
      emit('expand', team.fullyQualifiedName ?? team.name);
    }
  } else {
    expandedKeys.value = expandedKeys.value.filter((key) => key !== team.id);
  }
}

function rowKey(record: AdminTeam): string {
  return record.id;
}

function customRow(record: unknown) {
  const team = record as AdminTeam;
  return {
    draggable: true,
    onDragstart: (event: DragEvent) => {
      draggedTeam.value = team;
      event.dataTransfer?.setData('text/plain', team.id);
    },
    onDragend: () => {
      draggedTeam.value = undefined;
      dropTargetId.value = undefined;
    },
    onDragover: (event: DragEvent) => {
      if (draggedTeam.value && draggedTeam.value.id !== team.id) {
        event.preventDefault();
        dropTargetId.value = team.id;
      }
    },
    onDragleave: () => {
      if (dropTargetId.value === team.id) {
        dropTargetId.value = undefined;
      }
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const dragged = draggedTeam.value;
      draggedTeam.value = undefined;
      dropTargetId.value = undefined;
      if (dragged && dragged.id !== team.id) {
        emit('drop', { dragged, target: team });
      }
    },
  };
}

function onRootDrop(event: DragEvent): void {
  event.preventDefault();
  const dragged = draggedTeam.value;
  draggedTeam.value = undefined;
  if (dragged) {
    emit('drop', { dragged, target: null });
  }
}

function highlightParts(text: string): Array<{ text: string; match: boolean }> {
  const term = searchTerm.value.trim();
  if (!term) {
    return [{ text, match: false }];
  }
  const parts = text.split(term);
  const result: Array<{ text: string; match: boolean }> = [];
  parts.forEach((part, index) => {
    if (part) {
      result.push({ text: part, match: false });
    }
    if (index < parts.length - 1) {
      result.push({ text: term, match: true });
    }
  });
  return result;
}
</script>

<template>
  <div class="team-hierarchy">
    <div class="team-hierarchy__controls">
      <Input
        v-model:value="searchTerm"
        allow-clear
        :placeholder="t('label.search-entity', { entity: t('label.team-plural') })"
        data-testid="team-hierarchy-search"
        class="team-hierarchy__search"
      />
      <span class="team-hierarchy__toggle">
        <Switch
          :checked="showDeleted"
          data-testid="show-deleted-toggle"
          @change="(value) => { showDeleted = Boolean(value); emit('toggle-deleted', Boolean(value)); }"
        />
        <span>{{ t('label.deleted') }}</span>
      </span>
      <Button
        v-if="canCreateTeam && !isTeamDeleted"
        type="primary"
        data-testid="add-team-button"
        @click="emit('add-team')"
      >
        {{ t('label.add-entity', { entity: t('label.team') }) }}
      </Button>
    </div>

    <NoDataPlaceholder
      v-if="showEmptyState"
      test-id="no-data-placeholder"
      :description="
        t('message.adding-new-entity-is-easy-just-give-it-a-spin', { entity: t('label.team') })
      "
    >
      <template #footer>
        <p>
          <template v-if="docParts"
            >{{ docParts.before
            }}<a
              href="https://docs.open-metadata.org/latest/main-concepts/metadata-standard/schemas/entity/data/glossary"
              :aria-label="t('label.doc-plural-lowercase')"
              rel="noreferrer"
              target="_blank"
              >{{ docParts.inner }}</a
            >{{ docParts.after }}</template
          >
          <template v-else>{{ docMessage }}</template>
        </p>
        <Tooltip :title="addButtonTitle">
          <Button
            type="primary"
            size="small"
            :disabled="!canCreateTeam || isTeamDeleted"
            data-testid="add-placeholder-button"
            @click="emit('add-team')"
          >
            {{ t('label.add') }}
          </Button>
        </Tooltip>
      </template>
    </NoDataPlaceholder>
    <NoSearchResultsPlaceholder v-else-if="showSearchEmpty" test-id="search-error-placeholder" />
    <template v-else>
      <div
        v-if="draggedTeam"
        class="team-hierarchy__drop-zone"
        :aria-label="t('label.move-entity-to-root', { entity: t('label.team') })"
        @dragover.prevent
        @drop="onRootDrop"
      >
        {{ t('label.move-entity-to-root', { entity: t('label.team') }) }}
      </div>
      <SmTable
        :columns="columns"
        :data-source="teams"
        :row-key="rowKey"
        :pagination="false"
        :expanded-row-keys="expandedKeys"
        :row-expandable="(record) => ((record as AdminTeam).childrenCount ?? 0) > 0"
        :on-expand="onExpand"
        :custom-row="customRow"
        test-id="team-hierarchy-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <Tooltip :title="getEntityName(record as AdminTeam)">
              <RouterLink
                :to="getTeamsWithFqnPath((record as AdminTeam).fullyQualifiedName ?? '')"
                class="team-hierarchy__name"
              >
                <template
                  v-for="(part, partIndex) in highlightParts(getEntityName(record as AdminTeam))"
                  :key="partIndex"
                  ><mark v-if="part.match">{{ part.text }}</mark
                  ><template v-else>{{ part.text }}</template></template
                >
              </RouterLink>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'teamType'">
            {{ (record as AdminTeam).teamType }}
          </template>
          <template v-else-if="column.key === 'childrenCount'">
            <Skeleton v-if="advancedLoading" :active="true" :paragraph="false" :title="{ width: 40 }" />
            <template v-else>{{ (record as AdminTeam).childrenCount ?? 0 }}</template>
          </template>
          <template v-else-if="column.key === 'userCount'">
            <Skeleton v-if="advancedLoading" :active="true" :paragraph="false" :title="{ width: 40 }" />
            <template v-else>{{ (record as AdminTeam).userCount ?? 0 }}</template>
          </template>
          <template v-else-if="column.key === 'assetCount'">
            <Skeleton v-if="assetsLoading" :active="true" :paragraph="false" :title="{ width: 40 }" />
            <template v-else>{{
              assetCounts[(record as AdminTeam).fullyQualifiedName ?? ''] ?? 0
            }}</template>
          </template>
          <template v-else-if="column.key === 'description'">
            <DescriptionCell :markdown="(record as AdminTeam).description" />
          </template>
        </template>
      </SmTable>
    </template>
  </div>
</template>

<style scoped>
.team-hierarchy__controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.team-hierarchy__search {
  width: 320px;
}
.team-hierarchy__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.team-hierarchy__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.team-hierarchy__drop-zone {
  border: 1px dashed var(--sm-border-color);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  text-align: center;
}
</style>

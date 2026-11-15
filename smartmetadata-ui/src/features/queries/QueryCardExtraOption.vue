<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<template>
  <div class="query-card-extra-option" data-testid="extra-option-container">
    <span class="query-card-extra-option__lines" data-testid="query-line">
      {{ formatLineCount(sqlLineCount(query.query), t('query.line'), t('query.lines')) }}
    </span>
    <Tooltip :title="t('asset.voteUp')">
      <Button
        size="small"
        data-testid="up-vote-btn"
        :type="voteStatus === 'votedUp' ? 'primary' : 'default'"
        @click="onVote('votedUp')"
      >
        ↑ {{ query.votes?.upVotes ?? 0 }}
      </Button>
    </Tooltip>
    <Tooltip :title="t('asset.voteDown')">
      <Button
        size="small"
        data-testid="down-vote-btn"
        :type="voteStatus === 'votedDown' ? 'primary' : 'default'"
        @click="onVote('votedDown')"
      >
        ↓ {{ query.votes?.downVotes ?? 0 }}
      </Button>
    </Tooltip>
    <Dropdown :trigger="['click']">
      <Tooltip :title="t('query.manageQuery')">
        <Button size="small" data-testid="query-btn" :aria-label="t('query.manageQuery')">
          <MoreOutlined />
        </Button>
      </Tooltip>
      <template #overlay>
        <Menu @click="onMenuClick">
          <Menu.Item key="edit" data-testid="edit-query" :disabled="!permission.can('EditQueries')">
            {{ t('crud.edit') }}
          </Menu.Item>
          <Menu.Item key="delete" data-testid="delete-query" :disabled="!permission.canDelete">
            {{ t('crud.delete') }}
          </Menu.Item>
        </Menu>
      </template>
    </Dropdown>
  </div>
</template>

<script setup lang="ts">
import { deleteQuery, type DataQuery, type VoteType } from '@/api/queries';
import { getVoteStatus } from '@/api/votes';
import type { DerivedPermissionFlags } from '@/api/permissions';
import { formatLineCount, sqlLineCount } from '@/catalog/queryDisplay';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { MoreOutlined } from '@ant-design/icons-vue';
import { Button, Dropdown, Menu, message, Tooltip } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  query: DataQuery;
  permission: DerivedPermissionFlags;
  currentUserId: string;
}>();

const emit = defineEmits<{
  edit: [];
  vote: [voteType: VoteType];
  deleted: [];
}>();

const { t } = useI18n();

const voteStatus = computed(() => getVoteStatus(props.currentUserId, props.query.votes));

// Pin: clicking the current vote removes it; otherwise the click casts it.
function onVote(target: 'votedUp' | 'votedDown'): void {
  emit('vote', voteStatus.value === target ? 'unVoted' : target);
}

function onMenuClick(info: { key: string | number }): void {
  const key = String(info.key);
  if (key === 'edit') {
    emit('edit');
    return;
  }
  if (key === 'delete') {
    void onDelete();
  }
}

async function onDelete(): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('query.deleteTitle'),
    content: t('query.deleteBody'),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed || !props.query.id) {
    return;
  }
  try {
    await deleteQuery(props.query.id);
    emit('deleted');
  } catch {
    message.error(t('query.deleteFailed'));
  }
}
</script>

<style scoped>
.query-card-extra-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.query-card-extra-option__lines {
  color: var(--sm-color-text-secondary);
  font-size: 12px;
}
</style>

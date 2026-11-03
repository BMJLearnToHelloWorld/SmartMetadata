<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { getPersonaByName, personaUsersPatch, updatePersona } from '@/api/persona';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import FormModal from '@/components/shared/FormModal.vue';
import { Button, Card, Col, Form, Input, Row, Tabs, message } from 'ant-design-vue';
import type { EntityRef } from '@/types/api';
import type { Persona } from '@/types/persona';
import { PERSONA_CUSTOMIZE_CATEGORIES } from './personaPage';
import PersonaUserPicker from './PersonaUserPicker.vue';

/**
 * Persona detail, mirroring the official PersonaDetailsPage: header
 * with edit + set-as-default, a customize-ui tab (category cards into
 * the customize routes) and a users tab (member list with add/remove
 * via PATCH users). Personas are not deletable through this page, as
 * official notes.
 */
const props = defineProps<{ fqn: string }>();

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const loading = ref(false);
const errorMessage = ref('');
const persona = ref<Persona | null>(null);
const activeTab = ref('customize-ui');
const editOpen = ref(false);
const editing = ref(false);
const editForm = reactive({ displayName: '', description: '' });
const defaultOpen = ref(false);
const defaulting = ref(false);
const addUsersOpen = ref(false);
const addingUsers = ref(false);
const addUserIds = ref<string[]>([]);

const memberRefs = computed(() => persona.value?.users ?? []);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    persona.value = await getPersonaByName(props.fqn);
    editForm.displayName = persona.value.displayName ?? '';
    editForm.description = persona.value.description ?? '';
  } catch (error) {
    persona.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('persona.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function patchAndReload(patch: JsonPatchOp[]): Promise<boolean> {
  if (!persona.value) {
    return false;
  }
  try {
    persona.value = await updatePersona(persona.value.id, patch);
    return true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('persona.saveFailed'));
    return false;
  }
}

async function onEdit(): Promise<void> {
  if (!persona.value) {
    return;
  }
  const patch: JsonPatchOp[] = [];
  const displayName = editForm.displayName.trim() || undefined;
  const description = editForm.description.trim() || undefined;
  if (displayName !== (persona.value.displayName ?? undefined)) {
    patch.push({ op: 'replace', path: '/displayName', value: displayName ?? null });
  }
  if (description !== (persona.value.description ?? undefined)) {
    patch.push({ op: 'replace', path: '/description', value: description ?? null });
  }
  if (!patch.length) {
    editOpen.value = false;
    return;
  }
  editing.value = true;
  try {
    if (await patchAndReload(patch)) {
      editOpen.value = false;
      message.success(t('persona.saved'));
    }
  } finally {
    editing.value = false;
  }
}

async function onToggleDefault(): Promise<void> {
  if (!persona.value) {
    return;
  }
  defaulting.value = true;
  try {
    if (await patchAndReload([{ op: 'replace', path: '/default', value: !persona.value.default }])) {
      defaultOpen.value = false;
      message.success(t('persona.saved'));
    }
  } finally {
    defaulting.value = false;
  }
}

async function onRemoveUser(user: EntityRef): Promise<void> {
  if (!persona.value) {
    return;
  }
  const remaining = memberRefs.value.filter((member) => member.id !== user.id);
  await patchAndReload(personaUsersPatch(remaining));
}

async function onAddUsers(): Promise<void> {
  if (!persona.value || !addUserIds.value.length) {
    return;
  }
  addingUsers.value = true;
  try {
    const merged: EntityRef[] = [
      ...memberRefs.value,
      ...addUserIds.value.map((id) => ({ id, name: id, type: 'user' })),
    ];
    if (await patchAndReload(personaUsersPatch(merged))) {
      addUsersOpen.value = false;
      addUserIds.value = [];
      message.success(t('persona.saved'));
    }
  } finally {
    addingUsers.value = false;
  }
}

function openCustomize(category: string): void {
  void router.push({
    name: 'admin-settings-persona-customize',
    params: { fqn: props.fqn, category },
  });
}

function backToList(): void {
  void router.push({ name: 'admin-settings-persona' });
}

watch(
  () => props.fqn,
  () => {
    void load();
  },
);

onMounted(() => {
  if (route.hash === '#users') {
    activeTab.value = 'users';
  }
  void load();
});
</script>

<template>
  <div data-testid="persona-detail">
    <Button data-testid="persona-back" @click="backToList">{{ t('persona.backToPersona') }}</Button>
    <p v-if="errorMessage" class="persona-detail__error">{{ errorMessage }}</p>
    <div v-if="persona" class="persona-detail__header">
      <h2 data-testid="persona-detail-name">{{ persona.displayName || persona.name }}</h2>
      <p>{{ persona.description }}</p>
      <span v-if="persona.default">{{ t('persona.defaultBadge') }}</span>
      <div class="persona-detail__actions">
        <Button data-testid="persona-edit-button" @click="editOpen = true">{{ t('persona.edit') }}</Button>
        <Button data-testid="persona-default-button" @click="defaultOpen = true">
          {{ persona.default ? t('persona.removeDefault') : t('persona.setDefault') }}
        </Button>
      </div>
    </div>
    <Tabs v-if="persona" v-model:active-key="activeTab">
      <Tabs.TabPane key="customize-ui" :tab="t('persona.customizeUi')">
        <div data-testid="persona-tab-customize">
          <Row :gutter="[16, 16]">
            <Col v-for="category in PERSONA_CUSTOMIZE_CATEGORIES" :key="category.key" :xs="24" :sm="12" :lg="8">
              <Card
                hoverable
                :data-testid="`persona-customize-${category.key}`"
                @click="openCustomize(category.key)"
              >
                <Card.Meta :title="t(category.titleKey)" />
              </Card>
            </Col>
          </Row>
        </div>
      </Tabs.TabPane>
      <Tabs.TabPane key="users" :tab="t('persona.users')">
        <div data-testid="persona-tab-users">
          <Button data-testid="persona-add-users-button" type="primary" @click="addUsersOpen = true">
            {{ t('persona.addUsers') }}
          </Button>
          <p v-if="memberRefs.length === 0">{{ t('persona.noUsers') }}</p>
          <ul>
            <li v-for="user in memberRefs" :key="user.id" :data-testid="`persona-user-${user.id}`">
              {{ user.displayName || user.name }}
              <Button
                size="small"
                :data-testid="`persona-user-remove-${user.id}`"
                @click="void onRemoveUser(user)"
              >
                {{ t('persona.remove') }}
              </Button>
            </li>
          </ul>
        </div>
      </Tabs.TabPane>
    </Tabs>
    <FormModal
      :get-container="false"
      :open="editOpen"
      :title="t('persona.edit')"
      :confirm-loading="editing"
      test-id="persona-edit-modal"
      @ok="void onEdit()"
      @cancel="editOpen = false"
    >
      <Form layout="vertical">
        <Form.Item :label="t('persona.displayName')">
          <Input v-model:value="editForm.displayName" data-testid="persona-edit-display-name" />
        </Form.Item>
        <Form.Item :label="t('persona.description')">
          <Input.TextArea v-model:value="editForm.description" data-testid="persona-edit-description" />
        </Form.Item>
      </Form>
    </FormModal>
    <FormModal
      :get-container="false"
      :open="defaultOpen"
      :title="persona?.default ? t('persona.removeDefault') : t('persona.setDefault')"
      :confirm-loading="defaulting"
      test-id="persona-default-modal"
      @ok="void onToggleDefault()"
      @cancel="defaultOpen = false"
    >
      <p>{{ persona?.default ? t('persona.removeDefault') : t('persona.setDefault') }}</p>
    </FormModal>
    <FormModal
      :get-container="false"
      :open="addUsersOpen"
      :title="t('persona.addUsers')"
      :confirm-loading="addingUsers"
      test-id="persona-add-users-modal"
      @ok="void onAddUsers()"
      @cancel="addUsersOpen = false"
    >
      <PersonaUserPicker v-model="addUserIds" :excluded-ids="memberRefs.map((m) => m.id ?? '')" />
    </FormModal>
  </div>
</template>

<style scoped>
.persona-detail__header {
  margin: 16px 0;
}
.persona-detail__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.persona-detail__error {
  color: var(--sm-color-error-text);
}
</style>

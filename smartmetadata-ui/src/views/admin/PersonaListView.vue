<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { createPersona, listPersonas } from '@/api/persona';
import FormModal from '@/components/shared/FormModal.vue';
import { Button, Card, Col, Empty, Form, Input, Row, message } from 'ant-design-vue';
import {
  canGoNext,
  canGoPrev,
  createCursorPager,
  goNext,
  goPrev,
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';
import { useAuthStore } from '@/stores/auth';
import type { Persona } from '@/types/persona';
import PersonaUserPicker from './PersonaUserPicker.vue';

/**
 * Persona list, mirroring the official PersonaPage: a card grid with
 * cursor paging (page size 12) and an admin-only create modal (name,
 * displayName, description, users). Card click opens the detail page.
 */
const PERSONA_PAGE_SIZE = 12;

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();

const loading = ref(false);
const errorMessage = ref('');
const personas = ref<Persona[]>([]);
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const createForm = reactive({ name: '', displayName: '', description: '', userIds: [] as string[] });

const isAdminUser = computed(() => auth.user?.isAdmin === true);
const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listPersonas({ limit: PERSONA_PAGE_SIZE, after: cursor.value.after });
    personas.value = page.data;
    pageAfter.value = page.after;
  } catch (error) {
    personas.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  if (!createForm.name.trim()) {
    return;
  }
  creating.value = true;
  try {
    await createPersona({
      name: createForm.name.trim(),
      displayName: createForm.displayName.trim() || undefined,
      description: createForm.description.trim() || undefined,
      users: createForm.userIds.length ? createForm.userIds : undefined,
    });
    createOpen.value = false;
    message.success(t('persona.saved'));
    createForm.name = '';
    createForm.displayName = '';
    createForm.description = '';
    createForm.userIds = [];
    cursor.value = resetCursor();
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

function onNext(): void {
  cursor.value = goNext(cursor.value, pageAfter.value ?? '');
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
}

function openDetail(persona: Persona): void {
  void router.push({
    name: 'admin-settings-persona-detail',
    params: { fqn: persona.fullyQualifiedName },
  });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="persona-list">
    <div class="persona-list__header">
      <h2>{{ t('persona.title') }}</h2>
      <Button
        v-if="isAdminUser"
        type="primary"
        data-testid="persona-create-button"
        @click="createOpen = true"
      >
        {{ t('persona.create') }}
      </Button>
    </div>
    <p v-if="errorMessage" class="persona-list__error">{{ errorMessage }}</p>
    <Empty v-if="!loading && personas.length === 0" :description="t('persona.empty')" />
    <p v-if="!loading && personas.length === 0">{{ t('persona.emptyDescription') }}</p>
    <Row :gutter="[16, 16]">
      <Col v-for="persona in personas" :key="persona.id" :xs="24" :sm="12" :lg="8">
        <Card
          hoverable
          :data-testid="`persona-card-${persona.name}`"
          @click="openDetail(persona)"
        >
          <Card.Meta
            :title="persona.displayName || persona.name"
            :description="persona.description || persona.name"
          />
          <div class="persona-list__meta">
            <span v-if="persona.default">{{ t('persona.defaultBadge') }}</span>
            <span v-if="persona.users">
              {{ t('persona.users') }}: {{ persona.users.length }}
            </span>
          </div>
        </Card>
      </Col>
    </Row>
    <div class="persona-list__pager">
      <Button
        data-testid="persona-prev"
        :disabled="!hasPrev"
        @click="onPrev()"
      >
        {{ t('crud.previous') }}
      </Button>
      <Button
        data-testid="persona-next"
        :disabled="!hasNext"
        @click="onNext()"
      >
        {{ t('crud.next') }}
      </Button>
    </div>
    <FormModal
      :get-container="false"
      :open="createOpen"
      :title="t('persona.create')"
      :confirm-loading="creating"
      test-id="persona-create-modal"
      @ok="void onCreate()"
      @cancel="createOpen = false"
    >
      <Form layout="vertical">
        <Form.Item :label="t('persona.name')" required>
          <Input v-model:value="createForm.name" data-testid="persona-create-name" />
        </Form.Item>
        <Form.Item :label="t('persona.displayName')">
          <Input v-model:value="createForm.displayName" data-testid="persona-create-display-name" />
        </Form.Item>
        <Form.Item :label="t('persona.description')">
          <Input.TextArea v-model:value="createForm.description" data-testid="persona-create-description" />
        </Form.Item>
        <Form.Item :label="t('persona.users')">
          <PersonaUserPicker v-model="createForm.userIds" />
        </Form.Item>
      </Form>
    </FormModal>
  </div>
</template>

<style scoped>
.persona-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.persona-list__meta {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  color: var(--sm-text-secondary);
}
.persona-list__pager {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.persona-list__error {
  color: var(--sm-color-error-text);
}
</style>

<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Spin,
  Tabs,
  Typography,
  message,
} from 'ant-design-vue';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import {
  createTaskFormSchema,
  listTaskFormSchemas,
  updateTaskFormSchema,
  type JsonSchemaObject,
  type TaskFormSchema,
} from '@/api/taskFormSchemas';
import {
  getWorkflowDefinitionByFqn,
  updateWorkflowDefinition,
  type SanitizedWorkflowDefinition,
} from '@/api/workflows';
import {
  buildDesignerSchema,
  buildStageMappings,
  buildTransitionForms,
  createEmptyDesignerTransition,
  createEmptyStageMapping,
  parseSchemaToDesignerFields,
  parseStageMappings,
  parseTransitionForms,
  stringifyDesignerJson,
  type TaskFormDesignerField,
  type TaskFormDesignerStageMapping,
  type TaskFormDesignerTransition,
} from '@/views/admin/taskFormDesigner';
import {
  getDefaultTaskFormSchema,
  getDefaultWorkflowDefinitionRef,
  TASK_CATEGORIES,
  TASK_STATUSES,
} from '@/views/admin/taskFormTemplates';
import TaskFormBuilderSection from './TaskFormBuilderSection.vue';

const { t } = useI18n();

/**
 * Official page shape (pages/TaskFormSettingsPage): a schema sidebar, a
 * general + classification header, and a workspace with a designer tab
 * (create form, resolve form, transition forms, workflow stages) and an
 * advanced JSON tab holding the seven schema documents. Designer state
 * and JSON text stay two-way synced; saving validates every JSON
 * document first, then saves a non-empty workflow definition JSON before
 * creating or updating the schema.
 */
const EMPTY_SCHEMA: TaskFormSchema = {
  name: '',
  displayName: '',
  description: '',
  taskType: '',
  taskCategory: '',
  formSchema: { type: 'object', properties: {} },
  uiSchema: {},
  createFormSchema: { type: 'object', properties: {} },
  createUiSchema: {},
  transitionForms: {},
  defaultStageMappings: {},
};

const schemas = ref<TaskFormSchema[]>([]);
const selectedSchema = ref<TaskFormSchema>(EMPTY_SCHEMA);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');

const generalName = ref('');
const generalDisplayName = ref('');
const generalDescription = ref('');
const generalTaskType = ref('');
const generalTaskCategory = ref<string | undefined>(undefined);
const generalWorkflowRef = ref('');

// Set on the first save attempt: the required-field hints appear only
// after the user tries to save, then live-update as the fields change,
// matching the official form's required-rule + hint behaviour.
const saveAttempted = ref(false);
const nameError = computed(() =>
  saveAttempted.value && !generalName.value.trim() ? t('taskForms.nameRequired') : '',
);
const taskTypeError = computed(() =>
  saveAttempted.value && !generalTaskType.value.trim() ? t('taskForms.taskTypeRequired') : '',
);

const formSchemaValue = ref(stringifyDesignerJson(EMPTY_SCHEMA.formSchema));
const uiSchemaValue = ref(stringifyDesignerJson(EMPTY_SCHEMA.uiSchema));
const createFormSchemaValue = ref(stringifyDesignerJson(EMPTY_SCHEMA.createFormSchema));
const createUiSchemaValue = ref(stringifyDesignerJson(EMPTY_SCHEMA.createUiSchema));
const transitionFormsValue = ref(stringifyDesignerJson(EMPTY_SCHEMA.transitionForms));
const defaultStageMappingsValue = ref(stringifyDesignerJson(EMPTY_SCHEMA.defaultStageMappings));
const workflowDefinitionValue = ref('{}');

const resolveFields = ref<TaskFormDesignerField[]>(
  parseSchemaToDesignerFields(EMPTY_SCHEMA.formSchema, EMPTY_SCHEMA.uiSchema),
);
const createFields = ref<TaskFormDesignerField[]>(
  parseSchemaToDesignerFields(EMPTY_SCHEMA.createFormSchema, EMPTY_SCHEMA.createUiSchema),
);
const transitionBuilders = ref<TaskFormDesignerTransition[]>([]);
const stageMappings = ref<TaskFormDesignerStageMapping[]>([]);

const primaryTab = ref('designer');
const designerTab = ref('create-form');

const NO_TASK_CATEGORY_KEY = 'none';

const taskCategoryOptions = computed(() => [
  { id: NO_TASK_CATEGORY_KEY, label: t('taskForms.none') },
  ...TASK_CATEGORIES.map((category) => ({ id: category, label: category })),
]);

const schemaHeading = computed(
  () =>
    generalDisplayName.value.trim() ||
    generalName.value.trim() ||
    selectedSchema.value.displayName ||
    selectedSchema.value.name ||
    t('taskForms.newTaskForm'),
);
const pageDescription = computed(
  () =>
    generalDescription.value.trim() ||
    selectedSchema.value.description ||
    t('taskForms.pageDescription'),
);
const schemaSubtitle = computed(
  () => [generalTaskType.value, generalTaskCategory.value].filter(Boolean).join(' / '),
);

function parseJsonObject(value: string): JsonSchemaObject | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    // The official parse accepts any non-null object, arrays included.
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as JsonSchemaObject)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Official sanitizeWorkflowDefinitionPayload: exactly these 8 fields,
 * verbatim, all keys present. No id, no narrowing, no dropping.
 */
function sanitizeWorkflowDefinitionPayload(
  record: Record<string, unknown>,
): SanitizedWorkflowDefinition {
  return {
    name: record.name,
    displayName: record.displayName,
    description: record.description,
    owners: record.owners,
    config: record.config,
    trigger: record.trigger,
    nodes: record.nodes,
    edges: record.edges,
  };
}

function setSchemaEditors(schema: TaskFormSchema): void {
  const workflowDefinitionRef =
    schema.workflowDefinitionRef ?? getDefaultWorkflowDefinitionRef(schema.taskType);
  const nextResolveSchema = schema.formSchema;
  const nextResolveUiSchema = schema.uiSchema;
  const nextCreateSchema = schema.createFormSchema ?? schema.formSchema;
  const nextCreateUiSchema = schema.createUiSchema ?? schema.uiSchema;
  const nextTransitionForms = schema.transitionForms ?? {};
  const nextStageMappings = schema.defaultStageMappings ?? {};

  selectedSchema.value = schema;
  generalName.value = schema.name ?? '';
  generalDisplayName.value = schema.displayName ?? '';
  generalDescription.value = schema.description ?? '';
  generalTaskType.value = schema.taskType ?? '';
  generalTaskCategory.value = schema.taskCategory;
  generalWorkflowRef.value = workflowDefinitionRef ?? '';
  formSchemaValue.value = stringifyDesignerJson(nextResolveSchema);
  uiSchemaValue.value = stringifyDesignerJson(nextResolveUiSchema);
  createFormSchemaValue.value = stringifyDesignerJson(nextCreateSchema);
  createUiSchemaValue.value = stringifyDesignerJson(nextCreateUiSchema);
  transitionFormsValue.value = stringifyDesignerJson(nextTransitionForms);
  defaultStageMappingsValue.value = stringifyDesignerJson(nextStageMappings);
  resolveFields.value = parseSchemaToDesignerFields(nextResolveSchema, nextResolveUiSchema);
  createFields.value = parseSchemaToDesignerFields(nextCreateSchema, nextCreateUiSchema);
  transitionBuilders.value = parseTransitionForms(nextTransitionForms);
  stageMappings.value = parseStageMappings(nextStageMappings);
  workflowDefinitionValue.value = '{}';
  if (workflowDefinitionRef) {
    void getWorkflowDefinitionByFqn(workflowDefinitionRef)
      .then((workflow) => {
        workflowDefinitionValue.value = stringifyDesignerJson(workflow);
      })
      .catch(() => {
        workflowDefinitionValue.value = '{}';
      });
  }
}

async function loadSchemas(): Promise<void> {
  loading.value = true;
  try {
    const page = await listTaskFormSchemas({ limit: 100 });
    schemas.value = page.data;
    if (!selectedSchema.value.id && page.data.length > 0) {
      setSchemaEditors(page.data[0]);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function handleCreateNew(): void {
  setSchemaEditors(EMPTY_SCHEMA);
}

function handleDiscardChanges(): void {
  if (selectedSchema.value.id || selectedSchema.value.name) {
    setSchemaEditors(selectedSchema.value);
  } else {
    handleCreateNew();
  }
}

function handleLoadTemplate(): void {
  const taskType = generalTaskType.value;
  const taskCategory = generalTaskCategory.value;
  if (!taskType || !taskCategory) {
    message.error(t('taskForms.templateNeedsTypeAndCategory'));
    return;
  }
  const template = getDefaultTaskFormSchema(taskType, taskCategory);
  if (!template) {
    message.error(t('taskForms.noTemplate'));
    return;
  }
  setSchemaEditors({
    ...selectedSchema.value,
    ...template,
    name: generalName.value || template.name,
    displayName: generalDisplayName.value || template.displayName,
    description: generalDescription.value || template.description,
    taskType,
    taskCategory,
    workflowDefinitionRef:
      generalWorkflowRef.value ??
      template.workflowDefinitionRef ??
      getDefaultWorkflowDefinitionRef(taskType),
  });
}

function syncResolveDesigner(
  fields: TaskFormDesignerField[] = resolveFields.value,
  nextFormSchemaValue: string = formSchemaValue.value,
  nextUiSchemaValue: string = uiSchemaValue.value,
): void {
  const { formSchema, uiSchema } = buildDesignerSchema(
    fields,
    parseJsonObject(nextFormSchemaValue),
    parseJsonObject(nextUiSchemaValue),
  );
  resolveFields.value = fields;
  formSchemaValue.value = stringifyDesignerJson(formSchema);
  uiSchemaValue.value = stringifyDesignerJson(uiSchema);
}

function syncCreateDesigner(
  fields: TaskFormDesignerField[] = createFields.value,
  nextFormSchemaValue: string = createFormSchemaValue.value,
  nextUiSchemaValue: string = createUiSchemaValue.value,
): void {
  const { formSchema, uiSchema } = buildDesignerSchema(
    fields,
    parseJsonObject(nextFormSchemaValue),
    parseJsonObject(nextUiSchemaValue),
  );
  createFields.value = fields;
  createFormSchemaValue.value = stringifyDesignerJson(formSchema);
  createUiSchemaValue.value = stringifyDesignerJson(uiSchema);
}

function syncTransitionDesigner(
  transitions: TaskFormDesignerTransition[] = transitionBuilders.value,
  nextTransitionFormsValue: string = transitionFormsValue.value,
): void {
  const existingConfigs = parseJsonObject(nextTransitionFormsValue);
  const mergedTransitions = transitions.map((transition) => ({
    ...transition,
    config:
      (existingConfigs?.[transition.transitionId] as JsonSchemaObject | undefined) ??
      transition.config,
  }));
  transitionBuilders.value = mergedTransitions;
  transitionFormsValue.value = stringifyDesignerJson(buildTransitionForms(mergedTransitions));
}

function syncStageMappings(mappings: TaskFormDesignerStageMapping[] = stageMappings.value): void {
  stageMappings.value = mappings;
  defaultStageMappingsValue.value = stringifyDesignerJson(buildStageMappings(mappings));
}

function onResolveSchemaText(value: string): void {
  formSchemaValue.value = value;
  const nextFormSchema = parseJsonObject(value);
  const nextUiSchema = parseJsonObject(uiSchemaValue.value);
  if (nextFormSchema) {
    resolveFields.value = parseSchemaToDesignerFields(nextFormSchema, nextUiSchema);
  }
}

function onResolveUiText(value: string): void {
  uiSchemaValue.value = value;
  const nextFormSchema = parseJsonObject(formSchemaValue.value);
  const nextUiSchema = parseJsonObject(value);
  if (nextFormSchema) {
    resolveFields.value = parseSchemaToDesignerFields(nextFormSchema, nextUiSchema);
  }
}

function onCreateSchemaText(value: string): void {
  createFormSchemaValue.value = value;
  const nextFormSchema = parseJsonObject(value);
  const nextUiSchema = parseJsonObject(createUiSchemaValue.value);
  if (nextFormSchema) {
    createFields.value = parseSchemaToDesignerFields(nextFormSchema, nextUiSchema);
  }
}

function onCreateUiText(value: string): void {
  createUiSchemaValue.value = value;
  const nextFormSchema = parseJsonObject(createFormSchemaValue.value);
  const nextUiSchema = parseJsonObject(value);
  if (nextFormSchema) {
    createFields.value = parseSchemaToDesignerFields(nextFormSchema, nextUiSchema);
  }
}

function onTransitionFormsText(value: string): void {
  transitionFormsValue.value = value;
  const nextTransitionForms = parseJsonObject(value);
  if (nextTransitionForms) {
    transitionBuilders.value = parseTransitionForms(
      nextTransitionForms as Record<string, unknown>,
    );
  }
}

function onStageMappingsText(value: string): void {
  defaultStageMappingsValue.value = value;
  const nextStageMappings = parseJsonObject(value);
  if (nextStageMappings) {
    stageMappings.value = parseStageMappings(nextStageMappings as Record<string, string>);
  }
}

async function handleSave(): Promise<void> {
  saveAttempted.value = true;
  if (nameError.value || taskTypeError.value) {
    return;
  }
  let parsedFormSchema: unknown;
  let parsedUiSchema: unknown;
  let parsedCreateFormSchema: unknown;
  let parsedCreateUiSchema: unknown;
  let parsedTransitionForms: unknown;
  let parsedDefaultStageMappings: unknown;
  let parsedWorkflowDefinition: unknown;
  try {
    parsedFormSchema = JSON.parse(formSchemaValue.value) as unknown;
    parsedUiSchema = JSON.parse(uiSchemaValue.value) as unknown;
    parsedCreateFormSchema = JSON.parse(createFormSchemaValue.value) as unknown;
    parsedCreateUiSchema = JSON.parse(createUiSchemaValue.value) as unknown;
    parsedTransitionForms = JSON.parse(transitionFormsValue.value) as unknown;
    parsedDefaultStageMappings = JSON.parse(defaultStageMappingsValue.value) as unknown;
    parsedWorkflowDefinition = JSON.parse(workflowDefinitionValue.value) as unknown;
  } catch {
    message.error(t('taskForms.invalidJson'));
    return;
  }

  saving.value = true;
  try {
    const payload: TaskFormSchema = {
      ...selectedSchema.value,
      // The official save spreads the form values as-is: no trim, no
      // empty-to-undefined mapping.
      name: generalName.value,
      displayName: generalDisplayName.value,
      description: generalDescription.value,
      taskType: generalTaskType.value,
      taskCategory: generalTaskCategory.value,
      workflowDefinitionRef: generalWorkflowRef.value,
      formSchema: parsedFormSchema as JsonSchemaObject,
      uiSchema: parsedUiSchema as JsonSchemaObject,
      createFormSchema: parsedCreateFormSchema as JsonSchemaObject,
      createUiSchema: parsedCreateUiSchema as JsonSchemaObject,
      transitionForms: parsedTransitionForms as Record<string, unknown>,
      defaultStageMappings: parsedDefaultStageMappings as Record<string, string>,
    };

    if (
      parsedWorkflowDefinition !== null &&
      typeof parsedWorkflowDefinition === 'object' &&
      Object.keys(parsedWorkflowDefinition as Record<string, unknown>).length > 0
    ) {
      const workflowRecord = parsedWorkflowDefinition as Record<string, unknown>;
      const workflowName =
        (typeof workflowRecord.name === 'string' ? workflowRecord.name : undefined) ??
        payload.workflowDefinitionRef;
      if (!workflowName) {
        message.error(t('taskForms.workflowNeedsName'));
        return;
      }
      const savedWorkflow = await updateWorkflowDefinition({
        ...sanitizeWorkflowDefinitionPayload(workflowRecord),
        name: workflowName,
      });
      payload.workflowDefinitionRef = savedWorkflow.name;
      payload.workflowVersion = savedWorkflow.version;
    }

    const savedSchema = payload.id
      ? await updateTaskFormSchema(payload)
      : await createTaskFormSchema(payload);
    message.success(t('taskForms.saved'));
    await loadSchemas();
    setSchemaEditors(savedSchema);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadSchemas();
});
</script>

<template>
  <div data-testid="task-form-settings-page">
    <Typography.Text v-if="errorMessage" type="danger" data-testid="task-form-error">
      {{ errorMessage }}
    </Typography.Text>
    <Row :gutter="16">
      <Col :span="6">
        <Card :title="t('taskForms.schemas')" data-testid="task-form-sidebar">
          <Spin v-if="loading" />
          <div v-else>
            <div v-if="schemas.length === 0" style="margin-bottom: 12px">
              <Typography.Text type="secondary">{{ t('taskForms.noFormsFound') }}</Typography.Text>
            </div>
            <Button
              v-for="schema in schemas"
              :key="schema.id ?? schema.name"
              type="text"
              block
              :data-testid="`task-form-list-item-${schema.name}`"
              :style="{
                textAlign: 'left',
                background:
                  schema.id === selectedSchema.id ? 'var(--sm-bg-secondary, #f5f5f5)' : undefined,
                height: 'auto',
                padding: '8px 12px',
                marginBottom: 4,
              }"
              @click="setSchemaEditors(schema)"
            >
              <Typography.Text strong>{{ schema.displayName ?? schema.name }}</Typography.Text>
              <br />
              <Typography.Text type="secondary">
                {{ `${schema.taskType} / ${schema.taskCategory ?? '-'}` }}
              </Typography.Text>
            </Button>
          </div>
          <Button
            type="primary"
            block
            data-testid="task-form-add-button"
            style="margin-top: 12px"
            @click="handleCreateNew"
          >
            {{ t('taskForms.add') }}
          </Button>
        </Card>
      </Col>
      <Col :span="18">
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 16px;
          "
        >
          <div>
            <Typography.Text type="secondary">{{ t('taskForms.formBuilder') }}</Typography.Text>
            <Typography.Title :level="2" style="margin: 0">{{ schemaHeading }}</Typography.Title>
            <Typography.Paragraph type="secondary" style="margin: 0">
              {{ pageDescription }}
            </Typography.Paragraph>
            <Typography.Paragraph v-if="schemaSubtitle" type="secondary" style="margin: 0">
              {{ schemaSubtitle }}
            </Typography.Paragraph>
          </div>
          <div style="display: flex; gap: 8px; flex-shrink: 0">
            <Button data-testid="task-form-cancel-button" @click="handleDiscardChanges">
              {{ t('crud.cancel') }}
            </Button>
            <Button
              type="primary"
              data-testid="task-form-save-button"
              :loading="saving"
              @click="handleSave"
            >
              {{ t('crud.save') }}
            </Button>
          </div>
        </div>
        <Row :gutter="16" style="margin-bottom: 16px">
          <Col :span="14">
            <Card :title="t('taskForms.generalConfiguration')">
              <Form layout="vertical">
                <Form.Item
                  :label="t('crud.name')"
                  required
                  :validate-status="nameError ? 'error' : undefined"
                  :help="nameError || undefined"
                >
                  <Input v-model:value="generalName" data-testid="task-form-name-input" />
                </Form.Item>
                <Form.Item :label="t('crud.displayName')">
                  <Input v-model:value="generalDisplayName" data-testid="task-form-display-name-input" />
                </Form.Item>
                <Form.Item :label="t('crud.description')">
                  <Input.TextArea
                    v-model:value="generalDescription"
                    :rows="4"
                    data-testid="task-form-description-input"
                  />
                </Form.Item>
              </Form>
            </Card>
          </Col>
          <Col :span="10">
            <Card :title="t('taskForms.classification')">
              <Form layout="vertical">
                <Form.Item
                  :label="t('taskForms.taskType')"
                  required
                  :validate-status="taskTypeError ? 'error' : undefined"
                  :help="taskTypeError || undefined"
                >
                  <Input v-model:value="generalTaskType" data-testid="task-form-type-input" />
                </Form.Item>
                <Form.Item :label="t('taskForms.taskCategory')">
                  <Select
                    v-model:value="generalTaskCategory"
                    data-testid="task-form-category-input"
                    style="width: 100%"
                  >
                    <Select.Option
                      v-for="option in taskCategoryOptions"
                      :key="option.id"
                      :value="option.id === NO_TASK_CATEGORY_KEY ? undefined : option.id"
                    >
                      {{ option.label }}
                    </Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item :label="t('taskForms.workflowDefinition')">
                  <Input
                    v-model:value="generalWorkflowRef"
                    data-testid="task-form-workflow-definition-input"
                  />
                </Form.Item>
                <Button
                  data-testid="task-form-load-template-button"
                  @click="handleLoadTemplate"
                >
                  {{ t('taskForms.loadTemplate') }}
                </Button>
              </Form>
            </Card>
          </Col>
        </Row>
        <Card>
          <Tabs :active-key="primaryTab" @change="(key) => { primaryTab = String(key); }">
            <Tabs.TabPane key="designer" :tab="t('taskForms.designer')">
              <Alert
                :message="t('taskForms.builderTitle')"
                :description="t('taskForms.builderDescription')"
                type="info"
                show-icon
                style="margin-bottom: 16px"
              />
              <Tabs :active-key="designerTab" @change="(key) => { designerTab = String(key); }">
                <Tabs.TabPane key="create-form" :tab="t('taskForms.createForm')">
                  <div v-if="designerTab === 'create-form'">
              <TaskFormBuilderSection
                :title="t('taskForms.createFormFields')"
                :description="t('taskForms.createFormDescription')"
                :fields="createFields"
                test-id-prefix="task-form-create-builder"
                :base-form-schema="parseJsonObject(createFormSchemaValue)"
                :base-ui-schema="parseJsonObject(createUiSchemaValue)"
                @change="syncCreateDesigner"
              />
                  </div>
                </Tabs.TabPane>
                <Tabs.TabPane key="resolve-form" :tab="t('taskForms.resolveForm')">
                  <div v-if="designerTab === 'resolve-form'">
                    <TaskFormBuilderSection
                      :title="t('taskForms.resolveFormFields')"
                      :description="t('taskForms.resolveFormDescription')"
                      :fields="resolveFields"
                      test-id-prefix="task-form-resolve-builder"
                      :base-form-schema="parseJsonObject(formSchemaValue)"
                      :base-ui-schema="parseJsonObject(uiSchemaValue)"
                      @change="syncResolveDesigner"
                    />
                  </div>
                </Tabs.TabPane>
                <Tabs.TabPane key="transitions" :tab="t('taskForms.transitionForms')">
                  <div v-if="designerTab === 'transitions'">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 16px">
                    <div>
                      <Typography.Title :level="5" style="margin: 0">
                        {{ t('taskForms.transitionForms') }}
                      </Typography.Title>
                      <Typography.Paragraph type="secondary" style="margin: 0">
                        {{ t('taskForms.transitionFormsHelp') }}
                      </Typography.Paragraph>
                    </div>
                    <Button
                      data-testid="task-form-transition-add-button"
                      @click="syncTransitionDesigner([...transitionBuilders, createEmptyDesignerTransition()])"
                    >
                      {{ t('taskForms.addTransitionForm') }}
                    </Button>
                  </div>
                  <div v-if="transitionBuilders.length === 0">
                    <Typography.Text type="secondary">
                      {{ t('taskForms.noTransitionForms') }}
                    </Typography.Text>
                  </div>
                  <div
                    v-if="transitionBuilders.length > 0"
                    style="display: grid; gap: 16px"
                  >
                  <Card
                    v-for="(transition, index) in transitionBuilders"
                    :key="transition.key"
                    :data-testid="`task-form-transition-card-${index}`"
                  >
                    <template #title>
                      {{ transition.transitionId || `${t('taskForms.transition')} ${index + 1}` }}
                    </template>
                    <template #extra>
                      <Button
                        danger
                        type="link"
                        size="small"
                        :data-testid="`task-form-transition-remove-${index}`"
                        @click="syncTransitionDesigner(transitionBuilders.filter((_, currentIndex) => currentIndex !== index))"
                      >
                        {{ t('crud.remove') }}
                      </Button>
                    </template>
                    <Form.Item :label="t('taskForms.transitionId')" required>
                      <Input
                        :value="transition.transitionId"
                        :data-testid="`task-form-transition-id-${index}`"
                        placeholder="approve"
                        @change="(event: { target: { value: string } }) => syncTransitionDesigner(transitionBuilders.map((current, currentIndex) => currentIndex === index ? { ...current, transitionId: event.target.value } : current))"
                      />
                    </Form.Item>
                    <!-- The official page forces both base schemas to
                         undefined here (double assertion), discarding the
                         transition config's schemas; reproduce as-is. -->
                    <TaskFormBuilderSection
                      :title="t('taskForms.transitionFields')"
                      :description="t('taskForms.transitionFieldsHelp')"
                      :fields="transition.fields"
                      :test-id-prefix="`task-form-transition-builder-${index}`"
                      :base-form-schema="undefined"
                      :base-ui-schema="undefined"
                      @change="(fields: TaskFormDesignerField[]) => syncTransitionDesigner(transitionBuilders.map((current, currentIndex) => currentIndex === index ? { ...current, fields } : current))"
                    />
                  </Card>
                  </div>
                  </div>
                </Tabs.TabPane>
                <Tabs.TabPane key="workflow" :tab="t('taskForms.workflowStages')">
                  <div v-if="designerTab === 'workflow'">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 16px">
                    <div>
                      <Typography.Title :level="5" style="margin: 0">
                        {{ t('taskForms.stageMapping') }}
                      </Typography.Title>
                      <Typography.Paragraph type="secondary" style="margin: 0">
                        {{ t('taskForms.stageMappingHelp') }}
                      </Typography.Paragraph>
                    </div>
                    <Button
                      data-testid="task-form-stage-mapping-add-button"
                      @click="syncStageMappings([...stageMappings, createEmptyStageMapping()])"
                    >
                      {{ t('taskForms.addStageMapping') }}
                    </Button>
                  </div>
                  <div v-if="stageMappings.length === 0">
                    <Typography.Text type="secondary">
                      {{ t('taskForms.noStageMappings') }}
                    </Typography.Text>
                  </div>
                  <div
                    v-if="stageMappings.length > 0"
                    style="
                      display: grid;
                      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                      gap: 16px;
                    "
                  >
                  <Card
                    v-for="(mapping, index) in stageMappings"
                    :key="mapping.key"
                    :data-testid="`task-form-stage-mapping-card-${index}`"
                    size="small"
                  >
                    <template #title>
                      {{ mapping.stageId || `${t('taskForms.stage')} ${index + 1}` }}
                    </template>
                    <template #extra>
                      <Button
                        danger
                        type="link"
                        size="small"
                        :data-testid="`task-form-stage-mapping-remove-${index}`"
                        @click="syncStageMappings(stageMappings.filter((_, currentIndex) => currentIndex !== index))"
                      >
                        {{ t('crud.remove') }}
                      </Button>
                    </template>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
                      <div>
                        <Typography.Text>{{ t('taskForms.stageId') }}</Typography.Text>
                        <Input
                          :value="mapping.stageId"
                          :data-testid="`task-form-stage-id-${index}`"
                          placeholder="open"
                          @change="(event: { target: { value: string } }) => syncStageMappings(stageMappings.map((current, currentIndex) => currentIndex === index ? { ...current, stageId: event.target.value } : current))"
                        />
                      </div>
                      <div>
                        <Typography.Text>{{ t('taskForms.taskStatus') }}</Typography.Text>
                        <Select
                          :value="mapping.taskStatus || undefined"
                          :data-testid="`task-form-stage-status-${index}`"
                          style="width: 100%"
                          @change="(value: string) => syncStageMappings(stageMappings.map((current, currentIndex) => currentIndex === index ? { ...current, taskStatus: value } : current))"
                        >
                          <Select.Option v-for="status in TASK_STATUSES" :key="status" :value="status">
                            {{ status }}
                          </Select.Option>
                        </Select>
                      </div>
                    </div>
                  </Card>
                  </div>
                  </div>
                </Tabs.TabPane>
              </Tabs>
            </Tabs.TabPane>
            <Tabs.TabPane key="advanced" :tab="t('taskForms.advancedJson')">
              <div v-if="primaryTab === 'advanced'">
              <Typography.Title :level="5">{{ t('taskForms.resolveFormSchema') }}</Typography.Title>
              <div data-testid="task-form-resolve-schema-editor" style="margin-bottom: 16px">
                <SmCodeEditor
                  variant="code"
                  editor-class="task-form-schema-editor"
                  :value="formSchemaValue"
                  @change="onResolveSchemaText"
                />
              </div>
              <Typography.Title :level="5">{{ t('taskForms.resolveUiSchema') }}</Typography.Title>
              <div data-testid="task-form-resolve-ui-schema-editor" style="margin-bottom: 16px">
                <SmCodeEditor
                  variant="code"
                  editor-class="task-form-ui-schema-editor"
                  :value="uiSchemaValue"
                  @change="onResolveUiText"
                />
              </div>
              <Typography.Title :level="5">{{ t('taskForms.createFormSchema') }}</Typography.Title>
              <div data-testid="task-form-create-schema-editor" style="margin-bottom: 16px">
                <SmCodeEditor
                  variant="code"
                  editor-class="task-form-create-schema-editor"
                  :value="createFormSchemaValue"
                  @change="onCreateSchemaText"
                />
              </div>
              <Typography.Title :level="5">{{ t('taskForms.createUiSchema') }}</Typography.Title>
              <div data-testid="task-form-create-ui-schema-editor" style="margin-bottom: 16px">
                <SmCodeEditor
                  variant="code"
                  editor-class="task-form-create-ui-schema-editor"
                  :value="createUiSchemaValue"
                  @change="onCreateUiText"
                />
              </div>
              <Typography.Title :level="5">{{ t('taskForms.transitionForms') }}</Typography.Title>
              <div data-testid="task-form-transition-forms-editor" style="margin-bottom: 16px">
                <SmCodeEditor
                  variant="code"
                  editor-class="task-form-transition-forms-editor"
                  :value="transitionFormsValue"
                  @change="onTransitionFormsText"
                />
              </div>
              <Typography.Title :level="5">{{ t('taskForms.defaultStageMappings') }}</Typography.Title>
              <div data-testid="task-form-stage-mappings-editor" style="margin-bottom: 16px">
                <SmCodeEditor
                  variant="code"
                  editor-class="task-form-stage-mappings-editor"
                  :value="defaultStageMappingsValue"
                  @change="onStageMappingsText"
                />
              </div>
              <Typography.Title :level="5">{{ t('taskForms.workflowDefinitionJson') }}</Typography.Title>
              <div data-testid="task-form-workflow-definition-editor">
                <SmCodeEditor
                  variant="code"
                  editor-class="task-form-workflow-definition-editor"
                  :value="workflowDefinitionValue"
                  @change="(value: string) => { workflowDefinitionValue = value; }"
                />
              </div>
              </div>
            </Tabs.TabPane>
          </Tabs>
        </Card>
      </Col>
    </Row>
  </div>
</template>

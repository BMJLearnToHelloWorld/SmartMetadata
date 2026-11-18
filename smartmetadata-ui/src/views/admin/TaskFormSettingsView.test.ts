/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import TaskFormBuilderSection from './TaskFormBuilderSection.vue';
import TaskFormSettingsView from './TaskFormSettingsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SCHEMA = {
  id: 's1',
  name: 'RequestApproval',
  displayName: 'Request Approval',
  description: 'Approve requests',
  taskType: 'RequestApproval',
  taskCategory: 'Approval',
  formSchema: {
    type: 'object',
    properties: { comment: { type: 'string', title: 'Comment' } },
  },
  uiSchema: { comment: { 'ui:widget': 'textarea' } },
  workflowDefinitionRef: 'RequestApprovalTaskWorkflow',
};

async function mountTaskForms(
  schema: Record<string, unknown> = SCHEMA,
  listImpl?: () => Promise<Response>,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/governance/task-forms',
        name: 'admin-settings-governance-task-forms',
        component: TaskFormSettingsView,
      },
    ],
  });
  await router.push('/admin/settings/governance/task-forms');
  await router.isReady();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/v1/taskFormSchemas') && (!init?.method || init?.method === 'GET')) {
        return listImpl ? listImpl() : jsonResponse({ data: [schema], paging: { total: 1 } });
      }
      if (url.includes('/v1/governance/workflowDefinitions/name/')) {
        return jsonResponse({ id: 'w1', name: 'RequestApprovalTaskWorkflow', version: 1 });
      }
      if (url.includes('/v1/taskFormSchemas') && init?.method === 'POST') {
        return jsonResponse({ ...SCHEMA, id: 's2', name: 'CustomTask' });
      }
      if (url.includes('/v1/taskFormSchemas') && init?.method === 'PUT') {
        return jsonResponse(SCHEMA);
      }
      if (url.includes('/v1/governance/workflowDefinitions') && init?.method === 'PUT') {
        return jsonResponse({ id: 'w1', name: 'RequestApprovalTaskWorkflow', version: 2 });
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(TaskFormSettingsView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, requests };
}

type EditorViewLike = {
  dispatch: (transaction: unknown) => void;
  state: { doc: { length: number } };
};

type TaskFormsWrapper = Awaited<ReturnType<typeof mountTaskForms>>['wrapper'];

function editorView(wrapper: TaskFormsWrapper, editorClass: string): EditorViewLike {
  const editor = wrapper
    .findAllComponents(SmCodeEditor)
    .find((candidate) => candidate.props('editorClass') === editorClass);
  expect(editor).toBeDefined();
  const view = (
    editor!.vm as unknown as { getEditorView: () => EditorViewLike | null }
  ).getEditorView();
  expect(view).not.toBeNull();
  return view!;
}

async function setEditorText(
  wrapper: TaskFormsWrapper,
  editorClass: string,
  text: string,
): Promise<void> {
  const view = editorView(wrapper, editorClass);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  await nextTick();
  await flushPromises();
}

async function clickTab(wrapper: TaskFormsWrapper, label: string): Promise<void> {
  const tab = wrapper.findAll('.ant-tabs-tab').find((candidate) => candidate.text().includes(label));
  expect(tab).toBeDefined();
  await tab!.trigger('click');
  await flushPromises();
}

async function selectCategory(wrapper: TaskFormsWrapper, category: string): Promise<void> {
  const categorySelect = wrapper.find('[data-testid="task-form-category-input"]');
  const selector = categorySelect.element.querySelector('.ant-select-selector') as HTMLElement;
  selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  selector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
  const target = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find(
    (option) => option.textContent?.includes(category),
  ) as HTMLElement | undefined;
  expect(target).toBeDefined();
  target?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

describe('TaskFormSettingsView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // 10s cap, not the 5s default: this mount renders two Ant tab bars plus
  // the builder sections after two sequential fetches, so under parallel
  // workers it exceeds 5s (single-run: ~3.1s; 9-file parallel run: timeout).
  // Assertions are unchanged; the cap still fails a genuinely hung fetch.
  it('lists schemas and selects the first one with its designer fields', async () => {
    const { wrapper } = await mountTaskForms();
    expect(wrapper.find('[data-testid="task-form-list-item-RequestApproval"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Request Approval');
    expect(wrapper.find('[data-testid="task-form-name-input"]').element).toBeTruthy();
  }, 10000);

  it('creates a new schema from the general fields', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('CustomTask');
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('CustomTask');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    const post = requests.find((request) => request.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;
    expect(body.name).toBe('CustomTask');
    expect(body.taskType).toBe('CustomTask');
    expect(body.formSchema).toBeDefined();
  });

  // The Advanced-tab tests below carry the same 10s cap: opening the tab
  // mounts seven CodeMirror instances on top of the mount above, and
  // single-runs measure 3.8-4.0s (invalid-JSON 3966ms, designer-sync
  // 3789ms), too close to the 5s default under parallel workers.
  // Assertions are unchanged; the cap still fails a genuinely hung edit.
  it('refuses to save when a JSON document is invalid', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('Broken');
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('CustomTask');
    await clickTab(wrapper, createTestI18n().global.t('taskForms.advancedJson'));
    await setEditorText(wrapper, 'task-form-schema-editor', '{not json');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    expect(requests.some((request) => request.init?.method === 'POST')).toBe(false);
    expect(requests.some((request) => request.init?.method === 'PUT')).toBe(false);
  }, 10000);

  it('renders seven code editors with the official editor classes', async () => {
    const { wrapper } = await mountTaskForms();
    await clickTab(wrapper, createTestI18n().global.t('taskForms.advancedJson'));
    const editors = wrapper.findAllComponents(SmCodeEditor);
    expect(editors).toHaveLength(7);
    expect(editors.map((editor) => editor.props('editorClass'))).toEqual([
      'task-form-schema-editor',
      'task-form-ui-schema-editor',
      'task-form-create-schema-editor',
      'task-form-create-ui-schema-editor',
      'task-form-transition-forms-editor',
      'task-form-stage-mappings-editor',
      'task-form-workflow-definition-editor',
    ]);
    expect(editors.every((editor) => editor.props('variant') === 'code')).toBe(true);
    expect(wrapper.findAll('[data-testid="query-copy-button"]')).toHaveLength(7);
  }, 10000);

  it('syncs designer fields on each edit and tolerates temporarily invalid JSON', async () => {
    const { wrapper } = await mountTaskForms();
    const i18n = createTestI18n();
    await clickTab(wrapper, i18n.global.t('taskForms.advancedJson'));
    await setEditorText(wrapper, 'task-form-schema-editor', '{bad json');
    await clickTab(wrapper, i18n.global.t('taskForms.designer'));
    await clickTab(wrapper, i18n.global.t('taskForms.resolveForm'));
    // The invalid edit left the designer fields untouched, not broken.
    expect(
      (
        wrapper.find('[data-testid="task-form-resolve-builder-field-name-0"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('comment');
    await clickTab(wrapper, i18n.global.t('taskForms.advancedJson'));
    await setEditorText(
      wrapper,
      'task-form-schema-editor',
      '{"type":"object","properties":{"reason":{"type":"string","title":"Reason"}}}',
    );
    await clickTab(wrapper, i18n.global.t('taskForms.designer'));
    await clickTab(wrapper, i18n.global.t('taskForms.resolveForm'));
    expect(
      (
        wrapper.find('[data-testid="task-form-resolve-builder-field-name-0"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('reason');
  }, 10000);

  it('does not sync designer fields from the workflow JSON editor', async () => {
    const { wrapper } = await mountTaskForms();
    const i18n = createTestI18n();
    await clickTab(wrapper, i18n.global.t('taskForms.advancedJson'));
    await setEditorText(
      wrapper,
      'task-form-workflow-definition-editor',
      '{"name":"SomeWorkflow","nodes":[],"edges":[]}',
    );
    await clickTab(wrapper, i18n.global.t('taskForms.designer'));
    await clickTab(wrapper, i18n.global.t('taskForms.resolveForm'));
    expect(
      (
        wrapper.find('[data-testid="task-form-resolve-builder-field-name-0"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('comment');
    expect(wrapper.find('[data-testid="task-form-resolve-builder-field-card-1"]').exists()).toBe(
      false,
    );
  }, 10000);

  it('shows inline required hints on save attempt and clears them live', async () => {
    const { wrapper, requests } = await mountTaskForms();
    const i18n = createTestI18n();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('.ant-form-item-explain-error').exists()).toBe(false);
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    const hints = wrapper.findAll('.ant-form-item-explain-error').map((hint) => hint.text());
    expect(hints).toEqual([
      i18n.global.t('taskForms.nameRequired'),
      i18n.global.t('taskForms.taskTypeRequired'),
    ]);
    expect(requests.some((request) => request.init?.method === 'POST')).toBe(false);
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('CustomTask');
    await flushPromises();
    expect(wrapper.findAll('.ant-form-item-explain-error').map((hint) => hint.text())).toEqual([
      i18n.global.t('taskForms.taskTypeRequired'),
    ]);
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('CustomTask');
    await flushPromises();
    expect(wrapper.find('.ant-form-item-explain-error').exists()).toBe(false);
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    expect(requests.some((request) => request.init?.method === 'POST')).toBe(true);
  });

  it('saves general values raw, without trimming or empty-to-undefined mapping', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('  Padded Name  ');
    await wrapper.find('[data-testid="task-form-display-name-input"]').setValue('  ');
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('CustomTask');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    const post = requests.find((request) => request.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;
    expect(body.name).toBe('  Padded Name  ');
    expect(body.displayName).toBe('  ');
    expect(body.description).toBe('');
    expect(body.workflowDefinitionRef).toBe('');
    expect('displayName' in body).toBe(true);
    expect('description' in body).toBe(true);
  });

  it('sends the sanitized 8-field workflow payload verbatim and writes back ref and version', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('CustomTask');
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('CustomTask');
    await clickTab(wrapper, createTestI18n().global.t('taskForms.advancedJson'));
    await setEditorText(
      wrapper,
      'task-form-workflow-definition-editor',
      JSON.stringify({
        id: 'should-not-appear',
        extra: 'dropped',
        name: 'Wf1',
        displayName: 42,
        description: { nested: true },
        owners: [{ weird: 1 }],
        config: 'not-an-object',
        trigger: null,
        nodes: [{ noName: true }],
        edges: [{ x: 1 }],
      }),
    );
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    const workflowPut = requests.find(
      (request) =>
        request.init?.method === 'PUT' && request.url.includes('/v1/governance/workflowDefinitions'),
    );
    expect(workflowPut).toBeDefined();
    const workflowBody = JSON.parse(String(workflowPut?.init?.body)) as Record<string, unknown>;
    expect(Object.keys(workflowBody).sort()).toEqual([
      'config',
      'description',
      'displayName',
      'edges',
      'name',
      'nodes',
      'owners',
      'trigger',
    ]);
    expect(workflowBody).toEqual({
      name: 'Wf1',
      displayName: 42,
      description: { nested: true },
      owners: [{ weird: 1 }],
      config: 'not-an-object',
      trigger: null,
      nodes: [{ noName: true }],
      edges: [{ x: 1 }],
    });
    const post = requests.find((request) => request.init?.method === 'POST');
    const body = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;
    expect(body.workflowDefinitionRef).toBe('RequestApprovalTaskWorkflow');
    expect(body.workflowVersion).toBe(2);
  }, 10000);

  it('accepts array JSON in a schema document and in the workflow guard', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('ArrayForm');
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('CustomTask');
    await wrapper.find('[data-testid="task-form-workflow-definition-input"]').setValue('ArrayWorkflow');
    await clickTab(wrapper, createTestI18n().global.t('taskForms.advancedJson'));
    await setEditorText(wrapper, 'task-form-schema-editor', '[1, 2]');
    await setEditorText(wrapper, 'task-form-workflow-definition-editor', '[1, 2]');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    const post = requests.find((request) => request.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;
    expect(body.formSchema).toEqual([1, 2]);
    const workflowPut = requests.find(
      (request) =>
        request.init?.method === 'PUT' && request.url.includes('/v1/governance/workflowDefinitions'),
    );
    expect(workflowPut).toBeDefined();
    expect(JSON.parse(String(workflowPut?.init?.body))).toEqual({ name: 'ArrayWorkflow' });
  }, 10000);

  it('renders no PageHeader and keeps the hero actions on the hero row', async () => {
    const { wrapper } = await mountTaskForms();
    expect(wrapper.find('[data-testid="page-header"]').exists()).toBe(false);
    const saveButton = wrapper.find('[data-testid="task-form-save-button"]');
    const heroRow = saveButton.element.parentElement?.parentElement as HTMLElement | null;
    expect(heroRow?.style.display).toBe('flex');
    expect(heroRow?.querySelector('h2')).not.toBeNull();
    expect(heroRow?.querySelector('[data-testid="task-form-cancel-button"]')).not.toBeNull();
  });

  it('keeps the sidebar Add button visible and clickable while loading', async () => {
    let resolveList!: (response: Response) => void;
    const listGate = new Promise<Response>((resolve) => {
      resolveList = resolve;
    });
    const { wrapper } = await mountTaskForms(SCHEMA, () => listGate);
    expect(wrapper.find('[data-testid="task-form-sidebar"] .ant-spin').exists()).toBe(true);
    const add = wrapper.find('[data-testid="task-form-add-button"]');
    expect(add.exists()).toBe(true);
    await add.trigger('click');
    await flushPromises();
    resolveList(jsonResponse({ data: [SCHEMA], paging: { total: 1 } }));
    await flushPromises();
    expect(wrapper.find('[data-testid="task-form-list-item-RequestApproval"]').exists()).toBe(true);
  });

  it('passes undefined base schemas to the transition builder even with a config', async () => {
    const { wrapper } = await mountTaskForms({
      ...SCHEMA,
      transitionForms: {
        approve: {
          formSchema: {
            type: 'object',
            properties: { note: { type: 'string', title: 'Note' } },
          },
          uiSchema: {},
        },
      },
    });
    await clickTab(wrapper, createTestI18n().global.t('taskForms.transitionForms'));
    const builder = wrapper
      .findAllComponents(TaskFormBuilderSection)
      .find((candidate) => candidate.props('testIdPrefix') === 'task-form-transition-builder-0');
    expect(builder).toBeDefined();
    expect(builder!.props('baseFormSchema')).toBeUndefined();
    expect(builder!.props('baseUiSchema')).toBeUndefined();
    // The transition fields still parse from the config for editing.
    expect(
      (
        wrapper.find('[data-testid="task-form-transition-builder-0-field-name-0"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('note');
  });

  it('lays stage cards in an auto-fit grid and transition cards in a single-column grid', async () => {
    const { wrapper } = await mountTaskForms({
      ...SCHEMA,
      transitionForms: {
        approve: {
          formSchema: { type: 'object', properties: {} },
          uiSchema: {},
        },
      },
      defaultStageMappings: { open: 'Open', closed: 'Completed' },
    });
    const i18n = createTestI18n();
    await clickTab(wrapper, i18n.global.t('taskForms.transitionForms'));
    const transitionGrid = wrapper.find('[data-testid="task-form-transition-card-0"]')
      .element.parentElement as HTMLElement | null;
    expect(transitionGrid?.style.display).toBe('grid');
    expect(transitionGrid?.style.gap).toBe('16px');
    expect(transitionGrid?.style.gridTemplateColumns).toBe('');
    await clickTab(wrapper, i18n.global.t('taskForms.workflowStages'));
    const stageGrid = wrapper.find('[data-testid="task-form-stage-mapping-card-0"]')
      .element.parentElement as HTMLElement | null;
    expect(stageGrid?.style.display).toBe('grid');
    expect(stageGrid?.style.gridTemplateColumns).toBe('repeat(auto-fit, minmax(280px, 1fr))');
    expect(stageGrid?.style.gap).toBe('16px');
    expect(wrapper.findAll('[data-testid^="task-form-stage-mapping-card-"]')).toHaveLength(2);
  });

  it('marks Transition Id required without adding a validation rule', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    await clickTab(wrapper, createTestI18n().global.t('taskForms.transitionForms'));
    await wrapper.find('[data-testid="task-form-transition-add-button"]').trigger('click');
    await flushPromises();
    const card = wrapper.find('[data-testid="task-form-transition-card-0"]');
    expect(card.find('.ant-form-item-required').exists()).toBe(true);
    expect(wrapper.find('[data-testid="task-form-transition-remove-0"]').text()).toBe(
      createTestI18n().global.t('crud.remove'),
    );
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('WithTransition');
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('CustomTask');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    expect(requests.some((request) => request.init?.method === 'POST')).toBe(true);
  });

  it('labels the stage remove button Remove', async () => {
    const { wrapper } = await mountTaskForms({
      ...SCHEMA,
      defaultStageMappings: { open: 'Open' },
    });
    await clickTab(wrapper, createTestI18n().global.t('taskForms.workflowStages'));
    expect(wrapper.find('[data-testid="task-form-stage-mapping-remove-0"]').text()).toBe(
      createTestI18n().global.t('crud.remove'),
    );
  });

  it('keeps an empty workflow ref empty when loading a template', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    const fetchesBefore = requests.filter((request) =>
      request.url.includes('/v1/governance/workflowDefinitions/name/'),
    ).length;
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('DescriptionUpdate');
    await selectCategory(wrapper, 'MetadataUpdate');
    await wrapper.find('[data-testid="task-form-load-template-button"]').trigger('click');
    await flushPromises();
    expect(
      (
        wrapper.find('[data-testid="task-form-workflow-definition-input"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('');
    expect(
      requests.filter((request) =>
        request.url.includes('/v1/governance/workflowDefinitions/name/'),
      ).length,
    ).toBe(fetchesBefore);
    await wrapper.find('[data-testid="task-form-name-input"]').setValue('DescriptionUpdate');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    const post = requests.find((request) => request.init?.method === 'POST');
    const body = JSON.parse(String(post?.init?.body)) as {
      formSchema: { properties: Record<string, unknown> };
    };
    expect(body.formSchema.properties).toHaveProperty('newDescription');
  });

  it('loads a built-in template for a mapped type and category', async () => {
    const { wrapper, requests } = await mountTaskForms();
    await wrapper.find('[data-testid="task-form-add-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="task-form-type-input"]').setValue('RequestApproval');
    const categorySelect = wrapper.find('[data-testid="task-form-category-input"]');
    const selector = categorySelect.element.querySelector('.ant-select-selector') as HTMLElement;
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const target = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find(
      (option) => option.textContent?.includes('Approval'),
    ) as HTMLElement | undefined;
    expect(target).toBeDefined();
    target?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await wrapper.find('[data-testid="task-form-load-template-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('RequestApproval');
    await wrapper.find('[data-testid="task-form-save-button"]').trigger('click');
    await flushPromises();
    const post = requests.find((request) => request.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body)) as {
      formSchema: { properties: Record<string, unknown> };
    };
    expect(body.formSchema.properties).toHaveProperty('comment');
  });
});

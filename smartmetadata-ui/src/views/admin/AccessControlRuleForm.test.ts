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
import Antd, { AutoComplete, Select, message } from 'ant-design-vue';
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import AccessControlRuleForm from './AccessControlRuleForm.vue';
import { INITIAL_RULE } from './accessRuleForm';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const RESOURCES = [
  { name: 'all', operations: ['ViewAll', 'EditAll', 'All'] },
  { name: 'table', operations: ['ViewAll', 'EditAll'] },
  { name: 'databaseSchema', operations: ['ViewAll'] },
];

const FUNCTIONS = [{ name: 'isOwner', examples: ['isOwner()', 'isOwner()', 'noOwner()'] }];

const EditorStub = defineComponent({
  props: { initialValue: { type: String, default: '' } },
  emits: ['text-change'],
  setup(props) {
    return () => h('div', { 'data-testid': 'editor-stub' }, props.initialValue);
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function mountForm(
  fetchImpl: (input: RequestInfo | URL) => Promise<Response> = async (input) => {
    const url = String(input);
    if (url.includes('/api/v1/policies/resources')) return jsonResponse(RESOURCES);
    if (url.includes('/api/v1/policies/functions')) return jsonResponse(FUNCTIONS);
    if (url.includes('/api/v1/policies/validation/condition/')) return jsonResponse({}, 200);
    return new Response('not found', { status: 404 });
  },
) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const wrapper = mount(AccessControlRuleForm, {
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { SmRichTextEditor: EditorStub },
    },
  });
  await flushPromises();
  return wrapper;
}

type FormVm = {
  validate: () => Promise<boolean>;
  getRule: () => typeof INITIAL_RULE & { fullyQualifiedName?: string };
  setRule: (rule: typeof INITIAL_RULE & { fullyQualifiedName?: string }) => void;
};

function formVm(wrapper: ReturnType<typeof mount>): FormVm {
  return wrapper.vm as unknown as FormVm;
}

function selectByTestId(wrapper: ReturnType<typeof mount>, testId: string) {
  return wrapper
    .findAllComponents(Select)
    .find((node) => node.attributes('data-testid') === testId)!;
}

describe('AccessControlRuleForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts empty except for the allow effect default', async () => {
    const wrapper = await mountForm();
    expect(formVm(wrapper).getRule()).toEqual(INITIAL_RULE);
  });

  it('offers resources without the all descriptors and All first', async () => {
    const wrapper = await mountForm();
    const options = selectByTestId(wrapper, 'resources').props('options') as Array<{
      value: string;
      label: string;
    }>;
    expect(options).toEqual([
      { value: 'All', label: 'All' },
      { value: 'table', label: 'Table' },
      { value: 'databaseSchema', label: 'Database Schema' },
    ]);
  });

  it('derives operations from the selected resources without Operation.All', async () => {
    const wrapper = await mountForm();
    formVm(wrapper).setRule({ ...INITIAL_RULE, resources: ['table'] });
    await flushPromises();
    const tableOptions = selectByTestId(wrapper, 'operations').props('options') as Array<{
      value: string;
    }>;
    expect(tableOptions.map((option) => option.value)).toEqual(['All', 'ViewAll', 'EditAll']);
    formVm(wrapper).setRule({ ...INITIAL_RULE, resources: ['All'] });
    await flushPromises();
    const allOptions = selectByTestId(wrapper, 'operations').props('options') as Array<{
      value: string;
    }>;
    expect(allOptions.map((option) => option.value)).toEqual(['All', 'ViewAll', 'EditAll']);
    formVm(wrapper).setRule({ ...INITIAL_RULE, resources: ['databaseSchema'] });
    await flushPromises();
    const schemaOptions = selectByTestId(wrapper, 'operations').props('options') as Array<{
      value: string;
    }>;
    expect(schemaOptions.map((option) => option.value)).toEqual(['All', 'ViewAll']);
  });

  it('applies the All mutual-exclusion rules on change', async () => {
    const wrapper = await mountForm();
    const vm = formVm(wrapper);
    const resources = selectByTestId(wrapper, 'resources');
    await resources.vm.$emit('change', ['table', 'All']);
    expect(vm.getRule().resources).toEqual(['All']);
    await resources.vm.$emit('change', ['All', 'table']);
    expect(vm.getRule().resources).toEqual(['table']);
    await resources.vm.$emit('change', ['All']);
    expect(vm.getRule().resources).toEqual(['All']);
    await resources.vm.$emit('change', []);
    expect(vm.getRule().resources).toEqual([]);
    const operations = selectByTestId(wrapper, 'operations');
    await operations.vm.$emit('change', ['ViewAll', 'All']);
    expect(vm.getRule().operations).toEqual(['All']);
    await operations.vm.$emit('change', []);
    expect(vm.getRule().operations).toEqual([]);
  });

  it('clears operations on any resources change', async () => {
    const wrapper = await mountForm();
    const vm = formVm(wrapper);
    vm.setRule({ ...INITIAL_RULE, resources: ['table'], operations: ['ViewAll'] });
    await flushPromises();
    await selectByTestId(wrapper, 'resources').vm.$emit('change', ['databaseSchema']);
    expect(vm.getRule().resources).toEqual(['databaseSchema']);
    expect(vm.getRule().operations).toEqual([]);
  });

  it('validates name, resources and operations but never the condition', async () => {
    const wrapper = await mountForm();
    const vm = formVm(wrapper);
    expect(await vm.validate()).toBe(false);
    vm.setRule({
      ...INITIAL_RULE,
      name: 'RuleA',
      resources: ['table'],
      operations: ['ViewAll'],
      condition: 'definitely not valid {{{',
    });
    expect(await vm.validate()).toBe(true);
    vm.setRule({ ...INITIAL_RULE, name: 'RuleA', resources: ['table'], operations: [] });
    expect(await vm.validate()).toBe(false);
  });

  it('carries a loaded rule FQN through getRule without rendering it', async () => {
    const wrapper = await mountForm();
    const vm = formVm(wrapper);
    vm.setRule({ ...INITIAL_RULE, name: 'RuleA', fullyQualifiedName: 'Policy.RuleA' });
    expect(vm.getRule().fullyQualifiedName).toBe('Policy.RuleA');
    expect(wrapper.find('[data-testid="rule-description"]').exists()).toBe(true);
  });

  it('writes editor text changes into the description', async () => {
    const wrapper = await mountForm();
    await wrapper.getComponent(EditorStub).vm.$emit('text-change', '<p>hello</p>');
    expect(formVm(wrapper).getRule().description).toBe('<p>hello</p>');
  });

  it('validates the condition after a debounce and shows the valid feedback', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/policies/resources')) return jsonResponse(RESOURCES);
      if (url.includes('/api/v1/policies/functions')) return jsonResponse(FUNCTIONS);
      if (url.includes('/api/v1/policies/validation/condition/')) return new Response(null, { status: 204 });
      return new Response('not found', { status: 404 });
    });
    const wrapper = await mountForm(fetchMock);
    const autoComplete = wrapper.getComponent(AutoComplete);
    await autoComplete.vm.$emit('search', 'isOwner()');
    await sleep(400);
    await flushPromises();
    const validations = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/api/v1/policies/validation/condition/'),
    );
    expect(validations).toHaveLength(1);
    // Raw interpolation: the pin sends the condition unencoded.
    expect(String(validations[0]![0])).toContain('/api/v1/policies/validation/condition/isOwner()');
    expect(wrapper.find('[data-testid="condition-success"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="condition-error"]').exists()).toBe(false);
  });

  it('debounces rapid condition input into a single validation of the latest text', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/policies/resources')) return jsonResponse(RESOURCES);
      if (url.includes('/api/v1/policies/functions')) return jsonResponse(FUNCTIONS);
      if (url.includes('/api/v1/policies/validation/condition/')) return jsonResponse({}, 200);
      return new Response('not found', { status: 404 });
    });
    const wrapper = await mountForm(fetchMock);
    const autoComplete = wrapper.getComponent(AutoComplete);
    await autoComplete.vm.$emit('search', 'aaa');
    await sleep(100);
    await autoComplete.vm.$emit('search', 'bbb');
    await sleep(400);
    await flushPromises();
    const validations = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/api/v1/policies/validation/condition/'),
    );
    expect(validations).toHaveLength(1);
    expect(String(validations[0]![0])).toContain('condition/bbb');
  });

  it('shows the server error text for an invalid condition', async () => {
    const wrapper = await mountForm(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/policies/resources')) return jsonResponse(RESOURCES);
      if (url.includes('/api/v1/policies/functions')) return jsonResponse(FUNCTIONS);
      if (url.includes('/api/v1/policies/validation/condition/')) {
        return jsonResponse({ message: 'bad expression' }, 400);
      }
      return new Response('not found', { status: 404 });
    });
    await wrapper.getComponent(AutoComplete).vm.$emit('search', 'bad(');
    await sleep(400);
    await flushPromises();
    const error = wrapper.find('[data-testid="condition-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain('Invalid condition');
    expect(error.text()).toContain('bad expression');
    expect(wrapper.find('[data-testid="condition-success"]').exists()).toBe(false);
  });

  it('clears condition feedback immediately when the input is emptied', async () => {
    const wrapper = await mountForm(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/policies/resources')) return jsonResponse(RESOURCES);
      if (url.includes('/api/v1/policies/functions')) return jsonResponse(FUNCTIONS);
      if (url.includes('/api/v1/policies/validation/condition/')) {
        return jsonResponse({ message: 'bad expression' }, 400);
      }
      return new Response('not found', { status: 404 });
    });
    const autoComplete = wrapper.getComponent(AutoComplete);
    await autoComplete.vm.$emit('search', 'bad(');
    await sleep(400);
    await flushPromises();
    expect(wrapper.find('[data-testid="condition-error"]').exists()).toBe(true);
    await autoComplete.vm.$emit('search', '');
    await flushPromises();
    expect(wrapper.find('[data-testid="condition-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="condition-success"]').exists()).toBe(false);
  });

  it('offers deduplicated condition examples filtered by substring', async () => {
    const wrapper = await mountForm();
    const autoComplete = wrapper.getComponent(AutoComplete);
    await autoComplete.vm.$emit('search', 'isOwner');
    const options = autoComplete.props('options') as Array<{ value: string }>;
    expect(options.map((option) => option.value)).toEqual(['isOwner()']);
    await autoComplete.vm.$emit('search', '');
    const all = autoComplete.props('options') as Array<{ value: string }>;
    expect(all.map((option) => option.value)).toEqual(['isOwner()', 'noOwner()']);
  });

  it('toasts and leaves empty options when the option fetches fail', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const wrapper = await mountForm(async () => new Response('boom', { status: 500 }));
    expect(errorSpy).toHaveBeenCalledTimes(2);
    const options = selectByTestId(wrapper, 'resources').props('options') as Array<unknown>;
    expect(options).toEqual([{ value: 'All', label: 'All' }]);
  });
});

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
import Antd, { Button } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createTestI18n } from '@/test/i18n';
import TestConnectionCard from './TestConnectionCard.vue';

vi.mock('@/api/testConnections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/testConnections')>();
  return {
    ...actual,
    getTestConnectionDefinition: vi.fn(),
    createTestConnectionWorkflow: vi.fn(),
    triggerTestConnectionWorkflow: vi.fn(),
    getTestConnectionWorkflow: vi.fn(),
    deleteTestConnectionWorkflow: vi.fn(),
  };
});

import {
  createTestConnectionWorkflow,
  deleteTestConnectionWorkflow,
  getTestConnectionDefinition,
  getTestConnectionWorkflow,
  triggerTestConnectionWorkflow,
} from '@/api/testConnections';

const mockedDefinition = vi.mocked(getTestConnectionDefinition);
const mockedCreate = vi.mocked(createTestConnectionWorkflow);
const mockedTrigger = vi.mocked(triggerTestConnectionWorkflow);
const mockedGet = vi.mocked(getTestConnectionWorkflow);
const mockedDelete = vi.mocked(deleteTestConnectionWorkflow);

const mounted: Array<{ unmount: () => void }> = [];

function mountCard(props: Record<string, unknown> = {}) {
  const connection = ref({ config: { hostPort: 'localhost:3306' } });
  const wrapper = mount(TestConnectionCard, {
    props: {
      connectionType: 'Mysql',
      kind: 'database',
      serviceName: 'mysql-service',
      getConnection: () => connection.value,
      airflowAvailable: true,
      shouldValidateForm: false,
      pollIntervalMs: 10,
      timeoutMs: 1000,
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
  mounted.push(wrapper);
  return { wrapper, connection };
}

function cardTestId(wrapper: ReturnType<typeof mountCard>['wrapper']): string | undefined {
  // Query the DOM: findComponent(Alert).attributes() reads the motion
  // transition wrapper ant Alert renders around its root element.
  return wrapper.find('[data-testid^="test-connection-card-"]').attributes('data-testid');
}

async function settle(_wrapper: ReturnType<typeof mountCard>['wrapper'], ms = 100): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await flushPromises();
  }
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDefinition.mockResolvedValue([{ name: 'checkAccess', mandatory: true }]);
  mockedCreate.mockResolvedValue({ id: 'wf-1' });
  mockedTrigger.mockResolvedValue(undefined);
  mockedDelete.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const wrapper of mounted.splice(0)) {
    wrapper.unmount();
  }
  document.body.innerHTML = '';
});

describe('TestConnectionCard (official TestConnection)', () => {
  it('shows the ready-to-test card and disables the button without airflow', () => {
    const { wrapper } = mountCard({ airflowAvailable: false });
    expect(cardTestId(wrapper)).toBe('test-connection-card-ready-to-test');
    expect(wrapper.text()).toContain('Platform Service Client Unavailable');
    const button = wrapper.find('[data-testid="test-connection-btn"]');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('disables the button for Custom types and while required fields are missing it still allows the test', () => {
    const custom = mountCard({ connectionType: 'CustomDatabase' });
    expect(
      custom.wrapper.find('[data-testid="test-connection-btn"]').attributes('disabled'),
    ).toBeDefined();
    const missing = mountCard({ missingRequiredFieldsCount: 2 });
    expect(missing.wrapper.text()).toContain('Fill 2 more required fields');
    expect(
      missing.wrapper.find('[data-testid="test-connection-btn"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('runs the definition/create/trigger/poll/delete flow and reports success', async () => {
    mockedGet
      .mockResolvedValueOnce({ id: 'wf-1', status: 'Running' })
      .mockResolvedValue({
        id: 'wf-1',
        status: 'Successful',
        response: { status: 'Successful', steps: [{ name: 'checkAccess', passed: true }] },
      });
    const { wrapper } = mountCard();
    await wrapper.find('[data-testid="test-connection-btn"]').trigger('click');
    await settle(wrapper, 200);
    expect(mockedDefinition).toHaveBeenCalledWith('Mysql');
    expect(mockedCreate).toHaveBeenCalledWith({
      serviceName: 'mysql-service',
      kind: 'database',
      connectionType: 'Mysql',
      connection: { config: { hostPort: 'localhost:3306' } },
    });
    expect(mockedTrigger).toHaveBeenCalledWith('wf-1');
    expect(mockedDelete).toHaveBeenCalledWith('wf-1');
    expect(cardTestId(wrapper)).toBe('test-connection-card-Successful');
    expect(wrapper.text()).toContain('Connection verified');
    expect(wrapper.text()).toContain('1 checks passed');
    expect(wrapper.find('[data-testid="test-connection-btn"]').text()).toContain(
      'Re-test Connection',
    );
    expect(wrapper.emitted('status-change')?.at(-1)).toEqual([true]);
  });

  it('reports failure when a required step fails and deletes the workflow', async () => {
    mockedGet.mockResolvedValue({
      id: 'wf-1',
      status: 'Failed',
      response: { status: 'Failed', steps: [{ name: 'checkAccess', passed: false }] },
    });
    const { wrapper } = mountCard();
    await wrapper.find('[data-testid="test-connection-btn"]').trigger('click');
    await settle(wrapper, 200);
    expect(cardTestId(wrapper)).toBe('test-connection-card-Failed');
    expect(mockedDelete).toHaveBeenCalledWith('wf-1');
    expect(wrapper.emitted('status-change')?.at(-1)).toEqual([false]);
  });

  it('reports Warning as success when only optional steps fail', async () => {
    mockedDefinition.mockResolvedValue([
      { name: 'checkAccess', mandatory: true },
      { name: 'getDatabases', mandatory: false },
    ]);
    mockedGet.mockResolvedValue({
      id: 'wf-1',
      status: 'Successful',
      response: {
        status: 'Successful',
        steps: [
          { name: 'checkAccess', passed: true },
          { name: 'getDatabases', passed: false },
        ],
      },
    });
    const { wrapper } = mountCard();
    await wrapper.find('[data-testid="test-connection-btn"]').trigger('click');
    await settle(wrapper, 200);
    expect(cardTestId(wrapper)).toBe('test-connection-card-Warning');
    expect(wrapper.emitted('status-change')?.at(-1)).toEqual([true]);
  });

  it('deletes the workflow and fails when the trigger fails', async () => {
    mockedTrigger.mockRejectedValue(new Error('trigger denied'));
    const { wrapper } = mountCard();
    await wrapper.find('[data-testid="test-connection-btn"]').trigger('click');
    await settle(wrapper, 100);
    expect(mockedDelete).toHaveBeenCalledWith('wf-1');
    expect(cardTestId(wrapper)).toBe('test-connection-card-Failed');
  });

  it('fails when the definition is empty', async () => {
    mockedDefinition.mockResolvedValue([]);
    const { wrapper } = mountCard();
    await wrapper.find('[data-testid="test-connection-btn"]').trigger('click');
    await settle(wrapper, 100);
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(cardTestId(wrapper)).toBe('test-connection-card-Failed');
  });

  it('shows the cannot-be-triggered message when the definition fetch fails (pin, L-7)', async () => {
    mockedDefinition.mockRejectedValue(new Error('boom 500'));
    const { wrapper } = mountCard();
    await wrapper.find('[data-testid="test-connection-btn"]').trigger('click');
    await settle(wrapper, 100);
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(cardTestId(wrapper)).toBe('test-connection-card-Failed');
    await wrapper.find('[data-testid="test-connection-details-btn"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Test connection cannot be triggered.');
    expect(document.body.textContent).not.toContain('boom 500');
  });

  it('discards a stale result when the connection changes after a run', async () => {
    mockedGet.mockResolvedValue({
      id: 'wf-1',
      status: 'Successful',
      response: { status: 'Successful', steps: [{ name: 'checkAccess', passed: true }] },
    });
    const { wrapper, connection } = mountCard();
    await wrapper.find('[data-testid="test-connection-btn"]').trigger('click');
    await settle(wrapper, 200);
    expect(cardTestId(wrapper)).toBe('test-connection-card-Successful');
    connection.value = { config: { hostPort: 'other:3306' } };
    await flushPromises();
    expect(cardTestId(wrapper)).toBe('test-connection-card-ready-to-test');
    expect(wrapper.emitted('status-change')?.at(-1)).toEqual([false]);
  });

  it('times out, leaves the workflow in place, and says so', async () => {
    mockedGet.mockResolvedValue({ id: 'wf-1', status: 'Running' });
    const { wrapper } = mountCard({ timeoutMs: 50 });
    await wrapper.find('[data-testid="test-connection-btn"]').trigger('click');
    await settle(wrapper, 200);
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="test-connection-btn"]').attributes('disabled')).toBeUndefined();
  });

  it('validates the form first when shouldValidateForm is set', async () => {
    const { wrapper } = mountCard({
      shouldValidateForm: true,
      onValidateFormRequiredFields: () => false,
    });
    await wrapper.find('[data-testid="test-connection-btn"]').trigger('click');
    await flushPromises();
    expect(mockedDefinition).not.toHaveBeenCalled();
  });

  it('renders a simple button when showDetails is false', async () => {
    const { wrapper } = mountCard({ showDetails: false });
    expect(wrapper.find('[data-testid="test-connection-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-connection-btn"]').exists()).toBe(false);
    expect(wrapper.findAllComponents(Button).length).toBeGreaterThan(0);
  });
});

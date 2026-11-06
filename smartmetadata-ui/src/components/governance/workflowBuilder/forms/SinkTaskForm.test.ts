/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MASKED_PASSWORD_VALUE } from '@/constants/workflowBuilder';
import type { WorkflowFlowNode } from '@/types/governance';
import SinkTaskForm from './SinkTaskForm.vue';
import { mountWithBuilder } from '../testHarness';

const SINK_NODE: WorkflowFlowNode = {
  id: 'sinkTask_1',
  type: 'automatedTask',
  position: { x: 0, y: 0 },
  data: {
    name: 'sinkTask_1',
    label: 'Git Sink',
    displayName: 'Git Sink',
    subType: 'sinkTask',
    config: {
      sinkConfig: {
        sinkType: 'git',
        repositoryUrl: 'https://github.com/acme/metadata.git',
        branch: 'main',
        basePath: 'metadata',
        token: 'secret-token',
        conflictResolution: 'overwriteExternal',
        commitMessageTemplate: 'Sync {entityType}: {entityName}',
        authorName: 'iSmart Bot',
        authorEmail: 'bot@openmetadata.org',
        signingPrivateKey: 'private-key',
        signingKeyPassphrase: 'pass',
      },
    },
  },
};

function sinkConfigOf(onSave: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = onSave.mock.calls[0];
  expect(call).toBeDefined();
  const config = call[1] as Record<string, unknown>;
  return (config.config as Record<string, unknown>).sinkConfig as Record<
    string,
    unknown
  >;
}

async function mountSink() {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const Host = defineComponent({
    setup: () => () => h(SinkTaskForm, { node: SINK_NODE, onSave, onClose }),
  });
  const mounted = await mountWithBuilder(Host, {
    path: '/workflows/approve-glossary-term/workflow?mode=edit',
  });
  return { ...mounted, onSave, onClose };
}

function secretInput(wrapper: VueWrapper, testid: string) {
  const root = wrapper.find(`[data-testid="${testid}"]`);
  // A TextArea's root IS the textarea; an Input.Password root is a span
  // wrapper around the input.
  if (root.element.tagName === 'INPUT' || root.element.tagName === 'TEXTAREA') {
    return root;
  }
  return wrapper.find(`[data-testid="${testid}"] input`);
}

describe('SinkTaskForm masked-secret dance', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('renders stored secrets masked', { timeout: 15000 }, async () => {
    const mounted = await mountSink();
    const token = secretInput(mounted.wrapper, 'sink-token-input');
    expect((token.element as HTMLInputElement).value).toBe(MASKED_PASSWORD_VALUE);
    const key = secretInput(mounted.wrapper, 'sink-signing-private-key-textarea');
    expect((key.element as HTMLTextAreaElement).value).toBe(MASKED_PASSWORD_VALUE);
    const pass = secretInput(mounted.wrapper, 'sink-signing-key-passphrase-input');
    expect((pass.element as HTMLInputElement).value).toBe(MASKED_PASSWORD_VALUE);
  });

  it('restores the mask on blur without typing', { timeout: 15000 }, async () => {
    const mounted = await mountSink();
    const token = secretInput(mounted.wrapper, 'sink-token-input');
    await token.trigger('focus');
    expect((token.element as HTMLInputElement).value).toBe('');
    await token.trigger('blur');
    expect((token.element as HTMLInputElement).value).toBe(MASKED_PASSWORD_VALUE);
  });

  it('saves the stored token untouched when the field is never edited', { timeout: 15000 }, async () => {
    const mounted = await mountSink();
    await mounted.wrapper.find('[data-testid="save-node-configuration-button"]').trigger('click');
    expect(mounted.onSave).toHaveBeenCalledTimes(1);
    expect(sinkConfigOf(mounted.onSave).token).toBe('secret-token');
    expect(sinkConfigOf(mounted.onSave).signingPrivateKey).toBe('private-key');
    expect(sinkConfigOf(mounted.onSave).signingKeyPassphrase).toBe('pass');
  });

  it('saves a newly typed token', { timeout: 15000 }, async () => {
    const mounted = await mountSink();
    const token = secretInput(mounted.wrapper, 'sink-token-input');
    await token.trigger('focus');
    await token.setValue('rotated-token');
    await mounted.wrapper.find('[data-testid="save-node-configuration-button"]').trigger('click');
    expect(sinkConfigOf(mounted.onSave).token).toBe('rotated-token');
  });

  it('clears the secret on Backspace in a pending-masked field', { timeout: 15000 }, async () => {
    const mounted = await mountSink();
    const token = secretInput(mounted.wrapper, 'sink-token-input');
    await token.trigger('focus');
    await token.trigger('keydown', { key: 'Backspace' });
    expect((token.element as HTMLInputElement).value).toBe('');
    // With the token cleared the form is invalid, so Save disables
    // instead of submitting — the cleared secret never reaches the server.
    const save = mounted.wrapper.find(
      '[data-testid="save-node-configuration-button"]',
    );
    expect((save.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('replacing the signing key resets a masked passphrase', { timeout: 15000 }, async () => {
    const mounted = await mountSink();
    const key = secretInput(mounted.wrapper, 'sink-signing-private-key-textarea');
    await key.trigger('focus');
    await key.setValue('new-private-key');
    // Re-query after the mutation: the render replaces the input element.
    const pass = secretInput(mounted.wrapper, 'sink-signing-key-passphrase-input');
    expect((pass.element as HTMLInputElement).value).toBe('');
    await mounted.wrapper.find('[data-testid="save-node-configuration-button"]').trigger('click');
    expect(sinkConfigOf(mounted.onSave).signingPrivateKey).toBe('new-private-key');
    // An empty passphrase is omitted from the saved sink config, not
    // stored as an empty string.
    expect(sinkConfigOf(mounted.onSave).signingKeyPassphrase).toBeUndefined();
  });

  it('keeps a re-typed passphrase when the signing key is replaced', { timeout: 15000 }, async () => {
    const mounted = await mountSink();
    const key = secretInput(mounted.wrapper, 'sink-signing-private-key-textarea');
    const pass = secretInput(mounted.wrapper, 'sink-signing-key-passphrase-input');
    await pass.trigger('focus');
    await pass.setValue('new-pass');
    await key.trigger('focus');
    await key.setValue('new-private-key');
    const passAfter = secretInput(mounted.wrapper, 'sink-signing-key-passphrase-input');
    expect((passAfter.element as HTMLInputElement).value).toBe('new-pass');
    await mounted.wrapper.find('[data-testid="save-node-configuration-button"]').trigger('click');
    expect(sinkConfigOf(mounted.onSave).signingKeyPassphrase).toBe('new-pass');
  });
});

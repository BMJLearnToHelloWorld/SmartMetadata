/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NodeConfigSidebar from './NodeConfigSidebar.vue';
import { mountWithBuilder } from './testHarness';

async function mountSidebar() {
  const Host = defineComponent({
    setup: () => () => h(NodeConfigSidebar),
  });
  const mounted = await mountWithBuilder(Host, {
    path: '/workflows/approve-glossary-term/workflow?mode=edit',
  });
  const startNode = mounted.builder.state.state.nodes.find((n) => n.id === 'start');
  expect(startNode).toBeDefined();
  mounted.builder.actions.handleNodeClick(
    { stopPropagation: () => undefined } as unknown as MouseEvent,
    startNode!,
  );
  await nextTick();
  return mounted;
}

function drawerEl(testid: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testid}"]`);
}

describe('NodeConfigSidebar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('opens the start-node configuration when the start node is clicked', { timeout: 15000 }, async () => {
    await mountSidebar();
    // The Drawer teleports to document.body; antd does not forward the
    // testid attr onto the Drawer root, so assert on the inner hooks.
    expect(drawerEl('node-config-title')).not.toBeNull();
    expect(drawerEl('node-config-title')?.textContent).toBe('Start Node Configuration');
    const nameInput = drawerEl('workflow-name-input') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    // The start-node name derives from the definition display name.
    expect(nameInput.value).toBe('Approve Glossary Term');
    // The fixture trigger carries glossaryTerm data assets, so the
    // start-node config is valid and Save is enabled.
    const save = drawerEl('save-node-configuration-button') as HTMLButtonElement;
    expect(save).not.toBeNull();
    expect(save.disabled).toBe(false);
  });

  it('disables Save when the start-node name is cleared', { timeout: 15000 }, async () => {
    await mountSidebar();
    const nameInput = drawerEl('workflow-name-input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(nameInput, '');
    nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    await nextTick();
    const save = drawerEl('save-node-configuration-button') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});

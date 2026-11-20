/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { defineComponent, h } from 'vue';
import { createTestI18n } from '@/test/i18n';
import HomeWidgetCard from './HomeWidgetCard.vue';
import CustomizeMyData from './CustomizeMyData.vue';
import { EMPTY_WIDGET_PLACEHOLDER } from './landingPageEditor';
import type { PersonaPage } from '@/types/persona';

// The editor renders real widgets through `resolveMyDataWidget`; stub
// them to a HomeWidgetCard so the grid, edit chrome and remove flow
// are exercised without the widgets' own data fetching.
const StubWidget = defineComponent({
  props: {
    widgetKey: { type: String, required: true },
    // The editor binds `editView: true` (see CustomizeMyData
    // `editorWidgetProps`); declaring it keeps the prop typed boolean
    // instead of falling through as an unknown attr.
    editView: { type: Boolean, default: false },
  },
  setup(props) {
    return () =>
      h(HomeWidgetCard, {
        title: props.widgetKey,
        testId: `home-widget-${props.widgetKey}`,
        widgetKey: props.widgetKey,
        editView: props.editView,
      });
  },
});

vi.mock('./landingPageWidgets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./landingPageWidgets')>();
  return { ...actual, resolveMyDataWidget: () => StubWidget };
});

const onSaveLayout = vi.fn(async (..._args: unknown[]) => {});
const onBackgroundColorUpdate = vi.fn(async (..._args: unknown[]) => {});

let router: Router;

function mountEditor(
  initialPageData?: PersonaPage | null,
  pageFqn = 'LandingPage',
  extraProps: Record<string, unknown> = {},
) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/customize-page/:fqn/:pageFqn',
        name: 'customize-page',
        component: { template: '<div>customize</div>' },
      },
    ],
  });
  // Explicit null means "no saved page" (the save fallback then uses
  // the raw pageFqn); undefined means the default two-widget fixture.
  const page =
    initialPageData === undefined
      ? {
          pageType: 'LandingPage',
          layout: [
            { i: 'KnowledgePanel.Domains', x: 0, y: 0, w: 1, h: 3 },
            { i: 'KnowledgePanel.DataQuality', x: 1, y: 0, w: 1, h: 3 },
          ],
        }
      : initialPageData;
  return router.push({ name: 'customize-page', params: { fqn: 'Analyst', pageFqn } }).then(async () => {
    await router.isReady();
    return mount(CustomizeMyData, {
      props: {
        personaName: 'Analyst',
        personaFqn: 'Analyst',
        pageFqn,
        initialPageData: page,
        backgroundColor: '',
        onSaveLayout: (...args: unknown[]) => onSaveLayout(...args),
        onBackgroundColorUpdate: (...args: unknown[]) => onBackgroundColorUpdate(...args),
        ...extraProps,
      },
      global: { plugins: [router, Antd, createTestI18n()] },
    });
  });
}

function bodyEl(selector: string): HTMLElement {
  // antd Modals teleport to document.body, outside the wrapper DOM.
  const el = document.body.querySelector(selector) as HTMLElement | null;
  if (!el) {
    throw new Error(`Expected an element matching ${selector} in document.body`);
  }
  return el;
}

function clickBody(selector: string): void {
  bodyEl(selector).click();
}

/**
 * Whether the leave modal is visibly open. The modal's footer buttons
 * stay in the DOM after it closes (antd keeps a closed dialog mounted
 * with `display: none`), so asserting on their presence conflates open
 * with closed — the C-4 acceptance probe made exactly that mistake
 * and reported the working Cancel as dead. The `.ant-modal` element's
 * own style is the discriminator.
 */
function isLeaveModalVisible(): boolean {
  const modal = document.body.querySelector('.ant-modal') as HTMLElement | null;
  if (!modal) {
    return false;
  }
  return modal.style.display !== 'none';
}

/**
 * Mounts the editor as the matched route component (via <router-view>),
 * so the route-leave guard actually runs. The standalone mountEditor
 * mounts the component outside the router, where onBeforeRouteLeave
 * never fires — which is why the Discard loop below passed in jsdom
 * while failing live.
 */
function mountEditorAsRoute(extraProps: Record<string, unknown> = {}) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/customize-page/:fqn/:pageFqn',
        name: 'customize-page',
        component: CustomizeMyData,
        props: {
          personaName: 'Analyst',
          personaFqn: 'Analyst',
          pageFqn: 'LandingPage',
          initialPageData: {
            pageType: 'LandingPage',
            layout: [
              { i: 'KnowledgePanel.Domains', x: 0, y: 0, w: 1, h: 3 },
              { i: 'KnowledgePanel.DataQuality', x: 1, y: 0, w: 1, h: 3 },
            ],
          },
          backgroundColor: '',
          onSaveLayout: (...args: unknown[]) => onSaveLayout(...args),
          onBackgroundColorUpdate: (...args: unknown[]) => onBackgroundColorUpdate(...args),
          ...extraProps,
        },
      },
    ],
  });
  const Root = defineComponent({ template: '<router-view />' });
  return router.push({ name: 'customize-page', params: { fqn: 'Analyst', pageFqn: 'LandingPage' } }).then(async () => {
    await router.isReady();
    const wrapper = mount(Root, {
      global: { plugins: [router, Antd, createTestI18n()] },
    });
    await flushPromises();
    return wrapper;
  });
}

function saveButton(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="customize-save-layout"]');
}

function cellTestId(widgetKey: string): string {
  return `[data-testid="customize-widget-cell-${widgetKey}"]`;
}

describe('CustomizeMyData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // antd's Modal.confirm renders into document.body.
    document.body.innerHTML = '';
  });

  it('renders the saved layout with a placeholder at the end, Save disabled when clean', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    expect(wrapper.find(cellTestId('KnowledgePanel.Domains')).exists()).toBe(true);
    expect(wrapper.find(cellTestId('KnowledgePanel.DataQuality')).exists()).toBe(true);
    expect(wrapper.find('[data-testid="customize-placeholder-cell"]').exists()).toBe(true);
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('removing a widget enables Save, and saving writes the filtered layout', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    await wrapper.get('[data-testid="remove-widget-KnowledgePanel.Domains"]').trigger('click');
    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined();
    await saveButton(wrapper).trigger('click');
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    // The normalized layout carries `static: false` (the home page
    // normalizes the same way on read); the placeholder is stripped.
    expect(onSaveLayout).toHaveBeenCalledWith({
      pageType: 'LandingPage',
      layout: [{ i: 'KnowledgePanel.DataQuality', x: 0, y: 0, w: 1, h: 3, static: false }],
    });
    // The placeholder is never persisted.
    expect(JSON.stringify(onSaveLayout.mock.calls[0])).not.toContain(EMPTY_WIDGET_PLACEHOLDER);
  });

  it('reset restores the default layout, clears the colour, and saves with no page', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    await wrapper.get('[data-testid="customize-reset-layout"]').trigger('click');
    await flushPromises();
    const okButton = document.body.querySelector(
      '.ant-modal-confirm-btns .ant-btn-primary',
    ) as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton!.click();
    await flushPromises();
    expect(onBackgroundColorUpdate).toHaveBeenCalledWith(undefined);
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(onSaveLayout).toHaveBeenCalledWith();
    // The default 13-widget layout plus the placeholder.
    expect(wrapper.findAll('[data-testid^="customize-widget-cell-"]')).toHaveLength(13);
    expect(wrapper.find('[data-testid="customize-placeholder-cell"]').exists()).toBe(true);
  });

  it('cancel with unsaved changes opens the leave modal; discard navigates home', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    await wrapper.get('[data-testid="remove-widget-KnowledgePanel.Domains"]').trigger('click');
    await wrapper.get('[data-testid="customize-cancel"]').trigger('click');
    await flushPromises();
    // The leave modal teleports to document.body; antd swallows a
    // testid on <Modal> itself, so the footer buttons are the handle.
    expect(document.body.querySelector('[data-testid="customize-leave-discard"]')).not.toBeNull();
    expect(document.body.innerHTML).toContain('You have unsaved changes');
    clickBody('[data-testid="customize-leave-discard"]');
    await flushPromises();
    expect(onSaveLayout).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('leave modal cancel stays; save-and-exit saves then navigates', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    await wrapper.get('[data-testid="remove-widget-KnowledgePanel.Domains"]').trigger('click');
    await wrapper.get('[data-testid="customize-cancel"]').trigger('click');
    await flushPromises();
    expect(isLeaveModalVisible()).toBe(true);
    clickBody('[data-testid="customize-leave-cancel"]');
    await flushPromises();
    expect(isLeaveModalVisible()).toBe(false);
    expect(router.currentRoute.value.name).toBe('customize-page');
    await wrapper.get('[data-testid="customize-cancel"]').trigger('click');
    await flushPromises();
    expect(isLeaveModalVisible()).toBe(true);
    // The parent syncs the saved document back into initialPageData
    // after a save; emulate that here so the editor goes clean and
    // the leave may proceed.
    onSaveLayout.mockImplementationOnce(async (page: unknown) => {
      await wrapper.setProps({ initialPageData: page as PersonaPage });
    });
    clickBody('[data-testid="customize-leave-save-exit"]');
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(isLeaveModalVisible()).toBe(false);
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('save-and-exit with a rejected save stays on the page with the modal open', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    onSaveLayout.mockRejectedValueOnce(new Error('save boom'));
    await wrapper.get('[data-testid="remove-widget-KnowledgePanel.Domains"]').trigger('click');
    await wrapper.get('[data-testid="customize-cancel"]').trigger('click');
    await flushPromises();
    expect(isLeaveModalVisible()).toBe(true);
    clickBody('[data-testid="customize-leave-save-exit"]');
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    // Pin CustomizablePage: only a rejecting save stays on the page —
    // the failed save must never navigate away and drop the edits.
    expect(isLeaveModalVisible()).toBe(true);
    expect(router.currentRoute.value.name).toBe('customize-page');
    // The user can still cancel out of the modal afterwards.
    clickBody('[data-testid="customize-leave-cancel"]');
    await flushPromises();
    expect(isLeaveModalVisible()).toBe(false);
  });

  it('C-4: discard from the page-Cancel path leaves instead of reopening the modal', async () => {
    // Route-mounted: the editor is the matched route component, so
    // onBeforeRouteLeave runs — the standalone mount never exercises
    // it, which is how this loop shipped green while failing live.
    const wrapper = await mountEditorAsRoute();
    await wrapper.get('[data-testid="remove-widget-KnowledgePanel.Domains"]').trigger('click');
    await wrapper.get('[data-testid="customize-cancel"]').trigger('click');
    await flushPromises();
    expect(isLeaveModalVisible()).toBe(true);
    clickBody('[data-testid="customize-leave-discard"]');
    await flushPromises();
    expect(onSaveLayout).not.toHaveBeenCalled();
    expect(isLeaveModalVisible()).toBe(false);
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('C-4: discard from a held route-leave resumes the held navigation', async () => {
    const wrapper = await mountEditorAsRoute();
    await wrapper.get('[data-testid="remove-widget-KnowledgePanel.Domains"]').trigger('click');
    void router.push({ name: 'home' });
    await flushPromises();
    expect(isLeaveModalVisible()).toBe(true);
    expect(router.currentRoute.value.name).toBe('customize-page');
    clickBody('[data-testid="customize-leave-discard"]');
    await flushPromises();
    expect(onSaveLayout).not.toHaveBeenCalled();
    expect(isLeaveModalVisible()).toBe(false);
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('C-4: cancel from a held route-leave aborts it and a later navigation still works', async () => {
    const wrapper = await mountEditorAsRoute();
    await wrapper.get('[data-testid="remove-widget-KnowledgePanel.Domains"]').trigger('click');
    void router.push({ name: 'home' });
    await flushPromises();
    expect(isLeaveModalVisible()).toBe(true);
    clickBody('[data-testid="customize-leave-cancel"]');
    await flushPromises();
    expect(isLeaveModalVisible()).toBe(false);
    expect(router.currentRoute.value.name).toBe('customize-page');
    // The second push is held by the guard again (the editor is still
    // dirty), so it must not be awaited: a held navigation's promise
    // never settles until the modal answers it.
    void router.push({ name: 'home' });
    await flushPromises();
    // The held navigation was aborted (next(false)), not left hanging,
    // and the guard is still armed for new navigations: a fresh
    // attempt trips the modal again instead of slipping through.
    expect(isLeaveModalVisible()).toBe(true);
    expect(router.currentRoute.value.name).toBe('customize-page');
  });

  it('cancel with no changes navigates home without the leave modal', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    await wrapper.get('[data-testid="customize-cancel"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-testid="customize-leave-discard"]')).toBeNull();
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('O-ENTRY-2: with onExit, a clean cancel calls the parent instead of navigating home', async () => {
    const onExit = vi.fn();
    const wrapper = await mountEditor(undefined, 'LandingPage', { onExit });
    await flushPromises();
    await wrapper.get('[data-testid="customize-cancel"]').trigger('click');
    await flushPromises();
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe('customize-page');
  });

  it('O-ENTRY-2: with onExit, discard in the leave modal calls the parent instead of navigating home', async () => {
    const onExit = vi.fn();
    const wrapper = await mountEditor(undefined, 'LandingPage', { onExit });
    await flushPromises();
    await wrapper.get('[data-testid="remove-widget-KnowledgePanel.Domains"]').trigger('click');
    await wrapper.get('[data-testid="customize-cancel"]').trigger('click');
    await flushPromises();
    clickBody('[data-testid="customize-leave-discard"]');
    await flushPromises();
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe('customize-page');
  });

  it('a placeholder cell opens the picker, and applying adds the widget', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    await wrapper.get('[data-testid="customize-placeholder-0-3"]').trigger('click');
    await flushPromises();
    // The picker modal teleports to document.body; its widget
    // checkboxes are the handle (antd swallows a testid on <Modal>).
    expect(
      document.body.querySelector('[data-testid="customize-widget-KnowledgePanel.KPI"]'),
    ).not.toBeNull();
    // KPI is not in the initial layout, so it is selectable: the
    // testid lands on the checkbox input itself.
    bodyEl('[data-testid="customize-widget-KnowledgePanel.KPI"]').click();
    await flushPromises();
    const okButton = bodyEl('.ant-modal-footer .ant-btn-primary');
    expect(okButton.getAttribute('disabled')).toBeNull();
    okButton.click();
    await flushPromises();
    expect(wrapper.find(cellTestId('KnowledgePanel.KPI')).exists()).toBe(true);
    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('already-added widgets are disabled in the picker', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    await wrapper.get('[data-testid="customize-add-widget"]').trigger('click');
    await flushPromises();
    const domains = bodyEl('[data-testid="customize-widget-KnowledgePanel.Domains"]');
    expect(domains.getAttribute('disabled')).toBeDefined();
    expect(domains.getAttribute('checked')).toBeDefined();
  });

  it('a gapped saved layout renders without overlapping cells', async () => {
    // A saved layout may still carry raw official coordinates
    // (y=1 under a y=0 card); the editor packs on load and compacts
    // on render, so no two cells in one column may intersect.
    // ADR:2026-11-11-home-style-compaction-and-tokens
    const wrapper = await mountEditor({
      pageType: 'LandingPage',
      layout: [
        { i: 'KnowledgePanel.Domains', x: 0, y: 0, w: 1, h: 3 },
        { i: 'KnowledgePanel.DataQuality', x: 1, y: 0, w: 1, h: 3 },
        { i: 'KnowledgePanel.KPI', x: 0, y: 1, w: 1, h: 3 },
      ],
    });
    await flushPromises();
    const cells = wrapper.findAll('[data-testid^="customize-widget-cell-"]');
    const ranges = cells.map((cell) => {
      const style = cell.attributes('style') ?? '';
      const col = Number(/grid-column: (\d+) \/ span/.exec(style)?.[1]);
      const row = Number(/grid-row: (\d+) \/ span/.exec(style)?.[1]);
      const span = Number(/grid-row: \d+ \/ span (\d+)/.exec(style)?.[1]);
      return { col, start: row, end: row + span };
    });
    expect(ranges).toHaveLength(3);
    for (let a = 0; a < ranges.length; a++) {
      for (let b = a + 1; b < ranges.length; b++) {
        if (ranges[a].col !== ranges[b].col) continue;
        expect(ranges[a].start >= ranges[b].end || ranges[b].start >= ranges[a].end).toBe(true);
      }
    }
    // KPI slides under Domains' packed bottom edge (grid row 4 = y 3).
    const kpi = wrapper.get(cellTestId('KnowledgePanel.KPI'));
    expect(kpi.attributes('style')).toContain('grid-row: 4 / span 3');
  });

  it('dragging a widget to another cell reflows the layout live', async () => {
    const wrapper = await mountEditor();
    await flushPromises();
    const handle = wrapper.get('[data-testid="drag-widget-KnowledgePanel.Domains"]');
    // jsdom has no DragEvent; a MouseEvent carries everything the
    // handlers read (target, clientX/Y) once dataTransfer is attached.
    const dragStart = new MouseEvent('dragstart', { bubbles: true });
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: { effectAllowed: '', setData: vi.fn() },
    });
    handle.element.dispatchEvent(dragStart);
    const grid = wrapper.get('[data-testid="customize-my-data-grid"]');
    // jsdom reports a zero-size grid rect, so the pointer maps to the
    // clamped far cell (col 1, row 1); the dragged widget moves there
    // and the rest repacks around it.
    const dragOver = new MouseEvent('dragover', { bubbles: true, clientX: 100, clientY: 200 });
    grid.element.dispatchEvent(dragOver);
    await flushPromises();
    // The pointer maps to the clamped far cell (col 1, row 1); the
    // live reflow packs tightly, so both widgets still fit one row and
    // Domains swaps columns with DataQuality instead of dropping to
    // a second row — that is pin's repack, not a missed drag.
    const domainsCell = wrapper.get(cellTestId('KnowledgePanel.Domains'));
    expect(domainsCell.attributes('style')).toContain('grid-column: 2 / span 1');
    const dqCell = wrapper.get(cellTestId('KnowledgePanel.DataQuality'));
    expect(dqCell.attributes('style')).toContain('grid-column: 1 / span 1');
    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('uses the raw pageFqn as the save fallback (homepage alias, no LandingPage hardcode)', async () => {
    const wrapper = await mountEditor(null, 'homepage');
    await flushPromises();
    // No saved page: the default layout renders; removing a widget
    // makes the editor dirty.
    await wrapper.get('[data-testid="remove-widget-KnowledgePanel.Domains"]').trigger('click');
    await saveButton(wrapper).trigger('click');
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    const payload = onSaveLayout.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.pageType).toBe('homepage');
    expect(Array.isArray(payload.layout)).toBe(true);
  });

  it('shows the D2 abnormal state for an object layout and converts only on confirm', async () => {
    const wrapper = await mountEditor({
      pageType: 'LandingPage',
      layout: { a: 1 },
    } as unknown as PersonaPage);
    await flushPromises();
    expect(wrapper.find('[data-testid="object-layout-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="customize-my-data-grid"]').exists()).toBe(false);
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined();
    expect(
      wrapper.get('[data-testid="customize-add-widget"]').attributes('disabled'),
    ).toBeDefined();
    expect(onSaveLayout).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="object-layout-convert"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="customize-my-data-grid"]').exists()).toBe(true);
    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined();
    await saveButton(wrapper).trigger('click');
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    const payload = onSaveLayout.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.pageType).toBe('LandingPage');
    expect(Array.isArray(payload.layout)).toBe(true);
    expect(payload.layout).toHaveLength(13);
    expect(JSON.stringify(payload)).not.toContain(EMPTY_WIDGET_PLACEHOLDER);
  });

  it('treats {} like a non-empty object (D2, no silent default grid)', async () => {
    const wrapper = await mountEditor({
      pageType: 'LandingPage',
      layout: {},
    } as unknown as PersonaPage);
    await flushPromises();
    expect(wrapper.find('[data-testid="object-layout-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="customize-my-data-grid"]').exists()).toBe(false);
  });

  it('reset under an object layout still deletes via the no-arg save', async () => {
    const wrapper = await mountEditor({
      pageType: 'LandingPage',
      layout: { a: 1 },
    } as unknown as PersonaPage);
    await flushPromises();
    await wrapper.get('[data-testid="customize-reset-layout"]').trigger('click');
    await flushPromises();
    const okButton = document.body.querySelector(
      '.ant-modal-confirm-btns .ant-btn-primary',
    ) as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton!.click();
    await flushPromises();
    expect(onBackgroundColorUpdate).toHaveBeenCalledWith(undefined);
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(onSaveLayout).toHaveBeenCalledWith();
  });
});

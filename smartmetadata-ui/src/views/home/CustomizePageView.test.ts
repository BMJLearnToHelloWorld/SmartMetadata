/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h, type ComponentObjectPropsOptions } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ApiError } from '@/api/client';
import { getDocumentByFqn } from '@/api/docStore';
import { getPersonaByName, listPersonas } from '@/api/persona';
import { usePersonaStore } from '@/stores/persona';
import { createTestI18n } from '@/test/i18n';
import type { PageTab, Persona, PersonaDocument, PersonaPage } from '@/types/persona';
import CustomizePageView from './CustomizePageView.vue';

vi.mock('@/api/persona', async () => {
  const actual = await vi.importActual<typeof import('@/api/persona')>('@/api/persona');
  return { ...actual, getPersonaByName: vi.fn(), listPersonas: vi.fn() };
});

vi.mock('@/api/docStore', async () => {
  const actual = await vi.importActual<typeof import('@/api/docStore')>('@/api/docStore');
  return { ...actual, getDocumentByFqn: vi.fn() };
});

const mockedGetPersonaByName = vi.mocked(getPersonaByName);
const mockedListPersonas = vi.mocked(listPersonas);
const mockedGetDocumentByFqn = vi.mocked(getDocumentByFqn);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PERSONA = {
  id: 'p1',
  name: 'Analyst',
  fullyQualifiedName: 'Analyst',
  displayName: 'Data Analyst',
} satisfies Persona;

function makeDoc(overrides: Partial<PersonaDocument> = {}): PersonaDocument {
  const doc: PersonaDocument = {
    id: 'doc-1',
    name: 'Analyst-page',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'Page',
    data: { pages: [], navigation: null, personPreferences: [], personaPreferences: [] },
  };
  return Object.assign(doc, overrides);
}

function makePage(pageType: string, tabs: PageTab[] = []): PersonaPage {
  return { pageType, tabs };
}

/**
 * Editor stubs declare their props in object form, with the
 * constructor of each value the view actually passes (String for
 * names, Object for page/document values, Array for the navigation
 * list, Boolean for isGlossary, Function for callbacks). Object
 * form is what lets `defineComponent` infer the literal prop keys,
 * so `findComponent(stub).props('onSaveLayout')` typechecks; a
 * `string[]` prop list erases the keys. The constructors match the
 * bound values exactly, so no prop-type warning is introduced.
 */
function stubComponent<P extends ComponentObjectPropsOptions>(testId: string, props: P) {
  return defineComponent({
    name: `Stub${testId}`,
    props,
    render() {
      return h('div', { 'data-testid': testId });
    },
  });
}

const NavigationStub = stubComponent('stub-navigation', {
  persona: Object,
  navigation: Array,
  onSave: Function,
});
const AppLayoutStub = stubComponent('stub-app-layout', {
  persona: Object,
  document: Object,
  onSave: Function,
});
const LandingStub = stubComponent('stub-landing', {
  personaName: String,
  personaFqn: String,
  pageFqn: String,
  initialPageData: Object,
  backgroundColor: String,
  onSaveLayout: Function,
  onBackgroundColorUpdate: Function,
  onExit: Function,
});
const pageEditorProps = {
  personaName: String,
  currentPage: Object,
  currentPageType: String,
  originalPage: Object,
  onUpdateCurrentPage: Function,
  onSaveLayout: Function,
};
const MarketplaceStub = stubComponent('stub-marketplace', pageEditorProps);
const DomainStub = stubComponent('stub-domain', pageEditorProps);
const DataProductStub = stubComponent('stub-data-product', pageEditorProps);
const GlossaryStub = stubComponent('stub-glossary', {
  ...pageEditorProps,
  isGlossary: Boolean,
});
const DetailsStub = stubComponent('stub-details', pageEditorProps);

/**
 * One shared MessageType-compatible handle for the stubbed antd
 * message calls: a callable with a `then` that resolves `true`,
 * matching the real `message.success/error` return contract. The
 * view never consumes the return value; the shape exists only so
 * the mocks satisfy the MessageType return type without a cast.
 */
function messageHandle() {
  const resolved = Promise.resolve(true);
  return Object.assign(() => {}, {
    then: <TResult1 = boolean, TResult2 = never>(
      onfulfilled?: ((value: boolean) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> => resolved.then(onfulfilled, onrejected),
  });
}

function stubMessageCalls(): void {
  vi.spyOn(message, 'success').mockImplementation(() => messageHandle());
  vi.spyOn(message, 'error').mockImplementation(() => messageHandle());
}

interface MountOptions {
  doc?: PersonaDocument | Error | '404';
  personaResult?: Persona | Error;
  personaImpl?: () => Promise<Persona>;
  docImpl?: () => Promise<PersonaDocument>;
  stubs?: boolean;
  selectedPersona?: unknown;
  patchResponse?: (ops: unknown[]) => PersonaDocument;
  failDocStore?: boolean;
}

interface RecordedRequest {
  url: string;
  method: string;
  body: string;
}

async function mountView(pageFqn: string, options: MountOptions = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = usePersonaStore();
  if (options.selectedPersona) {
    // selectedPersona is a derived computed; the selection is set
    // through the store's own exposed list + id state.
    const selected = options.selectedPersona as Persona;
    store.personas = [selected];
    store.selectedPersonaId = selected.id;
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/customize-page/:fqn/:pageFqn',
        name: 'customize-page',
        component: { template: '<div>customize</div>' },
        props: true,
      },
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/settings/persona',
        name: 'admin-settings-persona',
        component: { template: '<div>list</div>' },
      },
      {
        path: '/settings/persona/:fqn',
        name: 'admin-settings-persona-detail',
        component: { template: '<div>detail</div>' },
        props: true,
      },
    ],
  });
  await router.push(`/customize-page/Analyst/${pageFqn}`);
  await router.isReady();

  const requests: RecordedRequest[] = [];
  let serverDoc: PersonaDocument | null =
    options.doc && typeof options.doc === 'object' && !(options.doc instanceof Error)
      ? options.doc
      : null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? String(init.body) : '';
      requests.push({ url, method, body });
      if (url.includes('/v1/docStore')) {
        if (options.failDocStore) {
          return jsonResponse({ message: 'boom' }, 500);
        }
        if (method === 'POST') {
          serverDoc = { ...(JSON.parse(body) as PersonaDocument), id: 'doc-1' };
          return jsonResponse(serverDoc);
        }
        if (method === 'PATCH') {
          const ops = JSON.parse(body) as unknown[];
          serverDoc = options.patchResponse ? options.patchResponse(ops) : serverDoc;
          return jsonResponse(serverDoc);
        }
      }
      return jsonResponse({ data: [], paging: { total: 0 } });
    }),
  );

  if (options.personaImpl) {
    mockedGetPersonaByName.mockImplementation(options.personaImpl);
  } else if (options.personaResult instanceof Error) {
    mockedGetPersonaByName.mockRejectedValue(options.personaResult);
  } else {
    mockedGetPersonaByName.mockResolvedValue(options.personaResult ?? PERSONA);
  }
  if (options.docImpl) {
    mockedGetDocumentByFqn.mockImplementation(options.docImpl);
  } else if (options.doc === '404') {
    mockedGetDocumentByFqn.mockRejectedValue(new ApiError(404, 'not found'));
  } else if (options.doc instanceof Error) {
    mockedGetDocumentByFqn.mockRejectedValue(options.doc);
  } else if (options.doc) {
    mockedGetDocumentByFqn.mockResolvedValue(options.doc);
  } else {
    mockedGetDocumentByFqn.mockRejectedValue(new ApiError(404, 'not found'));
  }
  mockedListPersonas.mockResolvedValue({ data: [], paging: { total: 0 } } as never);

  const useStubs = options.stubs !== false;
  const wrapper = mount(CustomizePageView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: useStubs
        ? {
            NavigationEditor: NavigationStub,
            AppLayoutEditor: AppLayoutStub,
            CustomizeMyData: LandingStub,
            DataMarketplaceEditor: MarketplaceStub,
            DomainPageEditor: DomainStub,
            DataProductPageEditor: DataProductStub,
            GlossaryPageEditor: GlossaryStub,
            DetailsPageEditor: DetailsStub,
          }
        : {},
    },
  });
  await flushPromises();
  return { wrapper, router, store, requests };
}

const docStoreRequests = (requests: RecordedRequest[]) =>
  requests.filter((req) => req.url.includes('/v1/docStore'));

describe('CustomizePageView dispatch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    stubMessageCalls();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const dispatchCases: Array<[string, string]> = [
    ['navigation', 'stub-navigation'],
    ['app-layout', 'stub-app-layout'],
    ['LandingPage', 'stub-landing'],
    ['homepage', 'stub-landing'],
    ['DataMarketplace', 'stub-marketplace'],
    ['Domain', 'stub-domain'],
    ['DataProduct', 'stub-data-product'],
    ['Glossary', 'stub-glossary'],
    ['GlossaryTerm', 'stub-glossary'],
    ['Table', 'stub-details'],
    ['Topic', 'stub-details'],
    ['StoredProcedure', 'stub-details'],
    ['DashboardDataModel', 'stub-details'],
    ['Dashboard', 'stub-details'],
    ['Pipeline', 'stub-details'],
    ['DatabaseSchema', 'stub-details'],
    ['Database', 'stub-details'],
    ['Container', 'stub-details'],
    ['SearchIndex', 'stub-details'],
    ['Metric', 'stub-details'],
    ['MlModel', 'stub-details'],
    ['APIEndpoint', 'stub-details'],
    ['APICollection', 'stub-details'],
    ['Chart', 'stub-details'],
    ['Directory', 'stub-details'],
    ['File', 'stub-details'],
    ['Spreadsheet', 'stub-details'],
    ['Worksheet', 'stub-details'],
  ];

  it.each(dispatchCases)('dispatches %s to %s', async (pageFqn, testId) => {
    const { wrapper } = await mountView(pageFqn, { doc: makeDoc() });
    expect(wrapper.find(`[data-testid="${testId}"]`).exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(false);
  });

  it.each(['askCollateSidebar', 'governance', 'data-assets', 'Tag', 'Classification', 'bogus', '__proto__', 'constructor'])(
    'renders the empty placeholder for %s with no editor mounted',
    async (pageFqn) => {
      const { wrapper } = await mountView(pageFqn, { doc: makeDoc() });
      expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid^="stub-"]').exists()).toBe(false);
    },
  );

  it('passes isGlossary true for Glossary and false for GlossaryTerm', async () => {
    const glossary = await mountView('Glossary', { doc: makeDoc() });
    expect(glossary.wrapper.findComponent(GlossaryStub).props('isGlossary')).toBe(true);
    const term = await mountView('GlossaryTerm', { doc: makeDoc() });
    expect(term.wrapper.findComponent(GlossaryStub).props('isGlossary')).toBe(false);
  });

  it('passes the raw pageFqn to the landing editor and looks the page up by it', async () => {
    const homepagePage = makePage('homepage', [{ label: 'home tab' }]);
    const landingPage = makePage('LandingPage', [{ label: 'landing tab' }]);
    const doc = makeDoc({ data: { pages: [homepagePage, landingPage] } as never });
    const homepage = await mountView('homepage', { doc });
    const homepageStub = homepage.wrapper.findComponent(LandingStub);
    expect(homepageStub.props('pageFqn')).toBe('homepage');
    expect(homepageStub.props('initialPageData')).toEqual(homepagePage);
    const landing = await mountView('LandingPage', { doc });
    const landingStub = landing.wrapper.findComponent(LandingStub);
    expect(landingStub.props('pageFqn')).toBe('LandingPage');
    expect(landingStub.props('initialPageData')).toEqual(landingPage);
  });

  it('passes the stored page as currentPage and originalPage to page editors', async () => {
    const tablePage = makePage('Table', [{ label: 'overview' }]);
    const doc = makeDoc({ data: { pages: [tablePage] } as never });
    const { wrapper } = await mountView('Table', { doc });
    const stub = wrapper.findComponent(DetailsStub);
    expect(stub.props('currentPageType')).toBe('Table');
    expect(stub.props('currentPage')).toEqual(tablePage);
    expect(stub.props('originalPage')).toEqual(tablePage);
  });

  it('echoes in-flight edits into currentPage while originalPage stays stored', async () => {
    const tablePage = makePage('Table', [{ label: 'overview' }]);
    const doc = makeDoc({ data: { pages: [tablePage] } as never });
    const { wrapper } = await mountView('Table', { doc });
    const stub = wrapper.findComponent(DetailsStub);
    const edited = makePage('Table', [{ label: 'edited' }]);
    (stub.props('onUpdateCurrentPage') as (page: PersonaPage) => void)(edited);
    await flushPromises();
    expect(wrapper.findComponent(DetailsStub).props('currentPage')).toEqual(edited);
    expect(wrapper.findComponent(DetailsStub).props('originalPage')).toEqual(tablePage);
  });

  it('passes the stored navigation array, and undefined for null or non-array values', async () => {
    const items = [{ id: 'x', title: 'X' }];
    const withNav = await mountView('navigation', {
      doc: makeDoc({ data: { navigation: items } as never }),
    });
    expect(withNav.wrapper.findComponent(NavigationStub).props('navigation')).toEqual(items);
    const withNull = await mountView('navigation', {
      doc: makeDoc({ data: { navigation: null } as never }),
    });
    expect(withNull.wrapper.findComponent(NavigationStub).props('navigation')).toBeUndefined();
    const withString = await mountView('navigation', {
      doc: makeDoc({ data: { navigation: 'bogus' } as never }),
    });
    expect(withString.wrapper.findComponent(NavigationStub).props('navigation')).toBeUndefined();
  });

  it('reads the header colour from personPreferences only', async () => {
    const doc = makeDoc({
      data: {
        personPreferences: [
          { personaId: 'p1', landingPageSettings: { headerColor: '#111111' } },
        ],
        personaPreferences: [
          { personaId: 'p1', landingPageSettings: { headerColor: '#222222' } },
        ],
      } as never,
    });
    const { wrapper } = await mountView('LandingPage', { doc });
    expect(wrapper.findComponent(LandingStub).props('backgroundColor')).toBe('#111111');
  });

  it('O-ENTRY-2: the landing editor exit callback navigates to the persona detail route', async () => {
    const { wrapper, router } = await mountView('LandingPage', { doc: makeDoc() });
    const onExit = wrapper.findComponent(LandingStub).props('onExit') as () => void;
    expect(typeof onExit).toBe('function');
    onExit();
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings-persona-detail');
    expect(router.currentRoute.value.params).toEqual({ fqn: 'Analyst' });
  });

  it('navigates to the persona detail route, without a hash, when an editor closes', async () => {
    const { wrapper, router } = await mountView('navigation', { doc: makeDoc() });
    wrapper.findComponent(NavigationStub).vm.$emit('close');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings-persona-detail');
    expect(router.currentRoute.value.params).toEqual({ fqn: 'Analyst' });
    expect(router.currentRoute.value.hash).toBe('');
  });
});

describe('CustomizePageView save callbacks', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    stubMessageCalls();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves a page with a PATCH and toasts success', async () => {
    const tablePage = makePage('Table', [{ label: 'overview' }]);
    const doc = makeDoc({ data: { pages: [tablePage] } as never });
    const { wrapper, requests } = await mountView('Table', { doc });
    const stub = wrapper.findComponent(DetailsStub);
    await (stub.props('onSaveLayout') as (page?: PersonaPage) => Promise<void>)(
      makePage('Table', [{ label: 'renamed' }]),
    );
    await flushPromises();
    const writes = docStoreRequests(requests);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe('PATCH');
    expect(writes[0].url).toContain('/v1/docStore/doc-1');
    expect(writes[0].body).toContain('renamed');
    expect(message.success).toHaveBeenCalled();
  });

  it('sends no request when the saved page equals the stored page', async () => {
    const tablePage = makePage('Table', [{ label: 'overview' }]);
    const doc = makeDoc({ data: { pages: [tablePage] } as never });
    const { wrapper, requests } = await mountView('Table', { doc });
    const stub = wrapper.findComponent(DetailsStub);
    await (stub.props('onSaveLayout') as (page?: PersonaPage) => Promise<void>)(
      stub.props('currentPage') as PersonaPage,
    );
    await flushPromises();
    expect(docStoreRequests(requests)).toHaveLength(0);
  });

  it('removes only the homepage entry on a homepage reset, using the raw pageFqn', async () => {
    const tablePage = makePage('Table', [{ label: 'overview' }]);
    const homepagePage = makePage('homepage', [{ label: 'home' }]);
    const doc = makeDoc({ data: { pages: [tablePage, homepagePage] } as never });
    const { wrapper, requests } = await mountView('homepage', {
      doc,
      patchResponse: () => makeDoc({ data: { pages: [tablePage] } as never }),
    });
    const stub = wrapper.findComponent(LandingStub);
    await (stub.props('onSaveLayout') as (page?: PersonaPage) => Promise<void>)(undefined);
    await flushPromises();
    const writes = docStoreRequests(requests);
    expect(writes).toHaveLength(1);
    // The document diff replaces the whole pages array: the resulting
    // array must hold the Table page alone — the homepage entry is
    // gone, and no other page was touched.
    const ops = JSON.parse(writes[0].body) as Array<{ op: string; path: string; value: unknown }>;
    expect(ops).toEqual([
      { op: 'replace', path: '/data/pages', value: [{ pageType: 'Table', tabs: [{ label: 'overview' }] }] },
    ]);
  });

  it('creates the document on save when the load 404d', async () => {
    const { wrapper, requests } = await mountView('Table', { doc: '404' });
    const stub = wrapper.findComponent(DetailsStub);
    await (stub.props('onSaveLayout') as (page?: PersonaPage) => Promise<void>)(
      makePage('Table', [{ label: 'fresh' }]),
    );
    await flushPromises();
    const writes = docStoreRequests(requests);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe('POST');
    expect(writes[0].body).toContain('"pageType":"Table"');
    expect(writes[0].body).toContain('fresh');
  });

  it('swallows a page-save failure after the error toast', async () => {
    const { wrapper, requests } = await mountView('Table', {
      doc: makeDoc(),
      failDocStore: true,
    });
    const stub = wrapper.findComponent(DetailsStub);
    await expect(
      (stub.props('onSaveLayout') as (page?: PersonaPage) => Promise<void>)(
        makePage('Table', [{ label: 'x' }]),
      ),
    ).resolves.toBeUndefined();
    expect(message.error).toHaveBeenCalled();
    expect(docStoreRequests(requests)).toHaveLength(1);
  });

  it('saves navigation by whole replacement with a PATCH', async () => {
    const { wrapper, requests } = await mountView('navigation', { doc: makeDoc() });
    const stub = wrapper.findComponent(NavigationStub);
    const list = [{ id: 'a', title: 'A', children: [] }];
    await (stub.props('onSave') as (list: unknown[]) => Promise<void>)(list);
    await flushPromises();
    const writes = docStoreRequests(requests);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe('PATCH');
    expect(writes[0].body).toContain('/data/navigation');
    expect(writes[0].body).toContain('"title":"A"');
  });

  it('swallows a navigation-save failure after the error toast, without throwing', async () => {
    const { wrapper } = await mountView('navigation', { doc: makeDoc(), failDocStore: true });
    const stub = wrapper.findComponent(NavigationStub);
    await expect(
      (stub.props('onSave') as (list: unknown[]) => Promise<void>)([{ id: 'a', title: 'A' }]),
    ).resolves.toBeUndefined();
    expect(message.error).toHaveBeenCalled();
  });

  it('saves the header colour with a PATCH against the stored preference entry', async () => {
    const doc = makeDoc({
      data: {
        personPreferences: [
          { personaId: 'p1', landingPageSettings: { headerColor: '#111111' } },
        ],
      } as never,
    });
    const { wrapper, requests } = await mountView('LandingPage', { doc });
    const stub = wrapper.findComponent(LandingStub);
    await (stub.props('onBackgroundColorUpdate') as (color?: string) => Promise<void>)('#222222');
    await flushPromises();
    const writes = docStoreRequests(requests);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe('PATCH');
    // The document diff replaces the whole personPreferences array;
    // the resulting entry carries the new header colour.
    const ops = JSON.parse(writes[0].body) as Array<{ op: string; path: string; value: unknown }>;
    expect(ops).toEqual([
      {
        op: 'replace',
        path: '/data/personPreferences',
        value: [{ personaId: 'p1', landingPageSettings: { headerColor: '#222222' } }],
      },
    ]);
  });

  it('sends no request when the colour update matches no stored preference entry', async () => {
    const doc = makeDoc({
      data: {
        personPreferences: [
          { personaId: 'other', landingPageSettings: { headerColor: '#111111' } },
        ],
      } as never,
    });
    const { wrapper, requests } = await mountView('LandingPage', { doc });
    const stub = wrapper.findComponent(LandingStub);
    await (stub.props('onBackgroundColorUpdate') as (color?: string) => Promise<void>)('#222222');
    await flushPromises();
    expect(docStoreRequests(requests)).toHaveLength(0);
  });

  it('appends a preference entry on colour save when the document is new', async () => {
    const { wrapper, requests } = await mountView('LandingPage', { doc: '404' });
    const stub = wrapper.findComponent(LandingStub);
    await (stub.props('onBackgroundColorUpdate') as (color?: string) => Promise<void>)('#333333');
    await flushPromises();
    const writes = docStoreRequests(requests);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe('POST');
    expect(writes[0].body).toContain('"personaId":"p1"');
    expect(writes[0].body).toContain('#333333');
  });

  it('saves app-layout preferences with a PATCH and emits no success toast of its own', async () => {
    const { wrapper, requests } = await mountView('app-layout', { doc: makeDoc() });
    const stub = wrapper.findComponent(AppLayoutStub);
    await (stub.props('onSave') as (prefs: unknown) => Promise<void>)({
      appMode: 'classic',
      defaultLandingPage: 'home',
      defaultViewModes: { Table: 'card' },
    });
    await flushPromises();
    const writes = docStoreRequests(requests);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe('PATCH');
    expect(writes[0].body).toContain('/data/personaPreferences');
    expect(writes[0].body).toContain('"appMode":"classic"');
    // R-ENTRY-TOAST: the parent owns the success toast; exactly one.
    expect(message.success).toHaveBeenCalledTimes(1);
    expect(message.success).toHaveBeenCalledWith(expect.stringContaining('updated'));
  });

  it('throws on app-layout save failure after the error toast', async () => {
    const { wrapper } = await mountView('app-layout', { doc: makeDoc(), failDocStore: true });
    const stub = wrapper.findComponent(AppLayoutStub);
    await expect(
      (stub.props('onSave') as (prefs: unknown) => Promise<void>)({
        appMode: 'classic',
        defaultLandingPage: 'home',
        defaultViewModes: {},
      }),
    ).rejects.toThrow();
    expect(message.error).toHaveBeenCalled();
  });

  it('re-derives currentPage and originalPage from the saved document', async () => {
    const tablePage = makePage('Table', [{ label: 'overview' }]);
    const updatedPage = makePage('Table', [{ label: 'saved' }]);
    const doc = makeDoc({ data: { pages: [tablePage] } as never });
    const { wrapper } = await mountView('Table', {
      doc,
      patchResponse: () => makeDoc({ data: { pages: [updatedPage] } as never }),
    });
    const stub = wrapper.findComponent(DetailsStub);
    (stub.props('onUpdateCurrentPage') as (page: PersonaPage) => void)(
      makePage('Table', [{ label: 'draft' }]),
    );
    await flushPromises();
    expect(wrapper.findComponent(DetailsStub).props('currentPage')).toEqual(
      makePage('Table', [{ label: 'draft' }]),
    );
    await (stub.props('onSaveLayout') as (page?: PersonaPage) => Promise<void>)(updatedPage);
    await flushPromises();
    expect(wrapper.findComponent(DetailsStub).props('currentPage')).toEqual(updatedPage);
    expect(wrapper.findComponent(DetailsStub).props('originalPage')).toEqual(updatedPage);
  });

  it('writes the saved document to the shared slot only for the selected persona', async () => {
    const same = await mountView('Table', {
      doc: makeDoc(),
      selectedPersona: PERSONA,
      patchResponse: (ops) => {
        expect(ops.length).toBeGreaterThan(0);
        return makeDoc({ data: { pages: [makePage('Table', [{ label: 'saved' }])] } as never });
      },
    });
    const sameStub = same.wrapper.findComponent(DetailsStub);
    await (sameStub.props('onSaveLayout') as (page?: PersonaPage) => Promise<void>)(
      makePage('Table', [{ label: 'saved' }]),
    );
    await flushPromises();
    expect(same.store.document?.fullyQualifiedName).toBe('persona.Analyst');
    expect(same.store.document?.data.pages).toHaveLength(1);

    const other = await mountView('Table', {
      doc: makeDoc(),
      selectedPersona: { ...PERSONA, id: 'p2', name: 'Other', fullyQualifiedName: 'Other' },
    });
    const otherStub = other.wrapper.findComponent(DetailsStub);
    await (otherStub.props('onSaveLayout') as (page?: PersonaPage) => Promise<void>)(
      makePage('Table', [{ label: 'saved' }]),
    );
    await flushPromises();
    expect(other.store.document).toBeNull();
  });
});

describe('CustomizePageView loading', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    stubMessageCalls();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads persona first, then the document, without touching the global selection', async () => {
    const order: string[] = [];
    const { store } = await mountView('Table', {
      doc: makeDoc(),
      personaImpl: async () => {
        order.push('persona');
        return PERSONA;
      },
      docImpl: async () => {
        order.push('document');
        return makeDoc();
      },
    });
    expect(order).toEqual(['persona', 'document']);
    expect(mockedListPersonas).not.toHaveBeenCalled();
    expect(store.selectedPersona).toBeNull();
    expect(store.document).toBeNull();
  });

  it('shows the loading state until the persona resolves', async () => {
    let resolvePersona: (value: Persona | PromiseLike<Persona>) => void = () => {};
    mockedGetPersonaByName.mockImplementation(
      () => new Promise((resolve) => { resolvePersona = resolve; }),
    );
    mockedGetDocumentByFqn.mockResolvedValue(makeDoc());
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/customize-page/:fqn/:pageFqn', name: 'customize-page', component: { template: '<div />' } },
      ],
    });
    await router.push('/customize-page/Analyst/Table');
    await router.isReady();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })));
    const wrapper = mount(CustomizePageView, {
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
        stubs: { DetailsPageEditor: DetailsStub },
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="customize-page-loading"]').exists()).toBe(true);
    resolvePersona(PERSONA);
    await flushPromises();
    expect(wrapper.find('[data-testid="stub-details"]').exists()).toBe(true);
  });

  it('renders the editor on a non-404 document failure, and saves send no request', async () => {
    const { wrapper, requests } = await mountView('Table', {
      doc: new ApiError(500, 'boom'),
    });
    expect(wrapper.find('[data-testid="stub-details"]').exists()).toBe(true);
    expect(message.error).toHaveBeenCalled();
    const stub = wrapper.findComponent(DetailsStub);
    await (stub.props('onSaveLayout') as (page?: PersonaPage) => Promise<void>)(
      makePage('Table', [{ label: 'x' }]),
    );
    await flushPromises();
    expect(docStoreRequests(requests)).toHaveLength(0);
  });

  it('shows the no-persona placeholder with a back-to-settings action', async () => {
    const { wrapper, router } = await mountView('Table', {
      personaResult: new Error('no such persona'),
    });
    expect(wrapper.find('[data-testid="customize-page-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-details"]').exists()).toBe(false);
    await wrapper.find('[data-testid="customize-page-back-settings"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings-persona');
  });
});

describe('CustomizePageView real editor mounts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    stubMessageCalls();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const realCases: Array<[string, string]> = [
    ['navigation', 'navigation-editor'],
    ['app-layout', 'app-layout-editor'],
    ['Table', 'details-page-editor'],
    ['Domain', 'domain-page-editor'],
    ['DataProduct', 'data-product-page-editor'],
    ['Glossary', 'glossary-page-editor'],
    ['DataMarketplace', 'marketplace-editor'],
  ];

  it.each(realCases)('mounts the real editor for %s', async (pageFqn, testId) => {
    const { wrapper } = await mountView(pageFqn, { doc: '404', stubs: false });
    expect(wrapper.find(`[data-testid="${testId}"]`).exists()).toBe(true);
  });
});

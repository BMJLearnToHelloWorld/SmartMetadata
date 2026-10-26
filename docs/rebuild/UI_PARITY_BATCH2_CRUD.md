# UI parity batch 2 step 2 — shared list + detail CRUD chrome

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture.
No CCL React source or CSS was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

This batch closes the shared CRUD scaffolding gap only. It does **not**
start Settings landing, Insights/charts, or Pipeline DAG.

## Official IA that this batch follows

Read-only paths (approaches, not source):

| Official surface | Path | Intent borrowed |
|---|---|---|
| List page chrome | `pages/UserListPage/UserListPageV1.tsx` | Page header + search/filters + table + create extra; empty/error placeholders |
| Page header | `components/PageHeader/PageHeader.component.tsx` | Title + sub-header lead, actions on the right |
| Cursor paging | `components/common/NextPrevious/NextPrevious.interface.ts` | `after` / `before` cursors (or offset `from`/`size` when that is what the API returns) — not invented page-number math on cursor lists |
| Detail header | `components/Entity/EntityHeader/EntityHeader.component.tsx` | Breadcrumb + displayName + technical name + deleted badge + suffix actions |
| Detail tabs | Classification / Glossary / Domain details | Overview first; related collection (tags, terms, members, roles, token) in a sibling tab |

Intentionally **not** copied: Ant-to-UntitledUI React tables, Settings landing
tree, persona chrome, Collate Knowledge / Ontology / AI drawers.

Product chrome stays **Ant Design Vue** (already in the console). Element Plus
was not added.

## What the product had

Each admin/governance list was a one-off `Card` + `Table` + English strings +
“N shown of M” with **no Next/Previous**. Detail pages were a back link +
stacked descriptions. Users had search; other lists ignored `paging.after`
even though the clients already parse it.

## Gap closed

Applied the new shells to **five** list→detail pairs that already have working
GETs (and writes only where the product already POSTs/PUTs/PATCHes):

| Route | List API | Write | Detail tabs |
|---|---|---|---|
| Users | `GET /v1/users` + `GET /v1/search/query?index=user` | POST create, PUT/PATCH/DELETE already shipped | Overview / Roles |
| Teams | `GET /v1/teams` (`include`, `after`) | POST create + membership APIs already shipped | Overview / Members |
| Classifications | `GET /v1/classifications` (`after`) | POST create + tag create already shipped | Overview / Tags |
| Glossaries | `GET /v1/glossaries` (`after`) | POST create + term create already shipped | Overview / Terms |
| Bots | `GET /v1/bots` (`after`) | POST create + token generate/revoke already shipped | Overview / Token |

Shared primitives (`smartmetadata-ui/src/features/crud/`):

| Primitive | Role |
|---|---|
| `EntityListShell.vue` | Title, lead, actions, optional search, filters slot, empty/error/loading, table, shown-of-total, Previous/Next |
| `EntityDetailShell.vue` | Breadcrumb, displayName + name/FQN, deleted badge, actions, lead, empty/error/loading, optional tabs |
| `paging.ts` | Cursor stack + offset (`from`/`size`) helpers; `entityLabel` / `joinRefNames` |

Users: search uses the existing user index (`from`/`size`). Unfiltered list
uses `after`. Teams/classifications/glossaries/bots: **no invented search
box** — those list APIs have no `q=` in the product client.

i18n: `crud.*`, `admin.users|teams|bots.*`, `governance.classifications|glossaries.*`
in zh-CN and en-US.

No new Java/Python endpoints.

## Residual (do not fake)

| Gap | Why it stays |
|---|---|
| Roles / policies / domains / data products / quality / alerts / services / pipelines still one-off | Closed in batch 3.1 (`UI_PARITY_BATCH3_CRUD.md`). Settings Policies read-only list in batch 3.4 (`UI_PARITY_BATCH3_SETTINGS.md`) |
| Settings landing / topbar | Closed in batch 2 step 3 (`UI_PARITY_BATCH2_CHROME.md`) |
| Team / glossary / classification / bot catalog search | No product search client for those indexes; do not pretend a local filter is server search |
| Hard delete / policy authoring / bot edit form | Not wired in the existing views; not invented here |
| Cursor `before` from the server | Official NextPrevious can send `before`; product responses often only return `after`. Previous walks a client-side cursor stack of `after` values already fetched |
| Insights / KPI, Pipeline DAG, non-table asset shells | Later batch steps |
| Knowledge / Ontology / AI | Collate-only **DROP** |

## How to verify

```bash
cd smartmetadata-ui
npm ci
npm test
npm run build
```

Root: `make ui_test` and `make ui_build`.

Manual (already-running slim server; this PR does not redeploy):

1. Admin → Users: search (user index), Admins/Bots/include filters, Refresh,
   Next when `paging.after` is present, open a row.
2. User detail: breadcrumb back, Overview + Roles tabs, Edit / Deactivate
   still hit the same APIs.
3. Teams: include filter + cursor paging; detail Overview / Members.
4. Classifications + Glossaries: create still works; detail tags/terms tabs.
5. Bots: create still POSTs bot user then bot; Token tab generate/revoke
   unchanged. Switch locale: list titles and chrome follow zh-CN / en-US.

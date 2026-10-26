# UI parity batch 3.4 — Settings Policies + custom property definitions

Holistic Alma gate after #32–#35: **READY_FOR_ALMA**
(`UI_PARITY_BATCH3_HOLISTIC.md`). Residuals in this file stay deferred.

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture.
No CCL React source or CSS was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

Batch 2 step 3 (`UI_PARITY_BATCH2_CHROME.md`, PR #29) left Settings
**Policies** and **custom property definitions** as residual hub text:
no product Vue page + client. This pass adds those read pages and live
hub links. It does **not** invent SSO / Persona / Apps / inbox
websocket / appearance / search-settings / profiler-run pages.

## Official IA that this batch follows

Read-only paths (approaches, not source):

| Official surface | Path | Intent borrowed |
|---|---|---|
| Settings Access | `GlobalSettings.constants` Policies card | Access category links to a Policies list |
| Policy REST | `GET /v1/policies`, `GET /v1/policies/{id}` | Same collection; default fields `owners,location,teams,roles` |
| Custom property defs | Settings Custom properties + `TypeResource` | Entity types, then definitions for one type |
| Type REST | `GET /v1/metadata/types?category=entity`, `GET /v1/metadata/types/name/{type}/customProperties` | Schema category enum is `entity` / `field` |

Intentionally **not** copied: policy rule authoring, PUT
`/v1/metadata/types/{id}` addProperty, SSO/Persona/Apps forms.

## Gap closed

| Item | Official (reference) | Product now | Residual |
|---|---|---|---|
| Policies list | Settings → Access → Policies | `PoliciesListView` at `/admin/policies` via `listPolicies` | No POST/PUT/PATCH/DELETE, no `/search` box |
| Policy detail | Policy page + rules | `PolicyDetailView` Overview / Rules / Roles / Teams | No editor; assignment stays on role/team |
| Custom property defs | Settings → Custom properties | `CustomPropertyTypesListView` + type detail | No add/edit definition form |
| Settings hub | Category cards | Policies + Custom properties are live `RouterLink`s | Other residual tiles stay text |

Existing `listCustomProperties` (asset tab values) is unchanged. Asset
Custom properties still PATCH **values**. This page only **reads**
definitions.

i18n: `admin.policies.*` and `settings.customProperties.*` in zh-CN +
en-US.

No new Java/Python endpoints.

## Residual (do not fake)

| Gap | Why it stays |
|---|---|
| Policy create / edit / delete | Official write APIs exist; product had no policy write client |
| Policy `/search` | No product search client (unlike roles) |
| Custom property definition PUT | `TypeResource.addOrUpdateProperty` is not called anywhere in this console |
| Admins / online-users / audit logs | Still residual hub text |
| Appearance / search-settings / profiler-run | Still residual; profiler `jobs.py` still raises |
| Notification inbox websocket | Still residual |
| Applications / SSO / Persona | Still residual; do not invent save forms |
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

1. Settings hub: Policies and Custom properties are links. Apps / SSO /
   Persona / inbox / appearance stay residual text.
2. Policies: table rows only when `GET /api/v1/policies` returns
   entities. Empty catalog → Empty, not demo rules. Open a row: rules /
   roles / teams from that payload.
3. Custom properties: entity types from `GET /api/v1/metadata/types`.
   Open a type: definitions from
   `GET /api/v1/metadata/types/name/{type}/customProperties`, or Empty.
4. Asset Custom properties tab still edits **values** only.

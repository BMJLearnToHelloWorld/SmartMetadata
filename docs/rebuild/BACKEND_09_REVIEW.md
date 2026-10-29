# backend-09 Settings/UI — review

## Scope
Close Apache-REST-backed Settings write gaps left residual after Batch 3.4
(`UI_PARITY_BATCH3_SETTINGS.md`): Policies create/edit/delete, Custom property
**definition** add/update, and Applications **read-only** list(+detail) from
`GET /v1/apps`. Vue clean-room only under `smartmetadata-ui/`. Official
OpenMetadata (Apache) REST + docs are authority.

## Shipped (BehaviorMatched unit)
| Surface | Apache contract | Product |
|---|---|---|
| Policies create | `POST /v1/policies` CreatePolicy (`name` + `rules` required) | `PoliciesListView` create modal → `createPolicy` |
| Policies update | `PUT /v1/policies` createOrUpdate | `PolicyDetailView` edit modal → `updatePolicy` |
| Policies delete | `DELETE /v1/policies/{id}` | list row delete + detail delete → `deletePolicy` |
| Custom property definition write | `PUT /v1/metadata/types/{id}` TypeResource.addOrUpdateProperty | `CustomPropertyTypeDetailView` add/edit → `addOrUpdateCustomProperty` |
| Applications list/detail | `GET /v1/apps`, `GET /v1/apps/{id}` | `AppsListView` + `AppDetailView`; hub `apps` flipped residual → route |

Asset Custom properties tab still PATCHes **values** only — unchanged.

## Explicit OutOfScope (not debt unless scope expands in writing)
- SSO deep config save forms
- Persona landing / switcher
- Appearance / theme dark-mode invent
- Notification inbox websocket
- Search-settings full editor
- Profiler-run UI (jobs residual)
- Admins / online-users / audit-logs invent
- Collate Apps marketplace install / trigger / configure UX
- Knowledge / Ontology / AI / RDF (Collate = OutOfScope)
- Lineage canvas edit (follow-up; not this PR)

## Status
**BehaviorMatched (unit)** for the Apache-backed Settings surfaces above.
Not ProductVerified. Not IntegrationVerified.

## Residuals left honestly
SSO, Persona, Appearance, inbox, search-settings, profiler-run, admins,
online-users, audit-logs stay residual hub text. Apps marketplace install
stays OutOfScope (list/detail only).

## Tests
```bash
cd smartmetadata-ui
npm test
```

Root: `make ui_test` when Make is available.

## Next
- Lineage UI write (tiny wire of existing lineage PUT if still needed on canvas)
- Optional: Policy `/search` if product search client is added like roles
- Do not invent SSO/Persona/AI on Settings

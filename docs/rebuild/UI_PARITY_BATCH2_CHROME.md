# UI parity batch 2 step 3 — topbar + Settings landing

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture.
No CCL React source or CSS was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

This batch closes the topbar + Settings hub gap only. It does **not**
start Insights/charts or Pipeline DAG / non-table asset shells.

## Official IA that this batch follows

Read-only paths (approaches, not source):

| Official surface | Path | Intent borrowed |
|---|---|---|
| App bar | `components/NavBar/NavBar.tsx` | Dense header: global search, language, user menu. Bell / help / domain / persona only when those APIs exist. |
| User menu | `components/Settings/Users/UserProfileIcon/UserProfileIcon.component.tsx` | View profile + logout (no persona switcher). |
| Settings landing | `pages/GlobalSettingPage/GlobalSettingPage.tsx` | Category cards, not a dump of every form. |
| Settings categories | `constants/GlobalSettings.constants.ts`, `utils/GlobalSettingsClassBase.ts` | Members / Access / Bots / Governance / Services / Preferences / Notifications grouping. |

Intentionally **not** copied: NotificationBox + websocket channels, help
dropdown, domain scope switcher, persona list, Collate Apps / Knowledge /
Ontology / AI cards.

## What the product had

`AppShell` header: search + locale select + display name + a standalone
Log out button. `/admin/settings` was the Phase 2 login/email form plus a
read-only settings table — not a hub into Users / Teams / Bots /
governance / services.

## Gap closed

| Item | Official (reference) | Product now | Residual |
|---|---|---|---|
| Global search | AppBar `GlobalSearchBar` | Existing header search → Explore; keeps facet query params | No typeahead recents API |
| Language | Navbar language dropdown | Existing locale switcher (`sm.locale.v1`) | Only zh-CN / en-US |
| User menu | Profile icon → view profile / logout | Dropdown: view profile when `GET /v1/users/loggedInUser` has `id`, Settings hub, logout | No persona switcher, no role/team lists in the menu |
| Notifications | Bell + websocket `NotificationBox` | **Omitted** — no inbox/websocket client | Activity + Tasks remain pages |
| Settings landing | Category cards | `SettingsHubView` at `/admin/settings` | Cards that lack a Vue page stay residual text |
| Members / Access / Bots | Nested Settings routes | Live links to Users / Teams / Roles / Bots | Admins / online-users / policies / audit logs residual |
| Governance | Settings + left-nav Govern | Live links to glossaries, classifications, domains, data products | Ontology **DROP** |
| Services | Settings → service types | Live links to existing ingestion services + pipelines | Per-type service admin pages not split out |
| Preferences | Email / login / theme / search / profiler | Live **Login and email** at `/admin/settings/system` (`GET/PUT /v1/system/settings` for those two types; auth GET read-only) | Appearance, search-settings, profiler-run residual |
| Notifications category | Alerts + announcements | Live links to existing alert + announcement pages | No navbar inbox |
| Apps / SSO / Persona / custom-property defs | Official Settings cards | Residual copy only | Do not invent save forms |

i18n: `chrome.userMenu|viewProfile|settings` and `settings.*` in zh-CN + en-US.

No new Java/Python endpoints.

## Residual (do not fake)

| Gap | Why it stays |
|---|---|
| Notification bell | Official uses websocket task/mention channels this product does not call |
| Help menu / version-mismatch toast | No help-link client; version stays on System |
| Domain scope switcher | No active-domain preference API in this console |
| Persona switcher / Applications / SSO callback | Documented P2/P9 gaps; auth provider is read-only on System |
| Policies / audit logs / online users / appearance / search-settings / profiler-run | No product Vue page + client for those writes |
| Custom property **definitions** admin | Asset Custom properties tab already edits values |
| Insights / KPI, Pipeline DAG, non-table asset shells | Later batch steps |
| Knowledge / Ontology / AI | Collate-only **DROP** |
| Left-nav still lists Users/Teams/… plus Ingestion | Official nests many of these only under Settings; product keeps the working shortcuts |

## How to verify

```bash
cd smartmetadata-ui
npm ci
npm test
npm run build
```

Root: `make ui_test` and `make ui_build`.

Manual (already-running slim server; this PR does not redeploy):

1. Header: search still opens Explore; locale still switches; no bell.
2. User menu: Settings → hub. Profile → `/admin/users/:id` only after
   `loggedInUser` has an id. Logout still clears the session.
3. Settings hub cards open Users / Teams / Bots / Classifications /
   Glossaries / Services / Login and email.
4. Residual rows (Applications, SSO, Persona, inbox, policies) are text,
   not save buttons.
5. Login and email still PUT `loginConfiguration` / `emailConfiguration`
   only.

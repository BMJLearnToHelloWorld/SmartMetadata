# UI Preferences full-chain — self-review

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture.
No CCL React source or CSS was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

Extends Settings fusion patterns from `UI_PARITY_BATCH3_SETTINGS.md`,
`BACKEND_09_REVIEW.md`, `UI_PARITY_BATCH2_CHROME.md`: hub residual→route,
`PreferencePageShell`, expanded `EDITABLE_SETTING_TYPES`, PUT
`/v1/system/settings`, Policies/CustomProps write style.

## Official IA followed (Apache Preferences)

| Official card | SettingsType / API | Product route |
|---|---|---|
| Appearance | `customUiThemePreference` | `settings-preferences-appearance` |
| Email | `emailConfiguration` | `settings-preferences-email` |
| Login configuration | `loginConfiguration` | `settings-preferences-login` |
| Health check | `GET /v1/system/status` | `settings-preferences-health` |
| Profiler configuration | `profilerConfiguration` | `settings-preferences-profiler` |
| Data quality | `GET /v1/dataQuality/dimensions` | `settings-preferences-dq-dimensions` |
| Search settings | `searchSettings` (+ assetType child) | `settings-preferences-search` |
| Lineage | `lineageSettings` | `settings-preferences-lineage` |
| Brand name URL | `openMetadataBaseUrlConfiguration` | `settings-preferences-om-url` |
| Data asset rules | `entityRulesSettings` | `settings-preferences-entity-rules` |
| Learning resources | `GET /v1/learning/resources` | `settings-preferences-learning` |
| App mode | `appConfiguration.defaultAppMode` | `settings-preferences-app-mode` |
| Glossary | `glossarySettings` | `settings-preferences-glossary` |
| Default time format | `appConfiguration.defaultTimeFormat` | `settings-preferences-time-format` |

Combined Preferences hub item `system` removed; legacy route
`admin-settings-system` kept for bookmark compatibility.

## Out of scope (do not invent)

| Gap | Why |
|---|---|
| Collate CustomizeAppModeSidebar | Collate-only |
| SSO callback / Persona landing | Residual (unchanged) |
| Dark-mode invent beyond theme colors | No separate SettingsType |
| Profiler **job execution** | Partial — config CRUD only; jobs.py raises |
| Notification inbox websocket | Residual |
| Knowledge / Ontology / AI / marketplace | DROP |

## Status

| Surface | Status | Notes |
|---|---|---|
| Appearance / Email / Login / Lineage / OM URL / Glossary / Entity rules / App mode / Time format | BehaviorMatched (unit) | PUT settings |
| Search global + assetType editor | BehaviorMatched (unit) | Nested NLQ / ranking advanced UI not fully mirrored |
| Profiler metricConfiguration | BehaviorMatched (unit) / **Partial** job run | Honest Partial for execution |
| Health / DQ dimensions / Learning | BehaviorMatched (unit) | Read lists |

## How to verify

```bash
cd smartmetadata-ui
npm ci
npm test
npm run build
```

Root: `make ui_test` and `make ui_build`.

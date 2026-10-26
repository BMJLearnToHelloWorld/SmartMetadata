# SmartMetadata UI — iPlatform component style (Batch style-1)

Authorized **component-style** alignment on the Vue 3 console
(`smartmetadata-ui/`). iPlatform3 `@icore` is **reference-only** for tokens
and ant-design-vue ConfigProvider defaults. No `@icore` packages, no CCL
React, and no layout/IA transplant.

ADR:2026-10-26-smartmetadata-ui-uses-icore-component-tokens.

## What this batch aligns

| Surface | Before | After |
|---|---|---|
| CSS variables | Hard-coded `#f4f6f8` / `#fff` / `#e5e7eb` on body + header | `--sm-*` 1:1 with `@icore` light (`--icore-content-bg` `#f0f2f5`, text, border, layout) in `src/styles/theme.css` |
| ConfigProvider primary | `#1d4ed8` | `#005587` (iPlatform default) |
| ConfigProvider radius | `4` | `6` (iPlatform radius-on) |
| Density | `fontSize` 13 / `controlHeight` 32 | Unchanged; compact algorithm **off** |
| Modal / Card / Table / Input | Ant defaults + local hex | Shared `smAntdTheme` + global CSS in `theme.css` |

Wiring lives in `src/theme/tokens.ts` (`smAntdTheme`) and `src/App.vue`
`ConfigProvider`. Body and AppShell header/content backgrounds use the
variables. AppShell / routes / EntityListShell / EntityDetailShell DOM is
unchanged.

Optional `:root[data-theme="dark"]` values exist as a CSS hook only. There
is **no** Settings appearance page and **no** dark-mode toggle.

## Out of scope (do not invent)

- IP3Layout / NaviTab / TabMenu / Bell / multi-tab chrome
- Porting `@icore` packages or FullModal as a required wrapper
- Settings appearance / themeConfiguration PUT
- DROP / connector / MCP / profiler-DQ work
- Per-view hex churn on lineage/search cards (prefer the global layer)

## How to verify

```bash
cd smartmetadata-ui
npm ci
npm test
npm run build
```

Root: `make verify-rebuild` (Job A: `ui-test` then `ui-build`).

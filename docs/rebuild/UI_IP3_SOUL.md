# iPlatform3 shadow/soul — ant token accents (keep OM IA)

Step 2 after OM Batches 1–4 (`e1ff99a9`, `#41`) `READY_FOR_ALMA`.

ADR:2026-10-26-smartmetadata-ui-layers-ip3-soul-on-om.

## What this PR layers

Feel/brand accents only on the existing Vue 3 + ant-design-vue console.
Clean-room recreation from the iPlatform token brief — **no** `@icore`
packages, **no** IP3Layout / NaviTab / product-shell transplant, **no**
copy of iPlatform source into the tree.

| Surface | After (soul on OM) | Intentionally left OM |
|---|---|---|
| Primary | **`#1570ef`** (OM brand-600) | Not historical #37 `#005587` |
| Hover / selected / status | OM `#175cd3` / `#eff8ff` / success·warning·error | Unchanged |
| Radius | **6** control / card / modal (iPlatform radius-on) | Not OM 8 / 12 / 16 |
| Font / control | **13** / 32 (denser form chrome) | Control height 32 stays |
| Canvas / elevated / border | `#f0f2f5` / `#f7f8fa` / `#f0f0f0` | OM text `#181d27` / `#414651`; selected row `#eff8ff` |
| Shadows | Quiet card rest + raised overlay (`--sm-shadow-*`) | Button `primaryShadow: none` |
| Modal / Card / Table / Input | Tighter padding, card rest shadow, table header elevated | Tabs 3px ink, confirm/empty/tooltip Batch4 chrome |
| Sider / header / routes | Unchanged AppShell IA (light sider 228, header 56, nav groups) | No IP3Layout |

Wiring: `smartmetadata-ui/src/theme/tokens.ts` (`smAntdTheme`) and
`src/styles/theme.css`. View CSS only updates token fallbacks so scoped
surfaces pick up the same radius/neutrals.

Optional `:root[data-theme="dark"]` values exist as a CSS hook only. There
is **no** Settings appearance page and **no** dark-mode toggle.

## Out of scope (still residual / forbidden)

- IP3Layout / NaviTab / TabMenu / Bell / multi-tab chrome
- `@icore` packages or FullModal as a required wrapper
- Settings appearance / themeConfiguration PUT
- DROP / connector marketplace / MCP console / profiler-DQ authoring
- SSO / Persona / inbox fakes
- Undoing Batch 1–4 copy, routes, or nav structure

## How to verify

```bash
cd smartmetadata-ui
npm test
npm run build
```

Manual: login → Explore (cards still hover with brand inset) → Users list
→ open a create modal (radius 6, denser padding, raised shadow) → table
header `#f7f8fa` → primary buttons remain `#1570ef`. Canvas is cooler
`#f0f2f5`, not Collate `#005587`.

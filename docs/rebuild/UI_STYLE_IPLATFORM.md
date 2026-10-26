# iPlatform soul — deferred (not this phase)

**This file is not the visual source of truth.** Current work is OM-only:
[`UI_PARITY_OM_1TO1.md`](UI_PARITY_OM_1TO1.md)
(ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look).

Owner sequencing:

1. Approximate in-repo **openmetadata-ui** first (pages, components, modals,
   interactive details). Vue 3 + ant-design-vue native. No iPlatform blend.
2. **Only after** the OM residual matrix is largely closed — a later batch /
   separate PR may layer **iPlatform3 shadow/soul** (feel/brand accents)
   without undoing OM IA or cloning IP3Layout.

Until then, do **not** re-apply historical #37 / `@icore` surface tokens or
IP3Layout / NaviTab chrome. That primary is superseded.

Still forbidden in every phase:

- Porting `@icore` packages or IP3Layout / NaviTab / TabMenu
- Settings appearance / themeConfiguration PUT
- DROP / connector / MCP / profiler-DQ invent

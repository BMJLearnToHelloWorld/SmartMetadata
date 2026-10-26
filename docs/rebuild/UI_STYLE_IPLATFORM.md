# iPlatform soul — layered on OM IA

**Visual source of truth for feel accents:** [`UI_IP3_SOUL.md`](UI_IP3_SOUL.md)
(ADR:2026-10-26-smartmetadata-ui-layers-ip3-soul-on-om).

OM Batches 1–4 remain the IA / copy / chrome SoT:
[`UI_PARITY_OM_1TO1.md`](UI_PARITY_OM_1TO1.md)
(ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look).

Owner sequencing (completed):

1. Approximate in-repo **openmetadata-ui** first (pages, components, modals,
   interactive details). Vue 3 + ant-design-vue native.
2. After that residual matrix was largely closed — layer **iPlatform3
   shadow/soul** (feel/brand accents) without undoing OM IA or cloning
   IP3Layout.

Primary stays **`#1570ef`**. Do **not** re-apply historical #37 `#005587`.
Soul is radius 6, shadows, denser Modal/Card/Table/Input, and
iPlatform-inspired neutrals.

Still forbidden:

- Porting `@icore` packages or IP3Layout / NaviTab / TabMenu
- Settings appearance / themeConfiguration PUT
- DROP / connector / MCP / profiler-DQ invent

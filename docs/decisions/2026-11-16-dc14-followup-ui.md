# D-C14 follow-up UI batch: recognizer-feedback tasks, Generated badge, usage surfaces, service delete flow

- **Status:** Accepted
- **Revisions:** v1 2026-11-16 (initial); v2 2026-11-16 (parent-review fix pass — see Revision v2 below; v1 text unchanged); v3 2026-11-16 (i18n audit — see Revision v3 below; v1/v2 text unchanged)
- **Deciders:** Bai (ruling 2026-11-16: the D-C14 follow-up batch and the service-delete cascade UI gap land completely, after official benchmarking, as one deploy round)
- **Guard:** `smartmetadata-ui/src/catalog/recognizerFeedback.test.ts`, `smartmetadata-ui/src/views/collaboration/FeedbackApprovalTask.test.ts`, `smartmetadata-ui/src/features/crud/AssetOverviewFields.test.ts`, `smartmetadata-ui/src/governance/assetPatch.test.ts`, `smartmetadata-ui/src/features/queries/TableQueries.test.ts`, `smartmetadata-ui/src/catalog/usagePercentile.test.ts`, `smartmetadata-ui/src/catalog/tableJoins.test.ts`, `smartmetadata-ui/src/features/crud/DeleteEntityModal.test.ts`, `smartmetadata-ui/src/ingestion/serviceApis.test.ts`, `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts`
- **Related:** upstream pin `a3012259ca` (`FeedbackApprovalTask.tsx`, `TaskTabNew.component.tsx`, `TaskActionUtils.ts`, `TaskFormSchemaUtils.ts`, `taskDetail.utils.ts`, `taskResolve.utils.ts`, `TagsViewer.tsx`, `AutoClassificationTag`, `TableQueries.tsx`, `QueryCard.tsx`, `TableQueryRightPanel`, `TablePureUtils.ts` `getUsagePercentile`/`getJoinsFromTableJoins`, `FrequentlyJoinedTables`, `DeleteEntityModal.tsx`, `ManageButton.tsx`, `miscAPI.ts`, `ServiceDetailsPage.tsx`, `DataAssetsHeader`); ruling `RULING-DC14.md` (D-F1..D-F18); ADR:2026-11-14-autopilot-agents-ui-parity; ADR:2026-11-14-agent-capability-batch1; ADR:2026-11-14-autoclassification-engine

## Context

The capability round (#213/#214/#215) left four UI surfaces explicitly
owed: recognizer-feedback approval tasks had no rendering anywhere
(the engine honors exception lists regardless of UI); Generated
(auto-classification) tags rendered as plain chips because the fork's
tag types and mappers dropped `labelType` and the save path rewrote
every label to Manual; the `table_queries` tab was a residual empty
state and percentile-rank / Frequently Joined displays did not exist;
and deleting a service from the UI sent a bare DELETE that the server
rejects for any non-empty service (`recursive` defaults to false),
with no soft/hard choice, no permission gate, and no restore path.
All four gaps are UI-only: the server endpoints, schemas, and
workflows the pin UI calls are present in the fork server.

## Decision

- **Recognizer-feedback tasks render the pin's task-tab surface.**
  The detail view shows exactly the pin's six feedback rows with the
  pin's conditionals, reading the sibling `payload.recognizer`
  (never `feedback.recognizerInfo`, never a fallback); tagFQN,
  scores, samples, and reason are never rendered. The shared
  predicate (`feedback` key in the payload AND type
  `RecognizerFeedbackApproval` or `DataQualityReview`) and the
  `feedbackApproval` handler serve every resolve path; approve
  sends `'approved'`, reject sends `'rejected'`, never the
  suggested-value JSON. The generic suggestion section is suppressed
  for feedback tasks. The approve/reject split button follows the
  pin task-tab gate (assignee or team-member-non-creator; an admin
  alone gets a disabled button with the reviewers-only tooltip) and
  generic Resolve/Close affordances are suppressed. The inbox gets
  the localized type label only, from the pin's label table ported
  as data. The split button defaults to approve-first: the pin's
  initial-action quirk (first primary press only relabels) is real
  but unasserted by pin tests and is not replicated.
- **The Generated badge is pin-gated (D-F1).** The badge branch
  exists ONLY at the entity-page tag display
  (`AssetOverviewFields.vue`, the `TagsContainerV2` equivalent):
  `labelType === 'Generated'` renders a distinct chip (product
  primary color role, automation icon role, name-only text, same
  chip shape/height); every other site renders Generated plain, as
  the pin does. No link, no tooltip, no locale text, no
  Derived/Propagated/Automated distinctions. `labelType` is carried
  on `TagRef` and preserved by `mapTags`, validated against the
  five-value pin enum.
- **Column-tag display is deferred as a residual (D-F2).** The fork
  has no column-tag display surface at all; building it is a
  prerequisite project larger than the badge and is not bundled
  silently. The pin badges column tags through the same gate, so
  the column badge stays owed until that surface exists.
- **The entity save path preserves `labelType` (D-F3).** Entity tag
  edits carry the incoming `labelType` through `toTagLabel` and
  `selectedTagOptions`, as the pin's entity editing does; the
  schema-field (bulk grid) path keeps rewriting to Manual, as the
  pin's schema-field editing does. Without this, badges would
  disappear on reload after any tag edit.
- **The `table_queries` tab follows the pin's search contract
  (D-F14).** The list is search-driven (`q=*`, `index=query`,
  `createQueryFilter` verbatim, sort options, offset paging) with
  the pin's states and ViewQueries gating; the right panel hydrates
  the selected query via REST GET by id; the tab count badge comes
  from REST `limit=0`. One conscious correction: filter/sort
  handlers pass the full current filter set, where the pin's
  tag/date/sort handlers silently drop a selected owner
  (stale-state inconsistency; only the pin's owner handler passes
  all three). The pin's paging filter-drop IS preserved exactly.
  URL writes merge into the existing query string via replace, so
  the `tab` parameter survives; the pin's wholesale replace would
  bounce the detail view off the tab.
- **Percentile and Frequently Joined follow the pin's formulas
  (D-F15).** `getUsagePercentile` is ported exactly, including the
  leading-space non-literal form; `usageSummary` is requested only
  when VIEW_USAGE is granted and the percentile renders only when
  present. Slots: detail header, explore/search cards, and the
  summary-panel equivalent. Schema/database listing columns and the
  service-page database-list column stay out: no fork equivalents
  were verified. Frequently Joined aggregates `joins` per the pin
  (column roll-up, group-and-sum, database.table names, sort by
  count) as a schema-tab widget plus the column affordance; the
  pin's dead `joinedTables` derivation is not replicated. The
  `DataQuery.service` mapping bug (EntityReference forced through
  `asString`) is fixed and query vote/patch/delete clients exist.
- **Service delete uses the async endpoint plus a bounded re-read
  (D-F5).** The pin reports async-delete completion over a
  websocket the fork does not have, and no pollable job-status
  endpoint exists; the fork follows its established metrics
  precedent (async endpoint, then a bounded re-read to confirm
  state). Mechanism differs, end-state parity is the rule. Every
  service delete sends `recursive=true` with `hardDelete` from the
  shared soft/hard modal (soft default, hard-only variant once
  soft-deleted, no type-to-confirm, pin copy in dev_ui visuals).
  The delete entry is omitted when the service entity's
  `Operation.Delete` is denied; restore (endpoint, modal, Deleted
  badge, show-deleted toggle, `include` handling) is built. The
  list-view row delete is REMOVED: official has no list-level
  service delete.
- **Delete navigation follows the pin's classic counterpart (D-F6).**
  The fork's ingestion services list + detail flow maps to the
  pin's classic settings-services flow: navigate to the list only
  on hard delete; on soft delete, stay and show the deleted state
  (refetch with `include`). What the pin classic page shows after
  an async soft delete without a reload stays open as a live check
  (delete Q2); D-F6 stands unless that check contradicts it.

## Consequences

- Generated labels survive entity tag edits and badge only where
  the pin badges; a future column-tag display project must apply
  the same gate to column tags when it lands.
- Recognizer-feedback resolve bodies match the pin's on every path,
  so the workflow machinery receives the sentinels it expects; the
  split-button default is a recorded fork choice, not pin behavior.
- The queries tab, percentile slots, and Frequently Joined widget
  render only from fields the server actually serves; unverified
  slots were left out rather than invented and are recorded in the
  implementation record, not silently dropped.
- Service delete can no longer fail with `entityIsNotEmpty` from
  the UI, and a soft-deleted service is visible and restorable;
  the async re-read budget (2s interval, 30s budget, metrics
  precedent) bounds how long the UI waits before landing per D-F6.
- Revisit when: the column-tag surface lands (D-F2); the delete Q2
  live check contradicts D-F6; live acceptance shows the async
  re-read budget misjudged for large services.

## Revision v2 — 2026-11-16 (parent-review fix pass)

Append-only: the v1 text above is unchanged. The parent review
(REJECT, 0 HIGH / 7 MEDIUM / 25 LOW) found no ruling violation on
any transport or gating path; the fix pass corrected the findings
and recorded the following four items.

- **Derived exception in the schema-field save path (B-F4).** The
  v1 Decision (D-F3) says the schema-field path keeps "rewriting to
  Manual, as the pin's schema-field editing does". Pin
  `getUpdatedTags` (`TablePureUtils.ts:209-225`) actually preserves
  `Derived` and rewrites everything else to Manual. No observable
  divergence exists today — the bulk-grid input type carries no
  `labelType`, so the Derived-preservation case cannot arise — and
  the leave-alone decision stands. A future labelType-aware grid
  change must preserve `Derived` per the pin.
- **Delete tooltip adaptation (D-L6).** The service detail Delete
  button's tooltip and aria-label keep the fork-neutral copy
  `ingestion.services.deleteActionHelp` ("Delete this service" /
  "删除此服务") instead of porting the pin ManageButton delete
  menu-item description
  `message.delete-entity-type-action-description` ("Deleting this
  {{entityType}} would permanently delete its metadata." /
  "删除此{{entityType}}将永久删除其元数据",
  ManageButton.tsx:271-275, interpolated with the raw entityType
  string). Porting that description onto a button whose default
  action is a reversible soft delete would reintroduce the
  misleading-permanence wording this batch removed from the delete
  flow (the retired "cannot be undone" copy); the neutral copy
  states only the action and leaves permanence to the modal's
  per-choice copy, where the pin's soft/permanent distinction is
  preserved verbatim.
- **Percentile header coverage extended (C-F03, parent decision
  D1).** `usageSummary` is now requested, VIEW_USAGE-gated, for
  dashboard, pipeline, and ML-model detail headers as well as
  tables — the pin shows the percentile at all four header sites
  (`DataAssetsHeader.utils.tsx`) with identically gated requests.
  Per-resource verification at pin `a3012259ca`: table
  (`TableResource.java:132`), dashboard
  (`DashboardResource.java:100`), and ML model
  (`MlModelResource.java:99`) map `usageSummary` to `VIEW_USAGE`;
  pipeline has NO server-side `addViewOperation` for the field
  (`PipelineResource.java:91-92` FIELDS omits it;
  `getEntitySpecificOperations` maps only `tasks,pipelineStatus`
  to `VIEW_BASIC`), but `PipelineRepository` serves the field
  whenever `fields` contains it (`PipelineRepository.java:124,
  223-238`) and the pin pipeline page gates the request on
  ViewUsage identically to the other three pages — so the fork
  requests it only when the viewer holds ViewUsage and no data
  leaks to an unauthorized viewer. The missing server-side mapping
  is a pin-server quirk, recorded here and in the
  `USAGE_SUMMARY_ENTITY_TYPES` comment. Stayed out, recorded not
  silently omitted: chart, database, databaseSchema, and drive
  entities gate `usageSummary` on VIEW_USAGE server-side but have
  no pin header-percentile site, so the two-part condition
  (VIEW_USAGE-gated AND an equivalent fork header slot) is not
  met.
- **`taskOwnership` matching is a deliberate fork convention
  (R-L2, parent decision D2).** The shared `taskOwnership` helper
  matches assignee/creator by id OR name and teams by id OR name,
  where the pin matches assignee/team by id only and creator by
  name only (`TaskTab.utils.ts:26-48`). The broader matching is
  pre-existing fork convention, shared with the generic `canAct`
  gate; narrowing it would risk P1 permission behavior, and the
  server enforces writes. Recorded as a convention, not aligned;
  the code comment at the helper says the same.

## Revision v3 — 2026-11-16 (i18n audit, Bai-requested)

Append-only: the v1/v2 text above is unchanged. At Bai's request the
batch's multilingual values were audited against the pin locale files
(`en-us.json` / `zh-cn.json` at pin `a3012259ca`): 111 added/changed
values, 85 verified character-for-character against the pin, key sets
identical in both locales, zero hardcoded user-visible strings, zero
interpolation errors. Six values were corrected to pin-verified
wording (F1–F6: `query.ownerFilter` zh `负责人` → `所有者`,
`query.addingNewEasy` full-width comma → pin ASCII comma,
`query.deleteBody` and `query.fetchPermissionsError` rewritten to the
pin-rendered sentences, `query.viewQueries` en `View Queries` →
`View Query`, `query.voteFailed` zh aligned with the pre-existing
`asset.voteFailed` rendering).

- **Eight zh-CN values deliberately diverge from the pin's Chinese
  (F7–F14, Bai's ruling 2026-11-16: keep the fork wording and record
  it).** The pin's zh values below are mistranslations, awkward
  renderings, or meaning-changing renderings; copying them would ship
  wrong Chinese to users. The fork values stay, the divergences are
  recorded here, and the en-US values (all pin-verbatim) are
  unaffected. Same record-over-port line as the D-L6 tooltip ruling.
  If a future pin revision fixes the zh translations, revisit.
  - F7 `query.copySql`: fork `复制到剪贴板`; pin
    `message.copy-to-clipboard` (zh-cn.json:4418)
    `链接已复制到剪贴板` — states a *link* was copied; the button
    copies SQL.
  - F8 `query.editOwners`: fork `编辑负责人`; pin rendered
    `label.edit-entity` (zh-cn.json:1139) +
    `label.owner-lowercase-plural` (zh-cn.json:2554) → `编辑业主`
    — `业主` means "property owner", a mistranslation.
  - F9+F10 `query.and` / `query.more` (decided as a pair): fork
    `还有` / `个`, rendering `还有 2 个`; pin
    `label.and-lowercase` (zh-cn.json:222) `和` +
    `label.more-lowercase` (zh-cn.json:2200) `更多`, rendering
    `和 2 更多` — unidiomatic.
  - F11 `query.pleaseSelectUsedIn`: fork `请选择引用表`; pin
    rendered `label.please-select-entity` (zh-cn.json:2674) +
    `label.query-used-in` (zh-cn.json:2783) →
    `请选择查询语句被使用在` — awkward/ungrammatical.
  - F12 `usage.frequentlyJoinedTables`: fork `经常连接的表`; pin
    `label.frequently-joined-table-plural` (zh-cn.json:1462)
    `经常连接查询的表 (Frequently Joined Table)` — carries an
    English parenthetical.
  - F13 `usage.frequentlyJoinedColumns`: fork `经常连接的列`; pin
    `label.frequently-joined-column-plural` (zh-cn.json:1461)
    `经常连接查询的列 (Frequently Joined Column)` — carries an
    English parenthetical.
  - F14 `usage.plusCountMore`: fork `+ {count} 更多`; pin
    `label.plus-count-more` (zh-cn.json:2676) `超过{count}` —
    "exceeds N", which does not convey "+N more" on a show-more
    affordance.

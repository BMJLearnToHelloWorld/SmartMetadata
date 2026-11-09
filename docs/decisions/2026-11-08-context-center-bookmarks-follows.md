# Context Center article bookmarks read and write through follows

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 W2-1 (G-19)
- **Guard:** `users.test.ts` ("reads bookmarks from the user follows field, keeping only pages"); `contextCenter.test.ts` ("knowledge page follows (G-19)"); `ArticlesRightPanel.test.ts` (bookmarks render, empty state, open-page emit); `ContextCenterArticlesView.test.ts` ("toggles follow on the article detail …", "toggles follow from the list row overflow menu")
- **Related:** W2-1 review condition 6; upstream pin `a3012259ca` (`BookMarkWidget.tsx`, `KnowledgePageListRightPanel.tsx`, `rest/knowledgeCenterAPI.ts`)

## Context

Official has no bookmark endpoint. Bookmarks are the current user's
`follows` entries of type `page` (`BookMarkWidget` reads
`getUserById(id, {fields: 'follows'})` and filters
`type === EntityType.KNOWLEDGE_PAGE`, where `KNOWLEDGE_PAGE = 'page'`),
and follow/unfollow are the followers sub-resource
(`followKnowledgePage` PUT `…/followers` with the raw user id as body;
`unfollowKnowledgePage` DELETE `…/followers/{userId}`). The product had
no bookmark read or write anywhere.

## Decision

- Read: `getUserFollows(id)` (GET `/v1/users/{id}?fields=follows`,
  `mapUser` maps `follows`) keeps only entries whose `type` is `'page'`.
  No separate bookmark endpoint is introduced.
- Write: `followKnowledgePage(id, userId)` PUTs the raw user id as the
  body (`Content-Type: application/json`); `unFollowKnowledgePage(id,
  userId)` DELETEs `…/followers/{userId}`. Both parse the added/removed
  followers from the response `changeDescription`
  (`fieldsAdded[0].newValue` / `fieldsDeleted[0].oldValue`); a missing
  changeDescription yields an empty list. The row and detail follow
  state is updated from the parsed change (falling back to the toggled
  user id when the server omits it).
- Follow is NOT permission-gated (official `onFollow` has no gate); the
  toggle lives on the article detail and as a list-row overflow menu
  item, both refreshing the right panel's bookmarks.
- Right panel (`ArticlesRightPanel.vue`) follows official
  `KnowledgePageListRightPanel`: three groups — bookmarks, recently
  viewed (product `stores/contextCenterRecent.ts`), tag-grouped quick
  links (`listTags({parent: 'KnowledgeCenter', limit: 25})` then per-tag
  `listKnowledgePages({fields: 'owners,tags', tagFQN})`, empty groups
  skipped, group title = startCase of the tag name). The whole-panel
  empty state appears only when the classification carries no tags at
  all, with a Create-gated "new quick-link" button that opens the create
  modal pre-set to QuickLink. The panel reloads all three groups when the
  parent bumps `refreshSignal` (create/delete/follow, return to list).
- Bookmark, recent, and quick-link clicks resolve through the parent:
  QuickLink with a URL opens in a new tab, otherwise the router goes to
  the article detail by FQN (a follows ref carries FQN but no pageType
  or URL, so the detail route resolves the type).

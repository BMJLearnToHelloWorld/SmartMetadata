# The browser Test Login signs in with the pin's oidc-client, in an isolated popup the entry guard diverts before the app mounts

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Settings A-group design (DESIGN.md §8, S25) under Bai's standing official-alignment rules; Q2 spike verdict below
- **Guard:** `smartmetadata-ui/src/composables/useSsoTestLogin.test.ts` (browser flow, guard, stale runs); `smartmetadata-ui/src/auth/ssoTestCallback.test.ts` (isolated config, callback, close); `smartmetadata-ui/src/auth/ssoTestLoginPopup.test.ts` (popup detection, URL safety)
- **Related:** upstream pin `a3012259ca`; design `~/workspace/work/settings-agroup-batch/DESIGN.md` (not in-repo, sole authority for this batch)

## Context

Public-client OIDC signs in in the browser, so its test must sign in in the browser too —
with the same flow the real login uses, or the test would fail (or pass) for a different
reason than the real login would. The pin drives that flow with `oidc-client@^1.11.5`, and
the design required a spike proving the pin library's five capabilities in this Vue/Vite
stack before adopting it, with any failure escalated rather than routed around with a fork.

The Q2 spike (isolated probe, `oidc-client` 1.11.5) passed all five: (1) `WebStorageStateStore`
with `InMemoryWebStorage` constructs and accepts a prefixed state store; (2) `signinPopup` /
`signinPopupCallback` exist on `UserManager` with the pin's semantics; (3) wrapping
`metadataService.getAuthorizationEndpoint` runs during `createSigninRequest`, giving the
configuration check and the endpoint-safety refusal a hook; (4) `response_type: 'code'`
produces PKCE (`code_challenge`, S256, `code_verifier`) and exchanges the code, while
`id_token` produces no challenge; (5) strict `tsc` and a `vite build` of a probe importing
the library both succeed. The pin original is therefore adopted: `package.json` gains only
`"oidc-client": "^1.11.5"`, and no fork was considered.

## Decision

- The test popup uses an isolated `UserManager` configuration: the tested identity's tokens
  stay in a memory `userStore`, sign-in state goes to a dedicated `omSsoTestLogin.`-prefixed
  localStorage `stateStore`, `loadUserInfo` and `monitorSession` are off, and the redirect
  URI is the candidate's own callback URL (blank falls back to the product's `/saml-callback`),
  so the test exercises the actually registered redirect URI and never requires the admin to
  register an extra one.
- `main.ts` diverts the returning popup before anything mounts: `isSsoTestLoginPopup` (an
  opener window plus an OIDC `state` present in the prefixed store, failing closed on any
  exception) routes to `runSsoTestCallback`, which completes the handshake and closes the
  window without mounting the app — so the tested identity can never touch the admin's real
  session, token storage, or auth context. A callback chunk that fails to load closes the
  popup rather than mounting the app into it.
- The authorization-endpoint guard runs the configuration check before the popup leaves the
  origin and refuses any endpoint that is not http(s); the candidate key is written before
  sign-in and removed in a `finally`, so a failed run leaves nothing behind.
- Code-flow providers (`okta`, `auth0`, `azure`) force `response_type: 'code'`; every other
  public client uses the candidate's stored response type, defaulting to `id_token`.
- No Playwright injection seam exists: tests drive the flow through the injected
  `UserManager` factory and module mocks at the HTTP boundary.

## Consequences

The browser test proves the real login flow against the candidate, in isolation, with no
extra redirect URI to register. The entry guard is a security requirement, not a routing
convenience: removing or weakening it would let a tested identity's tokens land in the
admin's session. Any future move off `oidc-client` needs a new spike and a new record —
the library choice is pinned to the pin's version deliberately.

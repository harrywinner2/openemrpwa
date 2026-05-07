# Patient Dashboard Migration — Defense

## What this is

A reimplementation of OpenEMR's clinician-side patient dashboard
(`interface/patient_file/summary/demographics.php`, ~1300 lines of PHP+Twig+JS)
as a single-page web application that consumes OpenEMR's existing FHIR API.

**Not changed:** the backend. No PHP, SQL, REST, or FHIR code in this repo is
modified. The new app sits alongside the legacy dashboard on a separate branch
(`port`, rooted at the upstream fork point `4c858b20d`) and ships as a standalone
static bundle.

## Why move off PHP at all

The 2025 UX refresh accomplished what it could *within* the constraints of
server-rendered PHP. The constraints themselves are what's left:

- **Every interaction is a full-page reload.** Every card update, every
  navigation, every filter change re-renders the entire page on the server and
  re-ships the whole DOM.
- **Loading and error states are essentially absent.** The PHP page renders
  empty `<ul>`s when an integration is misconfigured; the user sees a card with
  no items and no signal that something failed. The SPA renders explicit
  `Loading…` / error / `No active medications.` states for each card.
- **Mobile experience is afterthought-quality.** Bootstrap 4 + iframe layout
  predates responsive expectations.
- **The frontend is invisible to the modern toolchain.** No type checks, no
  fast hot-reload, no component testing, no bundler — Smarty/Twig + jQuery +
  inline `<script>` is what you get.
- **Auth is welded to PHP `$_SESSION`.** Anything that wants to consume patient
  data from outside the PHP process has to either reimplement the session model
  or bolt itself onto the existing OAuth2 server. We took the second path.

A modern SPA addresses every one of those points by trading server-rendering
for client-rendering and making the FHIR API the contract.

## Framework choice: React 18 + TypeScript + Vite

### Considered

| Option              | Why considered                                    | Why rejected                                                                                |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **HTMX on top of PHP** | Smallest delta from current code                | Doesn't decouple the dashboard from `$_SESSION`/PHP, doesn't help mobile, doesn't help types |
| **SvelteKit**       | Smaller bundle, better DX                         | Smaller hiring pool; ecosystem for clinical/FHIR components is thinner than React's          |
| **Vue 3**           | Comparable to React in DX                         | Marginal differentiation for this team; fewer FHIR-specific libraries                        |
| **Plain HTML + TS** | Zero deps                                         | We need 6+ cards with shared state, async fetching, and route nav — manual JSX is the wrong tool |
| **React + Vite**    | Largest ecosystem, fastest scaffold, typed JSX, full HMR, every clinical UI library targets it first | Bundle is bigger than Svelte, hooks model has a learning curve. Both acceptable here.      |

### Picked

React 18 + TypeScript + Vite, with:

- **TanStack Query** for server-state caching, request dedup, automatic retry.
- **TanStack Router** for typed routes.
- **Tailwind CSS** for styling — no Bootstrap port; simpler than maintaining a
  parallel design system.
- **Vitest + happy-dom** for fast unit tests (Jest API, native ESM).
- **vite-plugin-pwa** for the manifest + service worker — installable as a
  desktop/mobile app for free.

Bundle size is **~320KB raw / 103KB gzipped** for the entire dashboard plus
auth, six cards, the patient picker, and the PWA shell. That's smaller than the
PHP page's first paint when you include Bootstrap + jQuery + Angular 1.8 + the
inline `<script>` blocks.

## Why a popup OAuth flow over a redirect

`fhirclient` (the canonical SMART-on-FHIR JS lib) drives a full-page redirect:
the user clicks "Sign in", the browser leaves the SPA, OpenEMR's PHP login
appears, the user consents, and the browser comes back to the redirect URI.

That works, but it has three problems:

1. **State loss.** Anything in memory dies when the browser navigates away.
   `fhirclient` papers over this by using `sessionStorage`, but query caches,
   form drafts, and any in-flight UX state are gone.
2. **PWA feel breaks.** When the SPA is installed as an app, a full-page
   navigation pulls the user out of the app shell — the address bar reappears
   on browsers, the standalone window changes URL.
3. **The "remote / share a link" use case becomes harder later.** A popup
   architecture and a link-share architecture have nearly identical callback
   logic; a redirect architecture has to be torn out to support either.

So we hand-rolled OAuth2 + PKCE in ~120 lines (`src/auth/`). Two channels share
the same primitives:

- **Popup channel** — `window.open(...)`, `postMessage` from the callback page.
- **Link channel** — show the URL (with a QR), the user opens it in a new tab,
  the callback page signals back to the originator via a `localStorage` event.

The same `oauth-callback` page handles both — it detects whether it has a
`window.opener` and picks the right path. Both channels reuse the same
`exchangeCode()`, `tokenStore`, and silent-refresh logic. Adding the link
channel cost ~30 LoC on top of the popup.

## Why hand-rolled PKCE over `fhirclient`

`fhirclient` is excellent for the EHR-launch flow (where the EHR is launching
your app *into* itself with a launch token). For a standalone PWA that does its
own auth and wants a popup channel and a link channel, it gets in the way:

- Designed around full-page navigation; popup support is awkward.
- Pulls in a `Client` abstraction and a request layer we don't need (we use
  TanStack Query + a tiny typed `fhir.ts` wrapper).
- Adds ~50KB of JS for features we don't exercise.

Hand-rolled PKCE is roughly:

- `pkce.ts` — 25 lines for verifier/state generation + S256 challenge derivation.
- `authUrl.ts` — 50 lines to build the `/authorize` URL and stash pending state.
- `tokenStore.ts` — 130 lines for token persistence, code exchange, silent
  refresh, observer pattern.
- `popupChannel.ts` + `linkChannel.ts` — ~70 lines each.

Total: ~340 lines, fully typed, fully unit-testable, no dependency surface.

## Modular auth: `clinician` vs `single-patient`

The brief asks for "a working dashboard"; the user asked for two postures:

- **Clinician mode** — the doctor-facing shape. Patient picker shown, multiple
  patients visited per session, `user/*.rs` scopes.
- **Single-patient mode** — locked to one MRN, picker hidden, scopes still
  `user/*.rs` because OpenEMR's standalone-launch flow does not reliably bind
  a launch-context patient at consent time on the fork-point commit. The
  restriction is enforced in the SPA UI.

The mode is a tab on `SignInScreen`, persisted on the token, and changes both
the requested scope set (`scopes.ts`) and which routes the SPA exposes after
auth.

## What we gained

| Old (PHP)                                        | New (SPA)                                                  |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Full-page reload per interaction                 | Stateful, instant updates                                  |
| Empty cards on integration failure               | Explicit Loading / Error / Empty states per card           |
| Bootstrap 4 + iframe layout                      | Tailwind, responsive grid, no iframes                      |
| Smarty/Twig + jQuery + Angular 1.8               | One framework (React) + typed components                   |
| No build, no types, no HMR                       | tsc + Vite + Vitest, sub-second hot reload                 |
| Single-deploy artifact (PHP image only)          | Static bundle deployable to any HTTPS host                 |
| Welded to PHP `$_SESSION`                        | Standard OAuth2 + PKCE; portable identity                  |
| Cannot install as an app                         | PWA installable                                            |
| Auth = full-page redirect                        | Popup OR shareable link, app shell never navigates away    |

## What we gave up

Honest, not advertorial:

- **Server-rendered first paint.** The SPA shows a blank → spinner → content
  pattern. Time-to-first-meaningful-paint is slightly worse than the PHP page on
  cold cache. SSR could close this gap (Next.js / Remix); we chose not to take
  on a server runtime.
- **Single-deploy artifact.** Operations teams now have *two* things to ship —
  the PHP image and the SPA bundle — and two CORS surfaces to manage if the SPA
  is on a different origin. Same-origin deployment under `public/portal-spa/`
  defuses most of this.
- **Integrated session model.** PHP `$_SESSION` was free for OpenEMR plugins
  that wanted "the current user's context." The SPA has its own token, and
  cross-tool integrations would have to mint their own.
- **The OAuth client to manage.** Each new origin requires a one-time
  registration step (`scripts/register-client.sh`) and an admin click in
  OpenEMR. The PHP page had nothing equivalent.
- **No automatic feature parity.** If the legacy PHP dashboard grows a new
  card, the SPA does not gain it automatically. This is intentional — see
  README — but it means dashboards drift unless someone is paid attention to
  drift.
- **Tokens in `sessionStorage`.** XSS-vulnerable. Every public SPA shares this
  exposure; the mitigation is CSP + rigorous dependency review, not
  architecture.

## Future work

### Remote-relay sign-in (Flavor B)

The link channel above only supports same-browser sign-in: the URL has to be
opened in the browser that's running the SPA, because PKCE's `code_verifier`
lives on the originator's machine. Truly remote sign-in (a clinician on
machine A wants their resident on machine B to authenticate) requires a relay.

Three architectures, in declining order of preference:

#### 1. WebSocket relay (recommended)

```
┌─────────┐  open WS, get session_id   ┌──────────────┐
│   SPA   │ ─────────────────────────▶ │ Relay (Node) │
│ (orig)  │                            └──────────────┘
└─────────┘                                   ▲
     │                                        │
     │ shareable URL: relay.example/<sid>     │ POST {sid, code, state}
     ▼                                        │
┌──────────────┐    consent     ┌──────────────────┐
│   Helper     │ ─────────────▶ │   OpenEMR auth   │
│ (different   │ ◀───────────── │     server       │
│  device)     │  302 callback  └──────────────────┘
└──────────────┘
```

Wire protocol (sketched):

```
SPA → relay : { type: "open", session_id }
relay → SPA : { type: "ready" }
helper → relay (HTTP POST) : { session_id, code, state }
relay → SPA (WS) : { type: "auth_code", code, state }
SPA exchanges code locally with its own verifier → tokens.
```

Properties:
- Tokens never touch the relay. Only the auth code does, and the auth code is
  single-use, PKCE-bound, and worthless without the verifier.
- Sessions TTL out at 5 minutes.
- Relay can be a 100-line Go or Node service; stateless except for an
  in-memory map of `session_id → WebSocket`.

Threat model:
- A malicious relay can intercept `(code, state)` pairs but cannot redeem them.
- A passive observer of the relay's traffic gets nothing usable.
- The originator must verify the `state` matches its own pending entry — same
  invariant as the popup/link channels.

#### 2. Shared-DB poll

Same shape, but the relay is a single Postgres/Redis row keyed by
`session_id`. Originator polls every 2s. Simpler infra. Worse UX (latency
proportional to poll interval).

#### 3. RFC 8628 Device Authorization Grant

The standards-compliant solution. Requires server-side support OpenEMR doesn't
ship; would be a real PR upstream against `oauth2/authorize.php`. Cleanest if
pursued, but out of scope for "port the dashboard."

### Other on-deck items

- More cards: lab results (Observation), vitals (Observation w/ category=vital-signs),
  immunizations (Immunization), upcoming appointments (Appointment).
- Optional read-write: amendments, problem-list edits, medication
  reconciliation. Each adds a SMART scope (`user/Resource.cu`) and a form per
  card.
- Server-side rendering via Vite SSR + a tiny Node edge if first-paint
  becomes a complaint.
- Replacing TanStack Router with file-based routes once the route count justifies
  the build complexity.

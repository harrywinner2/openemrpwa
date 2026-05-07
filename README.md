# OpenEMR Patient Dashboard PWA

A modern, browser-only reimplementation of OpenEMR's clinician-side patient
dashboard. Authenticates against any OpenEMR instance via SMART-on-FHIR
(OAuth2 + PKCE) and calls the existing FHIR API directly from the browser —
**zero backend code, zero servers to operate**, just a static HTML/JS bundle.

The same bundle works against any OpenEMR in the world, provided the
operating org has registered this app's origin as an OAuth redirect URI.

> **Defense + design docs.** [`PATIENT_DASHBOARD_MIGRATION.md`](./PATIENT_DASHBOARD_MIGRATION.md)
> explains why this is a React+Vite SPA instead of PHP. [`REMOTE_ACCESS_DESIGN.md`](./REMOTE_ACCESS_DESIGN.md)
> covers a future cross-practice access flow (deferred). [`GITHUB_DEPLOY.md`](./GITHUB_DEPLOY.md)
> is the long-form deploy walkthrough this README links to.

## What it does

- **Patient header** — name, DOB, sex, MRN, active status (live from FHIR `Patient`)
- **Six clinical cards** — Allergies, Problem List, Medications, Prescriptions, Care Team, Encounters
- **Two sign-in modes**
  - *Clinician* (`user/*` scopes) — browse all patients you have access to in the EHR
  - *Single-patient* (`patient/*` scopes) — token bound to one patient, cannot escalate
- **Two sign-in channels**
  - *Popup* — opens OpenEMR's auth window inline; main window never navigates away
  - *Link / QR* — copy or scan the auth URL; `localStorage` event signals back when consent is given
- **Runtime-configurable backend** — point at any OpenEMR via the ServerPickerScreen; SMART discovery + auto-registration handle the rest
- **Granted-access transparency** — pre-sign-in description of what you're authorizing; post-sign-in banner showing identity, scopes, expiry
- **PWA installable** — manifest + service worker; offline shell, no PHI cached

## Quickstart — local dev against a local OpenEMR

```bash
npm install
npm run dev
# https://localhost:5173/  — accept the self-signed cert
```

In the SPA:

1. **Server picker** appears. Enter your OpenEMR URL (e.g. `https://localhost:9300` for the docker dev image). Click **Auto-register**.
2. The SPA POSTs to OpenEMR's `/oauth2/default/registration` and gets a `client_id`. Ask the OpenEMR admin to enable the new client (Admin → System → API Clients).
3. **Sign in.** Pick mode + channel. Authenticate against OpenEMR's login screen. You're in.

## Deploy to GitHub Pages (your personal demo URL)

This repo ships with a GitHub Actions workflow that auto-deploys on push to
`main`. Steps:

1. Create a new GitHub repo (e.g. `openEmrPwa`).
2. Push this repo's contents to it.
3. In the repo's Settings → Pages → set "Source" to "GitHub Actions".
4. Push to `main` → action runs → site at `https://<your-username>.github.io/<repo-name>/`.

The workflow ([`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml))
handles the GitHub Pages base path automatically by reading the repo name at
build time, so renaming or forking just works.

After deploy, **register the deployed origin with whichever OpenEMR you want
to demo against.** Easiest path: open the deployed URL, enter the OpenEMR
URL, click Auto-register — same as local. The redirect URI baked into the
registration is the one the SPA computes from `window.location.origin`, so it
matches automatically.

For pre-registration via shell, custom domains, troubleshooting, or
serving from S3/Netlify/etc. instead of Pages, see
[`GITHUB_DEPLOY.md`](./GITHUB_DEPLOY.md).

## How origin rules work in OpenEMR (one-paragraph version)

There are two distinct mechanisms in OpenEMR. **CORS is wide-open by default** —
the `CORSListener` echoes any `Origin` header back, so your browser SPA can
call the FHIR API from any origin without configuration. **Redirect URIs are
strict** — the OAuth client has an explicit allowlist with no wildcards, so
each origin you serve the SPA from has to be a registered `redirect_uri` on
the OAuth client. You can register multiple in one client to cover both local
dev and your Pages deploy. Full details + curl example in `GITHUB_DEPLOY.md`.

## Access scope — important for demo

The clinician mode requests `user/*` scopes — the resulting token inherits
the signing-in user's OpenEMR permissions. **If the user is an admin, the
token has admin-level read access.** SMART-on-FHIR has no "lesser" version
of `user/*`; finer granularity comes from the EHR's own ACL system (sign in
as a non-admin user, or use OpenEMR's per-user ACLs to scope what the
account can see).

For public demos, **always pick single-patient mode** when screen-sharing.
The picker disappears, the token is bound to one patient, and the
AccessBanner at the top of every page is green and labeled `Single patient
(PT-…)`.

## Development

```bash
npm run dev          # Vite dev server (HTTPS, port 5173)
npm run build        # Production build → dist/
npm run build:pages  # Production build + 404.html fallback for SPA routing
npm test             # Vitest unit tests (21 tests)
npm run lint         # ESLint
```

## Project structure

```
src/
  config/       # Runtime ServerConfig (localStorage) + SMART discovery + dynamic registration
  auth/         # PKCE, popup channel, link channel, token store, sign-in UI, scope helpers
  api/          # FHIR types + typed query wrappers + value formatters
  components/   # PatientHeader + 6 cards + AccessBanner + common (Card/Spinner/ErrorBox/EmptyState)
  pages/        # ServerPickerScreen, PatientPickerPage, PatientDashboardPage
  hooks/        # useFhirQuery (TanStack Query wrapper)
  routes.tsx    # @tanstack/react-router config
  main.tsx      # entry point
scripts/
  register-client.sh   # optional: shell-based OAuth2 client registration
.github/
  workflows/
    deploy.yml         # GitHub Pages auto-deploy on push to main
```

## License

Same as OpenEMR — GPL-3.0. This SPA is independent of the OpenEMR codebase
but is intended to operate against it; deriving from OpenEMR's API surface
makes the GPL terms apply by convention.

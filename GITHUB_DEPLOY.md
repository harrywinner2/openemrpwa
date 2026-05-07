# Publish the PWA on GitHub Pages

A walk-through to get this dashboard hosted on **your own** GitHub account and
pointed at any OpenEMR in the world. End state: a public URL like
`https://<your-username>.github.io/<repo-name>/` that you can sign into from
anywhere and demo against any properly-configured OpenEMR.

> Total time: ~15 minutes if you've published a GitHub Pages site before, ~30
> if you haven't.

---

## Step 1 — Create a fresh repo with just the SPA

The PWA lives at `patient-portal/` inside the OpenEMR worktree. You want a
*standalone* repo that contains only that subtree. Two equivalent ways:

### Option A — `git subtree split` (preserves SPA's commit history)

```bash
# From inside the openemr worktree (the .claude/worktrees/port one):
cd ~/openemr/.claude/worktrees/port

# Make a temporary branch that contains ONLY patient-portal/ commits.
git subtree split --prefix=patient-portal -b spa-only

# Clone it out as a brand new repository:
mkdir -p ~/code/openemr-patient-portal
cd ~/code/openemr-patient-portal
git init
git pull ~/openemr/.claude/worktrees/port spa-only
```

### Option B — copy the directory (simpler, fresh history)

```bash
mkdir -p ~/code/openemr-patient-portal
cp -r ~/openemr/.claude/worktrees/port/patient-portal/. ~/code/openemr-patient-portal/
cd ~/code/openemr-patient-portal
rm -rf node_modules dist .env.local
git init
git add -A
git commit -m "feat: initial commit — OpenEMR patient dashboard SPA"
```

Then on github.com, create a new public repo (e.g. `openemr-patient-portal`)
and push:

```bash
git remote add origin git@github.com:<your-username>/openemr-patient-portal.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Configure Vite for the GitHub Pages base path

GitHub Pages serves project sites at `https://<user>.github.io/<repo>/` —
notice the trailing `/<repo>/`. By default Vite assumes `/`. Two fixes you
need:

### 2a. Set the `base` in `vite.config.ts`

```ts
// vite.config.ts
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/openemr-patient-portal/' : '/',
  // ...rest of config unchanged
});
```

(Or hard-code `/openemr-patient-portal/` if this repo will only ever ship to
Pages.)

### 2b. Add a `404.html` SPA fallback

GitHub Pages doesn't natively support SPA routes. The standard workaround is to
ship a `404.html` that loads the same bundle. Add a tiny build step or copy
`dist/index.html` to `dist/404.html` after build:

```jsonc
// package.json — add to scripts:
"build:pages": "GITHUB_PAGES=true vite build && cp dist/index.html dist/404.html"
```

Now `https://<user>.github.io/openemr-patient-portal/oauth-callback` will
serve the SPA instead of GitHub's 404 page.

---

## Step 3 — Deploy via GitHub Actions

Drop this into `.github/workflows/deploy.yml` in your new repo:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build:pages
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

In your repo's settings → **Pages** → set "Source" to "GitHub Actions". Push
to `main`; the action runs and your site goes live.

---

## Step 4 — Tell OpenEMR about your new origin

This is the **only** step that has to happen on the OpenEMR side. The
deployed SPA's redirect URI must be registered as part of an OAuth client.

Your redirect URI is:
```
https://<your-username>.github.io/<repo-name>/oauth-callback
```

(Note the trailing `/oauth-callback`. The path matters — it must match exactly
what the SPA computes from `window.location.origin + '/oauth-callback'`.)

### 4a. Easy path — use the SPA's auto-registration

If the OpenEMR you're targeting has its registration endpoint open (it does
by default), just open the deployed SPA, enter the OpenEMR URL in the
ServerPickerScreen, and click "Auto-register". The SPA POSTs a registration
request that includes the deployed redirect URI. The owning admin still has
to enable the new client in OpenEMR (Admin → System → API Clients).

### 4b. Pre-register from CLI

If the OpenEMR has registration locked down or you want the `client_id` known
before you visit the site:

```bash
# From inside the patient-portal worktree (or anywhere with the script):
OAUTH_BASE_URL=https://emr.target-org.com/oauth2/default \
REDIRECT_URI=https://<your-username>.github.io/<repo-name>/oauth-callback \
  bash scripts/register-client.sh
```

The script prints a `client_id`. In the deployed SPA's ServerPickerScreen,
choose **"Use existing client_id"** and paste it.

### 4c. The OpenEMR-side enable step

In every case, the new client needs to be flipped to **Enabled** in OpenEMR's
admin UI:

1. Sign in to the target OpenEMR as an admin
2. Admin → System → **API Clients**
3. Find your client (search by client name; the SPA labels it "OpenEMR
   Patient Dashboard SPA")
4. Click "Edit" → check "Enabled" → Save

That's it.

---

## Step 5 — How origin rules work in OpenEMR

Two distinct mechanisms; worth keeping straight.

### CORS (cross-origin browser access)

OpenEMR's `CORSListener` (at `src/RestControllers/Subscriber/CORSListener.php`)
**echoes any `Origin` header back as `Access-Control-Allow-Origin`**. This
means by default, browsers from any origin can call OpenEMR's API. You don't
need to configure anything for CORS — your GitHub Pages origin already works.

If you want to lock this down (recommended in production), you'd need to
patch `CORSListener.php` to allowlist specific origins. Out of scope here.

### Redirect URIs (OAuth2 callback)

This *is* enforced. OpenEMR will only redirect back to a URL that's in the
client's `redirect_uris` array, registered at client-creation time. There's
no wildcarding. So:

- Each origin you serve from = one redirect URI to register.
- Move from `localhost:5173` to `<user>.github.io/<repo>` = re-register or
  edit the client to add a new redirect URI.
- Open up to a custom domain later = same — add `https://your-custom.com/oauth-callback`
  to the existing client's redirect URIs.

**Pro tip:** when you create a client you can pass *multiple* redirect URIs:

```bash
curl -k -X POST https://emr.target-org.com/oauth2/default/registration \
  -H 'Content-Type: application/json' \
  -d '{
    "application_type": "public",
    "token_endpoint_auth_method": "none",
    "redirect_uris": [
      "https://<user>.github.io/<repo>/oauth-callback",
      "https://localhost:5173/oauth-callback"
    ],
    "scope": "openid offline_access user/Patient.rs ..."
  }'
```

That single client_id will work for both your local dev server and your
deployed Pages site.

---

## Step 6 — Try it

1. Open `https://<your-username>.github.io/<repo-name>/`
2. ServerPickerScreen prompts. Enter the OpenEMR URL of the org you have
   credentials with.
3. Click **Auto-register** (or paste a pre-registered client_id).
4. Ask the OpenEMR admin to enable the new client.
5. SignInScreen appears. Pick mode + channel.
6. Click **Sign in**. You'll be redirected to the OpenEMR's auth screen,
   you log in, you consent, you come back, dashboard renders.

If anything goes wrong, the most common causes are:

- **"redirect_uri does not match"** — the redirect URI on the OAuth client
  doesn't match what your browser is sending. Check that it has
  `/oauth-callback` (not `/oauth-callback/`, not `/oauth_callback`).
- **"unauthorized_client"** — admin hasn't enabled the client yet.
- **CORS preflight 401 / 403** — the browser thinks something's wrong with
  the FHIR endpoints. Check that the OpenEMR is reachable over HTTPS from
  your browser (open the FHIR base URL directly in a new tab; you should get
  a JSON response or a 401).
- **Blank screen on `/oauth-callback`** — the SPA fallback isn't serving
  `index.html` for that path. Confirm `dist/404.html` exists in your build
  output and matches `dist/index.html`.

---

## A note on access scope

The SignInScreen offers two modes:

- **Clinician (`user/*`)** — token inherits your OpenEMR account's
  permissions. **If your account has admin rights, the SPA reads with admin
  rights too.** SMART-on-FHIR has no "lesser" version of `user/*`.
- **Single-patient (`patient/*`)** — token is bound to one patient. Cannot
  list, search, or escalate. Strictly less powerful.

For a public demo on a shared/screen-shared device, **always pick
single-patient mode**. The granted-access banner at the top of every
authenticated page tells you which scope the auth server actually granted —
in case the server downgraded your request.

---

## Optional: custom domain

GitHub Pages supports custom domains. Add a `CNAME` file with `your-domain.com`
to the repo, configure the DNS, and the site moves. After moving, you must
re-register or edit the OAuth client to add the new redirect URI:
`https://your-domain.com/oauth-callback`.

The SPA's PWA manifest (`manifest.webmanifest`) doesn't need changes — it
uses relative paths.

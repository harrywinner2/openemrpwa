# Remote Access Design — Cross-Practice, Admin-Approved

A design analysis for the case the user described:

> "I imagine wanting to show patient records to a doctor in another practice. He sends the auth to us (admin) to approve him."

This document does **not** describe code in `patient-portal/`. The dashboard SPA
itself is largely complete and only changes a little for this feature. The bulk
of the work is *new infrastructure* outside the SPA. This doc lays out what
those bricks are, where they live, and the order to build them.

---

## 1. What the scenario actually is

**The actors:**

| Role | Where they live | What they want |
|---|---|---|
| **External doctor** (Dr. Smith, Practice B) | Their own browser, no account in our OpenEMR | View one specific patient's record we hold, time-boxed, for a referral or consult |
| **Our admin** | Our OpenEMR + admin tools | Approve or deny the request after verifying identity and consent |
| **Our patient** | Not online for this flow | Pre-consented (BAA / care agreement) OR consents in real time |
| **Our OpenEMR** | Our infrastructure | Source of truth; mints scoped tokens; logs every access |

**The actual problems**, decomposed:

1. **Identity** — Who is Dr. Smith and how do we know?
2. **Authorization** — What is she allowed to see, and for how long?
3. **Approval workflow** — How does her request reach our admin, and how does the approval propagate back?
4. **Audit** — What did she actually see, and when? (HIPAA: every access logged, retained 6 years.)
5. **Consent** — Has the patient agreed to this disclosure?
6. **Revocation** — How do we cut access if something goes wrong mid-session?

Each is a separate brick. The naïve answer ("just give her an OAuth token") only handles #2, partially.

---

## 2. Workflow A — Async magic link (recommended starting point)

The friction-light path. Suitable for referrals, second opinions, scheduled consults.

### Flow

```
   Dr. Smith                         Relay/Approval Service                 Our Admin                        Our OpenEMR
   ────────                          ──────────────────────                 ─────────                        ────────────
       │                                       │                                 │                                 │
   1.  │ Opens our portal URL                  │                                 │                                 │
       │ Clicks "Request access"               │                                 │                                 │
       │ Fills NPI/email/patient/reason ──────▶│                                 │                                 │
       │                                       │ POST /access-requests           │                                 │
       │                                       │ → DB row pending                │                                 │
       │                                       │                                 │                                 │
       │                                       │ Notifies admin (email/push) ───▶│                                 │
       │                                       │                                 │ Reviews request                 │
       │                                       │                                 │ Verifies NPI + identity         │
       │                                       │                                 │ Captures patient consent        │
       │                                       │                                 │ Clicks "Approve"                │
       │                                       │◀────────── POST /approve ───────┤                                 │
       │                                       │                                 │                                 │
       │                                       │ Asks OpenEMR to mint a          │                                 │
       │                                       │ scoped token  ─────────────────────────────────────────────────▶ │
       │                                       │                                 │                                 │ ✓ mints
       │                                       │◀───────────────────────────────────────────────────────────────  │ token+ref
       │                                       │ Wraps token in a signed JWT     │                                 │
       │                                       │ "magic link"                    │                                 │
       │                                       │                                 │                                 │
       │ ◀──── Email: "Approved. Click here" ──┤                                 │                                 │
       │                                       │                                 │                                 │
   2.  │ Clicks link                           │                                 │                                 │
       │ SPA loads, /redeem?t=...              │                                 │                                 │
       │       ───────── POST /redeem ────────▶│ Validates JWT signature         │                                 │
       │                                       │ Returns access_token            │                                 │
       │                                       │ (already minted at step 1)      │                                 │
       │ ◀──── access_token ───────────────────┤                                 │                                 │
       │                                       │                                 │                                 │
   3.  │ SPA hits FHIR endpoints               │                                 │                                 │
       │ ──────────────── Authorization: Bearer ────────────────────────────────────────────────────────────────▶ │
       │                                       │                                 │                                 │ ✓ token valid
       │                                       │                                 │                                 │   for PT-12345
       │                                       │                                 │                                 │   only, until T+24h
       │ ◀───────────── FHIR resources ────────────────────────────────────────────────────────────────────────── │
       │                                       │                                 │                                 │
       │                                       │ Logs every access ─────────────────────────────────────────────▶ │ audit table
```

### Properties

- **Async.** Dr. Smith submits and walks away; she comes back when the email lands. No keep-the-tab-open requirement.
- **Identity is verified by our admin out-of-band** (phone, NPI lookup, fax). No federated trust required initially.
- **Tokens are scoped server-side** to the specific patient and the specific TTL. The token has no power outside that.
- **Revocable.** Admin can hit a "Revoke" button; the relay notifies our OpenEMR to invalidate the token.

### Bricks

#### A1. Approval microservice (new)

A small backend (Node/Go/Python — pick whatever fits the team's ops). Endpoints:

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/access-requests` | Public, rate-limited, captcha | Create pending request: `{requester_name, requester_npi, requester_email, patient_mrn, reason, duration_hours}` |
| `GET /api/access-requests?status=pending` | Admin OAuth (admin's OpenEMR session) | List for admin review |
| `POST /api/access-requests/:id/approve` | Admin OAuth | Mints a magic link, emails the requester |
| `POST /api/access-requests/:id/deny` | Admin OAuth | Rejects |
| `POST /api/access-requests/:id/revoke` | Admin OAuth | Invalidates a previously approved token |
| `POST /api/redeem` | Public | Exchange magic-link JWT for the actual `access_token` |

Storage: one Postgres table:

```sql
CREATE TABLE access_requests (
  id UUID PRIMARY KEY,
  requester_name TEXT NOT NULL,
  requester_npi TEXT,
  requester_email TEXT NOT NULL,
  patient_mrn TEXT NOT NULL,
  reason TEXT NOT NULL,
  duration_hours INT NOT NULL,
  status TEXT NOT NULL,  -- pending | approved | denied | revoked | redeemed
  created_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by_admin_id TEXT,
  consent_evidence_url TEXT,         -- PDF/scan of patient consent
  expires_at TIMESTAMPTZ,
  oemr_token_id TEXT,                -- reference to OpenEMR-minted token, for revocation
  oemr_refresh_token TEXT,           -- encrypted at rest
  audit_log_id UUID                  -- separate audit table, FK
);
```

Why a microservice and not a PHP route in OpenEMR? Two reasons:
- The approval workflow needs to be available even if OpenEMR is down for maintenance (queueing, retry).
- Keeps the OpenEMR PR surface small; the patch upstream is just "accept tokens minted by this trusted service."

~500-800 LoC + auth integration + a deploy unit. Call it **2 weeks** by a single developer.

#### A2. OpenEMR-side scoped-token mint endpoint (PHP patch — UPSTREAM PR)

This is the part that requires modifying OpenEMR. We need a way to ask OpenEMR
"mint an access token bound to {patient_id, scope, expires_at, audit_label}"
that is callable only by trusted services (the approval microservice).

The cleanest implementation:

- A new admin-protected route `POST /apis/default/system/mint-scoped-token` (placement: a new RestController under `src/RestControllers/Admin/`).
- Auth: SMART Backend Services with JWKS — the approval microservice presents
  a JWT signed by its private key, OpenEMR verifies against the registered JWKS.
  This is the standard SMART pattern for service-to-service auth and OpenEMR
  already has the building blocks.
- Body: `{ subject: string, patient_id: string, scopes: string[], expires_in: int, audit_label: string }`
- Response: `{ access_token, refresh_token, expires_in, jti }`. The `jti`
  becomes our handle for revocation later.
- The minted token's claims encode the patient restriction. The FHIR API layer
  then enforces it on every request: a token with `patient_restriction=PT-12345`
  must only return resources for that patient.
- Token revocation route: `POST /apis/default/system/revoke/:jti`.

This is the heaviest brick — it's a real OpenEMR PR. ~3-4 weeks if you do it
properly (tests, security review, upstream contribution). **2 weeks** if it
lives as a downstream-only fork.

If the team does NOT want to patch OpenEMR, the only alternative is to
pre-provision an OpenEMR user account per external doctor and use OpenEMR's
existing per-user ACL system to grant patient access. Cheaper to build but
gives every external doctor a permanent footprint in our system, which has its
own problems (offboarding, audit clutter, identity drift).

#### A3. Admin approval UI

Where it lives — two options:

| Option | Tradeoff |
|---|---|
| New tab in this SPA (`patient-portal`) | Re-uses our React infra; admin needs the same SPA installed; only works if admin is a clinician using the dashboard anyway |
| Standalone admin SPA at `/admin/` | Cleaner separation; doubles as the place to manage other admin tasks later |

I'd build it as a new top-level route in `patient-portal` (`/admin/access-requests`),
gated to users with the OpenEMR `admin` ACL. Same identity, same auth flow, same
deploy artifact — just an extra page. ~3-4 days.

The page shows: pending list → click → detail panel with NPI lookup
(`https://npiregistry.cms.hhs.gov/api/`) → "Verify identity" checklist →
"Patient consent on file" file upload → Approve/Deny buttons.

#### A4. Email infrastructure

Standard SMTP/SES/SendGrid. The email contains:
- The magic link (signed JWT, 24h TTL — separate from the OpenEMR access token TTL)
- The approval terms ("you've been granted access to PT-12345 for 24 hours; do not share this link")
- A revocation contact

~1 day of plumbing. Treat the magic-link JWT signing key with the same
seriousness as the OAuth signing key — same rotation policy, same vault.

#### A5. Audit log

Every access has to be logged. Schema:

```sql
CREATE TABLE remote_access_audit (
  id UUID PRIMARY KEY,
  access_request_id UUID NOT NULL REFERENCES access_requests(id),
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_email TEXT NOT NULL,
  patient_mrn TEXT NOT NULL,
  resource_type TEXT NOT NULL,    -- Patient | AllergyIntolerance | …
  resource_id TEXT,
  http_method TEXT NOT NULL,
  http_path TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
```

Populated by middleware in OpenEMR (or by the approval service if it sits in
front of OpenEMR as a reverse proxy — see "Anti-patterns" below for why that's
a bad idea). ~3 days for the OpenEMR-side middleware.

#### A6. SPA integration (this repo)

Three small additions in `patient-portal`:

- `/request-access` — public route showing the request form. Calls A1's `POST /access-requests`.
- `/redeem` — accepts magic-link tokens. Calls A1's `POST /redeem` to swap for an access_token, then drops into the dashboard.
- `/admin/access-requests` — admin approval UI (A3). Optional; could be a separate SPA.

Token store is generalized to accept "delegated" tokens (no refresh token, hard
TTL) in addition to the existing user tokens. ~3-5 days.

#### A7. Identity verification process (people, not code)

The admin's "verify identity" checklist needs to be defined. Realistic items:

- NPI lookup matches the requester's claimed name
- Practice name matches NPI registry
- Phone callback to the practice's published number (not the requester's claimed number)
- Or: an existing trust relationship (signed BAA, prior referral)

This is process, not code. But the admin UI (A3) needs to capture *evidence* of
each check (timestamps, who-did-what), because the audit story isn't complete
without it.

---

## 3. Workflow B — Live with admin approval (sugar on top of A)

Same scenario, but admin and requester are both online (e.g., a phone consult
between two doctors). The async email round-trip is too slow. Instead:

- Requester opens our SPA, picks "Live consult" mode → SPA generates a session id, opens a WebSocket to the approval service.
- SPA shows them: "Read this code over the phone: HX9-K2P-Q4R" + a QR.
- Admin opens `/admin/access-requests`, sees a "Live" tab with the code, the requester's claimed NPI, the patient they want.
- Admin clicks Approve → approval service mints the token (same path as A2) and pushes it to the requester's WebSocket.
- Requester's SPA stores the token and renders the dashboard.

**New brick beyond A:**

- **WebSocket transport** in the approval service (~150 LoC).
- **Live tab** in the admin UI showing in-flight sessions.
- **Code generator** (six-character human-readable, like `HX9-K2P`) for
  out-of-band code communication.

Everything else (token mint, audit, revocation) is identical to A. Build B
*after* A, never before — A is the one that exercises the harder parts of
the model (token mint, audit, revocation) and B is just a faster transport.

**Order of magnitude: 1 week** on top of A.

---

## 4. Workflow C — Federated identity (long-term, optional)

Eliminates "the external doctor needs to email us their identity claims."
Instead: their practice's IdP is registered with us as a trusted issuer; their
ID token comes pre-verified.

Requires:
- A trust registry — a small table of trusted IdPs, their JWKS URIs, their
  issuer values, and which kinds of access they can be auto-approved for.
- An IdP federation broker — code that validates incoming ID tokens against
  the registered IdPs, extracts identity claims, and creates the access request
  on the requester's behalf with `verified_by_idp=true`.
- An onboarding process for partner practices — they have to share their JWKS
  and we have to share ours.

This is **months** of work in real environments because the politics
(BAA negotiation, IT-to-IT trust setup) take longer than the code. Don't start
here. Build A and B first; C becomes obvious when you have 5+ partner practices
asking for it.

---

## 5. Brick inventory at a glance

| Brick | Lives in | Effort | Phase |
|---|---|---|---|
| A1. Approval microservice + DB | New service | ~2 weeks | First |
| A2. OpenEMR scoped-token mint endpoint | OpenEMR PHP patch | ~2-4 weeks | First |
| A3. Admin approval UI | This SPA (`/admin/access-requests`) | ~3-4 days | First |
| A4. Email infrastructure | New service | ~1 day | First |
| A5. Audit log + middleware | OpenEMR + dashboard | ~3 days | First |
| A6. SPA integration | This SPA | ~3-5 days | First |
| A7. Identity verification process (humans) | Operations playbook | — | First |
| B1. WebSocket transport | Approval service | ~1 week | Second |
| B2. Live admin UI | This SPA admin tab | ~3 days | Second |
| C1. Trust registry + IdP federation | Approval service | ~2-3 weeks | Third |
| C2. Partner-practice onboarding | Operations | months | Third |

**Total Phase 1 effort: ~6-8 weeks for one developer.** Not a Friday afternoon.

---

## 6. Phasing recommendation

```
┌─────────────────────────────────────────────────────────┐
│ Phase 0 (DONE):  Patient dashboard SPA                  │
│                  — local clinician auth via PKCE         │
│                  — runtime-configurable server URL       │
│                  — popup + link channels                 │
└─────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 1 (~6-8 weeks):  Async cross-practice access       │
│                  A1 + A2 + A3 + A4 + A5 + A6 + A7        │
│                  Outcome: external doctor submits a      │
│                  request; admin emails them a magic      │
│                  link; they view one patient, 24h, audit │
└─────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 2 (~1 week):  Live consult mode                    │
│                  B1 + B2                                 │
│                  Outcome: admin approves a session in    │
│                  real time over WebSocket                │
└─────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 3 (months):  Federated identity                    │
│                  C1 + C2                                 │
│                  Outcome: partner practices' IdPs are    │
│                  trusted; identity verification skips    │
│                  the human admin step for known origins  │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Anti-patterns — explicit don'ts

- **Don't put the approval service in front of OpenEMR as a reverse proxy.**
  Tempting because it'd let the service inject scope-restriction logic without
  patching OpenEMR. But it doubles the auth surface, breaks SMART discovery,
  and makes the FHIR responses go through a rewriter that has to understand
  every resource type. Keep OpenEMR's API surface direct; let the proxy only
  be the approval workflow's own API.

- **Don't reuse the SPA's existing PKCE client_id for delegated access.** A
  delegated token has fundamentally different lifecycle properties (no
  refresh, hard TTL, server-revocable, single-patient). Mint a separate client
  for the approval service so audit logs cleanly distinguish "admin acting on
  behalf of Dr. Smith" from "Dr. Smith logged in directly."

- **Don't put the patient consent capture inside the SPA.** The consent
  artifact (signed paper, e-signature, notarized release) is a legal document
  with retention requirements OpenEMR doesn't satisfy on its own. It belongs
  in a document management system that the admin uploads to during approval.
  The approval service stores a *reference* (URL + hash), not the document
  itself.

- **Don't auto-approve based on email domain match.** A `@hospital.example.com`
  email proves nothing about the sender's identity. Email is a notification
  channel, not an identity proof. Phase 3 (federated IdP) is the principled
  way to skip the human admin; until then, every approval is human-touched.

- **Don't build Workflow B before A.** Tempting because WebSockets feel
  modern. But A is what exercises the actual hard parts — token mint, audit,
  revocation. B is just a faster transport for the same approval. If you build
  B first you'll discover halfway through that you have no way to mint a
  scoped token, and the WebSocket work is moot.

- **Don't forget to revoke on deny.** Standard mistake: the approval service
  approves, mints a token, then later admin clicks "Deny" or "Revoke" and the
  token still works because nothing told OpenEMR. The mint endpoint MUST be
  paired with a revoke endpoint, and the revoke flow MUST be tested
  end-to-end before any external doctor sees a magic link.

---

## 8. Open questions for you

These need answers before Phase 1 starts:

1. **Who is the admin?** A specific role in OpenEMR? A new "delegation admin"
   role? An existing SuperAdmin? This drives A3's authorization model.

2. **Patient consent — how is it captured today?** Paper? Electronic
   signature? Pre-existing BAA with the partner practice? The answer
   determines whether A3 needs an upload widget or just a "consent on file ✓"
   checkbox with a reference number.

3. **Are external doctors going to be repeat visitors?** If yes (frequent
   referrals between two practices), Phase 3 (federated IdP) becomes
   load-bearing fast and Phase 1's per-request approval becomes a chore. If
   no (one-off consults), Phase 1 is sufficient indefinitely.

4. **Do we need offline access?** Some specialists annotate records offline
   and sync later. If yes, we need a "download a redacted bundle" feature
   that's a different brick set entirely (FHIR Bulk Data Export with
   patient-level scoping). Not in this design.

5. **Token TTL policy?** The brief says "time-boxed" but how long is right? 1
   hour is too short for a real consult; 30 days is too long. 24 hours plus an
   admin-driven "extend by 24h" button is a reasonable starting default.

6. **What about read-write?** This whole design assumes the external doctor
   only *reads* records. If they need to write (e.g., add an encounter note,
   send a referral acceptance), the scope set doubles and so does the audit
   surface.

Once those are answered, the Phase 1 plan can be turned into a real ticketed
sprint with assignees and a delivery date. The unknowns above are
business/policy questions, not engineering ones — engineering can't pick the
right shape until they're settled.

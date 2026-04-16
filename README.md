# Smart Weather Shield

Production-ready MERN system for rainfall-linked partner payouts.

## System Workflow

1. User completes profile with city and rain threshold.
2. User selects plan on Plans page.
3. Backend activates plan and creates/updates one active policy.
4. Daily claim automation runs in two paths:
  - On dashboard/claims/history load (on-demand automation)
  - In background scheduler (server-side periodic sweep)
5. Claim service always creates/updates one claim record per user per local day.
6. Claim status lifecycle:
  - `not_eligible` -> `eligible` -> `claimed` -> `approved` or `rejected`
7. UI only displays backend claim status; no fake eligibility logic.

## Claim Consistency Rules

- Local date only is used for claim day boundaries.
- Claim uniqueness is enforced by compound index: `(userId, date)`.
- Multiple same-day refresh calls update the same record.
- Terminal statuses (`claimed`, `approved`, `rejected`) are not overwritten by eligibility refresh.
- Strict guard: no active policy means no claim creation and no payout creation.

## No Policy Behavior

When user has no active policy:

- Claim APIs do not create daily claim records.
- Dashboard API returns policy-gated payload:
  - `hasPolicy: false`
  - `rainMm`
  - `threshold`
  - `predictedLoss`
  - `showTakePolicy: true`
- Dashboard UI hides eligibility/claim/payout actions and shows CTA:
  - `Take Policy to Recover Payout`

## Policy and Plan Rules

- Plan selection is the source of policy activation.
- One active policy per user.
- Active policy city is synchronized with partner profile city.
- Existing users with active plan profile are backfilled safely.

## Backend Setup

1. Create env file:
  - Copy `server/.env.example` to `server/.env`
2. Configure required vars:
  - `MONGO_URI`
  - `JWT_SECRET`
  - `OPENWEATHER_API_KEY`
3. Optional scheduler vars:
  - `AUTO_CLAIM_SCHEDULER_ENABLED=true`
  - `AUTO_CLAIM_SCAN_INTERVAL_MS=1800000`
  - `AUTO_CLAIM_SCHEDULER_STARTUP_DELAY_MS=5000`
  - `AUTO_CLAIM_SCHEDULER_BATCH_SIZE=25`
4. Optional AI/ML add-on vars:
  - `ML_SERVICE_URL=https://devtrails-ml-service.onrender.com/predict`
  - `ML_SERVICE_TIMEOUT_MS=10000`

Run backend:

```bash
cd server
npm install
npm run dev
```

## AI/ML Microservice (FastAPI)

The AI risk model is a separate Python service in [ml-service](ml-service) and does not replace existing backend logic.

### Recommended (Most Reliable) Run Path: Docker

```bash
cd ml-service
docker build -t devtrails-ml .
docker run --rm -p 5001:5001 devtrails-ml
```

This build step trains the RandomForestRegressor model and starts a FastAPI server:

- `GET /health`
- `POST /predict` -> `{ "risk_score": 0..1 }`

### Local Python Run (If Interpreter Is Healthy)

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python train_model.py
uvicorn app:app --host 0.0.0.0 --port 5001
```

## Frontend Setup

```bash
cd client
npm install
npm run dev
```

## Key API Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/partner/profile`
- `GET /api/partner/profile`
- `POST /api/plan/activate`
- `GET /api/policy/:userId`
- `POST /api/claim/auto`
- `POST /api/claim/redeem`
- `GET /api/claim/my`
- `GET /api/claim/all` (insurer)

## Standard Claim Response

Claim automation and claim detail flows return:

```json
{
  "success": true,
  "claim": {},
  "eligible": true,
  "status": "eligible"
}
```

`claim` is never intentionally returned as null from successful claim automation.

## Process Checklist

### New user

1. Register/login
2. Save profile with city
3. Select plan
4. Open dashboard
5. Verify claim record exists for today

### Existing user

1. Login
2. Open dashboard
3. Verify same-day claim updates, no duplicates

### Insurer

1. Open full claim history endpoint
2. Verify both `eligible` and `not_eligible` claims are visible

## Test Commands

Backend smoke test:

```bash
cd server
npm run test:claim
```

Frontend build check:

```bash
cd client
npm run build
```

## Operations Runbook

### Startup Expectations

When backend starts, you should see scheduler startup logging and then periodic run summaries.

Expected scheduler lifecycle:

1. Server boot completes.
2. Scheduler starts after startup delay.
3. Scheduler scans active-policy users in batches.
4. Scheduler logs run summary with processed counters.

### Scheduler Metrics to Monitor

Track these values from scheduler logs:

- `checkedUsers`: active-policy users considered in scan.
- `createdOrUpdatedClaims`: users for whom today claim was created/updated.
- `skippedUsers`: users skipped (already had claim, incomplete profile, inactive plan, etc).
- `failedUsers`: unexpected processing failures.
- `durationMs`: total run duration.

Healthy baseline:

- `failedUsers` close to `0`
- `durationMs` stable for your user volume
- `createdOrUpdatedClaims` spikes around local-day turnover and first daily run window

### Alerting Recommendations

Set alerts if any of the following persist:

- `failedUsers > 0` for consecutive scheduler runs
- `durationMs` continuously increasing across runs
- sudden drop to `createdOrUpdatedClaims = 0` during expected active periods

### Incident Triage Steps

1. Confirm backend is running and scheduler is enabled.
2. Verify environment values:
  - `AUTO_CLAIM_SCHEDULER_ENABLED`
  - `AUTO_CLAIM_SCAN_INTERVAL_MS`
  - `AUTO_CLAIM_SCHEDULER_BATCH_SIZE`
3. Check weather API health (`OPENWEATHER_API_KEY`, rate limits, timeout errors).
4. Check MongoDB connectivity and unique index health on claims.
5. Sample one affected user:
  - profile has city
  - plan status is active
  - active policy exists
  - claim for current local date exists

### Recovery Actions

- If scheduler is disabled accidentally: enable env var and restart backend.
- If weather API is degraded: keep scheduler running; claims will self-heal on next successful runs.
- If data inconsistency appears: trigger on-demand claim automation by opening dashboard/claims or calling `POST /api/claim/auto` for affected users.

### Safe Rollout Process

1. Deploy backend with scheduler enabled and conservative interval.
2. Monitor first 3-5 scheduler summaries.
3. Validate claims for new and existing test users.
4. Tune scan interval and batch size based on runtime and load.
5. Promote settings to production baseline.

### Recommended Defaults

- `AUTO_CLAIM_SCHEDULER_ENABLED=true`
- `AUTO_CLAIM_SCAN_INTERVAL_MS=1800000` (30 min)
- `AUTO_CLAIM_SCHEDULER_STARTUP_DELAY_MS=5000`
- `AUTO_CLAIM_SCHEDULER_BATCH_SIZE=25`

For higher volumes, increase batch size gradually and verify `durationMs` and DB load before each step.


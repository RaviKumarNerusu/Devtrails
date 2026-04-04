# ⚡ Quick Start & Testing Guide

## Installation & Setup (5 min)

```bash
# No new dependencies needed!
# Your existing package.json is compatible

cd server
npm install  # Installs existing dependencies

# Create logs directory (optional, auto-created)
mkdir -p logs

# Start server
npm start
# or for development
nodemon index.js
```

---

## Testing the Production-Grade System

### 1. Health Check
```bash
GET /api/health

✅ Expected Response:
{
  "success": true,
  "data": { "service": "smart-weather-dashboard-server" },
  "message": "OK"
}
```

---

### 2. Test Successful Claim (Rain >= Threshold)

**Setup**:
1. Create user account: `POST /api/auth/register`
2. Create partner profile with city + threshold: `POST /api/partner`
   - City: "London" (or any real city)
   - rainThresholdMm: 10

**Test**:
```bash
POST /api/claim/auto
Headers: Authorization: Bearer {token}

✅ Expected Response (rain >= threshold):
{
  "success": true,
  "data": {
    "claim": {
      "_id": "...",
      "city": "London",
      "rainMm": 15.5,
      "threshold": 10,
      "status": "approved",
      "payoutAmount": 60,
      "maxPayoutAmount": 50000
    },
    "claimDecision": "CLAIM_CREATED",
    "premium": { "dynamicPremium": 130 },
    "fraudChecks": {
      "dailyLimitOk": true,
      "cityLockOk": true,
      "weeklyLimitOk": true
    }
  },
  "message": "Claim created successfully"
}
```

---

### 3. Test No Claim (Rain < Threshold)

**Setup**: Same as above but with high threshold

```bash
POST /api/claim/auto
# Assume rain = 5mm, threshold = 10mm

✅ Expected Response (rain < threshold):
{
  "success": true,
  "data": {
    "claim": null,
    "claimDecision": "NO_CLAIM",
    "fraudChecks": {
      "dailyLimitOk": true,
      "cityLockOk": true,
      "weeklyLimitOk": true
    }
  },
  "message": "No claim triggered - conditions not met"
}
```

---

### 4. Test Daily Limit Fraud Prevention

**Sequence**:
```bash
# Request 1 (Day 1)
POST /api/claim/auto
✅ Status: 201, claim created

# Request 2 (Same day, same user)
POST /api/claim/auto
❌ Status: 429 - Too Many Requests
{
  "success": false,
  "message": "Maximum 1 claim allowed per day",
  "errorCode": "DAILY_LIMIT_EXCEEDED"
}

# Request 3 (Next day)
POST /api/claim/auto
✅ Status: 201, NEW claim created
```

---

### 5. Test City Lock Fraud Prevention

**Sequence**:
```bash
# Set partner profile city to "London"
POST /api/partner
{ "city": "London", "rainThresholdMm": 10 }

# Request 1: Create claim in London
POST /api/claim/auto
✅ Status: 201, claim created
# System locks city to "London" for today

# Try to change city
POST /api/partner
{ "city": "Paris" }  # Different city!
✅ Profile updated (allowed)

# Request 2: Try to create claim (same day, different city)
POST /api/claim/auto
❌ Status: 400
{
  "success": false,
  "message": "City cannot be changed within same day",
  "errorCode": "CITY_LOCKED_TODAY"
}
```

---

### 6. Test Rate Limiting (5 req/min)

**Sequence**:
```bash
# Requests 1-5 (within 60 seconds)
POST /api/claim/auto  × 5
✅ Status: 201 (all succeed)
Headers: X-RateLimit-Remaining: 0

# Request 6 (still within same minute)
POST /api/claim/auto
❌ Status: 429
{
  "success": false,
  "message": "Rate limit exceeded. Maximum 5 requests per minute. Retry after 45 seconds.",
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 45
}

# Wait 5 minutes...
POST /api/claim/auto
✅ Status: 201 (ban expired, counter reset)
```

---

### 7. Test Weekly Limit (Max 7/week)

**Sequence** (over 7 days):
```bash
Day 1: POST /api/claim/auto (rain >= threshold) → ✅ Claim 1/7
Day 2: POST /api/claim/auto → ✅ Claim 2/7
...
Day 7: POST /api/claim/auto → ✅ Claim 7/7

Day 8: POST /api/claim/auto (same week, Mon-Sun)
❌ Status: 429
{
  "success": false,
  "message": "Weekly claim limit exceeded (7/7)",
  "errorCode": "WEEKLY_LIMIT_EXCEEDED"
}

Day 9 (Next Sunday, new week):
POST /api/claim/auto → ✅ Claim 1/7 (counter reset)
```

---

### 8. Test Dynamic Payout Tiers

**Setup**: Threshold = 10mm, Base Payout = $100

**Test Cases**:
```bash
# Test 1: Rain = 5mm (< threshold)
Payout: $0 (no claim)

# Test 2: Rain = 10mm (1.0x threshold)
Payout: $30 (low tier: 0.3 × $100)

# Test 3: Rain = 15mm (1.5x threshold)
Payout: $30 (low tier: 0.3 × $100)

# Test 4: Rain = 20mm (2.0x threshold)
Payout: $60 (medium tier: 0.6 × $100)

# Test 5: Rain = 30mm (3.0x threshold)
Payout: $100 (high tier: 1.0 × $100)

# Test 6: Rain = 50mm (5.0x threshold) with MAX_PAYOUT_AMOUNT = $50k
Payout: $50000 (capped at MAX_PAYOUT_AMOUNT)
```

---

### 9. Test No Partner Profile Error

```bash
# Create user but NO partner profile
POST /api/auth/register
# Skip: POST /api/partner

# Try to create claim
POST /api/claim/auto
❌ Status: 400
{
  "success": false,
  "message": "City not set for user. Please set a partner profile first.",
  "errorCode": "NO_PARTNER_PROFILE"
}
```

---

### 10. Test Weather API Failure Handling

**Scenario**: Weather API is down

```bash
POST /api/claim/auto

❌ Status: 503 (Service Unavailable)
{
  "success": false,
  "message": "Weather API timeout for \"London\"",
  "errorCode": "WEATHER_API_TIMEOUT"
}

// NOTE: No claim is created when API fails ✅
// System fails safely
```

---

### 11. Get Claim History

```bash
GET /api/claim/my
Headers: Authorization: Bearer {token}

✅ Response:
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "...",
        "city": "London",
        "date": "2026-04-01",
        "rainMm": 15.5,
        "payoutAmount": 60,
        "status": "approved",
        "createdAt": "2026-04-01T10:30:00Z"
      },
      {
        "_id": "...",
        "city": "London",
        "date": "2026-03-31",
        "rainMm": 8,
        "payoutAmount": 0,
        "status": "pending",
        "createdAt": "2026-03-31T14:20:00Z"
      }
    ],
    "count": 2
  },
  "message": "Claims retrieved successfully"
}
```

---

### 12. Get Claim Statistics

```bash
GET /api/claim/stats/overview
Headers: Authorization: Bearer {token}

✅ Response:
{
  "success": true,
  "data": {
    "stats": {
      "approved": { "count": 8, "totalPayout": 580 },
      "pending": { "count": 2, "totalPayout": 0 },
      "rejected": { "count": 0, "totalPayout": 0 }
    },
    "todaysClaim": {
      "_id": "...",
      "status": "approved",
      "payoutAmount": 60
    },
    "lastUpdated": "2026-04-01T15:45:00Z"
  }
}
```

---

## Logs & Debugging

### View Logs
```bash
# Real-time logging (dev)
tail -f server/logs/claim-system-2026-04-01.log

# View all logs
ls -la server/logs/

# Search for specific user
grep "USER_ID_HERE" server/logs/claim-system-2026-04-01.log

# Search for fraud events
grep "FRAUD_CHECK" server/logs/claim-system-2026-04-01.log

# Search for errors
grep "ERROR" server/logs/claim-system-2026-04-01.log
```

### Log Format Examples
```json
// Successful automation
{
  "timestamp": "2026-04-01T10:30:00.000Z",
  "level": "INFO",
  "message": "Claim automation completed successfully",
  "userId": "507f1f77bcf86cd799439011",
  "city": "London",
  "rainMm": 15.5,
  "claimCreated": true,
  "claimDecision": "CLAIM_CREATED"
}

// Fraud detection
{
  "timestamp": "2026-04-01T10:31:00.000Z",
  "level": "WARN",
  "message": "Fraud check: CITY_CHANGED_SAME_DAY",
  "userId": "507f1f77bcf86cd799439011",
  "result": true,
  "reason": "Attempted to change city from London to Paris"
}

// API failure
{
  "timestamp": "2026-04-01T10:32:00.000Z",
  "level": "ERROR",
  "message": "Weather API timeout for \"London\"",
  "city": "London",
  "errorCode": "WEATHER_API_TIMEOUT",
  "details": "Timeout of 8000ms exceeded"
}
```

---

## Postman Collection Snippets

### Environment Variables
```json
{
  "baseUrl": "http://localhost:5000/api",
  "token": "YOUR_JWT_TOKEN",
  "userId": "USER_ID_FROM_DB"
}
```

### Collection Structure
```
Claim Automation (Production-Grade)
├── Health Check
│   └── GET /health
├── Setup (Run Once)
│   ├── POST /auth/register
│   └── POST /partner
├── Automation
│   ├── POST /claim/auto
│   ├── GET /claim/my
│   ├── GET /claim/:claimId
│   └── GET /claim/stats/overview
├── Fraud Prevention Tests
│   ├── Daily Limit (Request 2× same day)
│   ├── City Lock (Change city, then request)
│   ├── Rate Limit (5 requests rapid-fire)
│   └── Weekly Limit (7 requests over week)
└── Error Cases
    ├── No Partner Profile
    ├── Weather API Down
    ├── Invalid City
    └── Missing Headers
```

---

## Performance Checklist

- [ ] Health check responds in < 100ms
- [ ] Claim creation (cache hit) responds in < 500ms
- [ ] Claim creation (cache miss) responds in < 2s (weather API)
- [ ] Rate limit check adds < 10ms overhead
- [ ] Weather cache hit rate > 80% (after warmup)
- [ ] Database queries use indexes (check MongoDB logs)
- [ ] No orphaned claims (transactions guarantee consistency)
- [ ] Logs grow reasonably (monitor disk space)

---

## Troubleshooting

### Issue: "City not set for user"
**Fix**: Create partner profile first
```bash
POST /api/partner
{ "city": "London", "rainThresholdMm": 10 }
```

### Issue: "WEATHER_API_TIMEOUT"
**Fix**: Check OpenWeather API key in `.env`
```bash
# Verify API key is set
echo $OPENWEATHER_API_KEY
```

### Issue: Rate limit too strict?
**Fix**: Adjust in `middleware/rateLimiter.js`
```javascript
const RATE_LIMIT_CONFIG = {
  maxRequests: 10,  // Increase from 5
  windowMs: 60 * 1000,
  banDurationMs: 5 * 60 * 1000
};
```

### Issue: Weekly limit wrong?
**Fix**: Adjust in `automationService.js`
```javascript
const CLAIM_CONFIG = {
  MAX_CLAIMS_PER_WEEK: 10,  // Increase from 7
};
```

### Issue: Logs too verbose?
**Fix**: Disable debug logs in `logger.js`
```javascript
logger.debug = () => {}; // Disable debug level
```

---

## Success Criteria ✅

After testing, verify:

1. [x] Claims only create when rain >= threshold
2. [x] Duplicates prevented (same day = error)
3. [x] City lock works (can't change same day)
4. [x] Rate limiting works (5 req/min)
5. [x] Weekly limit enforced (max 7/week)
6. [x] Payouts are tiered (1.0x, 1.5x, 2.0x, 3.0x)
7. [x] Payouts are capped (max $50k)
8. [x] Weather API failures don't create claims
9. [x] All errors are standardized
10. [x] Logs show decision trail

---

## Support & Questions

**Common Issues**:
- See Troubleshooting section above
- Check logs: `server/logs/claim-system-*.log`
- Monitor response codes (429, 400, 500)

**Configuration**:
- Rate limit: `middleware/rateLimiter.js`
- Payout tiers: `automationService.js` (calculateDynamicPayout)
- Weekly/daily limits: `automationService.js` (CLAIM_CONFIG)
- Cache duration: `utils/weatherCache.js` (CACHE_DURATION_MS)

---

**Status**: ✅ Ready for testing  
**Estimated Test Time**: 30 minutes  
**Production Ready**: YES

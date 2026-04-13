# Devtrails Final Pitch Deck

## Slide 1: Problem
- Gig and delivery workers lose income during weather and disruption events.
- Traditional insurance claims are too slow and too manual for daily income protection.
- Workers need fast, transparent, automated protection.

## Slide 2: Solution
- Devtrails is an AI-powered parametric insurance platform.
- It detects disruption risk, calculates weekly premiums, auto-generates claims, and simulates instant payout.
- Built for worker income protection, not health or vehicle coverage.

## Slide 3: Worker Persona
- Delivery worker with variable weekly income.
- Exposure to heat, heavy rain, floods, pollution, curfews, and zone closures.
- Needs affordable weekly coverage and fast recovery after disruption.

## Slide 4: Product Workflow
- Login -> ML risk score -> Weekly premium -> Weather trigger monitoring -> Auto claim -> Fraud checks -> Approved or rejected -> Simulated payout -> Wallet update.

## Slide 5: AI + Fraud Architecture
- Python ML microservice predicts `risk_score` from weather, AQI, claims, and location risk.
- Fraud service checks repeated claims, invalid weather claims, city volatility, and historical anomalies.
- Trigger engine runs hourly with node-cron.

## Slide 6: Weekly Pricing Model
- Premium is computed weekly from risk score.
- Formula: `premium = 100 * (1 + risk_score)`.
- Low risk gets a discount, high risk gets a surcharge.
- Keeps pricing simple, explainable, and demo-friendly.

## Slide 7: Instant Payout (Simulated)
- Approved claims trigger a simulated gateway payout.
- Wallet balance updates immediately after approval.
- Claim audit trail stores transaction metadata for demo proof.

## Slide 8: Dashboard Analytics
- Worker dashboard shows risk score, weekly premium, active triggers, and claim status.
- Insurer dashboard shows total claims, loss ratio, and predicted next-week disruption claims by city.
- Data is pulled from backend APIs and rendered without UI redesign.

## Slide 9: Phase 3 Outcomes
- Advanced fraud detection for delivery context.
- Instant payout simulation.
- Intelligent worker and insurer dashboards.
- Automated parametric claim pipeline.

## Slide 10: Demo Evidence
- Dashboard screenshots.
- Claim lifecycle screenshots.
- Fraud and payout logs.
- Analytics screenshots.
- Final demo video link to be attached separately.

## Slide 11: Go-to-Market
- Pilot with gig workers and delivery fleets.
- Expand city by city.
- Offer weekly pricing for affordability and trust.

## Slide 12: Ask
- Pilot support.
- Insurer partnerships.
- Platform access for live testing and rollout.

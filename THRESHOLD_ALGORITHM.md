# Threshold Calculation Algorithm

## Purpose
This document defines a practical algorithm to calculate a rainfall threshold (in mm) for payout eligibility.

The threshold should be:
- Adaptive to local rain patterns
- Stable across normal fluctuations
- Bounded to avoid extreme values

## Formula
Use the last 30 days of daily rainfall values:

- Mean rainfall: $\mu$
- 90th percentile rainfall: $P_{90}$

Compute raw threshold:

$$
T_{raw} = 0.7\mu + 0.3P_{90}
$$

Apply safety bounds:

$$
T = \text{clamp}(8, 40, T_{raw})
$$

Where clamp is:
- If $T_{raw} < 8$, then $T = 8$
- If $T_{raw} > 40$, then $T = 40$
- Otherwise, $T = T_{raw}$

## Claim Trigger Rule
A claim is eligible when:

$$
\text{todayRainMm} \geq T
$$

## Step-by-Step Algorithm
1. Collect daily rainfall (mm) for the last 30 days.
2. Calculate mean rainfall $\mu$.
3. Calculate 90th percentile rainfall $P_{90}$.
4. Compute $T_{raw} = 0.7\mu + 0.3P_{90}$.
5. Clamp to range [8, 40] to get final threshold $T$.
6. Compare today rainfall with $T$ for eligibility.

## Pseudocode
```text
input: rain[30] // daily rainfall in mm
mu = mean(rain)
p90 = percentile(rain, 90)
rawT = 0.7 * mu + 0.3 * p90
T = clamp(rawT, 8, 40)

claimEligible = (todayRainMm >= T)
```

## Example
Given last-30-day stats:
- $\mu = 12.0$
- $P_{90} = 24.0$

Then:

$$
T_{raw} = 0.7(12) + 0.3(24) = 8.4 + 7.2 = 15.6
$$

After clamp:

$$
T = 15.6
$$

If today rain is:
- 14.0 mm -> Not eligible
- 15.6 mm -> Eligible
- 18.0 mm -> Eligible

## Recommended Defaults
- Lookback window: 30 days
- Minimum threshold: 8 mm
- Maximum threshold: 40 mm
- Recalculation frequency: once daily (or weekly if you prefer smoother behavior)

## Optional Simpler Variant
If percentile support is not available:

$$
T = \text{clamp}(8, 40, 1.2\mu)
$$

This is easier but less responsive to heavy-rain tails than the primary formula.

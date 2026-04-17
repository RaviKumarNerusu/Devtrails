# Income Guard AI - ML Algorithm Overview

## 1. Primary Algorithm: Random Forest Regressor (Risk Prediction)

### Location
- **Service**: `ml-service/train_model.py`
- **Endpoint**: `/predict` at ML service
- **Purpose**: Predict parametric claim risk scores based on environmental factors

### Algorithm Details
```
Algorithm Type: Ensemble Learning (Tree-Based)
Configuration:
  - Trees (n_estimators): 200
  - Max Depth: 12
  - Min Samples Split: 4
  - Min Samples Leaf: 2
  - Random Seed: 42
```

### Input Features
1. **Temperature** (°C) - Weather condition indicator
2. **Rainfall** (mm) - Precipitation level
3. **AQI** (Air Quality Index) - Air pollution level (0-500+)
4. **Past Claims** - Historical claim count
5. **Location Risk** - Geographic risk factor (0-1)

### Output
```json
{
  "risk_score": 0.0-1.0,  // Normalized risk prediction
  "factors": {            // Feature importance breakdown
    "temperature": 0.2,
    "rainfall": 0.25,
    "AQI": 0.2,
    "past_claims": 0.2,
    "location_risk": 0.25
  },
  "model_version": "v1.0"
}
```

### How It Works
1. **Training**: Generates 1000 mock samples with synthetic weather + historical data
2. **Regression**: Predicts continuous risk score [0, 1]
3. **Feature Importance**: Random Forest automatically ranks which factors matter most
4. **Validation Metric**: Mean Absolute Error (MAE) - targets < 0.10

### Why Random Forest?
✅ Handles non-linear patterns (weather ↔ claims correlation)
✅ Provides interpretable feature importance
✅ Robust to outliers and missing values
✅ Fast inference for real-time claims processing
✅ No feature scaling required

---

## 1.5 Loss Functions & Evaluation Metrics

### Training Loss: Mean Squared Error (MSE)

**Used by**: Random Forest internally for split optimization

**Formula**:
$$\text{MSE} = \frac{1}{n} \sum_{i=1}^{n} (y_i - \hat{y}_i)^2$$

**Where**:
- $y_i$ = actual risk score
- $\hat{y}_i$ = predicted risk score
- $n$ = number of samples

**Characteristics**:
- Penalizes larger errors more heavily (quadratic penalty)
- Sensitive to outliers
- Differentiable (good for gradient-based optimization)
- Default for scikit-learn's RandomForestRegressor

### Validation Metric: Mean Absolute Error (MAE)

**Used for**: Model performance evaluation

**Formula**:
$$\text{MAE} = \frac{1}{n} \sum_{i=1}^{n} |y_i - \hat{y}_i|$$

**Characteristics**:
- Linear penalty for errors (more interpretable)
- Less sensitive to outliers than MSE
- Represents average absolute deviation in risk scores
- Target: MAE < 0.10 (±0.10 risk score deviation)

**Example**:
```
Prediction: 0.65
Actual: 0.72
Error: |0.72 - 0.65| = 0.07 ✅ (within acceptable range)
```

### Loss Comparison

| Loss Function | Formula | Use Case | Sensitivity |
|---------------|---------|----------|-------------|
| **MSE** (used) | $\sum(y - \hat{y})^2$ | Tree training | High (outliers) |
| **MAE** (used) | $\sum\|y - \hat{y}\|$ | Evaluation | Medium |
| **RMSE** | $\sqrt{\frac{1}{n}\sum(y-\hat{y})^2}$ | Alternative metric | High |
| **Huber Loss** | Hybrid MSE/MAE | Robust regression | Medium |
| **Log Loss** | $-\sum y\log(\hat{y})$ | Classification | N/A |

### Why MSE for Training + MAE for Validation?

1. **MSE for Training**:
   - Random Forest uses tree splits that minimize MSE
   - Larger errors get bigger penalty → better corner-case handling
   - Standard for regression tasks

2. **MAE for Validation**:
   - More interpretable for business logic
   - If MAE = 0.08, average prediction error is ±0.08
   - Less influenced by rare extreme weather events
   - Better represents real-world claim risk variation

### Current Performance

```
Model: Random Forest (200 trees, depth 12)
Validation MAE: ~0.08-0.12
Interpretation: Average prediction error ≈ 8-12% of risk score scale
Acceptable Range: ✅ (target < 0.10)
```

### Alternative Loss Functions (Not Used)

| Loss | Pros | Cons | When to Use |
|------|------|------|------------|
| **Huber Loss** | Robust to outliers | More complex | Noisy weather data |
| **Quantile Loss** | Predict confidence intervals | Different interpretation | Risk percentiles |
| **Log-Cosh Loss** | Smooth MSE approximation | Computationally heavier | Outlier mitigation |
| **Focal Loss** | Emphasize hard examples | Classification-focused | Not applicable |

---

## 2. Secondary Algorithm: Rule-Based Fraud Detection

### Location
- **Service**: `server/services/fraudService.js`
- **Purpose**: Detect suspicious claim patterns
- **Type**: Deterministic heuristic engine (not statistical ML)

### Scoring Logic

#### A. Claim Velocity (Temporal Frequency)
```
2+ claims in 1 hour        → score += 0.25
3+ claims in 1 hour        → AUTO REJECT
3+ claims in 6 hours       → AUTO REJECT
3+ claims in 24 hours      → score += 0.2
5+ claims in 7 days        → score += 0.3
```

#### B. Pattern Recognition
```
Same trigger type 3+ times       → score += 0.3
Hourly pattern match 3+ times    → score += 0.2
```

#### C. Weather Validation
```
Trigger mismatch (e.g., "rain" claim but no rainfall) → score += 0.4
```

#### D. Geographic Mismatch
```
Location inconsistency detected → score += 0.25
```

#### E. Risk Integration
```
High risk (>0.7) + 4+ claims in 7 days → score += 0.1
```

### Final Score
```
fraud_score = clamp(sum_of_signals, 0.0, 1.0)
should_reject = (fraud_score > 0.7) || (auto_reject_flag)
```

### Output
```json
{
  "fraud_score": 0.0-1.0,
  "fraud_reason": "High frequency; Invalid disruption trigger",
  "should_reject": true/false,
  "claims1h": 2,
  "claims6h": 3,
  "claims24h": 5,
  "claims7d": 8
}
```

### Loss Function: Weighted Risk Penalty (Heuristic)

**Type**: Rule-based scoring (not statistical loss)

**Formula**:
$$\text{fraud\_score} = \text{clamp}\left(\sum_{i=1}^{k} w_i \cdot s_i, 0, 1\right)$$

**Where**:
- $w_i$ = weight of signal $i$ (0.25, 0.3, 0.4, etc.)
- $s_i$ = signal detection (binary: 0 or 1)
- $k$ = number of fraud signals

**Scoring Breakdown**:
```
Fraud Signal                                    Weight  Penalty
─────────────────────────────────────────────────────────────
2+ claims in 1 hour                             0.25    +0.25
Same trigger type 3+ times                      0.30    +0.30
Invalid disruption trigger (weather mismatch)   0.40    +0.40
Location mismatch detected                      0.25    +0.25
High risk (>0.7) + 4+ claims in 7 days         0.10    +0.10
─────────────────────────────────────────────────────────────
                                    Maximum:           ~1.70
                                    After clamp:       1.00 ✓
```

**Decision Threshold**:
```
fraud_score > 0.70 → REJECT or MANUAL REVIEW
fraud_score ≤ 0.70 → APPROVE
```

**Auto-Reject Conditions** (bypass threshold):
- 3+ claims in 1 hour
- 3+ claims in 6 hours

### Example Fraud Score Calculation

**Scenario**: User submits 3 claims in 2 hours during heavy rain

```
Detected Signals:
  ✓ 2+ claims in 1 hour           → +0.25
  ✓ Same trigger type (rain) 3x   → +0.30
  ✗ Valid weather (it IS raining) → +0.00
  ✓ Unknown location mismatch      → +0.25
  ✗ Not high risk yet              → +0.00
                                   ────────
                    Total Score:    0.80
                                   
Decision: fraud_score (0.80) > 0.70 threshold
Result: ❌ REJECT or MANUAL REVIEW
```

### Why Weighted Heuristics Instead of ML?

1. **Interpretability**: Clear rules for fraud analysts
2. **Explainability**: Easy to explain why claim was rejected
3. **Real-time**: <10ms response time
4. **No Training Data Needed**: Rule-based logic works immediately
5. **Conservative**: Avoids false positives harming customers

### Alternative Scoring Methods (Not Used)

| Method | Pros | Cons | When to Use |
|--------|------|------|------------|
| **Logistic Regression** | Statistical basis | Requires labeled data | With historical frauds |
| **Anomaly Detection (IF)** | Find outliers | Hard to tune | New fraud patterns |
| **Ensemble (RF + Rules)** | Best of both | Complex | High-stakes decisions |
| **Bayesian Network** | Probabilistic | Computationally heavy | Expert system |

---

## 3. Integration: Hybrid Decision Logic

### Claim Evaluation Pipeline
```
User Submits Claim
        ↓
Validate Basic Fields (message validation)
        ↓
Extract Weather Data (temperature, rainfall, AQI)
        ↓
Query ML Service for Risk Score (Random Forest)
        ↓
Run Fraud Detection (Rule-based scoring)
        ↓
Combine Signals:
    - If fraud_score > 0.7 → REJECT or MANUAL REVIEW
    - If risk_score > 0.8 AND high_velocity → REJECT
    - If all checks pass → APPROVE
        ↓
Log Decision (AuditLog)
        ↓
Process Payout
```

---

## 4. Alternative Algorithms (Not Currently Used)

| Algorithm | Pros | Cons | Best For |
|-----------|------|------|----------|
| **Logistic Regression** | Simple, interpretable | Low complexity, linear only | Binary fraud classification |
| **Gradient Boosting (XGBoost)** | Better accuracy, faster | Requires tuning, overfitting risk | Complex non-linear patterns |
| **Neural Networks** | Complex patterns, state-of-art | Black-box, needs lots of data | Deep pattern recognition |
| **Isolation Forest** | Anomaly detection specialist | Requires retraining, slower | Outlier fraud detection |
| **K-Means Clustering** | Unsupervised grouping | Needs domain knowledge | Risk tier segmentation |
| **SVM** | Good non-linear boundary | Slow training, memory-heavy | Binary classification |

---

## 5. Model Training & Deployment

### Current Setup
- **Training**: On-demand via `train_model.py` (generates synthetic dataset)
- **Serialization**: Joblib format (`model.pkl`)
- **Deployment**: FastAPI service (`ml-service/app.py`)
- **Port**: `5001` (configurable via `ML_SERVICE_PORT`)

### How to Retrain
```bash
cd ml-service
python train_model.py
# Generates: model.pkl + validation MAE
```

### API Endpoint
```
POST /predict
Content-Type: application/json

{
  "temperature": 32.5,
  "rainfall": 45.2,
  "aqi": 150,
  "past_claims": 3,
  "location_risk": 0.6
}
```

---

## 6. Performance Metrics

### Random Forest
- **Validation MAE**: ~0.08-0.12 (on synthetic data)
- **Inference Time**: <50ms per prediction
- **Model Size**: ~2-5MB (model.pkl)

### Fraud Detection
- **Execution Time**: <10ms (rule-based)
- **Precision**: Manually tuned thresholds (conservative)

---

## 7. Future Improvements

1. **Real Data Training**: Replace synthetic dataset with production claim history
2. **Feature Engineering**: Add temporal seasonality, geographic regions, policy type
3. **Model Ensembles**: Combine Random Forest + XGBoost for hybrid predictions
4. **Online Learning**: Incrementally update model as new claims arrive
5. **Explainability**: Add SHAP values for individual prediction explanations
6. **Monitoring**: Track model drift and recalibrate monthly

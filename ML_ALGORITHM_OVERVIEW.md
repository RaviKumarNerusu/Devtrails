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

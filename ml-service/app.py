import os
import joblib
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from train_model import train_and_save_model

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.pkl")
app = FastAPI(title="Risk ML Service", version="1.0.0")


class PredictRequest(BaseModel):
    temperature: float = 0.0
    rainfall: float = 0.0
    aqi: float = 0.0
    past_claims: float = 0.0
    location_risk: float = 0.0


def _load_model():
    if not os.path.exists(MODEL_PATH):
        train_and_save_model()
    return joblib.load(MODEL_PATH)


model = _load_model()
FEATURE_NAMES = ["temperature", "rainfall", "AQI", "past_claims", "location_risk"]
MODEL_VERSION = "v1.0"


@app.get("/")
def root():
    return {
        "ok": True,
        "service": "risk-ml-service",
        "endpoints": ["/health", "/predict", "/docs"],
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "risk-ml-service"}


@app.post("/predict")
def predict(payload: PredictRequest):

    features = np.array(
        [
            [
                float(payload.temperature),
                float(payload.rainfall),
                float(payload.aqi),
                float(payload.past_claims),
                float(payload.location_risk),
            ]
        ]
    )

    prediction = float(model.predict(features)[0])
    risk_score = float(np.clip(prediction, 0.0, 1.0))

    importances = getattr(model, "feature_importances_", None)
    if importances is None or len(importances) != len(FEATURE_NAMES):
        factors = {name: 0.0 for name in FEATURE_NAMES}
    else:
        factors = {
            name: float(np.clip(importance, 0.0, 1.0))
            for name, importance in zip(FEATURE_NAMES, importances)
        }

    return {
        "risk_score": risk_score,
        "factors": factors,
        "model_version": MODEL_VERSION
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("ML_SERVICE_PORT", "5001")))

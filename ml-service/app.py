import os
import joblib
import numpy as np
from flask import Flask, request, jsonify

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.pkl")

app = Flask(__name__)


def _coerce_float(payload: dict, key: str, default: float = 0.0) -> float:
    try:
        return float(payload.get(key, default))
    except (TypeError, ValueError):
        return default


def _load_model():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError("model.pkl was not found. Run train_model.py first.")
    return joblib.load(MODEL_PATH)


model = _load_model()


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "risk-ml-service"})


@app.post("/predict")
def predict():
    payload = request.get_json(silent=True) or {}

    features = np.array(
        [
            [
                _coerce_float(payload, "temperature"),
                _coerce_float(payload, "rainfall"),
                _coerce_float(payload, "aqi"),
                _coerce_float(payload, "past_claims"),
                _coerce_float(payload, "location_risk"),
            ]
        ]
    )

    prediction = float(model.predict(features)[0])
    risk_score = float(np.clip(prediction, 0.0, 1.0))

    return jsonify({"risk_score": risk_score})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("ML_SERVICE_PORT", "5001")))

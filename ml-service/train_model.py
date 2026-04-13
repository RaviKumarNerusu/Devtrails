import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import joblib

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.pkl")
RANDOM_SEED = 42


def generate_mock_dataset(rows: int = 1000) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_SEED)

    temperature = rng.uniform(10, 48, rows)
    rainfall = rng.uniform(0, 350, rows)
    aqi = rng.uniform(20, 450, rows)
    past_claims = rng.integers(0, 25, rows)
    location_risk = rng.uniform(0, 1, rows)

    # Create a synthetic but bounded risk score target in [0, 1]
    raw = (
        0.20 * (temperature / 50)
        + 0.25 * (rainfall / 350)
        + 0.20 * (aqi / 500)
        + 0.20 * (past_claims / 25)
        + 0.25 * location_risk
        + rng.normal(0, 0.03, rows)
    )

    risk_score = np.clip(raw, 0, 1)

    return pd.DataFrame(
        {
            "temperature": temperature,
            "rainfall": rainfall,
            "aqi": aqi,
            "past_claims": past_claims,
            "location_risk": location_risk,
            "risk_score": risk_score,
        }
    )


def train_and_save_model() -> None:
    dataset = generate_mock_dataset(1000)
    features = dataset[["temperature", "rainfall", "aqi", "past_claims", "location_risk"]]
    target = dataset["risk_score"]

    x_train, x_test, y_train, y_test = train_test_split(
        features, target, test_size=0.2, random_state=RANDOM_SEED
    )

    model = RandomForestRegressor(
        n_estimators=200,
        random_state=RANDOM_SEED,
        max_depth=12,
        min_samples_split=4,
        min_samples_leaf=2,
    )
    model.fit(x_train, y_train)

    predictions = model.predict(x_test)
    mae = mean_absolute_error(y_test, predictions)

    joblib.dump(model, MODEL_PATH)
    print(f"Model trained and saved to {MODEL_PATH}")
    print(f"Validation MAE: {mae:.4f}")


if __name__ == "__main__":
    train_and_save_model()

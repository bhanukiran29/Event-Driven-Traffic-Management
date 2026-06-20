from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
MODELS = ROOT / "models"


def load(name: str):
    with (PROCESSED / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    metrics = load("model_metrics.json")
    predictions = load("model_predictions.json")
    feature_importance = load("model_feature_importance.json")
    model_path = ROOT / metrics["best_model_path"]

    assert model_path.exists(), f"Missing trained model artifact: {model_path}"
    assert metrics["row_count"] == 8173, f"Expected 8173 rows, got {metrics['row_count']}"
    assert metrics["train_rows"] > metrics["test_rows"] > 0
    assert metrics["target"] == "traffic_impact_score"
    assert "external" not in metrics["data_source"].lower() or "no external" in json.dumps(metrics).lower()
    assert metrics["best_metrics"]["mae"] < 2.5, f"MAE too high for TIS surrogate: {metrics['best_metrics']['mae']}"
    assert metrics["best_metrics"]["r2"] > 0.95, f"R2 too low for TIS surrogate: {metrics['best_metrics']['r2']}"
    assert predictions, "Expected prediction sample output"
    assert feature_importance, "Expected feature importance output"
    assert (MODELS / "model_card.json").exists(), "Expected model card"
    print("Model verification passed")


if __name__ == "__main__":
    main()

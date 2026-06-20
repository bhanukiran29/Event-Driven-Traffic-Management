from __future__ import annotations

import json
import math
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
MODELS = ROOT / "models"
EVENTS_PATH = PROCESSED / "events.json"
METRICS_PATH = PROCESSED / "model_metrics.json"
PREDICTIONS_PATH = PROCESSED / "model_predictions.json"
FEATURE_IMPORTANCE_PATH = PROCESSED / "model_feature_importance.json"
MODEL_CARD_PATH = MODELS / "model_card.json"

RANDOM_SEED = 42
TEST_FRACTION = 0.20
FEATURES = [
    "event_type",
    "event_cause",
    "requires_road_closure",
    "event_duration_hours_capped",
    "corridor",
    "priority",
    "police_station",
    "zone",
    "junction",
    "status",
    "start_hour",
    "start_day",
    "start_month",
    "spatial_cluster_id",
    "cluster_risk",
]
CATEGORICAL_FEATURES = [
    "event_type",
    "event_cause",
    "corridor",
    "priority",
    "police_station",
    "zone",
    "junction",
    "status",
    "start_day",
    "start_month",
]


def load_events() -> list[dict[str, Any]]:
    with EVENTS_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def feature_row(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_type": str(event.get("event_type") or "unknown"),
        "event_cause": str(event.get("event_cause") or "others"),
        "requires_road_closure": int(bool(event.get("requires_road_closure"))),
        "event_duration_hours_capped": min(max(float(event.get("event_duration_hours") or 0.0), 0.0), 72.0),
        "corridor": str(event.get("corridor") or "Non-corridor"),
        "priority": str(event.get("priority") or "Low"),
        "police_station": str(event.get("police_station") or "Unknown Station"),
        "zone": str(event.get("zone") or "Unmapped Zone"),
        "junction": str(event.get("junction") or "Unmapped Junction"),
        "status": str(event.get("status") or "unknown"),
        "start_hour": int(event.get("start_hour") or 0),
        "start_day": str(event.get("start_day") or "Monday"),
        "start_month": str(event.get("start_month") or "unknown"),
        "spatial_cluster_id": int(event.get("spatial_cluster_id") or -1),
        "cluster_risk": float(event.get("cluster_risk") or 0.0),
    }


def train_test_indices(count: int) -> tuple[list[int], list[int]]:
    # Deterministic split without needing numpy before optional ML imports.
    indices = list(range(count))
    indices.sort(key=lambda idx: ((idx * 1103515245 + RANDOM_SEED) & 0x7FFFFFFF))
    test_count = max(1, int(count * TEST_FRACTION))
    return indices[test_count:], indices[:test_count]


def regression_metrics(y_true: list[float], y_pred: list[float]) -> dict[str, float]:
    n = len(y_true)
    if n == 0:
        return {"r2": 0.0, "mae": 0.0, "rmse": 0.0}
    mean_y = sum(y_true) / n
    ss_res = sum((actual - pred) ** 2 for actual, pred in zip(y_true, y_pred))
    ss_tot = sum((actual - mean_y) ** 2 for actual in y_true)
    mae = sum(abs(actual - pred) for actual, pred in zip(y_true, y_pred)) / n
    rmse = math.sqrt(ss_res / n)
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot else 0.0
    return {"r2": round(r2, 4), "mae": round(mae, 4), "rmse": round(rmse, 4)}


def json_ready(value: Any) -> Any:
    if hasattr(value, "item"):
        return value.item()
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return round(value, 6)
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    return value


def train_catboost(x_train: list[dict[str, Any]], y_train: list[float], x_test: list[dict[str, Any]], y_test: list[float]):
    import pandas as pd
    from catboost import CatBoostRegressor, Pool

    train_frame = pd.DataFrame(x_train, columns=FEATURES)
    test_frame = pd.DataFrame(x_test, columns=FEATURES)
    train_pool = Pool(train_frame, y_train, cat_features=CATEGORICAL_FEATURES)
    test_pool = Pool(test_frame, y_test, cat_features=CATEGORICAL_FEATURES)
    model = CatBoostRegressor(
        iterations=700,
        depth=7,
        learning_rate=0.045,
        loss_function="RMSE",
        eval_metric="RMSE",
        random_seed=RANDOM_SEED,
        od_type="Iter",
        od_wait=60,
        verbose=False,
        allow_writing_files=False,
    )
    model.fit(train_pool, eval_set=test_pool, use_best_model=True)
    predictions = [float(value) for value in model.predict(test_pool)]
    importance_values = model.get_feature_importance(train_pool)
    feature_importance = [
        {"feature": feature, "importance": round(float(value), 4)}
        for feature, value in sorted(zip(FEATURES, importance_values), key=lambda item: item[1], reverse=True)
    ]
    return {
        "name": "CatBoostRegressor",
        "role": "Primary surrogate model for Traffic Impact Score",
        "status": "trained",
        "model": model,
        "predictions": predictions,
        "metrics": regression_metrics(y_test, predictions),
        "feature_importance": feature_importance,
    }


def train_sklearn_benchmarks(x_train: list[dict[str, Any]], y_train: list[float], x_test: list[dict[str, Any]], y_test: list[float]):
    import pandas as pd
    from sklearn.compose import ColumnTransformer
    from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder

    categorical = CATEGORICAL_FEATURES
    numeric = [feature for feature in FEATURES if feature not in categorical]
    preprocessor = ColumnTransformer(
        transformers=[
            ("categorical", OneHotEncoder(handle_unknown="ignore", sparse_output=True), categorical),
            ("numeric", "passthrough", numeric),
        ]
    )
    candidates = [
        (
            "RandomForestRegressor",
            RandomForestRegressor(
                n_estimators=240,
                max_depth=20,
                min_samples_leaf=2,
                random_state=RANDOM_SEED,
                n_jobs=-1,
            ),
            "Benchmark tree ensemble",
        ),
        (
            "ExtraTreesRegressor",
            ExtraTreesRegressor(
                n_estimators=260,
                max_depth=22,
                min_samples_leaf=2,
                random_state=RANDOM_SEED,
                n_jobs=-1,
            ),
            "Benchmark high-variance tree ensemble",
        ),
    ]
    output = []
    train_frame = pd.DataFrame(x_train, columns=FEATURES)
    test_frame = pd.DataFrame(x_test, columns=FEATURES)
    for name, regressor, role in candidates:
        pipe = Pipeline([("preprocess", preprocessor), ("model", regressor)])
        pipe.fit(train_frame, y_train)
        predictions = [float(value) for value in pipe.predict(test_frame)]
        output.append(
            {
                "name": name,
                "role": role,
                "status": "trained",
                "model": pipe,
                "predictions": predictions,
                "metrics": regression_metrics(y_test, predictions),
                "feature_importance": [],
            }
        )
    return output


def train_xgboost_if_available(x_train: list[dict[str, Any]], y_train: list[float], x_test: list[dict[str, Any]], y_test: list[float]):
    try:
        import pandas as pd
        from sklearn.compose import ColumnTransformer
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import OneHotEncoder
        from xgboost import XGBRegressor
    except Exception as exc:
        return {
            "name": "XGBRegressor",
            "role": "Optional benchmark",
            "status": f"skipped: {type(exc).__name__}",
            "metrics": None,
        }

    categorical = CATEGORICAL_FEATURES
    numeric = [feature for feature in FEATURES if feature not in categorical]
    pipe = Pipeline(
        [
            (
                "preprocess",
                ColumnTransformer(
                    transformers=[
                        ("categorical", OneHotEncoder(handle_unknown="ignore", sparse_output=True), categorical),
                        ("numeric", "passthrough", numeric),
                    ]
                ),
            ),
            (
                "model",
                XGBRegressor(
                    n_estimators=350,
                    max_depth=5,
                    learning_rate=0.05,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    objective="reg:squarederror",
                    random_state=RANDOM_SEED,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    train_frame = pd.DataFrame(x_train, columns=FEATURES)
    test_frame = pd.DataFrame(x_test, columns=FEATURES)
    pipe.fit(train_frame, y_train)
    predictions = [float(value) for value in pipe.predict(test_frame)]
    return {
        "name": "XGBRegressor",
        "role": "Optional benchmark",
        "status": "trained",
        "model": pipe,
        "predictions": predictions,
        "metrics": regression_metrics(y_test, predictions),
        "feature_importance": [],
    }


def train_lightgbm_if_available(x_train: list[dict[str, Any]], y_train: list[float], x_test: list[dict[str, Any]], y_test: list[float]):
    try:
        import pandas as pd
        from sklearn.compose import ColumnTransformer
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import OneHotEncoder
        from lightgbm import LGBMRegressor
    except Exception as exc:
        return {
            "name": "LGBMRegressor",
            "role": "Optional benchmark",
            "status": f"skipped: {type(exc).__name__}",
            "metrics": None,
        }

    categorical = CATEGORICAL_FEATURES
    numeric = [feature for feature in FEATURES if feature not in categorical]
    pipe = Pipeline(
        [
            (
                "preprocess",
                ColumnTransformer(
                    transformers=[
                        ("categorical", OneHotEncoder(handle_unknown="ignore", sparse_output=True), categorical),
                        ("numeric", "passthrough", numeric),
                    ]
                ),
            ),
            (
                "model",
                LGBMRegressor(
                    n_estimators=350,
                    max_depth=8,
                    learning_rate=0.045,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    random_state=RANDOM_SEED,
                    n_jobs=-1,
                    verbose=-1,
                ),
            ),
        ]
    )
    train_frame = pd.DataFrame(x_train, columns=FEATURES)
    test_frame = pd.DataFrame(x_test, columns=FEATURES)
    pipe.fit(train_frame, y_train)
    predictions = [float(value) for value in pipe.predict(test_frame)]
    return {
        "name": "LGBMRegressor",
        "role": "Optional benchmark",
        "status": "trained",
        "model": pipe,
        "predictions": predictions,
        "metrics": regression_metrics(y_test, predictions),
        "feature_importance": [],
    }


def try_shap_summary(model: Any, x_sample: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        import shap  # noqa: F401
    except Exception as exc:
        return {
            "status": "skipped",
            "reason": f"SHAP unavailable or incompatible: {type(exc).__name__}",
            "fallback": "Dashboard uses CatBoost feature importance and deterministic TIS component explanations.",
        }
    return {
        "status": "available",
        "note": "SHAP package imported successfully. Per-event explanations are still served from deterministic TIS components for demo speed.",
        "sample_size": len(x_sample),
    }


def main() -> None:
    MODELS.mkdir(exist_ok=True)
    events = load_events()
    rows = [feature_row(event) for event in events]
    targets = [float(event["traffic_impact_score"]) for event in events]
    train_idx, test_idx = train_test_indices(len(rows))
    x_train = [rows[idx] for idx in train_idx]
    y_train = [targets[idx] for idx in train_idx]
    x_test = [rows[idx] for idx in test_idx]
    y_test = [targets[idx] for idx in test_idx]
    test_events = [events[idx] for idx in test_idx]

    trained = []
    skipped = []
    try:
        trained.append(train_catboost(x_train, y_train, x_test, y_test))
    except Exception as exc:
        skipped.append(
            {
                "name": "CatBoostRegressor",
                "role": "Primary surrogate model for Traffic Impact Score",
                "status": f"failed: {type(exc).__name__}: {exc}",
                "metrics": None,
            }
        )

    try:
        trained.extend(train_sklearn_benchmarks(x_train, y_train, x_test, y_test))
    except Exception as exc:
        skipped.append(
            {
                "name": "RandomForestRegressor / ExtraTreesRegressor",
                "role": "Benchmark tree ensembles",
                "status": f"failed: {type(exc).__name__}: {exc}",
                "metrics": None,
            }
        )

    for optional_result in (
        train_xgboost_if_available(x_train, y_train, x_test, y_test),
        train_lightgbm_if_available(x_train, y_train, x_test, y_test),
    ):
        if optional_result.get("status") == "trained":
            trained.append(optional_result)
        else:
            skipped.append(optional_result)

    if not trained:
        raise RuntimeError("No model could be trained. Install catboost and/or scikit-learn, then rerun.")

    best = min(trained, key=lambda result: result["metrics"]["mae"])
    timestamp = datetime.now(timezone.utc).isoformat()
    model_path = MODELS / "tis_surrogate_model.pkl"
    catboost_path = MODELS / "catboost_tis_surrogate.cbm"

    with model_path.open("wb") as handle:
        pickle.dump(
            {
                "model_name": best["name"],
                "model": best["model"],
                "features": FEATURES,
                "categorical_features": CATEGORICAL_FEATURES,
                "target": "traffic_impact_score",
                "trained_at": timestamp,
            },
            handle,
        )

    if best["name"] == "CatBoostRegressor":
        best["model"].save_model(str(catboost_path))

    model_comparison = []
    for result in trained:
        model_comparison.append(
            {
                "model": result["name"],
                "role": result["role"],
                "fit_status": result["status"],
                "r2": result["metrics"]["r2"],
                "mae": result["metrics"]["mae"],
                "rmse": result["metrics"]["rmse"],
            }
        )
    for result in skipped:
        model_comparison.append(
            {
                "model": result["name"],
                "role": result["role"],
                "fit_status": result["status"],
                "r2": None,
                "mae": None,
                "rmse": None,
            }
        )

    predictions = []
    for event, actual, pred in zip(test_events, y_test, best["predictions"]):
        predictions.append(
            {
                "id": event["id"],
                "actual_tis": round(actual, 2),
                "predicted_tis": round(float(pred), 2),
                "absolute_error": round(abs(actual - float(pred)), 2),
                "risk_category": event["risk_category"],
                "event_cause": event["event_cause"],
                "corridor": event["corridor"],
                "zone": event["zone"],
            }
        )
    predictions.sort(key=lambda item: item["absolute_error"], reverse=True)

    feature_importance = best.get("feature_importance") or []
    shap_summary = try_shap_summary(best["model"], x_test[:100])
    metrics = {
        "trained_at": timestamp,
        "data_source": "Only data/processed/events.json generated from the instructor-provided ASTraM CSV was used.",
        "target": "traffic_impact_score",
        "target_type": "surrogate operational risk score, not measured congestion",
        "features": FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "row_count": len(rows),
        "train_rows": len(x_train),
        "test_rows": len(x_test),
        "random_seed": RANDOM_SEED,
        "best_model": best["name"],
        "best_model_path": str(model_path.relative_to(ROOT)),
        "catboost_model_path": str(catboost_path.relative_to(ROOT)) if catboost_path.exists() else None,
        "best_metrics": best["metrics"],
        "model_comparison": model_comparison,
        "feature_importance": feature_importance,
        "shap_summary": shap_summary,
    }
    model_card = {
        "name": "GridSense AI TIS Surrogate Model",
        "purpose": "Learn the proprietary Traffic Impact Score from ASTraM event features for fast ranking, benchmarking, and explainability.",
        "not_for": "This model is not a measured congestion, vehicle-count, travel-time, or delay-duration predictor.",
        "data_boundary": "No external training data was used.",
        "target": metrics["target"],
        "best_model": metrics["best_model"],
        "metrics": metrics["best_metrics"],
        "trained_at": timestamp,
        "limitations": [
            "Target is generated from the transparent TIS formula because the dataset has no true congestion label.",
            "Predictions should be presented as operational risk estimates.",
            "Mapbox is used only for visualization, not training.",
        ],
    }

    for path, payload in (
        (METRICS_PATH, metrics),
        (PREDICTIONS_PATH, predictions[:250]),
        (FEATURE_IMPORTANCE_PATH, feature_importance),
        (MODEL_CARD_PATH, model_card),
    ):
        with path.open("w", encoding="utf-8") as handle:
            json.dump(json_ready(payload), handle, ensure_ascii=False, indent=2)

    print(
        json.dumps(
            json_ready(
                {
                    "best_model": metrics["best_model"],
                    "best_metrics": metrics["best_metrics"],
                    "trained_models": [result["name"] for result in trained],
                    "skipped_models": [result["name"] for result in skipped],
                    "model_path": metrics["best_model_path"],
                }
            ),
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

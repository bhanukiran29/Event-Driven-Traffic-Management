from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"


def load(name: str):
    with (PROCESSED / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    events = load("events.json")
    summary = load("summary.json")
    hotspots = load("hotspots.json")
    context = load("context.json")

    assert len(events) == 8173, f"Expected 8173 processed events, got {len(events)}"
    required_fields = {
        "start_hour",
        "start_day",
        "start_month",
        "event_duration_hours",
        "traffic_impact_score",
        "risk_category",
        "spatial_cluster_id",
        "recommendation",
    }
    for event in events:
        missing = required_fields - set(event)
        assert not missing, f"{event.get('id')} missing fields: {sorted(missing)}"
        score = event["traffic_impact_score"]
        assert 0 <= score <= 100, f"{event.get('id')} score out of range: {score}"
        category = event["risk_category"]
        if score >= 80:
            assert category == "Critical"
        elif score >= 65:
            assert category == "High"
        elif score >= 45:
            assert category == "Medium"
        else:
            assert category == "Low"

    assert hotspots["clusters"], "Expected DBSCAN clusters"
    assert summary["data_source"].lower().find("instructor") >= 0
    assert context["scoring_version"] == "tis-v1-standard-library"
    print("Data verification passed")


if __name__ == "__main__":
    main()

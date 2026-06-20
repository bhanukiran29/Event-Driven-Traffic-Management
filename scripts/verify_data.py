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
        "expected_attendance",
        "venue_capacity",
        "event_scale",
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
        assert event["expected_attendance"] >= 0
        assert event["venue_capacity"] >= event["expected_attendance"]
        assert event["event_scale"] in {"Small", "Medium", "Large", "Mega"}
        recommendation = event["recommendation"]
        assert recommendation["officers"] >= 2
        assert recommendation["barricades"] >= 0
        assert recommendation["allocation_explanation"]
        assert recommendation["officer_allocation_rationale"]
        assert recommendation["barricade_allocation_rationale"]
        diversion = recommendation["diversion_advisory"]
        assert diversion["type"] == "diversion_plan"
        assert 0 <= diversion["estimated_congestion_reduction"] <= 35
        assert 0 <= diversion["diversion_confidence_score"] <= 95
        assert diversion["after_diversion_score"] <= diversion["before_diversion_score"]
        assert diversion["rationale"]
        if diversion["primary_diversion_corridor"]:
            assert diversion["primary_diversion_corridor"] != event["corridor"]
            assert diversion["candidate_corridors"]
            candidate = diversion["candidate_corridors"][0]
            assert 0 <= candidate["average_hotspot_density"] <= 1
            assert 0 <= candidate["closure_rate"] <= 1
            assert 0 <= candidate["diversion_score"] <= 100
            assert candidate["count"] >= context["diversion_config"]["minimum_corridor_support"]
            assert candidate["distance_km"] <= context["diversion_config"]["maximum_distance_km"]
            assert candidate["tis_standard_deviation"] >= 0
            if candidate["risk_reduction_percentage"] <= 0:
                assert diversion["estimated_congestion_reduction"] == 0
        if score >= 80:
            assert category == "Critical"
        elif score >= 65:
            assert category == "High"
        elif score >= 45:
            assert category == "Medium"
        else:
            assert category == "Low"

    assert hotspots["clusters"], "Expected DBSCAN clusters"
    attendance_expectations = {
        "public_event": (20000, 30000),
        "accident": (50, 100),
        "vehicle_breakdown": (10, 20),
        "water_logging": (0, 0),
        "tree_fall": (0, 0),
    }
    for cause, expected in attendance_expectations.items():
        event = next(item for item in events if item["event_cause"].lower() == cause)
        assert (event["expected_attendance"], event["venue_capacity"]) == expected
    assert any(event["recommendation"]["diversion_advisory"]["primary_diversion_corridor"] for event in events)
    assert summary["data_source"].lower().find("instructor") >= 0
    assert context["scoring_version"] == "tis-v1-standard-library"
    print("Data verification passed")


if __name__ == "__main__":
    main()

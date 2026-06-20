from __future__ import annotations

import csv
import json
import math
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, pstdev
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RAW_PATH = ROOT / "data" / "raw" / "astram_events.csv"
OUT_DIR = ROOT / "data" / "processed"

MISSING = {"", "NULL", "null", "None", "none", "NaN", "nan"}
DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
WEIGHTS = {
    "event_cause": 0.15,
    "road_closure": 0.15,
    "priority": 0.12,
    "duration": 0.10,
    "corridor_density": 0.10,
    "zone_density": 0.08,
    "junction_density": 0.08,
    "police_workload": 0.07,
    "temporal_risk": 0.08,
    "hotspot": 0.07,
}
CAUSE_RISK = {
    "vehicle_breakdown": 0.78,
    "construction": 0.93,
    "accident": 0.88,
    "water_logging": 0.76,
    "tree_fall": 0.72,
    "public_event": 0.90,
    "procession": 0.92,
    "vip_movement": 0.96,
    "protest": 0.91,
    "congestion": 0.80,
    "pot_holes": 0.58,
    "road_conditions": 0.62,
    "debris": 0.64,
    "others": 0.50,
}
PRIORITY_RISK = {"high": 1.0, "medium": 0.62, "low": 0.35}
CAUSE_ATTENDANCE_PROFILES = {
    "public_event": {"expected_attendance": 20000, "venue_capacity": 30000},
    "procession": {"expected_attendance": 10000, "venue_capacity": 15000},
    "protest": {"expected_attendance": 5000, "venue_capacity": 8000},
    "vip_movement": {"expected_attendance": 2000, "venue_capacity": 3000},
    "congestion": {"expected_attendance": 200, "venue_capacity": 500},
    "others": {"expected_attendance": 100, "venue_capacity": 250},
    "accident": {"expected_attendance": 50, "venue_capacity": 100},
    "construction": {"expected_attendance": 25, "venue_capacity": 50},
    "vehicle_breakdown": {"expected_attendance": 10, "venue_capacity": 20},
    "water_logging": {"expected_attendance": 0, "venue_capacity": 0},
    "tree_fall": {"expected_attendance": 0, "venue_capacity": 0},
    "pot_holes": {"expected_attendance": 0, "venue_capacity": 0},
    "road_conditions": {"expected_attendance": 0, "venue_capacity": 0},
    "debris": {"expected_attendance": 0, "venue_capacity": 0},
    "fog_/_low_visibility": {"expected_attendance": 0, "venue_capacity": 0},
    "test_demo": {"expected_attendance": 500, "venue_capacity": 1000},
}
EVENT_TYPE_ATTENDANCE_FALLBACKS = {
    "planned": {"expected_attendance": 5000, "venue_capacity": 7500},
    "unplanned": {"expected_attendance": 50, "venue_capacity": 100},
    "unknown": {"expected_attendance": 100, "venue_capacity": 250},
}
DIVERSION_CONFIG = {"minimum_corridor_support": 20, "maximum_distance_km": 20.0}


def clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return None if text in MISSING else text


def display_text(value: Any, fallback: str) -> str:
    return clean(value) or fallback


def key_text(value: Any, fallback: str = "unknown") -> str:
    text = clean(value) or fallback
    return text.strip().lower().replace(" ", "_")


def truthy(value: Any) -> bool:
    text = str(value or "").strip().lower()
    return text in {"true", "1", "yes", "y"}


def safe_float(value: Any) -> float | None:
    text = clean(value)
    if text is None:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if not math.isfinite(number):
        return None
    return number


def valid_coordinate(lat: Any, lng: Any) -> tuple[float, float] | None:
    lat_value = safe_float(lat)
    lng_value = safe_float(lng)
    if lat_value is None or lng_value is None:
        return None
    if lat_value == 0 or lng_value == 0:
        return None
    if not (12.0 <= lat_value <= 14.0 and 76.5 <= lng_value <= 78.5):
        return None
    return lat_value, lng_value


def parse_datetime(value: Any) -> datetime | None:
    text = clean(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def duration_hours(row: dict[str, str]) -> tuple[float, str]:
    start = parse_datetime(row.get("start_datetime"))
    if start is None:
        return 0.0, "missing"
    for field in ("end_datetime", "closed_datetime", "resolved_datetime", "modified_datetime"):
        end = parse_datetime(row.get(field))
        if end and end >= start:
            return (end - start).total_seconds() / 3600.0, field
    return 0.0, "missing"


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_m = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    return 2 * earth_radius_m * math.asin(math.sqrt(a))


def risk_category(score: float) -> str:
    if score >= 80:
        return "Critical"
    if score >= 65:
        return "High"
    if score >= 45:
        return "Medium"
    return "Low"


def event_scale(attendance: int) -> str:
    if attendance <= 500:
        return "Small"
    if attendance <= 2500:
        return "Medium"
    if attendance <= 10000:
        return "Large"
    return "Mega"


def attendance_estimate(event_cause: str, event_type: str) -> dict[str, Any]:
    profile = CAUSE_ATTENDANCE_PROFILES.get(key_text(event_cause))
    if profile is None:
        profile = EVENT_TYPE_ATTENDANCE_FALLBACKS.get(key_text(event_type), EVENT_TYPE_ATTENDANCE_FALLBACKS["unknown"])
    attendance = int(profile["expected_attendance"])
    return {**profile, "event_scale": event_scale(attendance)}


def normalized_counter(counter: Counter[str], missing_fallbacks: set[str] | None = None) -> dict[str, float]:
    missing_fallbacks = missing_fallbacks or set()
    max_count = max((count for key, count in counter.items() if key not in missing_fallbacks), default=1)
    result: dict[str, float] = {}
    for key, count in counter.items():
        if key in missing_fallbacks:
            result[key] = 0.20
        else:
            result[key] = min(1.0, count / max_count)
    return result


def run_dbscan(points: list[tuple[int, float, float]], eps_m: float = 750.0, min_samples: int = 8) -> dict[int, int]:
    if not points:
        return {}
    cell_lat = eps_m / 111320.0
    cell_lng = eps_m / (111320.0 * math.cos(math.radians(12.97)))
    grid: dict[tuple[int, int], list[int]] = defaultdict(list)
    for position, (_, lat, lng) in enumerate(points):
        grid[(math.floor(lat / cell_lat), math.floor(lng / cell_lng))].append(position)

    def neighbors(position: int) -> list[int]:
        _, lat, lng = points[position]
        cell = (math.floor(lat / cell_lat), math.floor(lng / cell_lng))
        found: list[int] = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for candidate in grid.get((cell[0] + dx, cell[1] + dy), []):
                    if haversine_m(lat, lng, points[candidate][1], points[candidate][2]) <= eps_m:
                        found.append(candidate)
        return found

    labels: list[int | None] = [None] * len(points)
    cluster_id = 0
    for position in range(len(points)):
        if labels[position] is not None:
            continue
        seed_neighbors = neighbors(position)
        if len(seed_neighbors) < min_samples:
            labels[position] = -1
            continue
        labels[position] = cluster_id
        queue: deque[int] = deque(seed_neighbors)
        while queue:
            current = queue.popleft()
            if labels[current] == -1:
                labels[current] = cluster_id
            if labels[current] is not None:
                continue
            labels[current] = cluster_id
            current_neighbors = neighbors(current)
            if len(current_neighbors) >= min_samples:
                queue.extend(current_neighbors)
        cluster_id += 1
    return {points[position][0]: int(label if label is not None else -1) for position, label in enumerate(labels)}


def score_components(row: dict[str, Any], context: dict[str, Any]) -> tuple[float, list[dict[str, Any]]]:
    cause_key = key_text(row.get("event_cause"), "others")
    priority_key = key_text(row.get("priority"), "low")
    duration_capped = min(max(float(row.get("event_duration_hours", 0.0)), 0.0), 72.0)
    duration_risk = math.log1p(duration_capped) / math.log1p(72.0)
    corridor = str(row.get("corridor") or "Non-corridor")
    zone = str(row.get("zone") or "Unmapped Zone")
    junction = str(row.get("junction") or "Unmapped Junction")
    police_station = str(row.get("police_station") or "Unknown Station")
    hour = str(row.get("start_hour", 0))
    day = str(row.get("start_day", "Monday"))
    hour_risk = context["hour_risk"].get(hour, 0.35)
    day_risk = context["day_risk"].get(day, 0.35)
    values = {
        "Event cause risk": context["cause_risk"].get(cause_key, context["cause_risk"].get("others", 0.50)),
        "Road closure requirement": 1.0 if bool(row.get("requires_road_closure")) else 0.0,
        "Priority level": PRIORITY_RISK.get(priority_key, 0.45),
        "Duration risk": duration_risk,
        "Corridor frequency": context["corridor_density"].get(corridor, 0.25),
        "Zone frequency": context["zone_density"].get(zone, 0.20),
        "Junction frequency": context["junction_density"].get(junction, 0.20),
        "Police station workload": context["police_density"].get(police_station, 0.25),
        "Time pattern risk": (hour_risk + day_risk) / 2,
        "DBSCAN hotspot membership": float(row.get("cluster_risk", 0.0)),
    }
    weight_lookup = {
        "Event cause risk": "event_cause",
        "Road closure requirement": "road_closure",
        "Priority level": "priority",
        "Duration risk": "duration",
        "Corridor frequency": "corridor_density",
        "Zone frequency": "zone_density",
        "Junction frequency": "junction_density",
        "Police station workload": "police_workload",
        "Time pattern risk": "temporal_risk",
        "DBSCAN hotspot membership": "hotspot",
    }
    components = []
    total = 0.0
    for label, value in values.items():
        contribution = value * WEIGHTS[weight_lookup[label]] * 100.0
        total += contribution
        components.append(
            {
                "name": label,
                "value": round(value, 4),
                "weight": round(WEIGHTS[weight_lookup[label]] * 100, 1),
                "contribution": round(contribution, 2),
            }
        )
    return round(min(max(total, 0.0), 100.0), 1), sorted(components, key=lambda item: item["contribution"], reverse=True)


def recommendation(score: float, closure: bool, attendance: int, duration_hours: float, cluster_risk: float) -> dict[str, Any]:
    category = risk_category(score)
    safe_attendance = max(0, round(attendance))
    safe_duration = min(72.0, max(0.0, duration_hours))
    attendance_officers = math.ceil(safe_attendance / 500)
    impact_officers = math.ceil(score / 20)
    closure_officers = 4 if closure else 0
    duration_officers = math.ceil(safe_duration / 8)
    officers = min(80, max(2, 1 + attendance_officers + impact_officers + closure_officers + duration_officers))
    severity_barricades = {"Low": 0, "Medium": 1, "High": 3, "Critical": 5}[category]
    attendance_barricades = math.ceil(safe_attendance / 1000)
    closure_barricades = 3 if closure else 0
    bounded_hotspot_risk = min(1.0, max(0.0, cluster_risk))
    hotspot_barricades = math.ceil(bounded_hotspot_risk * 4)
    barricades = min(40, attendance_barricades + closure_barricades + severity_barricades + hotspot_barricades)
    response_priority = {
        "Low": "Monitor", "Medium": "Scheduled deployment",
        "High": "Priority intervention", "Critical": "Immediate intervention",
    }[category]
    return {
        "officers": officers,
        "barricades": barricades,
        "patrol_units": max(1, math.ceil(officers / 6)),
        "response_priority": response_priority,
        "risk_category": category,
        "officer_allocation_rationale": [
            f"{safe_attendance:,} expected attendees require {attendance_officers} attendance-based officer units.",
            f"TIS {score:.1f} and {safe_duration:.1f} hours add {impact_officers + duration_officers} operational officer units.",
            "Road closure adds 4 traffic-control officers." if closure else "No closure-specific officers are added.",
        ],
        "barricade_allocation_rationale": [
            f"{safe_attendance:,} expected attendees require {attendance_barricades} attendance-based barricade units.",
            f"{category} severity and hotspot exposure add {severity_barricades + hotspot_barricades} barricade units.",
            "Road closure adds 3 perimeter barricades." if closure else "No closure-specific barricades are added.",
        ],
        "allocation_explanation": [
            f"{safe_attendance:,} expected attendees add {attendance_officers} officer units and {attendance_barricades} barricade units.",
            f"TIS {score:.1f} adds {impact_officers} officer units; {category.lower()} severity adds {severity_barricades} barricade units.",
            "Road closure adds 4 officers and 3 barricades." if closure else "No road closure increment is applied.",
            f"{safe_duration:.1f} hours adds {duration_officers} officer units.",
            f"Hotspot risk {bounded_hotspot_risk * 100:.0f}% adds {hotspot_barricades} barricade units.",
        ],
    }


def diversion_plan(
    corridor: str,
    zone: str,
    score: float,
    closure: bool,
    cluster_risk: float,
    latitude: float,
    longitude: float,
    context: dict[str, Any],
) -> dict[str, Any]:
    minimum_support = int(context.get("diversion_config", DIVERSION_CONFIG)["minimum_corridor_support"])
    maximum_distance_km = float(context.get("diversion_config", DIVERSION_CONFIG)["maximum_distance_km"])
    zone_density = min(1.0, max(0.0, context["zone_density"].get(zone, 0.2)))
    candidates = context["zone_corridor_advisories"].get(zone, [])
    affected = next((item for item in candidates if item["corridor"] == corridor), None)
    affected_risk = float(affected["average_tis"] if affected else score)
    ranked = []
    for item in candidates:
        if item["corridor"] in {corridor, "Non-corridor"}:
            continue
        if item["count"] < minimum_support:
            continue
        distance_km = haversine_m(latitude, longitude, item["latitude"], item["longitude"]) / 1000.0
        if distance_km > maximum_distance_km:
            continue
        historical_safety = 1.0 - min(1.0, item["average_tis"] / 100.0)
        candidate_hotspot_safety = 1.0 - min(1.0, max(0.0, item["average_hotspot_density"]))
        event_hotspot_relief = max(0.0, min(1.0, cluster_risk) - item["average_hotspot_density"])
        hotspot_safety = candidate_hotspot_safety * 0.7 + event_hotspot_relief * 0.3
        zone_relief = 1.0 - zone_density
        closure_resilience = (
            1.0 - min(1.0, item["closure_rate"])
            if closure
            else 0.5 + (1.0 - min(1.0, item["closure_rate"])) * 0.5
        )
        proximity = 1.0 - min(1.0, distance_km / 25.0)
        stability = 1.0 - min(1.0, item["tis_standard_deviation"] / 20.0)
        candidate_score = 100.0 * (
            historical_safety * 0.35
            + hotspot_safety * 0.2
            + zone_relief * 0.1
            + closure_resilience * 0.15
            + proximity * 0.1
            + stability * 0.1
        )
        risk_reduction = ((affected_risk - item["average_tis"]) / affected_risk) * 100.0 if affected_risk > 0 else 0.0
        ranked.append({
            **item,
            "diversion_score": round(candidate_score, 1),
            "risk_reduction_percentage": round(risk_reduction, 1),
            "distance_km": round(distance_km, 1),
        })
    ranked.sort(key=lambda item: item["diversion_score"], reverse=True)
    if not ranked:
        return {
            "type": "diversion_plan",
            "message": f"No eligible same-zone corridor has at least {minimum_support} records within {maximum_distance_km:g} km.",
            "avoid_corridor": corridor,
            "primary_diversion_corridor": None,
            "secondary_diversion_corridor": None,
            "estimated_congestion_reduction": 0.0,
            "diversion_confidence_score": 0.0,
            "before_diversion_score": score,
            "after_diversion_score": score,
            "rationale": [f"Candidates require at least {minimum_support} historical records and must be within {maximum_distance_km:g} km."],
            "candidate_corridors": [],
        }
    primary = ranked[0]
    secondary = ranked[1] if len(ranked) > 1 else None
    risk_reduction = primary["risk_reduction_percentage"]
    estimated_reduction = min(35.0, max(0.0, risk_reduction * 0.65 + (3.0 if closure else 0.0))) if risk_reduction > 0 else 0.0
    support_score = min(1.0, primary["count"] / 100.0)
    stability_score = 1.0 - min(1.0, primary["tis_standard_deviation"] / 20.0)
    risk_advantage = max(0.0, min(1.0, risk_reduction / 40.0))
    hotspot_quality = 1.0 - min(1.0, primary["average_hotspot_density"])
    closure_quality = 1.0 - min(1.0, primary["closure_rate"])
    proximity_quality = 1.0 - min(1.0, primary["distance_km"] / maximum_distance_km)
    candidate_quality = risk_advantage * 0.6 + (hotspot_quality * 0.35 + closure_quality * 0.35 + proximity_quality * 0.3) * 0.4
    confidence = min(95.0, max(0.0, 100.0 * (support_score * 0.4 + stability_score * 0.3 + candidate_quality * 0.3)))
    risk_rationale = (
        f"Selected because corridor risk is {risk_reduction:.1f}% lower than affected corridor."
        if risk_reduction >= 0
        else f"Selected on composite resilience despite corridor risk being {abs(risk_reduction):.1f}% higher than affected corridor."
    )
    return {
        "type": "diversion_plan",
        "message": f"Route traffic primarily via {primary['corridor']}" + (f", with {secondary['corridor']} as secondary relief." if secondary else "."),
        "avoid_corridor": corridor,
        "primary_diversion_corridor": primary["corridor"],
        "secondary_diversion_corridor": secondary["corridor"] if secondary else None,
        "estimated_congestion_reduction": round(estimated_reduction, 1),
        "diversion_confidence_score": round(confidence, 1),
        "before_diversion_score": score,
        "after_diversion_score": round(score * (1.0 - estimated_reduction / 100.0), 1),
        "rationale": [
            risk_rationale,
            f"Candidate has {primary['count']} historical records, TIS deviation {primary['tis_standard_deviation']:.1f}, and lies {primary['distance_km']:.1f} km away.",
            f"Confidence {confidence:.1f}% is derived independently from support, stability, and candidate quality.",
        ],
        "candidate_corridors": ranked[:3],
    }


def explanation(components: list[dict[str, Any]]) -> list[str]:
    messages = []
    for component in components[:4]:
        name = component["name"]
        if component["contribution"] <= 2.5:
            continue
        if name == "Road closure requirement":
            messages.append("Road closure requirement materially increases operational disruption risk.")
        elif name == "Priority level":
            messages.append("High priority classification indicates elevated operational attention.")
        elif name == "Corridor frequency":
            messages.append("The corridor has repeated historical disruption records in the ASTraM dataset.")
        elif name == "Zone frequency":
            messages.append("The zone has dense historical event activity.")
        elif name == "Junction frequency":
            messages.append("The junction appears frequently in historical event records.")
        elif name == "Duration risk":
            messages.append("Longer estimated event duration raises deployment and barricading needs.")
        elif name == "DBSCAN hotspot membership":
            messages.append("The location falls inside a detected spatial hotspot cluster.")
        elif name == "Time pattern risk":
            messages.append("The start time aligns with historically busy event windows.")
        else:
            messages.append("The event cause has high historical disruption potential.")
    return messages or ["Risk is driven by a balanced mix of event type, location history, and timing."]


def top_counter(rows: list[dict[str, Any]], field: str, limit: int = 10) -> list[dict[str, Any]]:
    counts = Counter(str(row.get(field) or "Unknown") for row in rows)
    return [{"name": name, "count": count} for name, count in counts.most_common(limit)]


def average_by(rows: list[dict[str, Any]], field: str, limit: int = 10) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        buckets[str(row.get(field) or "Unknown")].append(float(row["traffic_impact_score"]))
    ranked = sorted(buckets.items(), key=lambda item: (mean(item[1]), len(item[1])), reverse=True)
    return [
        {"name": name, "count": len(values), "average_tis": round(mean(values), 1)}
        for name, values in ranked[:limit]
    ]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not RAW_PATH.exists():
        raise FileNotFoundError(f"Missing raw CSV: {RAW_PATH}")

    with RAW_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        raw_rows = list(csv.DictReader(handle))

    column_missing: dict[str, float] = {}
    for column in raw_rows[0].keys():
        missing = sum(1 for row in raw_rows if clean(row.get(column)) is None)
        column_missing[column] = missing / len(raw_rows)
    dropped_columns = sorted([column for column, pct in column_missing.items() if pct > 0.95])

    rows: list[dict[str, Any]] = []
    duration_source_counts: Counter[str] = Counter()
    for index, raw in enumerate(raw_rows):
        start = parse_datetime(raw.get("start_datetime"))
        coords = valid_coordinate(raw.get("latitude"), raw.get("longitude"))
        if coords is None or start is None:
            continue
        end_coords = valid_coordinate(raw.get("endlatitude"), raw.get("endlongitude"))
        duration, duration_source = duration_hours(raw)
        duration_source_counts[duration_source] += 1
        attendance = attendance_estimate(
            display_text(raw.get("event_cause"), "others"),
            display_text(raw.get("event_type"), "unplanned"),
        )
        rows.append(
            {
                "row_index": index,
                "id": display_text(raw.get("id"), f"ASTRAM-{index:05d}"),
                "event_type": display_text(raw.get("event_type"), "unplanned"),
                **attendance,
                "latitude": round(coords[0], 7),
                "longitude": round(coords[1], 7),
                "end_latitude": round(end_coords[0], 7) if end_coords else None,
                "end_longitude": round(end_coords[1], 7) if end_coords else None,
                "address": display_text(raw.get("address"), "Address unavailable"),
                "end_address": clean(raw.get("end_address")),
                "event_cause": display_text(raw.get("event_cause"), "others"),
                "requires_road_closure": truthy(raw.get("requires_road_closure")),
                "start_datetime": start.isoformat(),
                "start_date": start.date().isoformat(),
                "start_hour": start.hour,
                "start_day": start.strftime("%A"),
                "start_month": start.strftime("%Y-%m"),
                "status": display_text(raw.get("status"), "unknown"),
                "authenticated": display_text(raw.get("authenticated"), "unknown"),
                "description": (display_text(raw.get("description"), "No field note available").replace("\n", " ")[:220]),
                "veh_type": display_text(raw.get("veh_type"), "Unknown vehicle"),
                "veh_no": display_text(raw.get("veh_no"), "Masked"),
                "corridor": display_text(raw.get("corridor"), "Non-corridor"),
                "priority": display_text(raw.get("priority"), "Low"),
                "police_station": display_text(raw.get("police_station"), "Unknown Station"),
                "kgid": display_text(raw.get("kgid"), "Unknown"),
                "zone": display_text(raw.get("zone"), "Unmapped Zone"),
                "junction": display_text(raw.get("junction"), "Unmapped Junction"),
                "event_duration_hours": round(duration, 2),
                "duration_source": duration_source,
            }
        )

    corridor_counter = Counter(row["corridor"] for row in rows)
    zone_counter = Counter(row["zone"] for row in rows)
    junction_counter = Counter(row["junction"] for row in rows)
    police_counter = Counter(row["police_station"] for row in rows)
    hour_counter = Counter(str(row["start_hour"]) for row in rows)
    day_counter = Counter(row["start_day"] for row in rows)

    context = {
        "weights": WEIGHTS,
        "cause_risk": CAUSE_RISK,
        "corridor_density": normalized_counter(corridor_counter),
        "zone_density": normalized_counter(zone_counter, {"Unmapped Zone"}),
        "junction_density": normalized_counter(junction_counter, {"Unmapped Junction"}),
        "police_density": normalized_counter(police_counter),
        "hour_risk": normalized_counter(hour_counter),
        "day_risk": normalized_counter(day_counter),
        "priority_risk": PRIORITY_RISK,
        "diversion_config": DIVERSION_CONFIG,
    }

    points = [(idx, row["latitude"], row["longitude"]) for idx, row in enumerate(rows)]
    cluster_lookup = run_dbscan(points)
    cluster_sizes = Counter(cluster_id for cluster_id in cluster_lookup.values() if cluster_id >= 0)
    max_cluster_size = max(cluster_sizes.values(), default=1)
    for idx, row in enumerate(rows):
        cluster_id = cluster_lookup.get(idx, -1)
        row["spatial_cluster_id"] = cluster_id
        row["cluster_risk"] = round(cluster_sizes.get(cluster_id, 0) / max_cluster_size, 4) if cluster_id >= 0 else 0.0

    contribution_totals: Counter[str] = Counter()
    for row in rows:
        score, components = score_components(row, context)
        row["traffic_impact_score"] = score
        row["risk_category"] = risk_category(score)
        row["score_components"] = components
        row["explanation"] = explanation(components)
        for component in components:
            contribution_totals[component["name"]] += float(component["contribution"])

    zone_corridors: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        corridor = row["corridor"]
        if corridor != "Non-corridor":
            zone_corridors[row["zone"]][corridor].append(row)

    zone_corridor_advisories: dict[str, list[dict[str, Any]]] = {}
    for zone, corridors in zone_corridors.items():
        zone_corridor_advisories[zone] = [
            {
                "corridor": corridor,
                "average_tis": round(mean(row["traffic_impact_score"] for row in members), 1),
                "count": len(members),
                "average_hotspot_density": round(mean(row["cluster_risk"] for row in members), 4),
                "closure_rate": round(sum(1 for row in members if row["requires_road_closure"]) / len(members), 4),
                "tis_standard_deviation": round(pstdev(row["traffic_impact_score"] for row in members), 4),
                "latitude": round(mean(row["latitude"] for row in members), 7),
                "longitude": round(mean(row["longitude"] for row in members), 7),
            }
            for corridor, members in sorted(
                corridors.items(), key=lambda item: mean(row["traffic_impact_score"] for row in item[1])
            )
            if len(members) >= DIVERSION_CONFIG["minimum_corridor_support"]
        ]
    context["zone_corridor_advisories"] = zone_corridor_advisories

    cluster_members: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["spatial_cluster_id"] >= 0:
            cluster_members[row["spatial_cluster_id"]].append(row)

    clusters = []
    for cluster_id, members in cluster_members.items():
        clusters.append(
            {
                "id": cluster_id,
                "latitude": round(mean(member["latitude"] for member in members), 7),
                "longitude": round(mean(member["longitude"] for member in members), 7),
                "count": len(members),
                "average_tis": round(mean(member["traffic_impact_score"] for member in members), 1),
                "risk_category": risk_category(mean(member["traffic_impact_score"] for member in members)),
                "top_cause": Counter(member["event_cause"] for member in members).most_common(1)[0][0],
                "top_corridor": Counter(member["corridor"] for member in members).most_common(1)[0][0],
                "top_police_station": Counter(member["police_station"] for member in members).most_common(1)[0][0],
            }
        )
    clusters.sort(key=lambda item: (item["average_tis"], item["count"]), reverse=True)
    cluster_by_id = {cluster["id"]: cluster for cluster in clusters}

    for row in rows:
        rec = recommendation(
            row["traffic_impact_score"], row["requires_road_closure"], row["expected_attendance"],
            row["event_duration_hours"], row["cluster_risk"],
        )
        barricade_points = [
            {"label": "Primary incident point", "latitude": row["latitude"], "longitude": row["longitude"]}
        ]
        if row.get("end_latitude") and row.get("end_longitude"):
            barricade_points.append(
                {
                    "label": "Terminal road-closure point",
                    "latitude": row["end_latitude"],
                    "longitude": row["end_longitude"],
                }
            )
        elif row["spatial_cluster_id"] in cluster_by_id:
            cluster = cluster_by_id[row["spatial_cluster_id"]]
            barricade_points.append(
                {
                    "label": "Hotspot perimeter reference",
                    "latitude": cluster["latitude"],
                    "longitude": cluster["longitude"],
                }
            )
        diversion = diversion_plan(
            row["corridor"], row["zone"], row["traffic_impact_score"], row["requires_road_closure"],
            row["cluster_risk"], row["latitude"], row["longitude"], context,
        )
        rec["barricade_points"] = barricade_points
        rec["diversion_advisory"] = diversion
        row["recommendation"] = rec

    rows.sort(key=lambda item: item["traffic_impact_score"], reverse=True)
    heatmap_points = [
        {
            "id": row["id"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "weight": round(row["traffic_impact_score"] / 100, 3),
            "risk_category": row["risk_category"],
        }
        for row in rows
    ]
    risk_counts = Counter(row["risk_category"] for row in rows)
    risk_band_order = ["Critical", "High", "Medium", "Low"]
    risk_bands = [
        {
            "name": name,
            "count": risk_counts.get(name, 0),
            "percentage": round((risk_counts.get(name, 0) / len(rows)) * 100, 1),
        }
        for name in risk_band_order
    ]

    monthly_buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    hourly_buckets: dict[int, list[dict[str, Any]]] = defaultdict(list)
    day_buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        monthly_buckets[row["start_month"]].append(row)
        hourly_buckets[row["start_hour"]].append(row)
        day_buckets[row["start_day"]].append(row)

    monthly_trend = [
        {
            "month": month,
            "events": len(items),
            "closures": sum(1 for item in items if item["requires_road_closure"]),
            "average_tis": round(mean(item["traffic_impact_score"] for item in items), 1),
        }
        for month, items in sorted(monthly_buckets.items())
    ]
    hourly_risk = [
        {
            "hour": hour,
            "events": len(hourly_buckets.get(hour, [])),
            "average_tis": round(mean(item["traffic_impact_score"] for item in hourly_buckets[hour]), 1)
            if hourly_buckets.get(hour)
            else 0,
        }
        for hour in range(24)
    ]
    day_risk = [
        {
            "day": day,
            "events": len(day_buckets.get(day, [])),
            "average_tis": round(mean(item["traffic_impact_score"] for item in day_buckets[day]), 1)
            if day_buckets.get(day)
            else 0,
        }
        for day in DAY_ORDER
    ]

    feature_importance = [
        {
            "feature": name,
            "average_contribution": round(total / len(rows), 2),
            "weight": next((component["weight"] for component in rows[0]["score_components"] if component["name"] == name), 0),
        }
        for name, total in contribution_totals.most_common()
    ]

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_source": "ASTraM instructor-provided anonymized event dataset only",
        "honesty_notice": "The dataset does not contain measured congestion, vehicle counts, travel time, or delay duration. Scores represent operational traffic impact risk.",
        "data_quality": {
            "raw_rows": len(raw_rows),
            "processed_rows": len(rows),
            "dropped_columns_over_95_missing": dropped_columns,
            "duration_source_counts": dict(duration_source_counts),
            "date_range": {
                "start": min(row["start_datetime"] for row in rows),
                "end": max(row["start_datetime"] for row in rows),
            },
        },
        "metrics": {
            "total_events": len(rows),
            "road_closures": sum(1 for row in rows if row["requires_road_closure"]),
            "high_risk_events": sum(1 for row in rows if row["risk_category"] in {"High", "Critical"}),
            "critical_events": risk_counts.get("Critical", 0),
            "active_events": sum(1 for row in rows if row["status"].lower() == "active"),
            "average_tis": round(mean(row["traffic_impact_score"] for row in rows), 1),
            "planned_events": sum(1 for row in rows if row["event_type"].lower() == "planned"),
            "unplanned_events": sum(1 for row in rows if row["event_type"].lower() == "unplanned"),
        },
        "risk_bands": risk_bands,
        "top_causes": top_counter(rows, "event_cause", 12),
        "top_corridors": top_counter(rows, "corridor", 12),
        "top_zones": average_by(rows, "zone", 10),
        "top_police_stations": average_by(rows, "police_station", 10),
        "monthly_trend": monthly_trend,
        "hourly_risk": hourly_risk,
        "day_risk": day_risk,
        "score_weights": [
            {"name": key.replace("_", " ").title(), "weight": round(value * 100, 1)}
            for key, value in WEIGHTS.items()
        ],
        "feature_importance": feature_importance,
        "model_comparison": [
            {
                "model": "Traffic Impact Score formula",
                "role": "Authoritative operational risk layer",
                "fit_status": "Computed directly from provided dataset features",
                "r2": 1.0,
                "mae": 0.0,
            },
            {
                "model": "CatBoost surrogate",
                "role": "Optional learner for the TIS target",
                "fit_status": "Ready when optional ML dependencies are installed",
                "r2": None,
                "mae": None,
            },
            {
                "model": "Random Forest / XGBoost / LightGBM",
                "role": "Optional benchmark family",
                "fit_status": "Configured as install-time benchmark candidates",
                "r2": None,
                "mae": None,
            },
        ],
        "top_risk_events": rows[:12],
    }

    hotspots = {
        "clusters": clusters,
        "heatmap_points": heatmap_points,
        "corridor_hotspots": average_by(rows, "corridor", 12),
        "zone_hotspots": average_by(rows, "zone", 12),
        "police_station_hotspots": average_by(rows, "police_station", 12),
    }
    context.update(
        {
            "scoring_version": "tis-v1-standard-library",
            "risk_thresholds": {"Critical": 80, "High": 65, "Medium": 45, "Low": 0},
            "zone_corridor_advisories": zone_corridor_advisories,
            "feature_importance": feature_importance,
            "hotspot_clusters": clusters,
        }
    )
    copilot_corpus = {
        "summary": summary,
        "top_events": rows[:25],
        "hotspots": clusters[:25],
        "corridor_hotspots": hotspots["corridor_hotspots"],
        "zone_hotspots": hotspots["zone_hotspots"],
    }

    outputs = {
        "events.json": rows,
        "summary.json": summary,
        "hotspots.json": hotspots,
        "context.json": context,
        "copilot_corpus.json": copilot_corpus,
    }
    for filename, payload in outputs.items():
        with (OUT_DIR / filename).open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

    print(json.dumps({
        "processed_rows": len(rows),
        "clusters": len(clusters),
        "average_tis": summary["metrics"]["average_tis"],
        "output_dir": str(OUT_DIR),
    }, indent=2))


if __name__ == "__main__":
    main()

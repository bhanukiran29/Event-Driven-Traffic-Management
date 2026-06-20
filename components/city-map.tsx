"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { HotspotCluster, RiskEvent } from "@/lib/types";

type HeatPoint = {
  id: string;
  latitude: number;
  longitude: number;
  weight: number;
  risk_category: string;
};

type CityMapProps = {
  events: RiskEvent[];
  clusters: HotspotCluster[];
  heatmapPoints: HeatPoint[];
  mode?: "events" | "hotspots";
};

const RISK_COLOR: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#f6b73c",
  Low: "#22c55e"
};

function featureCollection(points: HeatPoint[]) {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      properties: {
        id: point.id,
        weight: point.weight,
        risk_category: point.risk_category,
        color: RISK_COLOR[point.risk_category] || "#38bdf8"
      },
      geometry: {
        type: "Point",
        coordinates: [point.longitude, point.latitude]
      }
    }))
  } as GeoJSON.FeatureCollection<GeoJSON.Point>;
}

function eventFeatureCollection(events: RiskEvent[]) {
  return {
    type: "FeatureCollection",
    features: events.map((event) => ({
      type: "Feature",
      properties: {
        id: event.id,
        score: event.traffic_impact_score,
        risk_category: event.risk_category,
        cause: event.event_cause,
        corridor: event.corridor,
        station: event.police_station,
        color: RISK_COLOR[event.risk_category] || "#38bdf8"
      },
      geometry: {
        type: "Point",
        coordinates: [event.longitude, event.latitude]
      }
    }))
  } as GeoJSON.FeatureCollection<GeoJSON.Point>;
}

function clusterFeatureCollection(clusters: HotspotCluster[]) {
  return {
    type: "FeatureCollection",
    features: clusters.map((cluster) => ({
      type: "Feature",
      properties: {
        id: cluster.id,
        count: cluster.count,
        average_tis: cluster.average_tis,
        risk_category: cluster.risk_category,
        station: cluster.top_police_station
      },
      geometry: {
        type: "Point",
        coordinates: [cluster.longitude, cluster.latitude]
      }
    }))
  } as GeoJSON.FeatureCollection<GeoJSON.Point>;
}

export function CityMap({ events, clusters, heatmapPoints, mode = "events" }: CityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const heatData = useMemo(() => featureCollection(heatmapPoints), [heatmapPoints]);
  const eventData = useMemo(() => eventFeatureCollection(events), [events]);
  const clusterData = useMemo(() => clusterFeatureCollection(clusters), [clusters]);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) {
      return;
    }
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [77.5946, 12.9716],
      zoom: 10.2,
      pitch: 32,
      bearing: -8,
      attributionControl: false
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      map.addSource("tis-heat", { type: "geojson", data: heatData });
      map.addSource("event-points", { type: "geojson", data: eventData });
      map.addSource("hotspot-clusters", { type: "geojson", data: clusterData });

      map.addLayer({
        id: "tis-heat-layer",
        type: "heatmap",
        source: "tis-heat",
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 1, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 13, 1.6],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 8, 13, 30],
          "heatmap-opacity": mode === "hotspots" ? 0.78 : 0.52,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(22, 163, 74, 0)",
            0.25,
            "rgba(59, 130, 246, 0.45)",
            0.5,
            "rgba(245, 158, 11, 0.65)",
            0.78,
            "rgba(217, 119, 6, 0.80)",
            1,
            "rgba(220, 38, 38, 0.90)"
          ]
        }
      });

      map.addLayer({
        id: "event-point-layer",
        type: "circle",
        source: "event-points",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "score"], 35, 4, 85, 11],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1.5,
          "circle-opacity": mode === "events" ? 0.9 : 0.35
        }
      });

      map.addLayer({
        id: "hotspot-cluster-layer",
        type: "circle",
        source: "hotspot-clusters",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "count"], 8, 6, 200, 18, 1000, 28],
          "circle-color": "#3B82F6",
          "circle-opacity": mode === "hotspots" ? 0.55 : 0.25,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1.5
        }
      });

      map.on("click", "event-point-layer", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") {
          return;
        }
        const props = feature.properties || {};
        const coordinates = feature.geometry.coordinates.slice() as [number, number];
        new mapboxgl.Popup({ closeButton: false, className: "traffic-popup" })
          .setLngLat(coordinates)
          .setHTML(
            `<div style="font-family:var(--font-inter,system-ui,sans-serif);font-size:13px;color:#0F172A;">
              <div style="font-weight:600;margin-bottom:4px;">${props.id}</div>
              <div style="color:#6B7280;margin-bottom:2px;">TIS ${Number(props.score).toFixed(1)} · ${props.risk_category}</div>
              <div style="color:#374151;">${String(props.cause).replace(/_/g," ").replace(/\b\w/g,(l:string)=>l.toUpperCase())}</div>
              <div style="color:#6B7280;font-size:12px;margin-top:4px;">${props.corridor}</div>
            </div>`
          )
          .addTo(map);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) {
      return;
    }
    (map.getSource("tis-heat") as mapboxgl.GeoJSONSource | undefined)?.setData(heatData);
    (map.getSource("event-points") as mapboxgl.GeoJSONSource | undefined)?.setData(eventData);
    (map.getSource("hotspot-clusters") as mapboxgl.GeoJSONSource | undefined)?.setData(clusterData);
    if (map.getLayer("tis-heat-layer")) {
      map.setPaintProperty("tis-heat-layer", "heatmap-opacity", mode === "hotspots" ? 0.78 : 0.52);
      map.setPaintProperty("event-point-layer", "circle-opacity", mode === "events" ? 0.92 : 0.38);
      map.setPaintProperty("hotspot-cluster-layer", "circle-opacity", mode === "hotspots" ? 0.58 : 0.28);
    }
  }, [heatData, eventData, clusterData, mode]);

  if (!token) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-border-base bg-surface-subtle text-sm text-ink-muted">
        Mapbox token is missing from .env.local.
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full overflow-hidden rounded-xl bg-surface-subtle" />;
}

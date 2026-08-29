// Geo helpers for the map surface. The page — not the agent — talks to the
// routing service: the tool call carries two endpoints, the page fetches the
// street geometry, and only the human-scale summary (distance, minutes,
// street names) flows back through the WebMCP channel.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface WalkingRoute {
  points: [number, number][];
  distanceM: number;
  durationMin: number;
  streets: string[];
  fallback: boolean;
}

const WALK_M_PER_MIN = 80;

export function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

// Straight-line stand-in so a routing-service outage can never stall a demo.
export function fallbackRoute(from: GeoPoint, to: GeoPoint): WalkingRoute {
  const distanceM = haversineM(from, to);
  return {
    points: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    distanceM,
    durationMin: Math.max(1, Math.round(distanceM / WALK_M_PER_MIN)),
    streets: [],
    fallback: true,
  };
}

// Free OSRM instance run by FOSSGIS — the same routing the openstreetmap.org
// site uses for its own directions. No API key; light demo traffic only.
const OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";

export async function walkingRoute(
  from: GeoPoint,
  to: GeoPoint,
  fetcher: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<WalkingRoute> {
  try {
    const url = `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return fallbackRoute(from, to);
    const data: any = await res.json();
    const route = data?.routes?.[0];
    const coords: [number, number][] | undefined = route?.geometry?.coordinates;
    if (data?.code !== "Ok" || !route || !Array.isArray(coords) || coords.length < 2) {
      return fallbackRoute(from, to);
    }
    const streets: string[] = [];
    for (const leg of route.legs ?? []) {
      for (const step of leg.steps ?? []) {
        const name = typeof step?.name === "string" ? step.name.trim() : "";
        if (name && streets[streets.length - 1] !== name) streets.push(name);
      }
    }
    return {
      points: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
      distanceM: Math.round(route.distance),
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      streets: streets.slice(0, 5),
      fallback: false,
    };
  } catch {
    return fallbackRoute(from, to);
  }
}

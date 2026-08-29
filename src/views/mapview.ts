// Live map renderer for location-shaped presentations. Loaded lazily (dynamic
// import) so Leaflet never weighs down the base page — the chunk and the tiles
// only arrive when a map surface first renders.
//
// The Leaflet instance lives on a persistent container div owned by this
// module. Renders re-append that same div into the fresh stage DOM, so tiles
// survive every re-render with no reload or flash.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Store, Stack, CardItem, RouteState } from "../state/store";
import { isValidCoord } from "../geo";

const container = document.createElement("div");
container.className = "map-live";

let map: L.Map | null = null;
let pinLayer = L.layerGroup();
let youLayer = L.layerGroup();
let routeLayer = L.layerGroup();
let pinnedSignature = "";
let routeSignature = "";
let focusedId: string | null = null;
let fittedStackId: string | null = null;
let lastSize = "";

const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Standard OSM raster tiles — keyless and reliable. The dark look comes from
// a CSS filter on the tile pane only (see .map-dark-tiles), so pins, the
// route, and labels drawn by us keep their true colors.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function ensureMap(): L.Map {
  if (map) return map;
  map = L.map(container, { zoomControl: false, attributionControl: true });
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, className: "map-dark-tiles" }).addTo(map);
  pinLayer.addTo(map);
  youLayer.addTo(map);
  routeLayer.addTo(map);
  map.setView([22.28, 114.17], 14);
  return map;
}

export function geoItems(stack: Stack): CardItem[] {
  return stack.items.filter((item) => isValidCoord(item.lat, item.lng));
}

function pinIcon(n: number, focused: boolean, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: "map-pin-wrap",
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    html: `<div class="map-pin${focused ? " focus" : ""}${selected ? " sel" : ""}"><span>${n}</span></div>`,
  });
}

function youIcon(label?: string): L.DivIcon {
  return L.divIcon({
    className: "map-you-wrap",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div class="map-you"></div>${label ? `<div class="map-you-label">${label.replace(/[&<>"]/g, "")}</div>` : ""}`,
  });
}

function destIcon(): L.DivIcon {
  return L.divIcon({ className: "map-dest-wrap", iconSize: [34, 34], iconAnchor: [17, 17], html: '<div class="map-dest-pulse"></div>' });
}

// Draw-in effect: Leaflet polylines are SVG paths, so the classic
// dashoffset trick animates the route from origin to destination.
function animateDrawIn(line: L.Polyline) {
  const el = line.getElement() as SVGPathElement | null;
  if (!el || reducedMotion() || typeof el.getTotalLength !== "function") return;
  const length = el.getTotalLength();
  el.style.transition = "none";
  el.style.strokeDasharray = `${length}`;
  el.style.strokeDashoffset = `${length}`;
  el.getBoundingClientRect();
  el.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.4, 0, 0.2, 1)";
  el.style.strokeDashoffset = "0";
  el.addEventListener(
    "transitionend",
    () => {
      el.style.transition = "none";
      el.style.strokeDasharray = "none";
    },
    { once: true },
  );
}

// Flying mid-layer-transition can hit a zero-size viewport and throw NaN
// coordinates out of Leaflet — defer a frame, refresh the size, and fall back
// to an instant fit rather than ever losing the view.
function safeFlyToBounds(bounds: L.LatLngBounds) {
  if (!bounds.isValid()) return;
  requestAnimationFrame(() => {
    if (!map) return;
    try {
      map.invalidateSize();
      map.flyToBounds(bounds, { duration: reducedMotion() ? 0 : 0.9, maxZoom: 17 });
    } catch {
      map.fitBounds(bounds, { maxZoom: 17, animate: false });
    }
  });
}

function routeBounds(route: RouteState): L.LatLngBounds {
  return L.latLngBounds(route.points.map(([lat, lng]) => L.latLng(lat, lng))).pad(0.18);
}

function drawRoute(route: RouteState) {
  routeLayer.clearLayers();
  const points = route.points.map(([lat, lng]) => L.latLng(lat, lng));
  L.polyline(points, { className: "route-glow", weight: 11, opacity: 1, interactive: false }).addTo(routeLayer);
  const main = L.polyline(points, {
    className: `route-main${route.fallback ? " fallback" : ""}`,
    weight: 4,
    opacity: 1,
    interactive: false,
  }).addTo(routeLayer);
  if (!reducedMotion() && !route.fallback) {
    L.polyline(points, { className: "route-flow", weight: 2.5, opacity: 1, interactive: false }).addTo(routeLayer);
  }
  L.marker(points[points.length - 1], { icon: destIcon(), interactive: false }).addTo(routeLayer);
  animateDrawIn(main);
  safeFlyToBounds(L.latLngBounds(points).pad(0.18));
}

// Called by the renderer after every render pass while a map layout is on
// screen. Idempotent: signatures keep tile/marker churn to actual changes.
export function sync(store: Store, placeholder: HTMLElement) {
  const stack = store.activeStack();
  if (!stack) return;
  if (container.parentElement !== placeholder) {
    placeholder.appendChild(container);
  }
  const m = ensureMap();
  // invalidateSize cancels any in-flight fly animation, so only call it when
  // the container genuinely changed size (mount, resize, glasses toggle).
  const size = `${placeholder.clientWidth}x${placeholder.clientHeight}`;
  const resized = size !== lastSize;
  if (resized) {
    lastSize = size;
    m.invalidateSize();
  }

  const items = geoItems(stack);
  const focused = stack.items[stack.focusIndex];
  const s = store.state;

  const pinSig = JSON.stringify([stack.id, items.map((i) => [i.id, i.lat, i.lng, Boolean(i.selected)]), focused?.id, s.userLocation]);
  if (pinSig !== pinnedSignature) {
    pinnedSignature = pinSig;
    pinLayer.clearLayers();
    items.forEach((item, index) => {
      const marker = L.marker([item.lat!, item.lng!], {
        icon: pinIcon(index + 1, item.id === focused?.id, Boolean(item.selected)),
      });
      marker.on("click", () => store.focusItem(item.id));
      marker.addTo(pinLayer);
    });
    youLayer.clearLayers();
    if (s.userLocation) {
      L.marker([s.userLocation.lat, s.userLocation.lng], {
        icon: youIcon(s.userLocation.label),
        interactive: false,
        zIndexOffset: -100,
      }).addTo(youLayer);
    }
  }

  const routeSig = s.route ? JSON.stringify([s.route.toId, s.route.points.length, s.route.distanceM]) : "";
  if (routeSig !== routeSignature) {
    routeSignature = routeSig;
    if (s.route) drawRoute(s.route);
    else routeLayer.clearLayers();
  } else if (resized && lastSize !== "" && s.route) {
    // A lens/desktop switch reshapes the viewport — keep the route in frame.
    safeFlyToBounds(routeBounds(s.route));
  }

  if (fittedStackId !== stack.id) {
    fittedStackId = stack.id;
    focusedId = focused?.id ?? null;
    const bounds = L.latLngBounds([
      ...items.map((i) => [i.lat!, i.lng!] as [number, number]),
      ...(s.userLocation ? [[s.userLocation.lat, s.userLocation.lng] as [number, number]] : []),
    ]);
    if (bounds.isValid()) m.fitBounds(bounds.pad(0.25), { maxZoom: 16, animate: false });
  } else if (focused && focused.id !== focusedId && isValidCoord(focused.lat, focused.lng) && !s.route) {
    focusedId = focused.id;
    m.flyTo([focused.lat!, focused.lng!], Math.max(m.getZoom(), 15), { duration: reducedMotion() ? 0 : 0.7 });
  } else {
    focusedId = focused?.id ?? null;
  }
}

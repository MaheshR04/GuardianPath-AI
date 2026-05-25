import { useEffect, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  LOCATION_ZOOM,
  OPEN_STREET_MAP_ATTRIBUTION,
  OPEN_STREET_MAP_TILE_URL,
  toLatLng,
} from '../../services/mapService.js';

function createUserIcon(L) {
  return L.divIcon({
    className: '',
    html: '<span class="block h-5 w-5 rounded-full border-[3px] border-white bg-brand-600 shadow-[0_0_0_8px_rgba(27,154,139,0.22)]"></span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createDestinationIcon(L) {
  return L.divIcon({
    className: '',
    html: '<span class="block h-6 w-6 rounded-full border-[3px] border-white bg-red-500 shadow-[0_0_0_8px_rgba(239,68,68,0.18)]"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function getRouteStyle(route, selectedRouteId) {
  if (route.id === selectedRouteId || route.isSafest) {
    return {
      color: '#137c72',
      weight: 7,
      opacity: 0.95,
    };
  }

  return {
    color: '#64748b',
    weight: 4,
    opacity: 0.5,
  };
}

function getRiskZoneStyle(zone) {
  if (zone.level === 'CRITICAL') {
    return { color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.22, opacity: 0.65, weight: 2 };
  }

  if (zone.level === 'HIGH') {
    return { color: '#ea580c', fillColor: '#f97316', fillOpacity: 0.2, opacity: 0.6, weight: 2 };
  }

  return { color: '#d97706', fillColor: '#f59e0b', fillOpacity: 0.16, opacity: 0.55, weight: 1 };
}

function MapView({ destination, location, riskZones = [], routes = [], selectedRouteId, status }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const riskLayerRef = useRef(null);
  const hasCenteredRef = useRef(false);
  const leafletRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    let isMounted = true;

    async function initializeMap() {
      const { default: L } = await import('leaflet');

      if (!isMounted || !containerRef.current) {
        return;
      }

      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        boxZoom: true,
        doubleClickZoom: true,
        dragging: true,
        keyboard: true,
        scrollWheelZoom: true,
        tap: true,
        touchZoom: true,
        zoomControl: true,
        attributionControl: true,
        worldCopyJump: true,
      });

      L.tileLayer(OPEN_STREET_MAP_TILE_URL, {
        attribution: OPEN_STREET_MAP_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

      markerRef.current = L.marker(DEFAULT_CENTER, {
        icon: createUserIcon(L),
        title: 'Current user location',
      }).addTo(map);

      mapRef.current = map;
      setMapReady(true);

      window.setTimeout(() => map.invalidateSize(), 0);
    }

    initializeMap();

    return () => {
      isMounted = false;
      hasCenteredRef.current = false;
      markerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      routeLayerRef.current?.remove();
      riskLayerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      destinationMarkerRef.current = null;
      routeLayerRef.current = null;
      riskLayerRef.current = null;
      mapRef.current = null;
      leafletRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !location) {
      return;
    }

    const latLng = toLatLng(location);
    markerRef.current.setLatLng(latLng);

    if (!hasCenteredRef.current) {
      mapRef.current.flyTo(latLng, LOCATION_ZOOM, {
        animate: true,
        duration: 0.8,
      });
      hasCenteredRef.current = true;
    }
  }, [location]);

  useEffect(() => {
    const L = leafletRef.current;

    if (!mapRef.current || !L) {
      return;
    }

    riskLayerRef.current?.remove();
    riskLayerRef.current = L.layerGroup().addTo(mapRef.current);

    riskZones.forEach((zone) => {
      L.circle([zone.latitude, zone.longitude], {
        radius: zone.radiusMeters,
        ...getRiskZoneStyle(zone),
      })
        .bindPopup(`<strong>${zone.label}</strong><br/>${zone.category}<br/>Risk: ${zone.level}`)
        .addTo(riskLayerRef.current);
    });
  }, [riskZones]);

  useEffect(() => {
    const L = leafletRef.current;

    if (!mapRef.current || !L) {
      return;
    }

    routeLayerRef.current?.remove();
    routeLayerRef.current = L.layerGroup().addTo(mapRef.current);

    routes.forEach((route) => {
      L.polyline(route.geometry, getRouteStyle(route, selectedRouteId)).addTo(routeLayerRef.current);
    });

    destinationMarkerRef.current?.remove();
    destinationMarkerRef.current = null;

    if (destination) {
      destinationMarkerRef.current = L.marker([destination.latitude, destination.longitude], {
        icon: createDestinationIcon(L),
        title: 'Selected destination',
      }).addTo(mapRef.current);
    }

    if (routes.length > 0) {
      const bounds = L.latLngBounds(routes.flatMap((route) => route.geometry));
      mapRef.current.fitBounds(bounds, {
        padding: [28, 28],
      });
    }
  }, [destination, routes, selectedRouteId]);

  const recenterMap = () => {
    if (!mapRef.current || !location) {
      return;
    }

    mapRef.current.flyTo(toLatLng(location), LOCATION_ZOOM, {
      animate: true,
      duration: 0.8,
    });
  };

  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-md bg-white/95 px-3 py-2 text-sm font-medium text-slate-700 shadow-soft">
        {status === 'ready' && mapReady ? 'Live location active' : 'Locating user...'}
      </div>
      <button
        type="button"
        onClick={recenterMap}
        disabled={!location}
        className="absolute bottom-4 right-4 z-[500] inline-flex h-11 w-11 items-center justify-center rounded-md bg-white text-slate-700 shadow-soft transition hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Recenter map"
        title="Recenter map"
      >
        <Crosshair size={19} aria-hidden="true" />
      </button>
    </div>
  );
}

export default MapView;

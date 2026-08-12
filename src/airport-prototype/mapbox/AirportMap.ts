import mapboxgl from 'mapbox-gl';
import type { DisplayPosition, GeoSample, MarkedWaypoint, Prediction } from '../types';
import { getMapboxToken } from '../config';

export interface MapPoint {
  lat: number;
  lng: number;
}

const YVR_CENTER: [number, number] = [-123.181, 49.196];

export class AirportMap {
  private map: mapboxgl.Map | null = null;
  private container: HTMLElement;
  private onDestinationSelect: ((lat: number, lng: number) => void) | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private trackCoords: [number, number][] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(onDestinationSelect: (lat: number, lng: number) => void): boolean {
    const token = getMapboxToken();
    if (!token) return false;

    mapboxgl.accessToken = token;
    this.onDestinationSelect = onDestinationSelect;

    this.map = new mapboxgl.Map({
      container: this.container,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: YVR_CENTER,
      zoom: 16,
      attributionControl: true,
    });

    this.map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

    this.map.on('load', () => {
      this.ensureSourcesAndLayers();
    });

    this.map.on('click', (e) => {
      this.onDestinationSelect?.(e.lngLat.lat, e.lngLat.lng);
    });

    this.map.on('contextmenu', (e) => {
      e.preventDefault();
      this.onDestinationSelect?.(e.lngLat.lat, e.lngLat.lng);
    });

    this.bindLongPress();
    return true;
  }

  private bindLongPress(): void {
    const el = this.container;
    const start = (e: TouchEvent) => {
      if (!this.map || e.touches.length !== 1) return;
      const touch = e.touches[0];
      this.longPressTimer = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const point: [number, number] = [touch.clientX - rect.left, touch.clientY - rect.top];
        const lngLat = this.map!.unproject(point);
        this.onDestinationSelect?.(lngLat.lat, lngLat.lng);
      }, 600);
    };
    const cancel = () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchmove', cancel);
  }

  private ensureSourcesAndLayers(): void {
    if (!this.map) return;

    const sources = ['route', 'track', 'waypoints'] as const;
    for (const id of sources) {
      if (!this.map.getSource(id)) {
        this.map.addSource(id, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
    }

    if (!this.map.getLayer('route-line')) {
      this.map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#4f46e5', 'line-width': 4, 'line-opacity': 0.85 },
      });
    }

    if (!this.map.getLayer('track-line')) {
      this.map.addLayer({
        id: 'track-line',
        type: 'line',
        source: 'track',
        paint: { 'line-color': '#16a34a', 'line-width': 3, 'line-opacity': 0.9 },
      });
    }

    if (!this.map.getLayer('waypoints-circles')) {
      this.map.addLayer({
        id: 'waypoints-circles',
        type: 'circle',
        source: 'waypoints',
        paint: {
          'circle-radius': 7,
          'circle-color': '#f59e0b',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
    }
  }

  setUserMarker(pos: DisplayPosition | null): void {
    if (!this.map || !pos) return;
    this.setMarker('user-marker', pos.longitude, pos.latitude, '#2563eb');
  }

  setDestinationMarker(point: MapPoint | null): void {
    if (!this.map) return;
    if (!point) {
      this.removeMarker('dest-marker');
      return;
    }
    this.setMarker('dest-marker', point.lng, point.lat, '#dc2626');
  }

  private markers = new Map<string, mapboxgl.Marker>();

  private setMarker(id: string, lng: number, lat: number, color: string): void {
    if (!this.map) return;
    let marker = this.markers.get(id);
    if (!marker) {
      const el = document.createElement('div');
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '50%';
      el.style.border = '3px solid #fff';
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';
      el.style.background = color;
      marker = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(this.map);
      this.markers.set(id, marker);
    } else {
      marker.setLngLat([lng, lat]);
    }
  }

  private removeMarker(id: string): void {
    const marker = this.markers.get(id);
    if (marker) {
      marker.remove();
      this.markers.delete(id);
    }
  }

  setRoute(prediction: Prediction): void {
    if (!this.map?.getSource('route')) return;
    const source = this.map.getSource('route') as mapboxgl.GeoJSONSource;
    if (prediction.routeGeometry) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: prediction.routeGeometry,
      });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  updateTrack(samples: GeoSample[]): void {
    if (!this.map?.getSource('track')) return;
    this.trackCoords = samples.map((s) => [s.longitude, s.latitude]);
    const source = this.map.getSource('track') as mapboxgl.GeoJSONSource;
    if (this.trackCoords.length < 2) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: this.trackCoords },
    });
  }

  setWaypoints(waypoints: MarkedWaypoint[]): void {
    if (!this.map?.getSource('waypoints')) return;
    const source = this.map.getSource('waypoints') as mapboxgl.GeoJSONSource;
    source.setData({
      type: 'FeatureCollection',
      features: waypoints.map((w) => ({
        type: 'Feature',
        properties: { label: w.label },
        geometry: { type: 'Point', coordinates: [w.longitude, w.latitude] },
      })),
    });
  }

  recenterOn(lng: number, lat: number): void {
    this.map?.flyTo({ center: [lng, lat], zoom: Math.max(this.map.getZoom(), 17) });
  }

  getCenter(): MapPoint | null {
    if (!this.map) return null;
    const c = this.map.getCenter();
    return { lat: c.lat, lng: c.lng };
  }

  centerOnYvr(): void {
    this.map?.flyTo({ center: YVR_CENTER, zoom: 16 });
  }

  resize(): void {
    this.map?.resize();
  }

  destroy(): void {
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    this.map?.remove();
    this.map = null;
  }
}

import { YVR_BOUNDS } from '../constants';

export function isNearYvr(latitude: number, longitude: number): boolean {
  return (
    latitude >= YVR_BOUNDS.minLat &&
    latitude <= YVR_BOUNDS.maxLat &&
    longitude >= YVR_BOUNDS.minLng &&
    longitude <= YVR_BOUNDS.maxLng
  );
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs} sec`;
  return `${mins} min ${secs.toString().padStart(2, '0')} sec`;
}

export function formatDistance(meters: number | null): string {
  if (meters === null || Number.isNaN(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function sanitizeFilenameTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, '-').replace(/Z$/, 'Z');
}

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'Location permission denied. Enable location access in your browser settings and try again.';
    case 2:
      return 'Location unavailable. Your device could not determine a position.';
    case 3:
      return 'Location request timed out. Try moving to an area with better signal or retry.';
    default:
      return 'An unknown geolocation error occurred.';
  }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

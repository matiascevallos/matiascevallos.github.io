import type { Prediction } from '../types';
import { getMapboxToken } from '../config';

export interface DirectionsResult {
  prediction: Prediction;
  error: string | null;
}

export async function fetchWalkingRoute(
  startLng: number,
  startLat: number,
  destLng: number,
  destLat: number,
): Promise<DirectionsResult> {
  const token = getMapboxToken();
  if (!token) {
    return {
      prediction: emptyPrediction(),
      error: 'Mapbox token is not configured.',
    };
  }

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/` +
    `${startLng},${startLat};${destLng},${destLat}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        prediction: emptyPrediction(),
        error: `Directions request failed (${response.status}).`,
      };
    }

    const data = (await response.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { type: 'LineString'; coordinates: [number, number][] };
      }>;
      code?: string;
      message?: string;
    };

    const route = data.routes?.[0];
    if (!route) {
      return {
        prediction: emptyPrediction(),
        error: data.message ?? 'Indoor walking route unavailable',
      };
    }

    return {
      prediction: {
        routeAvailable: true,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        routeGeometry: route.geometry,
      },
      error: null,
    };
  } catch {
    return {
      prediction: emptyPrediction(),
      error: 'Network error while fetching walking route.',
    };
  }
}

function emptyPrediction(): Prediction {
  return {
    routeAvailable: false,
    distanceMeters: null,
    durationSeconds: null,
    routeGeometry: null,
  };
}

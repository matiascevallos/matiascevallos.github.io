import type { DisplayPosition, GeoSample } from '../types';
import { DISPLAY_SMOOTHING_ALPHA } from '../constants';

/**
 * Applies simple exponential smoothing for map display only.
 * Raw GeoSample values are never modified.
 */
export function smoothDisplayPosition(
  previous: DisplayPosition | null,
  sample: GeoSample,
): DisplayPosition {
  if (!previous) {
    return { latitude: sample.latitude, longitude: sample.longitude };
  }
  const alpha = DISPLAY_SMOOTHING_ALPHA;
  return {
    latitude: previous.latitude + alpha * (sample.latitude - previous.latitude),
    longitude: previous.longitude + alpha * (sample.longitude - previous.longitude),
  };
}

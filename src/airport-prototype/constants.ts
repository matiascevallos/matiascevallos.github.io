/** GPS quality thresholds — adjust after field testing. */
export const GPS_QUALITY_THRESHOLDS = {
  goodMaxMeters: 15,
  moderateMaxMeters: 30,
  poorMaxMeters: 60,
} as const;

/** YVR approximate bounding box for informational detection only. */
export const YVR_BOUNDS = {
  minLat: 49.188,
  maxLat: 49.208,
  minLng: -123.195,
  maxLng: -123.165,
} as const;

export const TESTING_AIRPORT_NAME = 'Vancouver International Airport (YVR)';

export const LOCAL_STORAGE_KEYS = {
  activeJourney: 'airport-prototype-active-journey',
  activeStationary: 'airport-prototype-active-stationary',
  destination: 'airport-prototype-destination',
  flightNumber: 'airport-prototype-flight-number',
} as const;

export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

export const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 1000,
};

/** Arrival proximity hint — not used for auto-finish. */
export const ARRIVAL_HINT_DISTANCE_METERS = 40;

/** Simple exponential smoothing factor for display position only (0–1). */
export const DISPLAY_SMOOTHING_ALPHA = 0.35;

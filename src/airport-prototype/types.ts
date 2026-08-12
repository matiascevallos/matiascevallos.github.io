/** Application states for the walking test flow. */
export type AppState =
  | 'SETUP'
  | 'READY'
  | 'TRACKING'
  | 'ARRIVAL_CONFIRMATION'
  | 'RESULTS';

export type TestMode = 'walking' | 'stationary';

/** Raw geolocation sample — immutable once stored. */
export interface GeoSample {
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface MarkedWaypoint {
  id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  label: string | null;
}

export interface VisibilityEvent {
  timestamp: string;
  type: 'visibility';
  state: 'visible' | 'hidden';
}

/** Original Mapbox prediction — never mutated after journey start. */
export interface Prediction {
  routeAvailable: boolean;
  distanceMeters: number | null;
  durationSeconds: number | null;
  routeGeometry: { type: 'LineString'; coordinates: [number, number][] } | null;
}

export interface JourneyFeedback {
  walkedDirectly: 'yes' | 'no' | null;
  estimateUsefulness: 'too-short' | 'about-right' | 'too-long' | 'not-applicable' | null;
  routeCorrect: 'yes' | 'no' | 'not-sure' | 'no-route' | null;
  locationAccuracyFeel: 'good' | 'acceptable' | 'poor' | 'very-poor' | null;
  issues: string[];
  notes: string;
}

export interface JourneyStatistics {
  sampleCount: number;
  medianAccuracyMeters: number | null;
  meanAccuracyMeters: number | null;
  bestAccuracyMeters: number | null;
  worstAccuracyMeters: number | null;
  testDurationSeconds: number | null;
  firstSampleTimestamp: string | null;
  lastSampleTimestamp: string | null;
  longestSampleGapSeconds: number | null;
  markedLandmarkCount: number;
}

export interface JourneyMetadata {
  journeyId: string;
  flightNumber: string | null;
  startedAt: string;
  completedAt: string | null;
  browserUserAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  testMode: TestMode;
  testingAirport: string;
  startingLatitude: number;
  startingLongitude: number;
  startingAccuracyMeters: number;
  destinationLatitude: number;
  destinationLongitude: number;
  initialDocumentVisibility: DocumentVisibilityState;
}

export interface JourneyActual {
  actualDurationSeconds: number | null;
  predictionErrorSeconds: number | null;
  absoluteErrorSeconds: number | null;
  percentageError: number | null;
}

export interface Journey {
  metadata: JourneyMetadata;
  prediction: Prediction;
  actual: JourneyActual;
  samples: GeoSample[];
  waypoints: MarkedWaypoint[];
  visibilityEvents: VisibilityEvent[];
  statistics: JourneyStatistics;
  feedback: JourneyFeedback;
  appState: AppState;
  /** Straight-line distance when no walking route — informational only. */
  straightLineDistanceMeters: number | null;
}

export interface StationaryTestMetadata {
  testId: string;
  label: string | null;
  startedAt: string;
  completedAt: string | null;
  browserUserAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  testingAirport: string;
  initialLatitude: number |  null;
  initialLongitude: number | null;
}

export interface StationaryDriftStats {
  medianLatitude: number | null;
  medianLongitude: number | null;
  maxDisplacementMeters: number | null;
  spreadLatitudeMeters: number | null;
  spreadLongitudeMeters: number | null;
}

export interface StationaryTest {
  metadata: StationaryTestMetadata;
  samples: GeoSample[];
  visibilityEvents: VisibilityEvent[];
  statistics: JourneyStatistics;
  drift: StationaryDriftStats;
  appState: 'idle' | 'running' | 'complete';
}

export interface ExportPayload {
  metadata: Record<string, unknown>;
  prediction: Record<string, unknown>;
  actual: Record<string, unknown>;
  samples: GeoSample[];
  waypoints: MarkedWaypoint[];
  visibilityEvents: VisibilityEvent[];
  statistics: JourneyStatistics | Record<string, unknown>;
  feedback: JourneyFeedback | Record<string, unknown>;
  drift?: StationaryDriftStats;
}

export interface DisplayPosition {
  latitude: number;
  longitude: number;
}

export interface GeolocationErrorInfo {
  code: number;
  message: string;
}

declare global {
  interface Window {
    AIRPORT_PROTOTYPE_CONFIG?: {
      MAPBOX_TOKEN: string;
    };
  }
}

export {};

import { describe, expect, it } from 'vitest';
import {
  absoluteErrorSeconds,
  computeGpsAccuracyStats,
  computeSampleGaps,
  computeStationaryDrift,
  elapsedDurationSeconds,
  longestSampleGapSeconds,
  percentageError,
  predictionErrorSeconds,
} from '../src/airport-prototype/utils/journeyMetrics';
import { serializeDeserializeRoundTrip } from '../src/airport-prototype/storage/journeyStorage';
import type { GeoSample, Journey } from '../src/airport-prototype/types';

const sample = (ts: string, lat: number, lng: number, accuracy: number): GeoSample => ({
  timestamp: ts,
  latitude: lat,
  longitude: lng,
  accuracy,
  altitude: null,
  altitudeAccuracy: null,
  heading: null,
  speed: null,
});

describe('elapsedDurationSeconds', () => {
  it('computes seconds between ISO timestamps', () => {
    expect(elapsedDurationSeconds('2026-08-12T18:00:00.000Z', '2026-08-12T18:05:30.000Z')).toBe(330);
  });

  it('never returns negative duration', () => {
    expect(elapsedDurationSeconds('2026-08-12T18:05:00.000Z', '2026-08-12T18:00:00.000Z')).toBe(0);
  });
});

describe('prediction errors', () => {
  it('computes signed prediction error', () => {
    expect(predictionErrorSeconds(300, 330)).toBe(-30);
  });

  it('computes absolute error', () => {
    expect(absoluteErrorSeconds(300, 330)).toBe(30);
  });

  it('computes percentage error', () => {
    expect(percentageError(300, 330)).toBeCloseTo(9.0909, 3);
  });

  it('returns null when no prediction exists', () => {
    expect(predictionErrorSeconds(null, 100)).toBeNull();
    expect(absoluteErrorSeconds(null, 100)).toBeNull();
    expect(percentageError(null, 100)).toBeNull();
  });
});

describe('GPS accuracy statistics', () => {
  const samples = [
    sample('2026-08-12T18:00:00.000Z', 49.19, -123.18, 10),
    sample('2026-08-12T18:00:05.000Z', 49.19, -123.18, 20),
    sample('2026-08-12T18:00:10.000Z', 49.19, -123.18, 30),
  ];

  it('computes median, mean, best, and worst accuracy', () => {
    const stats = computeGpsAccuracyStats(samples);
    expect(stats.medianAccuracyMeters).toBe(20);
    expect(stats.meanAccuracyMeters).toBe(20);
    expect(stats.bestAccuracyMeters).toBe(10);
    expect(stats.worstAccuracyMeters).toBe(30);
  });
});

describe('sample timing gaps', () => {
  const samples = [
    sample('2026-08-12T18:00:00.000Z', 49.19, -123.18, 10),
    sample('2026-08-12T18:00:05.000Z', 49.19, -123.18, 10),
    sample('2026-08-12T18:00:20.000Z', 49.19, -123.18, 10),
  ];

  it('computes gaps between consecutive samples', () => {
    expect(computeSampleGaps(samples)).toEqual([5, 15]);
  });

  it('finds longest gap', () => {
    expect(longestSampleGapSeconds(samples)).toBe(15);
  });
});

describe('stationary drift', () => {
  it('computes displacement from median position', () => {
    const samples = [
      sample('2026-08-12T18:00:00.000Z', 49.196, -123.181, 8),
      sample('2026-08-12T18:00:05.000Z', 49.19601, -123.18101, 12),
      sample('2026-08-12T18:00:10.000Z', 49.19599, -123.18099, 10),
    ];
    const drift = computeStationaryDrift(samples);
    expect(drift.medianLatitude).not.toBeNull();
    expect(drift.maxDisplacementMeters).toBeGreaterThan(0);
  });
});

describe('localStorage serialization', () => {
  it('round-trips journey objects', () => {
    const journey: Journey = {
      metadata: {
        journeyId: 'journey-1',
        flightNumber: 'AC123',
        startedAt: '2026-08-12T18:00:00.000Z',
        completedAt: null,
        browserUserAgent: 'test',
        viewportWidth: 390,
        viewportHeight: 844,
        testMode: 'walking',
        testingAirport: 'YVR',
        startingLatitude: 49.196,
        startingLongitude: -123.181,
        startingAccuracyMeters: 15,
        destinationLatitude: 49.197,
        destinationLongitude: -123.18,
        initialDocumentVisibility: 'visible',
      },
      prediction: {
        routeAvailable: false,
        distanceMeters: null,
        durationSeconds: null,
        routeGeometry: null,
      },
      actual: {
        actualDurationSeconds: null,
        predictionErrorSeconds: null,
        absoluteErrorSeconds: null,
        percentageError: null,
      },
      samples: [],
      waypoints: [],
      visibilityEvents: [],
      statistics: {
        sampleCount: 0,
        medianAccuracyMeters: null,
        meanAccuracyMeters: null,
        bestAccuracyMeters: null,
        worstAccuracyMeters: null,
        testDurationSeconds: null,
        firstSampleTimestamp: null,
        lastSampleTimestamp: null,
        longestSampleGapSeconds: null,
        markedLandmarkCount: 0,
      },
      feedback: {
        walkedDirectly: null,
        estimateUsefulness: null,
        routeCorrect: null,
        locationAccuracyFeel: null,
        issues: [],
        notes: '',
      },
      appState: 'SETUP',
      straightLineDistanceMeters: null,
    };

    const restored = serializeDeserializeRoundTrip(journey);
    expect(restored.metadata.journeyId).toBe('journey-1');
    expect(restored.metadata.flightNumber).toBe('AC123');
  });
});

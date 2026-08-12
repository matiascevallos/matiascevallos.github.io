import type { GeoSample, JourneyStatistics, MarkedWaypoint } from '../types';
import { mean, median } from './format';

export function positionToSample(position: GeolocationPosition): GeoSample {
  return {
    timestamp: new Date(position.timestamp).toISOString(),
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    altitudeAccuracy: position.coords.altitudeAccuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
  };
}

export function elapsedDurationSeconds(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function predictionErrorSeconds(
  predictedSeconds: number | null,
  actualSeconds: number,
): number | null {
  if (predictedSeconds === null) return null;
  return predictedSeconds - actualSeconds;
}

export function absoluteErrorSeconds(
  predictedSeconds: number | null,
  actualSeconds: number,
): number | null {
  const error = predictionErrorSeconds(predictedSeconds, actualSeconds);
  if (error === null) return null;
  return Math.abs(error);
}

export function percentageError(
  predictedSeconds: number | null,
  actualSeconds: number,
): number | null {
  const absError = absoluteErrorSeconds(predictedSeconds, actualSeconds);
  if (absError === null || actualSeconds <= 0) return null;
  return (absError / actualSeconds) * 100;
}

export function computeSampleGaps(samples: GeoSample[]): number[] {
  if (samples.length < 2) return [];
  const gaps: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = Date.parse(samples[i - 1].timestamp);
    const curr = Date.parse(samples[i].timestamp);
    if (!Number.isNaN(prev) && !Number.isNaN(curr)) {
      gaps.push(Math.max(0, (curr - prev) / 1000));
    }
  }
  return gaps;
}

export function longestSampleGapSeconds(samples: GeoSample[]): number | null {
  const gaps = computeSampleGaps(samples);
  if (gaps.length === 0) return null;
  return Math.max(...gaps);
}

export function computeGpsAccuracyStats(samples: GeoSample[]): {
  medianAccuracyMeters: number | null;
  meanAccuracyMeters: number | null;
  bestAccuracyMeters: number | null;
  worstAccuracyMeters: number | null;
} {
  const accuracies = samples.map((s) => s.accuracy).filter((a) => Number.isFinite(a));
  if (accuracies.length === 0) {
    return {
      medianAccuracyMeters: null,
      meanAccuracyMeters: null,
      bestAccuracyMeters: null,
      worstAccuracyMeters: null,
    };
  }
  return {
    medianAccuracyMeters: median(accuracies),
    meanAccuracyMeters: mean(accuracies),
    bestAccuracyMeters: Math.min(...accuracies),
    worstAccuracyMeters: Math.max(...accuracies),
  };
}

export function computeJourneyStatistics(
  samples: GeoSample[],
  waypoints: MarkedWaypoint[],
  startedAt: string | null,
  completedAt: string | null,
): JourneyStatistics {
  const accuracyStats = computeGpsAccuracyStats(samples);
  return {
    sampleCount: samples.length,
    ...accuracyStats,
    testDurationSeconds:
      startedAt && completedAt ? elapsedDurationSeconds(startedAt, completedAt) : null,
    firstSampleTimestamp: samples[0]?.timestamp ?? null,
    lastSampleTimestamp: samples[samples.length - 1]?.timestamp ?? null,
    longestSampleGapSeconds: longestSampleGapSeconds(samples),
    markedLandmarkCount: waypoints.length,
  };
}

export function computeStationaryDrift(samples: GeoSample[]): {
  medianLatitude: number | null;
  medianLongitude: number | null;
  maxDisplacementMeters: number | null;
  spreadLatitudeMeters: number | null;
  spreadLongitudeMeters: number | null;
} {
  if (samples.length === 0) {
    return {
      medianLatitude: null,
      medianLongitude: null,
      maxDisplacementMeters: null,
      spreadLatitudeMeters: null,
      spreadLongitudeMeters: null,
    };
  }

  const lats = samples.map((s) => s.latitude);
  const lngs = samples.map((s) => s.longitude);
  const medLat = median(lats)!;
  const medLng = median(lngs)!;

  const latSpread = Math.max(...lats) - Math.min(...lats);
  const lngSpread = Math.max(...lngs) - Math.min(...lngs);

  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const latSpreadMeters = latSpread * toRad(1) * R;
  const lngSpreadMeters = lngSpread * toRad(1) * R * Math.cos(toRad(medLat));

  let maxDisp = 0;
  for (const s of samples) {
    const dLat = (s.latitude - medLat) * toRad(1) * R;
    const dLng = (s.longitude - medLng) * toRad(1) * R * Math.cos(toRad(medLat));
    const disp = Math.sqrt(dLat ** 2 + dLng ** 2);
    if (disp > maxDisp) maxDisp = disp;
  }

  return {
    medianLatitude: medLat,
    medianLongitude: medLng,
    maxDisplacementMeters: maxDisp,
    spreadLatitudeMeters: latSpreadMeters,
    spreadLongitudeMeters: lngSpreadMeters,
  };
}

import { GPS_QUALITY_THRESHOLDS } from '../constants';

export function gpsQualityLabel(accuracyMeters: number): string {
  const { goodMaxMeters, moderateMaxMeters, poorMaxMeters } = GPS_QUALITY_THRESHOLDS;
  if (accuracyMeters <= goodMaxMeters) return 'Good';
  if (accuracyMeters <= moderateMaxMeters) return 'Moderate';
  if (accuracyMeters <= poorMaxMeters) return 'Poor';
  return 'Very poor';
}

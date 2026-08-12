import type { ExportPayload, Journey, StationaryTest } from '../types';
import { sanitizeFilenameTimestamp } from './format';

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildWalkingExportPayload(journey: Journey): ExportPayload {
  return {
    metadata: {
      journeyId: journey.metadata.journeyId,
      flightNumber: journey.metadata.flightNumber,
      startedAt: journey.metadata.startedAt,
      completedAt: journey.metadata.completedAt,
      browserUserAgent: journey.metadata.browserUserAgent,
      viewport: {
        width: journey.metadata.viewportWidth,
        height: journey.metadata.viewportHeight,
      },
      testingAirport: journey.metadata.testingAirport,
      startingLatitude: journey.metadata.startingLatitude,
      startingLongitude: journey.metadata.startingLongitude,
      startingAccuracyMeters: journey.metadata.startingAccuracyMeters,
      destinationLatitude: journey.metadata.destinationLatitude,
      destinationLongitude: journey.metadata.destinationLongitude,
      testMode: journey.metadata.testMode,
      initialDocumentVisibility: journey.metadata.initialDocumentVisibility,
      straightLineDistanceMeters: journey.straightLineDistanceMeters,
    },
    prediction: {
      routeAvailable: journey.prediction.routeAvailable,
      distanceMeters: journey.prediction.distanceMeters,
      durationSeconds: journey.prediction.durationSeconds,
      routeGeometry: journey.prediction.routeGeometry,
    },
    actual: {
      actualDurationSeconds: journey.actual.actualDurationSeconds,
      predictionErrorSeconds: journey.actual.predictionErrorSeconds,
      absoluteErrorSeconds: journey.actual.absoluteErrorSeconds,
      percentageError: journey.actual.percentageError,
    },
    samples: journey.samples,
    waypoints: journey.waypoints,
    visibilityEvents: journey.visibilityEvents,
    statistics: journey.statistics,
    feedback: journey.feedback,
  };
}

export function buildStationaryExportPayload(test: StationaryTest): ExportPayload {
  return {
    metadata: {
      testId: test.metadata.testId,
      label: test.metadata.label,
      startedAt: test.metadata.startedAt,
      completedAt: test.metadata.completedAt,
      browserUserAgent: test.metadata.browserUserAgent,
      viewport: {
        width: test.metadata.viewportWidth,
        height: test.metadata.viewportHeight,
      },
      testingAirport: test.metadata.testingAirport,
      initialLatitude: test.metadata.initialLatitude,
      initialLongitude: test.metadata.initialLongitude,
      testMode: 'stationary',
    },
    prediction: {},
    actual: {},
    samples: test.samples,
    waypoints: [],
    visibilityEvents: test.visibilityEvents,
    statistics: test.statistics,
    feedback: {},
    drift: test.drift,
  };
}

export function exportWalkingJourney(journey: Journey): void {
  const timestamp = sanitizeFilenameTimestamp(
    journey.metadata.completedAt ?? journey.metadata.startedAt,
  );
  downloadJson(`yvr-walking-test-${timestamp}.json`, buildWalkingExportPayload(journey));
}

export function exportStationaryTest(test: StationaryTest): void {
  const timestamp = sanitizeFilenameTimestamp(
    test.metadata.completedAt ?? test.metadata.startedAt,
  );
  downloadJson(`yvr-stationary-test-${timestamp}.json`, buildStationaryExportPayload(test));
}

import type { GeoSample } from '../types';
import { GEOLOCATION_OPTIONS, WATCH_OPTIONS } from '../constants';
import { geolocationErrorMessage } from '../utils/format';
import { positionToSample } from '../utils/journeyMetrics';

export type GeolocationCallback = (sample: GeoSample) => void;
export type GeolocationErrorCallback = (message: string, code: number) => void;

export class GeolocationTracker {
  private watchId: number | null = null;
  private sampleCount = 0;

  get isSupported(): boolean {
    return 'geolocation' in navigator;
  }

  get totalSamples(): number {
    return this.sampleCount;
  }

  requestSinglePosition(
    onSuccess: GeolocationCallback,
    onError: GeolocationErrorCallback,
  ): void {
    if (!this.isSupported) {
      onError('Geolocation is not supported in this browser.', -1);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const sample = positionToSample(position);
        this.sampleCount += 1;
        onSuccess(sample);
      },
      (error) => onError(geolocationErrorMessage(error.code), error.code),
      GEOLOCATION_OPTIONS,
    );
  }

  startWatching(onSample: GeolocationCallback, onError: GeolocationErrorCallback): void {
    if (!this.isSupported) {
      onError('Geolocation is not supported in this browser.', -1);
      return;
    }

    this.stopWatching();
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const sample = positionToSample(position);
        this.sampleCount += 1;
        onSample(sample);
      },
      (error) => onError(geolocationErrorMessage(error.code), error.code),
      WATCH_OPTIONS,
    );
  }

  stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  resetSampleCount(): void {
    this.sampleCount = 0;
  }
}

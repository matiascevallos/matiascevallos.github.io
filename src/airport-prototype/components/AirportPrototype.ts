import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/airport-prototype.css';

import type {
  AppState,
  GeoSample,
  Journey,
  JourneyFeedback,
  MarkedWaypoint,
  Prediction,
  StationaryTest,
} from '../types';
import {
  ARRIVAL_HINT_DISTANCE_METERS,
  GPS_QUALITY_THRESHOLDS,
  TESTING_AIRPORT_NAME,
} from '../constants';
import { getMapboxToken, isValidPublicMapboxToken } from '../config';
import { AirportMap } from '../mapbox/AirportMap';
import { fetchWalkingRoute } from '../mapbox/mapboxDirections';
import { GeolocationTracker } from '../hooks/useGeolocationTracker';
import { VisibilityTracker } from '../hooks/useVisibilityTracker';
import {
  clearActiveJourney,
  clearActiveStationary,
  clearDestination,
  loadActiveJourney,
  loadActiveStationary,
  loadDestination,
  loadFlightNumber,
  saveActiveJourney,
  saveActiveStationary,
  saveDestination,
  saveFlightNumber,
} from '../storage/journeyStorage';
import {
  absoluteErrorSeconds,
  computeJourneyStatistics,
  computeStationaryDrift,
  elapsedDurationSeconds,
  gpsQualityLabel,
  percentageError,
  predictionErrorSeconds,
} from '../utils/journeyMetrics';
import { exportStationaryTest, exportWalkingJourney } from '../utils/exportJourney';
import {
  formatCoordinates,
  formatDistance,
  formatDuration,
  generateId,
  haversineDistanceMeters,
  isNearYvr,
} from '../utils/format';
import { smoothDisplayPosition } from '../utils/smoothing';

type Mode = 'walking' | 'stationary';

const FEEDBACK_ISSUES = [
  'Location jumped around',
  'Location was delayed',
  'Wrong floor',
  'Wrong side of terminal',
  'Route looked wrong',
  'Browser stopped updating',
  'I switched apps',
  'I locked the phone',
  'I stopped during the walk',
  'Crowds slowed me down',
  'Escalator/elevator affected timing',
  'Other',
];

export class AirportPrototypeApp {
  private root: HTMLElement;
  private mapContainer: HTMLElement;
  private panelEl: HTMLElement;
  private airportMap: AirportMap;
  private geo = new GeolocationTracker();
  private visibility = new VisibilityTracker();

  private mode: Mode = 'walking';
  private appState: AppState = 'SETUP';
  private permissionGranted = false;
  private geoError: string | null = null;
  private latestSample: GeoSample | null = null;
  private displayPos: { latitude: number; longitude: number } | null = null;
  private destination: { lat: number; lng: number } | null = null;
  private flightNumber = '';
  private prediction: Prediction = emptyPrediction();
  private routeError: string | null = null;
  private straightLineMeters: number | null = null;
  private journey: Journey | null = null;
  private stationary: StationaryTest | null = null;
  private routeLoading = false;
  private showDebug = false;
  private arrivalHintShown = false;
  private pendingRecovery: Journey | null = null;
  private pendingStationaryRecovery: StationaryTest | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="ap-app">
        <div class="ap-map-wrap"><div id="ap-map" class="ap-map"></div></div>
        <div id="ap-panel" class="ap-panel"></div>
      </div>
    `;
    this.mapContainer = root.querySelector('#ap-map')!;
    this.panelEl = root.querySelector('#ap-panel')!;
    this.airportMap = new AirportMap(this.mapContainer);
  }

  init(): void {
    this.flightNumber = loadFlightNumber();
    this.destination = loadDestination();
    this.pendingRecovery = loadActiveJourney();
    this.pendingStationaryRecovery = loadActiveStationary();

    const token = getMapboxToken();
    if (!isValidPublicMapboxToken(token)) {
      this.renderTokenMissing();
      return;
    }

    const mapOk = this.airportMap.init((lat, lng) => {
      if (this.appState === 'TRACKING') return;
      this.setDestination(lat, lng);
    });

    if (mapOk) {
      if (this.destination) {
        this.airportMap.setDestinationMarker(this.destination);
      }
    } else {
      this.renderTokenMissing();
      return;
    }

    this.visibility.start((event) => {
      if (this.journey && this.appState === 'TRACKING') {
        this.journey.visibilityEvents.push(event);
        saveActiveJourney(this.journey);
      }
      if (this.stationary?.appState === 'running') {
        this.stationary.visibilityEvents.push(event);
        saveActiveStationary(this.stationary);
      }
      this.render();
    });

    if (this.pendingRecovery && this.pendingRecovery.appState !== 'RESULTS') {
      this.renderRecoveryPrompt('walking');
      return;
    }

    if (this.pendingStationaryRecovery && this.pendingStationaryRecovery.appState === 'running') {
      this.renderRecoveryPrompt('stationary');
      return;
    }

    this.render();
  }

  private renderTokenMissing(): void {
    this.root.innerHTML = `
      <div class="ap-token-missing">
        <h2>Mapbox token required</h2>
        <p>Copy <code>airport-prototype/config.example.js</code> to <code>airport-prototype/config.js</code> and set your public Mapbox token (<code>pk.</code>…).</p>
        <p>See README for setup instructions.</p>
      </div>
    `;
  }

  private emptyFeedback(): JourneyFeedback {
    return {
      walkedDirectly: null,
      estimateUsefulness: null,
      routeCorrect: null,
      locationAccuracyFeel: null,
      issues: [],
      notes: '',
    };
  }

  private setDestination(lat: number, lng: number): void {
    this.destination = { lat, lng };
    saveDestination(lat, lng);
    this.airportMap.setDestinationMarker(this.destination);
    void this.updateRoute();
    if (this.permissionGranted && this.latestSample) {
      this.appState = 'READY';
    }
    this.render();
  }

  private clearDest(): void {
    this.destination = null;
    clearDestination();
    this.prediction = emptyPrediction();
    this.routeError = null;
    this.straightLineMeters = null;
    this.airportMap.setDestinationMarker(null);
    this.airportMap.setRoute(emptyPrediction());
    if (this.permissionGranted) this.appState = 'SETUP';
    this.render();
  }

  private async updateRoute(): Promise<void> {
    if (!this.latestSample || !this.destination) return;
    this.routeLoading = true;
    this.render();

    const result = await fetchWalkingRoute(
      this.latestSample.longitude,
      this.latestSample.latitude,
      this.destination.lng,
      this.destination.lat,
    );

    this.prediction = result.prediction;
    this.routeError = result.error;
    this.straightLineMeters = haversineDistanceMeters(
      this.latestSample.latitude,
      this.latestSample.longitude,
      this.destination.lat,
      this.destination.lng,
    );
    this.airportMap.setRoute(this.prediction);
    this.routeLoading = false;
    this.render();
  }

  private requestLocation(): void {
    this.geoError = null;
    this.geo.requestSinglePosition(
      (sample) => {
        this.permissionGranted = true;
        this.latestSample = sample;
        this.displayPos = { latitude: sample.latitude, longitude: sample.longitude };
        this.airportMap.setUserMarker(this.displayPos);
        this.airportMap.recenterOn(sample.longitude, sample.latitude);
        if (this.destination) {
          void this.updateRoute().then(() => {
            this.appState = 'READY';
            this.render();
          });
        } else {
          this.appState = 'SETUP';
          this.render();
        }
      },
      (msg) => {
        this.geoError = msg;
        this.permissionGranted = false;
        this.render();
      },
    );
  }

  private startTest(): void {
    if (!this.latestSample || !this.destination) return;

    this.geo.resetSampleCount();
    this.arrivalHintShown = false;

    this.journey = {
      metadata: {
        journeyId: generateId('journey'),
        flightNumber: this.flightNumber.trim() || null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        browserUserAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        testMode: 'walking',
        testingAirport: TESTING_AIRPORT_NAME,
        startingLatitude: this.latestSample.latitude,
        startingLongitude: this.latestSample.longitude,
        startingAccuracyMeters: this.latestSample.accuracy,
        destinationLatitude: this.destination.lat,
        destinationLongitude: this.destination.lng,
        initialDocumentVisibility: document.visibilityState,
      },
      prediction: { ...this.prediction, routeGeometry: this.prediction.routeGeometry ? { ...this.prediction.routeGeometry, coordinates: [...this.prediction.routeGeometry.coordinates] } : null },
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
      feedback: this.emptyFeedback(),
      appState: 'TRACKING',
      straightLineDistanceMeters: this.straightLineMeters,
    };

    this.appState = 'TRACKING';
    saveActiveJourney(this.journey);

    this.geo.startWatching(
      (sample) => this.onTrackingSample(sample),
      (msg) => {
        this.geoError = msg;
        this.render();
      },
    );

    this.render();
  }

  private onTrackingSample(sample: GeoSample): void {
    if (!this.journey) return;
    this.journey.samples.push(sample);
    this.latestSample = sample;
    this.displayPos = smoothDisplayPosition(this.displayPos, sample);
    this.airportMap.setUserMarker(this.displayPos);
    this.airportMap.updateTrack(this.journey.samples);

    if (
      !this.arrivalHintShown &&
      this.destination &&
      haversineDistanceMeters(sample.latitude, sample.longitude, this.destination.lat, this.destination.lng) <=
        ARRIVAL_HINT_DISTANCE_METERS
    ) {
      this.arrivalHintShown = true;
    }

    saveActiveJourney(this.journey);
    this.render();
  }

  private markWaypoint(): void {
    if (!this.latestSample) return;
    const label = window.prompt('Optional label for this landmark:', '') ?? '';
    const waypoint: MarkedWaypoint = {
      id: generateId('waypoint'),
      timestamp: new Date().toISOString(),
      latitude: this.latestSample.latitude,
      longitude: this.latestSample.longitude,
      accuracy: this.latestSample.accuracy,
      label: label.trim() || null,
    };

    if (this.journey) {
      this.journey.waypoints.push(waypoint);
      this.airportMap.setWaypoints(this.journey.waypoints);
      saveActiveJourney(this.journey);
    } else if (this.stationary?.appState === 'running') {
      // stationary mode doesn't use waypoints but could label start
      this.stationary.metadata.label = label.trim() || this.stationary.metadata.label;
      saveActiveStationary(this.stationary);
    }
    this.render();
  }

  private confirmArrival(): void {
    this.appState = 'ARRIVAL_CONFIRMATION';
    if (this.journey) {
      this.journey.appState = 'ARRIVAL_CONFIRMATION';
      saveActiveJourney(this.journey);
    }
    this.render();
  }

  private finishTest(): void {
    this.geo.stopWatching();
    if (!this.journey) return;

    const completedAt = new Date().toISOString();
    const actualDuration = elapsedDurationSeconds(this.journey.metadata.startedAt, completedAt);

    this.journey.metadata.completedAt = completedAt;
    this.journey.actual.actualDurationSeconds = actualDuration;
    this.journey.actual.predictionErrorSeconds = predictionErrorSeconds(
      this.journey.prediction.durationSeconds,
      actualDuration,
    );
    this.journey.actual.absoluteErrorSeconds = absoluteErrorSeconds(
      this.journey.prediction.durationSeconds,
      actualDuration,
    );
    this.journey.actual.percentageError = percentageError(
      this.journey.prediction.durationSeconds,
      actualDuration,
    );
    this.journey.statistics = computeJourneyStatistics(
      this.journey.samples,
      this.journey.waypoints,
      this.journey.metadata.startedAt,
      completedAt,
    );
    this.journey.appState = 'RESULTS';
    this.appState = 'RESULTS';
    saveActiveJourney(this.journey);
    this.render();
  }

  private resetWalking(): void {
    this.geo.stopWatching();
    clearActiveJourney();
    this.journey = null;
    this.appState = this.permissionGranted ? (this.destination ? 'READY' : 'SETUP') : 'SETUP';
    this.arrivalHintShown = false;
    this.geo.resetSampleCount();
    this.airportMap.updateTrack([]);
    this.render();
  }

  // --- Stationary mode ---

  private startStationary(): void {
    if (!this.latestSample) return;
    this.stationary = {
      metadata: {
        testId: generateId('stationary'),
        label: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        browserUserAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        testingAirport: TESTING_AIRPORT_NAME,
        initialLatitude: this.latestSample.latitude,
        initialLongitude: this.latestSample.longitude,
      },
      samples: [],
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
      drift: {
        medianLatitude: null,
        medianLongitude: null,
        maxDisplacementMeters: null,
        spreadLatitudeMeters: null,
        spreadLongitudeMeters: null,
      },
      appState: 'running',
    };
    this.mode = 'stationary';
    this.geo.resetSampleCount();
    this.geo.startWatching(
      (sample) => {
        if (!this.stationary) return;
        this.stationary.samples.push(sample);
        this.latestSample = sample;
        this.displayPos = smoothDisplayPosition(this.displayPos, sample);
        this.airportMap.setUserMarker(this.displayPos);
        saveActiveStationary(this.stationary);
        this.render();
      },
      (msg) => {
        this.geoError = msg;
        this.render();
      },
    );
    saveActiveStationary(this.stationary);
    this.render();
  }

  private finishStationary(): void {
    this.geo.stopWatching();
    if (!this.stationary) return;
    const completedAt = new Date().toISOString();
    this.stationary.metadata.completedAt = completedAt;
    this.stationary.statistics = computeJourneyStatistics(
      this.stationary.samples,
      [],
      this.stationary.metadata.startedAt,
      completedAt,
    );
    this.stationary.drift = computeStationaryDrift(this.stationary.samples);
    this.stationary.appState = 'complete';
    saveActiveStationary(this.stationary);
    this.render();
  }

  private resetStationary(): void {
    clearActiveStationary();
    this.stationary = null;
    this.mode = 'walking';
    this.render();
  }

  private renderRecoveryPrompt(kind: 'walking' | 'stationary'): void {
    this.panelEl.innerHTML = `
      <div class="ap-card">
        <h2>Unfinished test found</h2>
        <p>An unfinished ${kind} test was found in this browser.</p>
        <div class="ap-actions">
          <button class="ap-btn ap-btn-primary" data-action="resume">Resume test</button>
          <button class="ap-btn" data-action="discard">Discard test</button>
        </div>
      </div>
    `;
    this.bindPanelActions({
      resume: () => {
        if (kind === 'walking' && this.pendingRecovery) {
          this.journey = this.pendingRecovery;
          this.appState = this.journey.appState;
          this.destination = {
            lat: this.journey.metadata.destinationLatitude,
            lng: this.journey.metadata.destinationLongitude,
          };
          this.flightNumber = this.journey.metadata.flightNumber ?? '';
          this.prediction = this.journey.prediction;
          if (this.journey.samples.length > 0) {
            const last = this.journey.samples[this.journey.samples.length - 1];
            this.latestSample = last;
            this.displayPos = { latitude: last.latitude, longitude: last.longitude };
          }
          this.airportMap.setDestinationMarker(this.destination);
          this.airportMap.setRoute(this.prediction);
          this.airportMap.updateTrack(this.journey.samples);
          this.airportMap.setWaypoints(this.journey.waypoints);
          if (this.appState === 'TRACKING') {
            this.geo.startWatching(
              (s) => this.onTrackingSample(s),
              (msg) => {
                this.geoError = msg;
                this.render();
              },
            );
          }
        } else if (kind === 'stationary' && this.pendingStationaryRecovery) {
          this.stationary = this.pendingStationaryRecovery;
          this.mode = 'stationary';
          if (this.stationary.samples.length > 0) {
            const last = this.stationary.samples[this.stationary.samples.length - 1];
            this.latestSample = last;
            this.displayPos = { latitude: last.latitude, longitude: last.longitude };
          }
          this.geo.startWatching(
            (sample) => {
              if (!this.stationary) return;
              this.stationary.samples.push(sample);
              this.latestSample = sample;
              this.displayPos = smoothDisplayPosition(this.displayPos, sample);
              this.airportMap.setUserMarker(this.displayPos);
              saveActiveStationary(this.stationary);
              this.render();
            },
            (msg) => {
              this.geoError = msg;
              this.render();
            },
          );
        }
        this.pendingRecovery = null;
        this.pendingStationaryRecovery = null;
        this.render();
      },
      discard: () => {
        clearActiveJourney();
        clearActiveStationary();
        this.pendingRecovery = null;
        this.pendingStationaryRecovery = null;
        this.render();
      },
    });
  }

  private bindPanelActions(actions: Record<string, () => void>): void {
    this.panelEl.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = (el as HTMLElement).dataset.action!;
        actions[key]?.();
      });
    });
  }

  private bindFormInputs(): void {
    const flightInput = this.panelEl.querySelector<HTMLInputElement>('#ap-flight');
    flightInput?.addEventListener('change', () => {
      this.flightNumber = flightInput.value;
      saveFlightNumber(this.flightNumber);
    });

    this.panelEl.querySelectorAll<HTMLInputElement>('input[name="feedback"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!this.journey) return;
        const name = input.name;
        const val = input.value;
        if (name === 'walkedDirectly') this.journey.feedback.walkedDirectly = val as JourneyFeedback['walkedDirectly'];
        if (name === 'estimateUsefulness') this.journey.feedback.estimateUsefulness = val as JourneyFeedback['estimateUsefulness'];
        if (name === 'routeCorrect') this.journey.feedback.routeCorrect = val as JourneyFeedback['routeCorrect'];
        if (name === 'locationAccuracyFeel') this.journey.feedback.locationAccuracyFeel = val as JourneyFeedback['locationAccuracyFeel'];
        saveActiveJourney(this.journey);
      });
    });

    this.panelEl.querySelectorAll<HTMLInputElement>('input[name="issues"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!this.journey) return;
        const issues = new Set(this.journey.feedback.issues);
        if (input.checked) issues.add(input.value);
        else issues.delete(input.value);
        this.journey.feedback.issues = [...issues];
        saveActiveJourney(this.journey);
      });
    });

    const notes = this.panelEl.querySelector<HTMLTextAreaElement>('#ap-notes');
    notes?.addEventListener('change', () => {
      if (!this.journey) return;
      this.journey.feedback.notes = notes.value;
      saveActiveJourney(this.journey);
    });

    const debugToggle = this.panelEl.querySelector<HTMLButtonElement>('[data-action="toggle-debug"]');
    debugToggle?.addEventListener('click', () => {
      this.showDebug = !this.showDebug;
      this.render();
    });
  }

  private bindButtons(): void {
    const map: Record<string, () => void> = {
      'use-location': () => this.requestLocation(),
      'use-map-center': () => {
        const c = this.airportMap.getCenter();
        if (c) this.setDestination(c.lat, c.lng);
      },
      'change-destination': () => {
        this.appState = 'SETUP';
        this.render();
      },
      'clear-destination': () => this.clearDest(),
      'mark-waypoint': () => this.markWaypoint(),
      'start-test': () => this.startTest(),
      'recenter': () => {
        if (this.displayPos) this.airportMap.recenterOn(this.displayPos.longitude, this.displayPos.latitude);
      },
      'arrived': () => this.confirmArrival(),
      'finish-yes': () => this.finishTest(),
      'finish-no': () => {
        this.appState = 'TRACKING';
        if (this.journey) {
          this.journey.appState = 'TRACKING';
          saveActiveJourney(this.journey);
        }
        this.render();
      },
      'export': () => this.journey && exportWalkingJourney(this.journey),
      'start-another': () => this.resetWalking(),
      'start-stationary': () => this.startStationary(),
      'finish-stationary': () => this.finishStationary(),
      'export-stationary': () => this.stationary && exportStationaryTest(this.stationary),
      'reset-stationary': () => this.resetStationary(),
      'mode-walking': () => {
        this.mode = 'walking';
        this.render();
      },
      'mode-stationary': () => {
        this.mode = 'stationary';
        this.render();
      },
    };
    this.bindPanelActions(map);
    this.bindFormInputs();
  }

  private yvrStatus(): string {
    if (!this.latestSample) return '';
    return isNearYvr(this.latestSample.latitude, this.latestSample.longitude)
      ? 'Detected near Vancouver International Airport (YVR)'
      : 'Location does not appear to be near YVR';
  }

  private gpsQualityHtml(accuracy: number): string {
    const label = gpsQualityLabel(accuracy);
    return `<span class="ap-gps ap-gps-${label.toLowerCase().replace(' ', '-')}">${label}</span> <span class="ap-muted">±${Math.round(accuracy)} m</span>`;
  }

  private debugPanel(sample: GeoSample): string {
    if (!this.showDebug) {
      return `<button type="button" class="ap-btn ap-btn-small" data-action="toggle-debug">Show debug information</button>`;
    }
    return `
      <button type="button" class="ap-btn ap-btn-small" data-action="toggle-debug">Hide debug information</button>
      <pre class="ap-debug">${JSON.stringify(sample, null, 2)}</pre>
    `;
  }

  private locationBlock(): string {
    if (!this.latestSample) return '';
    const s = this.latestSample;
    return `
      <div class="ap-info-grid">
        <div><strong>Latitude</strong><br>${s.latitude.toFixed(6)}</div>
        <div><strong>Longitude</strong><br>${s.longitude.toFixed(6)}</div>
        <div><strong>Accuracy</strong><br>${this.gpsQualityHtml(s.accuracy)}</div>
        <div><strong>Altitude</strong><br>${s.altitude ?? '—'}</div>
        <div><strong>Alt. accuracy</strong><br>${s.altitudeAccuracy ?? '—'}</div>
        <div><strong>Speed</strong><br>${s.speed ?? '—'}</div>
        <div><strong>Heading</strong><br>${s.heading ?? '—'}</div>
        <div><strong>Timestamp</strong><br>${s.timestamp}</div>
        <div><strong>Samples</strong><br>${this.geo.totalSamples}</div>
      </div>
      ${this.debugPanel(s)}
    `;
  }

  private destinationBlock(): string {
    if (!this.destination) {
      return `<p class="ap-muted">Tap or long-press the map to set a destination, or use the button below.</p>`;
    }
    return `
      <p><strong>Destination:</strong> ${formatCoordinates(this.destination.lat, this.destination.lng)}</p>
      <div class="ap-actions ap-actions-inline">
        <button class="ap-btn ap-btn-small" data-action="change-destination">Change destination</button>
        <button class="ap-btn ap-btn-small" data-action="clear-destination">Clear destination</button>
      </div>
    `;
  }

  private routeBlock(): string {
    if (this.routeLoading) return `<p class="ap-muted">Calculating walking route…</p>`;
    if (this.prediction.routeAvailable) {
      return `
        <p><strong>Predicted distance:</strong> ${formatDistance(this.prediction.distanceMeters)}</p>
        <p><strong>Predicted time:</strong> ${formatDuration(this.prediction.durationSeconds)}</p>
      `;
    }
    return `
      <p class="ap-warning">Indoor walking route unavailable</p>
      ${this.straightLineMeters !== null ? `<p><strong>Straight-line distance — not walking route:</strong> ${formatDistance(this.straightLineMeters)}</p>` : ''}
      <p class="ap-muted">You can continue with a tracking-only test.</p>
    `;
  }

  private visibilityBadge(): string {
    const state = this.visibility.currentState;
    return state === 'visible'
      ? '<span class="ap-badge ap-badge-active">PAGE ACTIVE</span>'
      : '<span class="ap-badge ap-badge-hidden">PAGE HIDDEN / BACKGROUND</span>';
  }

  private render(): void {
    if (this.mode === 'stationary') {
      this.renderStationary();
      return;
    }

    let html = '';

    html += `<p class="ap-context">${TESTING_AIRPORT_NAME}</p>`;
    if (this.latestSample) html += `<p class="ap-yvr">${this.yvrStatus()}</p>`;
    html += this.visibilityBadge();
    html += `<p class="ap-privacy">Your test location data stays in this browser unless you export the JSON file.</p>`;

    if (this.appState === 'SETUP') {
      html += this.renderSetup();
    } else if (this.appState === 'READY') {
      html += this.renderReady();
    } else if (this.appState === 'TRACKING') {
      html += this.renderTracking();
    } else if (this.appState === 'ARRIVAL_CONFIRMATION') {
      html += this.renderArrivalConfirmation();
    } else if (this.appState === 'RESULTS') {
      html += this.renderResults();
    }

    html += `
      <hr class="ap-divider" />
      <button class="ap-btn ap-btn-small" data-action="mode-stationary">Stationary GPS Test</button>
    `;

    this.panelEl.innerHTML = html;
    this.bindButtons();
    if (this.displayPos) this.airportMap.setUserMarker(this.displayPos);
    if (this.destination) this.airportMap.setDestinationMarker(this.destination);
    requestAnimationFrame(() => this.airportMap.resize());
  }

  private renderSetup(): string {
    let html = `<h2 class="ap-title">Airport Walking Test</h2>`;

    if (!this.permissionGranted) {
      html += `
        <div class="ap-card">
          <h3>Use your location</h3>
          <p>This experiment uses your location while this page is open to measure indoor positioning and estimate walking time.</p>
          ${this.geoError ? `<p class="ap-error">${this.geoError}</p>` : ''}
          <button class="ap-btn ap-btn-primary ap-btn-large" data-action="use-location">Use my location</button>
        </div>
      `;
      return html;
    }

    html += `
      <label class="ap-label">Flight number <span class="ap-muted">(optional)</span>
        <input id="ap-flight" type="text" placeholder="AC123" value="${escapeHtml(this.flightNumber)}" />
      </label>
      ${this.locationBlock()}
      ${this.destinationBlock()}
      <div class="ap-actions">
        <button class="ap-btn" data-action="use-map-center">Use map center as destination</button>
        <button class="ap-btn" data-action="mark-waypoint">Mark current position</button>
      </div>
      ${this.destination ? this.routeBlock() : ''}
    `;
    return html;
  }

  private renderReady(): string {
    const canStart = this.latestSample && this.destination;
    return `
      <h2 class="ap-title">Airport Walking Test</h2>
      <p><strong>Flight:</strong> ${this.flightNumber.trim() || '(none)'}</p>
      ${this.latestSample ? `<p><strong>Current location:</strong> ${formatCoordinates(this.latestSample.latitude, this.latestSample.longitude)}</p>` : ''}
      ${this.latestSample ? `<p><strong>GPS accuracy:</strong> ${this.gpsQualityHtml(this.latestSample.accuracy)}</p>` : ''}
      ${this.destinationBlock()}
      ${this.routeBlock()}
      <div class="ap-actions">
        <button class="ap-btn ap-btn-primary ap-btn-large" data-action="start-test" ${canStart ? '' : 'disabled'}>START TEST</button>
        <button class="ap-btn" data-action="mark-waypoint">Mark current position</button>
      </div>
    `;
  }

  private renderTracking(): string {
    const j = this.journey;
    const elapsed = j
      ? elapsedDurationSeconds(j.metadata.startedAt, new Date().toISOString())
      : 0;

    return `
      <h2 class="ap-title ap-tracking">TRACKING</h2>
      ${this.arrivalHintShown ? '<p class="ap-hint">Looks like you may have arrived.</p>' : ''}
      <p><strong>Elapsed:</strong> ${formatDuration(elapsed)}</p>
      ${
        j?.prediction.routeAvailable
          ? `<p><strong>Initial predicted duration:</strong> ${formatDuration(j.prediction.durationSeconds)}</p>
             <p><strong>Initial predicted distance:</strong> ${formatDistance(j.prediction.distanceMeters)}</p>`
          : '<p class="ap-muted">Tracking-only test — no valid Mapbox walking prediction</p>'
      }
      ${this.latestSample ? `<p><strong>GPS accuracy:</strong> ${this.gpsQualityHtml(this.latestSample.accuracy)}</p>` : ''}
      <p><strong>GPS samples:</strong> ${j?.samples.length ?? 0}</p>
      ${this.latestSample ? `<p><strong>Position:</strong> ${formatCoordinates(this.latestSample.latitude, this.latestSample.longitude)}</p>` : ''}
      <div class="ap-actions">
        <button class="ap-btn ap-btn-primary ap-btn-large" data-action="arrived">I've Arrived</button>
        <button class="ap-btn" data-action="recenter">Recenter on me</button>
        <button class="ap-btn" data-action="mark-waypoint">Mark current position</button>
      </div>
      <p class="ap-legend"><span class="ap-legend-route"></span> Predicted route &nbsp; <span class="ap-legend-track"></span> Actual GPS track</p>
    `;
  }

  private renderArrivalConfirmation(): string {
    return `
      <h2 class="ap-title">Are you at your destination?</h2>
      <div class="ap-actions">
        <button class="ap-btn ap-btn-primary ap-btn-large" data-action="finish-yes">Yes, finish test</button>
        <button class="ap-btn ap-btn-large" data-action="finish-no">Keep walking</button>
      </div>
    `;
  }

  private renderResults(): string {
    const j = this.journey;
    if (!j) return '';

    let html = `<h2 class="ap-title">Test Complete</h2>`;

    if (j.prediction.routeAvailable && j.actual.actualDurationSeconds !== null) {
      html += `
        <p><strong>Predicted:</strong> ${formatDuration(j.prediction.durationSeconds)}</p>
        <p><strong>Actual:</strong> ${formatDuration(j.actual.actualDurationSeconds)}</p>
        <p><strong>Difference:</strong> ${formatDuration(j.actual.predictionErrorSeconds !== null ? Math.abs(j.actual.predictionErrorSeconds) : null)}</p>
        <p><strong>Prediction error:</strong> ${j.actual.percentageError !== null ? `${j.actual.percentageError.toFixed(1)}%` : '—'}</p>
        <p><strong>Predicted distance:</strong> ${formatDistance(j.prediction.distanceMeters)}</p>
      `;
    } else {
      html += `<p class="ap-muted">No valid Mapbox walking prediction was available for this test. Geolocation data was still recorded successfully.</p>`;
    }

    html += `
      <p><strong>GPS samples:</strong> ${j.statistics.sampleCount}</p>
      <p><strong>Median GPS accuracy:</strong> ${j.statistics.medianAccuracyMeters !== null ? `${Math.round(j.statistics.medianAccuracyMeters)} m` : '—'}</p>
      <p><strong>Best GPS accuracy:</strong> ${j.statistics.bestAccuracyMeters !== null ? `${Math.round(j.statistics.bestAccuracyMeters)} m` : '—'}</p>
      <p><strong>Worst GPS accuracy:</strong> ${j.statistics.worstAccuracyMeters !== null ? `${Math.round(j.statistics.worstAccuracyMeters)} m` : '—'}</p>
      <p><strong>Longest sample gap:</strong> ${formatDuration(j.statistics.longestSampleGapSeconds)}</p>
      <p><strong>Marked landmarks:</strong> ${j.statistics.markedLandmarkCount}</p>
    `;

    html += this.renderFeedbackForm(j);
    html += `
      <div class="ap-actions">
        <button class="ap-btn ap-btn-primary ap-btn-large" data-action="export">Export test data</button>
        <button class="ap-btn ap-btn-large" data-action="start-another">Start another test</button>
      </div>
    `;
    return html;
  }

  private renderFeedbackForm(j: Journey): string {
    const f = j.feedback;
    const noRoute = !j.prediction.routeAvailable;
    return `
      <div class="ap-feedback">
        <h3>Feedback</h3>
        <fieldset>
          <legend>Did you walk directly to the destination?</legend>
          <label><input type="radio" name="walkedDirectly" value="yes" ${f.walkedDirectly === 'yes' ? 'checked' : ''} /> Yes</label>
          <label><input type="radio" name="walkedDirectly" value="no" ${f.walkedDirectly === 'no' ? 'checked' : ''} /> No</label>
        </fieldset>
        <fieldset>
          <legend>How useful was the original estimate?</legend>
          <label><input type="radio" name="estimateUsefulness" value="too-short" ${f.estimateUsefulness === 'too-short' ? 'checked' : ''} /> Too short</label>
          <label><input type="radio" name="estimateUsefulness" value="about-right" ${f.estimateUsefulness === 'about-right' ? 'checked' : ''} /> About right</label>
          <label><input type="radio" name="estimateUsefulness" value="too-long" ${f.estimateUsefulness === 'too-long' ? 'checked' : ''} /> Too long</label>
          <label><input type="radio" name="estimateUsefulness" value="not-applicable" ${f.estimateUsefulness === 'not-applicable' || noRoute ? 'checked' : ''} /> Not applicable — no prediction</label>
        </fieldset>
        <fieldset>
          <legend>Did the route look correct?</legend>
          <label><input type="radio" name="routeCorrect" value="yes" ${f.routeCorrect === 'yes' ? 'checked' : ''} /> Yes</label>
          <label><input type="radio" name="routeCorrect" value="no" ${f.routeCorrect === 'no' ? 'checked' : ''} /> No</label>
          <label><input type="radio" name="routeCorrect" value="not-sure" ${f.routeCorrect === 'not-sure' ? 'checked' : ''} /> Not sure</label>
          <label><input type="radio" name="routeCorrect" value="no-route" ${f.routeCorrect === 'no-route' || noRoute ? 'checked' : ''} /> No route available</label>
        </fieldset>
        <fieldset>
          <legend>How accurate did the location marker feel?</legend>
          <label><input type="radio" name="locationAccuracyFeel" value="good" ${f.locationAccuracyFeel === 'good' ? 'checked' : ''} /> Good</label>
          <label><input type="radio" name="locationAccuracyFeel" value="acceptable" ${f.locationAccuracyFeel === 'acceptable' ? 'checked' : ''} /> Acceptable</label>
          <label><input type="radio" name="locationAccuracyFeel" value="poor" ${f.locationAccuracyFeel === 'poor' ? 'checked' : ''} /> Poor</label>
          <label><input type="radio" name="locationAccuracyFeel" value="very-poor" ${f.locationAccuracyFeel === 'very-poor' ? 'checked' : ''} /> Very poor</label>
        </fieldset>
        <fieldset>
          <legend>Issues (optional)</legend>
          ${FEEDBACK_ISSUES.map((issue) => `<label><input type="checkbox" name="issues" value="${escapeHtml(issue)}" ${f.issues.includes(issue) ? 'checked' : ''} /> ${escapeHtml(issue)}</label>`).join('')}
        </fieldset>
        <label class="ap-label">Notes
          <textarea id="ap-notes" rows="3">${escapeHtml(f.notes)}</textarea>
        </label>
      </div>
    `;
  }

  private renderStationary(): void {
    const s = this.stationary;
    let html = `
      <h2 class="ap-title">Stationary GPS Test</h2>
      <p class="ap-context">${TESTING_AIRPORT_NAME}</p>
      ${this.visibilityBadge()}
      <p class="ap-privacy">Your test location data stays in this browser unless you export the JSON file.</p>
    `;

    if (s?.appState === 'running') {
      const elapsed = elapsedDurationSeconds(s.metadata.startedAt, new Date().toISOString());
      html += `
        <p><strong>Elapsed:</strong> ${formatDuration(elapsed)}</p>
        <p><strong>Samples:</strong> ${s.samples.length}</p>
        ${this.latestSample ? `<p><strong>Accuracy:</strong> ${this.gpsQualityHtml(this.latestSample.accuracy)}</p>` : ''}
        ${this.latestSample ? `<p><strong>Position:</strong> ${formatCoordinates(this.latestSample.latitude, this.latestSample.longitude)}</p>` : ''}
        <button class="ap-btn ap-btn-primary ap-btn-large" data-action="finish-stationary">Finish stationary test</button>
      `;
    } else if (s?.appState === 'complete') {
      html += `
        <p><strong>Samples:</strong> ${s.statistics.sampleCount}</p>
        <p><strong>Median accuracy:</strong> ${s.statistics.medianAccuracyMeters !== null ? `${Math.round(s.statistics.medianAccuracyMeters)} m` : '—'}</p>
        <p><strong>Mean accuracy:</strong> ${s.statistics.meanAccuracyMeters !== null ? `${Math.round(s.statistics.meanAccuracyMeters)} m` : '—'}</p>
        <p><strong>Best accuracy:</strong> ${s.statistics.bestAccuracyMeters !== null ? `${Math.round(s.statistics.bestAccuracyMeters)} m` : '—'}</p>
        <p><strong>Worst accuracy:</strong> ${s.statistics.worstAccuracyMeters !== null ? `${Math.round(s.statistics.worstAccuracyMeters)} m` : '—'}</p>
        <p><strong>Max displacement:</strong> ${s.drift.maxDisplacementMeters !== null ? `${Math.round(s.drift.maxDisplacementMeters)} m` : '—'}</p>
        <p><strong>Longest sample gap:</strong> ${formatDuration(s.statistics.longestSampleGapSeconds)}</p>
        <div class="ap-actions">
          <button class="ap-btn ap-btn-primary" data-action="export-stationary">Export test data</button>
          <button class="ap-btn" data-action="reset-stationary">Start another test</button>
        </div>
      `;
    } else {
      html += `
        <p>Measure indoor geolocation drift while standing still in one known location.</p>
        ${!this.permissionGranted ? `
          <div class="ap-card">
            <h3>Use your location</h3>
            <p>Location access is required for the stationary test.</p>
            ${this.geoError ? `<p class="ap-error">${this.geoError}</p>` : ''}
            <button class="ap-btn ap-btn-primary ap-btn-large" data-action="use-location">Use my location</button>
          </div>
        ` : `
          ${this.locationBlock()}
          <button class="ap-btn ap-btn-primary ap-btn-large" data-action="start-stationary">Start stationary test</button>
        `}
      `;
    }

    html += `<hr class="ap-divider" /><button class="ap-btn ap-btn-small" data-action="mode-walking">Back to Walking Test</button>`;
    this.panelEl.innerHTML = html;
    this.bindButtons();
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mountAirportPrototype(root: HTMLElement): void {
  const app = new AirportPrototypeApp(root);
  app.init();
}

import type { Journey, StationaryTest } from '../types';
import { LOCAL_STORAGE_KEYS } from '../constants';

export function saveActiveJourney(journey: Journey): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEYS.activeJourney, JSON.stringify(journey));
  } catch {
    // Storage full or unavailable — non-fatal
  }
}

export function loadActiveJourney(): Journey | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.activeJourney);
    if (!raw) return null;
    return JSON.parse(raw) as Journey;
  } catch {
    return null;
  }
}

export function clearActiveJourney(): void {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.activeJourney);
}

export function saveActiveStationary(test: StationaryTest): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEYS.activeStationary, JSON.stringify(test));
  } catch {
    // non-fatal
  }
}

export function loadActiveStationary(): StationaryTest | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.activeStationary);
    if (!raw) return null;
    return JSON.parse(raw) as StationaryTest;
  } catch {
    return null;
  }
}

export function clearActiveStationary(): void {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.activeStationary);
}

export function saveDestination(lat: number, lng: number): void {
  localStorage.setItem(LOCAL_STORAGE_KEYS.destination, JSON.stringify({ lat, lng }));
}

export function loadDestination(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.destination);
    if (!raw) return null;
    return JSON.parse(raw) as { lat: number; lng: number };
  } catch {
    return null;
  }
}

export function clearDestination(): void {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.destination);
}

export function saveFlightNumber(flight: string): void {
  localStorage.setItem(LOCAL_STORAGE_KEYS.flightNumber, flight);
}

export function loadFlightNumber(): string {
  return localStorage.getItem(LOCAL_STORAGE_KEYS.flightNumber) ?? '';
}

export function serializeDeserializeRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

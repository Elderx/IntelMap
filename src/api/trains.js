import { TRAIN_OVERLAY_CONFIG } from '../config/constants.js';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Train API request failed: ${response.status}`);
  }
  return response.json();
}

export function fetchTrainLocationsGeoJson() {
  return fetchJson(TRAIN_OVERLAY_CONFIG.locationsUrl);
}

export function fetchTrainStationsGeoJson() {
  return fetchJson(TRAIN_OVERLAY_CONFIG.stationsUrl);
}

export async function fetchTrainDetails(trainNumber, departureDate = null) {
  const url = `${TRAIN_OVERLAY_CONFIG.trainDetailsBaseUrl}/${encodeURIComponent(trainNumber)}`;
  const payload = await fetchJson(url);
  const trains = Array.isArray(payload) ? payload : [];

  return trains.find(train => !departureDate || train.departureDate === departureDate) || trains[0] || null;
}

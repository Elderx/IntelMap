import { state } from '../state/store.js';
import { getAisOverlayRuntimeConfig } from '../config/constants.js';
import { saveAisHistoryBatch } from '../api/client.js';

let flushing = false;

function shouldPersist() {
  return Boolean(state.aisEnabled && state.aisPersistenceEnabled);
}

function clearQueue() {
  state.aisPersistenceQueue.locations = [];
  state.aisPersistenceQueue.metadata = [];
}

function requeue(items, key) {
  if (!items.length) return;
  state.aisPersistenceQueue[key] = items.concat(state.aisPersistenceQueue[key]);
}

export function enqueueAisLocation(mmsi, payload) {
  if (!shouldPersist()) {
    return;
  }

  const lon = Number(payload?.lon);
  const lat = Number(payload?.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return;
  }

  state.aisPersistenceQueue.locations.push({
    mmsi: String(mmsi),
    time: payload?.time ?? null,
    observedAt: payload?.observedAt ?? null,
    lon,
    lat,
    sog: Number.isFinite(Number(payload?.sog)) ? Number(payload.sog) : null,
    cog: Number.isFinite(Number(payload?.cog)) ? Number(payload.cog) : null,
    heading: Number.isFinite(Number(payload?.heading)) ? Number(payload.heading) : null,
    navStat: Number.isFinite(Number(payload?.navStat)) ? Number(payload.navStat) : null,
    rot: Number.isFinite(Number(payload?.rot)) ? Number(payload.rot) : null,
    posAcc: typeof payload?.posAcc === 'boolean' ? payload.posAcc : null,
    raim: typeof payload?.raim === 'boolean' ? payload.raim : null
  });
}

export function enqueueAisMetadata(mmsi, payload) {
  if (!shouldPersist()) {
    return;
  }

  state.aisPersistenceQueue.metadata.push({
    mmsi: String(mmsi),
    timestamp: payload?.timestamp ?? null,
    observedAt: payload?.observedAt ?? null,
    destination: payload?.destination ?? null,
    name: payload?.name ?? null,
    draught: Number.isFinite(Number(payload?.draught)) ? Number(payload.draught) : null,
    eta: Number.isFinite(Number(payload?.eta)) ? Number(payload.eta) : null,
    posType: Number.isFinite(Number(payload?.posType)) ? Number(payload.posType) : null,
    refA: Number.isFinite(Number(payload?.refA)) ? Number(payload.refA) : null,
    refB: Number.isFinite(Number(payload?.refB)) ? Number(payload.refB) : null,
    refC: Number.isFinite(Number(payload?.refC)) ? Number(payload.refC) : null,
    refD: Number.isFinite(Number(payload?.refD)) ? Number(payload.refD) : null,
    callSign: payload?.callSign ?? null,
    imo: payload?.imo ?? null,
    type: Number.isFinite(Number(payload?.type)) ? Number(payload.type) : null
  });
}

export async function flushAisPersistenceQueue() {
  if (!shouldPersist() || flushing) {
    return;
  }

  const config = getAisOverlayRuntimeConfig();
  const maxBatchSize = Math.max(1, Number(config.persistenceBatchSize) || 200);
  const locationBatch = state.aisPersistenceQueue.locations.splice(0, maxBatchSize);
  const metadataBatch = state.aisPersistenceQueue.metadata.splice(0, maxBatchSize);

  if (!locationBatch.length && !metadataBatch.length) {
    return;
  }

  flushing = true;
  try {
    const result = await saveAisHistoryBatch({
      locations: locationBatch,
      metadata: metadataBatch
    });

    if (!result || result.ok !== true) {
      requeue(locationBatch, 'locations');
      requeue(metadataBatch, 'metadata');
    }
  } catch (error) {
    console.warn('[AIS] Failed to flush persistence queue:', error);
    requeue(locationBatch, 'locations');
    requeue(metadataBatch, 'metadata');
  } finally {
    flushing = false;
  }
}

export function startAisPersistenceLoop() {
  stopAisPersistenceLoop();

  const config = getAisOverlayRuntimeConfig();
  const intervalMs = Math.max(100, Number(config.persistenceFlushIntervalMs) || 3000);
  state.aisPersistenceFlushTimer = setInterval(() => {
    flushAisPersistenceQueue();
  }, intervalMs);
}

export function stopAisPersistenceLoop({ clear = true } = {}) {
  if (state.aisPersistenceFlushTimer) {
    clearInterval(state.aisPersistenceFlushTimer);
    state.aisPersistenceFlushTimer = null;
  }
  if (clear) {
    clearQueue();
  }
}

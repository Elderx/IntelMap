/**
 * AISStream.io WebSocket API Client
 * Fetches live AIS vessel position data
 */

import { AISSTREAM_CONFIG } from '../config/constants.js';
import { state } from '../state/store.js';

/**
 * Connect to AISStream WebSocket and accumulate vessels
 * @param {Array} bbox - [minLon, minLat, maxLon, maxLat] in WGS84
 * @param {Function} onVessel - Callback for each vessel received
 * @returns {Promise<WebSocket|null>} WebSocket connection or null on error
 */
export function connectToAISStream(bbox, onVessel) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(AISSTREAM_CONFIG.wsUrl);
    let accumulationTimer = null;
    let vesselsReceived = 0;

    ws.onopen = () => {
      console.log('[AISStream] Connected');

      // Subscribe to bounding box
      const subscribeMsg = {
        type: 'Subscription',
        bbox: bbox,
        filters: [
          { key: 'MessageType', value: 'PositionReport' }
        ]
      };

      try {
        ws.send(JSON.stringify(subscribeMsg));
      } catch (err) {
        console.error('[AISStream] Failed to send subscription:', err);
        ws.close();
        resolve(null);
        return;
      }

      // Set accumulation timeout
      accumulationTimer = setTimeout(() => {
        console.log(`[AISStream] Accumulation complete: ${vesselsReceived} vessels`);
        ws.close();
      }, AISSTREAM_CONFIG.accumulationTimeout);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'PositionReport') {
          vesselsReceived++;
          onVessel(data);
        }
      } catch (err) {
        console.error('[AISStream] Failed to parse message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[AISStream] WebSocket error:', err);
      state.aisError = {
        type: 'network',
        message: 'WebSocket connection failed',
        time: Date.now()
      };

      if (accumulationTimer) clearTimeout(accumulationTimer);
      resolve(null);
    };

    ws.onclose = () => {
      console.log('[AISStream] Connection closed');
      if (accumulationTimer) clearTimeout(accumulationTimer);
      resolve(ws);
    };
  });
}

/**
 * Validate AIS vessel data
 * @param {Object} vessel - Vessel data from AISStream
 * @returns {boolean} True if valid
 */
export function validateVesselData(vessel) {
  // MMSI must be 9 digits
  if (!vessel.mmsi || !/^\d{9}$/.test(vessel.mmsi.toString())) {
    return false;
  }

  // Latitude must be between -90 and 90
  if (vessel.latitude === undefined ||
      vessel.latitude < -90 || vessel.latitude > 90) {
    return false;
  }

  // Longitude must be between -180 and 180
  if (vessel.longitude === undefined ||
      vessel.longitude < -180 || vessel.longitude > 180) {
    return false;
  }

  return true;
}

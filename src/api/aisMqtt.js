import mqtt from 'mqtt';
import { AIS_OVERLAY_CONFIG } from '../config/constants.js';

function buildClientId() {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${AIS_OVERLAY_CONFIG.clientName}; ${suffix}`;
}

function parseTopic(topic) {
  const match = /^vessels-v2\/([^/]+)\/(location|metadata)$/.exec(topic);
  if (!match) {
    return null;
  }

  return {
    mmsi: match[1],
    kind: match[2],
    topic
  };
}

function parsePayload(payload) {
  try {
    return JSON.parse(payload.toString());
  } catch (error) {
    throw new Error(`AIS payload parse failed: ${error.message}`);
  }
}

function subscribe(client, topic) {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, { qos: 0 }, (error, granted) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(granted);
    });
  });
}

function disconnect(client) {
  return new Promise((resolve) => {
    client.end(true, {}, resolve);
  });
}

function createBrowserSession(handlers) {
  const client = mqtt.connect(AIS_OVERLAY_CONFIG.wsUrl, {
    clientId: buildClientId(),
    clean: true,
    connectTimeout: AIS_OVERLAY_CONFIG.connectTimeoutMs,
    keepalive: AIS_OVERLAY_CONFIG.keepaliveSeconds,
    reconnectPeriod: AIS_OVERLAY_CONFIG.reconnectPeriodMs,
    resubscribe: true
  });

  client.on('connect', () => {
    if (typeof handlers.onConnect === 'function') {
      handlers.onConnect();
    }
  });

  client.on('message', (topic, payload) => {
    const descriptor = parseTopic(topic);
    if (!descriptor) {
      return;
    }

    let parsed;
    try {
      parsed = parsePayload(payload);
    } catch (error) {
      if (typeof handlers.onError === 'function') {
        handlers.onError(error);
      }
      return;
    }

    const message = {
      ...descriptor,
      payload: parsed
    };

    if (descriptor.kind === 'location' && typeof handlers.onLocation === 'function') {
      handlers.onLocation(message);
    }

    if (descriptor.kind === 'metadata' && typeof handlers.onMetadata === 'function') {
      handlers.onMetadata(message);
    }
  });

  client.on('error', (error) => {
    if (typeof handlers.onError === 'function') {
      handlers.onError(error);
    }
  });

  client.on('close', () => {
    if (typeof handlers.onClose === 'function') {
      handlers.onClose();
    }
  });

  return {
    subscribe(topic) {
      return subscribe(client, topic);
    },
    disconnect() {
      return disconnect(client);
    }
  };
}

function resolveSessionFactory() {
  if (typeof window !== 'undefined' && typeof window.__INTELMAP_AIS_MQTT_FACTORY__ === 'function') {
    return window.__INTELMAP_AIS_MQTT_FACTORY__;
  }

  return createBrowserSession;
}

export function connectToAisMqtt(handlers = {}) {
  const session = resolveSessionFactory()(handlers);

  Promise.all([
    Promise.resolve(session.subscribe(AIS_OVERLAY_CONFIG.topics.location)),
    Promise.resolve(session.subscribe(AIS_OVERLAY_CONFIG.topics.metadata))
  ]).catch((error) => {
    if (typeof handlers.onError === 'function') {
      handlers.onError(error);
    }
  });

  return session;
}

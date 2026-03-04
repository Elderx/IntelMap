const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const mqtt = require('mqtt');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mmlmap';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const AIS_MQTT_WS_URL = process.env.AIS_MQTT_WS_URL || 'wss://meri.digitraffic.fi:443/mqtt';
const AIS_MQTT_TOPIC_LOCATION = process.env.AIS_MQTT_TOPIC_LOCATION || 'vessels-v2/+/location';
const AIS_MQTT_TOPIC_METADATA = process.env.AIS_MQTT_TOPIC_METADATA || 'vessels-v2/+/metadata';
const AIS_MQTT_RECONNECT_MS = Math.max(1000, Number(process.env.AIS_MQTT_RECONNECT_MS) || 5000);
const AIS_MQTT_CONNECT_TIMEOUT_MS = Math.max(1000, Number(process.env.AIS_MQTT_CONNECT_TIMEOUT_MS) || 10000);
const AIS_MQTT_KEEPALIVE_SECONDS = Math.max(5, Number(process.env.AIS_MQTT_KEEPALIVE_SECONDS) || 30);
const AIS_PERSIST_FLUSH_INTERVAL_MS = Math.max(250, Number(process.env.AIS_PERSIST_FLUSH_INTERVAL_MS) || 3000);
const AIS_PERSIST_BATCH_SIZE = Math.max(1, Number(process.env.AIS_PERSIST_BATCH_SIZE) || 500);

const pool = new Pool({ connectionString: DATABASE_URL });
const aisIngestion = {
  client: null,
  locationQueue: [],
  metadataQueue: [],
  enabledUserIds: new Set(),
  refreshTimer: null,
  flushTimer: null,
  flushing: false
};

function parseAisTopic(topic) {
  const match = /^vessels-v2\/([^/]+)\/(location|metadata)$/.exec(String(topic || ''));
  if (!match) {
    return null;
  }

  return {
    mmsi: match[1],
    kind: match[2]
  };
}

function parseAisPayload(payload) {
  try {
    return JSON.parse(payload.toString());
  } catch (error) {
    console.warn('[AIS ingestion] Failed to parse MQTT payload:', error.message);
    return null;
  }
}

function resolveObservedAt(payload, numericFieldName) {
  const fromIso = parseIsoDate(payload?.observedAt);
  if (fromIso) {
    return fromIso.toISOString();
  }

  const numeric = Number(payload?.[numericFieldName]);
  if (Number.isFinite(numeric)) {
    const fromNumeric = new Date(numeric > 1e12 ? numeric : numeric * 1000);
    if (!Number.isNaN(fromNumeric.getTime())) {
      return fromNumeric.toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeAisLocationRecord(mmsi, payload) {
  const lon = Number(payload?.lon);
  const lat = Number(payload?.lat);
  if (!mmsi || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  return {
    mmsi,
    observedAt: resolveObservedAt(payload, 'time'),
    lon,
    lat,
    sog: Number.isFinite(Number(payload?.sog)) ? Number(payload.sog) : null,
    cog: Number.isFinite(Number(payload?.cog)) ? Number(payload.cog) : null,
    heading: Number.isFinite(Number(payload?.heading)) ? Number(payload.heading) : null,
    navStat: Number.isFinite(Number(payload?.navStat)) ? Number(payload.navStat) : null,
    rot: Number.isFinite(Number(payload?.rot)) ? Number(payload.rot) : null,
    posAcc: typeof payload?.posAcc === 'boolean' ? payload.posAcc : null,
    raim: typeof payload?.raim === 'boolean' ? payload.raim : null
  };
}

function normalizeAisMetadataRecord(mmsi, payload) {
  if (!mmsi) {
    return null;
  }

  return {
    mmsi,
    observedAt: resolveObservedAt(payload, 'timestamp'),
    name: payload?.name || null,
    destination: payload?.destination || null,
    callSign: payload?.callSign || payload?.call_sign || null,
    imo: payload?.imo !== undefined && payload?.imo !== null ? String(payload.imo) : null,
    draught: Number.isFinite(Number(payload?.draught)) ? Number(payload.draught) : null,
    eta: Number.isFinite(Number(payload?.eta)) ? Number(payload.eta) : null,
    type: Number.isFinite(Number(payload?.type)) ? Number(payload.type) : null,
    posType: Number.isFinite(Number(payload?.posType)) ? Number(payload.posType) : null,
    refA: Number.isFinite(Number(payload?.refA)) ? Number(payload.refA) : null,
    refB: Number.isFinite(Number(payload?.refB)) ? Number(payload.refB) : null,
    refC: Number.isFinite(Number(payload?.refC)) ? Number(payload.refC) : null,
    refD: Number.isFinite(Number(payload?.refD)) ? Number(payload.refD) : null
  };
}

function enqueueAisMessage(topic, payload) {
  if (!aisIngestion.enabledUserIds.size) {
    return;
  }

  const descriptor = parseAisTopic(topic);
  if (!descriptor) {
    return;
  }

  const parsed = parseAisPayload(payload);
  if (!parsed) {
    return;
  }

  const mmsi = String(descriptor.mmsi || '').trim();
  if (!mmsi) {
    return;
  }

  if (descriptor.kind === 'location') {
    const normalized = normalizeAisLocationRecord(mmsi, parsed);
    if (normalized) {
      aisIngestion.locationQueue.push(normalized);
    }
    return;
  }

  if (descriptor.kind === 'metadata') {
    const normalized = normalizeAisMetadataRecord(mmsi, parsed);
    if (normalized) {
      aisIngestion.metadataQueue.push(normalized);
    }
  }
}

async function refreshAisEnabledUsers() {
  try {
    const { rows } = await pool.query(
      `SELECT owner_user_id
       FROM user_settings
       WHERE ais_persistence_enabled = TRUE`
    );
    aisIngestion.enabledUserIds = new Set(
      rows
        .map((row) => Number(row.owner_user_id))
        .filter((userId) => Number.isFinite(userId))
    );
  } catch (error) {
    console.error('[AIS ingestion] Failed to refresh enabled users:', error);
  }
}

async function insertAisLocationBatchForUser(userId, batch) {
  if (!batch.length) {
    return 0;
  }

  const values = [];
  const rowsSql = batch.map((item, index) => {
    const base = index * 12;
    values.push(
      item.mmsi,
      item.observedAt,
      item.lon,
      item.lat,
      item.sog,
      item.cog,
      item.heading,
      item.navStat,
      item.rot,
      item.posAcc,
      item.raim,
      userId
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`;
  });

  await pool.query(
    `INSERT INTO ais_location_history
     (mmsi, observed_at, lon, lat, sog, cog, heading, nav_stat, rot, pos_acc, raim, owner_user_id)
     VALUES ${rowsSql.join(', ')}`,
    values
  );

  return batch.length;
}

async function insertAisMetadataBatchForUser(userId, batch) {
  if (!batch.length) {
    return 0;
  }

  const values = [];
  const rowsSql = batch.map((item, index) => {
    const base = index * 15;
    values.push(
      item.mmsi,
      item.observedAt,
      item.name,
      item.destination,
      item.callSign,
      item.imo,
      item.draught,
      item.eta,
      item.type,
      item.posType,
      item.refA,
      item.refB,
      item.refC,
      item.refD,
      userId
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15})`;
  });

  await pool.query(
    `INSERT INTO ais_metadata_history
     (mmsi, observed_at, name, destination, call_sign, imo, draught, eta, type, pos_type, ref_a, ref_b, ref_c, ref_d, owner_user_id)
     VALUES ${rowsSql.join(', ')}`,
    values
  );

  return batch.length;
}

async function flushAisIngestionQueue() {
  if (aisIngestion.flushing) {
    return;
  }

  const locationBatch = aisIngestion.locationQueue.splice(0, AIS_PERSIST_BATCH_SIZE);
  const metadataBatch = aisIngestion.metadataQueue.splice(0, AIS_PERSIST_BATCH_SIZE);
  if (!locationBatch.length && !metadataBatch.length) {
    return;
  }

  const enabledUserIds = Array.from(aisIngestion.enabledUserIds);
  if (!enabledUserIds.length) {
    return;
  }

  aisIngestion.flushing = true;
  try {
    await pool.query('BEGIN');
    for (const userId of enabledUserIds) {
      await insertAisLocationBatchForUser(userId, locationBatch);
      await insertAisMetadataBatchForUser(userId, metadataBatch);
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => { });
    aisIngestion.locationQueue = locationBatch.concat(aisIngestion.locationQueue);
    aisIngestion.metadataQueue = metadataBatch.concat(aisIngestion.metadataQueue);
    console.error('[AIS ingestion] Failed to persist queued messages:', error);
  } finally {
    aisIngestion.flushing = false;
  }
}

function startAisBackgroundIngestionLoop() {
  if (!aisIngestion.flushTimer) {
    aisIngestion.flushTimer = setInterval(() => {
      flushAisIngestionQueue();
    }, AIS_PERSIST_FLUSH_INTERVAL_MS);
  }

  if (!aisIngestion.refreshTimer) {
    aisIngestion.refreshTimer = setInterval(() => {
      refreshAisEnabledUsers();
    }, 30 * 1000);
  }
}

function startAisBackgroundMqttClient() {
  if (aisIngestion.client) {
    return;
  }

  const clientId = `IntelMap AIS Ingestion/1.0; ${randomUUID()}`;
  const client = mqtt.connect(AIS_MQTT_WS_URL, {
    clientId,
    clean: true,
    reconnectPeriod: AIS_MQTT_RECONNECT_MS,
    connectTimeout: AIS_MQTT_CONNECT_TIMEOUT_MS,
    keepalive: AIS_MQTT_KEEPALIVE_SECONDS,
    resubscribe: true
  });

  client.on('connect', () => {
    client.subscribe([AIS_MQTT_TOPIC_LOCATION, AIS_MQTT_TOPIC_METADATA], { qos: 0 }, (error) => {
      if (error) {
        console.error('[AIS ingestion] MQTT subscribe failed:', error);
      }
    });
  });

  client.on('message', (topic, payload) => {
    enqueueAisMessage(topic, payload);
  });

  client.on('error', (error) => {
    console.error('[AIS ingestion] MQTT client error:', error);
  });

  client.on('close', () => {
    console.warn('[AIS ingestion] MQTT websocket closed, waiting for reconnect');
  });

  aisIngestion.client = client;
}

async function startAisBackgroundIngestion() {
  await refreshAisEnabledUsers();
  startAisBackgroundIngestionLoop();
  startAisBackgroundMqttClient();
}

async function initDb() {
  // Create extension and tables if not exist
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS markers (
      id SERIAL PRIMARY KEY,
      geom geometry(Point, 4326) NOT NULL,
      properties JSONB DEFAULT '{}'::jsonb,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS polygons (
      id SERIAL PRIMARY KEY,
      geom geometry(Polygon, 4326) NOT NULL,
      properties JSONB DEFAULT '{}'::jsonb,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS circles (
      id SERIAL PRIMARY KEY,
      center geometry(Point, 4326) NOT NULL,
      radius_meters DOUBLE PRECISION NOT NULL,
      properties JSONB DEFAULT '{}'::jsonb,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  `);

  // Backfill schema for existing deployments
  await pool.query(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name='markers' AND column_name='owner_user_id'
    ) THEN
      ALTER TABLE markers ADD COLUMN owner_user_id INTEGER;
    END IF;
  END $$;`);
  await pool.query(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_name='markers' AND constraint_name='markers_owner_fk'
    ) THEN
      ALTER TABLE markers ADD CONSTRAINT markers_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;`);
  await pool.query(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name='polygons' AND column_name='owner_user_id'
    ) THEN
      ALTER TABLE polygons ADD COLUMN owner_user_id INTEGER;
    END IF;
  END $$;`);
  await pool.query(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_name='polygons' AND constraint_name='polygons_owner_fk'
    ) THEN
      ALTER TABLE polygons ADD CONSTRAINT polygons_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marker_shares (
      marker_id INTEGER REFERENCES markers(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (marker_id, user_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS polygon_shares (
      polygon_id INTEGER REFERENCES polygons(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (polygon_id, user_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS circle_shares (
      circle_id INTEGER REFERENCES circles(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (circle_id, user_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS layer_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      config JSONB NOT NULL,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // OSM Tile Cache - tracks which tiles have been downloaded to nginx cache
  await pool.query(`
    CREATE TABLE IF NOT EXISTS osm_tile_cache (
      id SERIAL PRIMARY KEY,
      layer_id TEXT NOT NULL,
      tile_key TEXT NOT NULL,
      bbox JSONB NOT NULL,
      feature_count INTEGER DEFAULT 0,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (layer_id, tile_key, owner_user_id)
    );
  `);

  // Per-user runtime settings
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      owner_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ais_persistence_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // AIS historical location stream (from MQTT ingestion batches)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ais_location_history (
      id BIGSERIAL PRIMARY KEY,
      mmsi TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      lon DOUBLE PRECISION NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      sog DOUBLE PRECISION,
      cog DOUBLE PRECISION,
      heading DOUBLE PRECISION,
      nav_stat INTEGER,
      rot DOUBLE PRECISION,
      pos_acc BOOLEAN,
      raim BOOLEAN,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ais_location_history_mmsi_observed_at
    ON ais_location_history (mmsi, observed_at);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ais_location_history_owner_user_id
    ON ais_location_history (owner_user_id);
  `);

  // AIS historical metadata stream
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ais_metadata_history (
      id BIGSERIAL PRIMARY KEY,
      mmsi TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      name TEXT,
      destination TEXT,
      call_sign TEXT,
      imo TEXT,
      draught DOUBLE PRECISION,
      eta BIGINT,
      type INTEGER,
      pos_type INTEGER,
      ref_a INTEGER,
      ref_b INTEGER,
      ref_c INTEGER,
      ref_d INTEGER,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ais_metadata_history_mmsi_observed_at
    ON ais_metadata_history (mmsi, observed_at);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ais_metadata_history_owner_user_id
    ON ais_metadata_history (owner_user_id);
  `);

  // Seed/update users from environment variables
  // USERS format: "username:password,username:password,..."
  // Backward compatible with ADMIN_PASSWORD (treated as "admin:ADMIN_PASSWORD")

  let usersToSync = [];

  if (process.env.USERS) {
    // Parse USERS env var: username:password,username:password
    const userEntries = process.env.USERS.split(',').map(u => u.trim()).filter(Boolean);
    for (const entry of userEntries) {
      const [username, ...passwordParts] = entry.split(':');
      const password = passwordParts.join(':'); // Allow colons in password
      if (username && password) {
        usersToSync.push({ username, password });
      }
    }
    console.log(`[server] Syncing ${usersToSync.length} user(s) from USERS env var`);
  } else if (ADMIN_PASSWORD) {
    // Backward compatibility: treat ADMIN_PASSWORD as admin user
    usersToSync.push({ username: 'admin', password: ADMIN_PASSWORD });
    console.log('[server] Using ADMIN_PASSWORD env var (deprecated, use USERS instead)');
  }

  // Sync users: create if not exists, update password if changed
  for (const { username, password } of usersToSync) {
    const existing = await pool.query('SELECT id, password_hash FROM users WHERE username = $1', [username]);

    if (existing.rows.length === 0) {
      // Create new user
      const hash = await bcrypt.hash(password, 10);
      await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
      console.log(`[server] Created user: ${username}`);
    } else {
      // Check if password needs updating
      const currentHash = existing.rows[0].password_hash;
      const passwordMatches = await bcrypt.compare(password, currentHash);

      if (!passwordMatches) {
        const newHash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [newHash, username]);
        console.log(`[server] Updated password for user: ${username}`);
      }
    }
  }

  // Assign owner to legacy rows (default to admin) if not set
  const admin = await pool.query('SELECT id FROM users WHERE username=$1', ['admin']);
  if (admin.rows[0]) {
    await pool.query('UPDATE markers SET owner_user_id = $1 WHERE owner_user_id IS NULL', [admin.rows[0].id]);
    await pool.query('UPDATE polygons SET owner_user_id = $1 WHERE owner_user_id IS NULL', [admin.rows[0].id]);
  }
}

function featureFromRow(row, type) {
  const geom = JSON.parse(row.geom_json);
  const properties = row.properties || {};
  properties.id = row.id;
  properties.created_at = row.created_at;
  properties._type = type;
  properties.owner_username = row.owner_username || null;
  properties.shared_user_ids = row.shared_user_ids || [];
  return { type: 'Feature', geometry: geom, properties };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { sameSite: 'lax' } }));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const { rows } = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user) return done(null, false);
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return done(null, false);
    return done(null, { id: user.id, username: user.username });
  } catch (e) { return done(e); }
}));
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT id, username FROM users WHERE id = $1', [id]);
    const user = rows[0];
    if (!user) return done(null, false);
    done(null, { id: user.id, username: user.username });
  } catch (e) { done(e); }
});

function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

async function ensureUserSettingsRow(userId) {
  await pool.query(
    'INSERT INTO user_settings (owner_user_id) VALUES ($1) ON CONFLICT (owner_user_id) DO NOTHING',
    [userId]
  );
}

async function getUserSettings(userId) {
  await ensureUserSettingsRow(userId);
  const { rows } = await pool.query(
    `SELECT owner_user_id, ais_persistence_enabled, updated_at
     FROM user_settings
     WHERE owner_user_id = $1`,
    [userId]
  );
  return rows[0] || {
    owner_user_id: userId,
    ais_persistence_enabled: false,
    updated_at: new Date().toISOString()
  };
}

function parseIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseMmsiListFromQuery(query) {
  const list = [];

  if (typeof query.mmsis === 'string') {
    query.mmsis.split(',').map(v => v.trim()).filter(Boolean).forEach(v => list.push(v));
  }

  if (typeof query.mmsi === 'string') {
    list.push(query.mmsi.trim());
  } else if (Array.isArray(query.mmsi)) {
    query.mmsi.map(v => String(v).trim()).filter(Boolean).forEach(v => list.push(v));
  }

  return Array.from(new Set(list));
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/session', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) return res.json({ user: req.user });
  return res.status(401).json({ error: 'unauthorized' });
});
app.post('/api/login', passport.authenticate('local'), (req, res) => {
  res.json({ ok: true, user: req.user });
});
app.post('/api/logout', (req, res) => {
  req.logout && req.logout(() => res.json({ ok: true }));
});
app.get('/api/users', ensureAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username FROM users ORDER BY username ASC');
  res.json(rows);
});

// User settings
app.get('/api/settings', ensureAuth, async (req, res) => {
  try {
    const settings = await getUserSettings(req.user.id);
    res.json({
      aisPersistenceEnabled: Boolean(settings.ais_persistence_enabled),
      updatedAt: settings.updated_at
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.patch('/api/settings', ensureAuth, async (req, res) => {
  try {
    const { aisPersistenceEnabled } = req.body || {};
    if (typeof aisPersistenceEnabled !== 'boolean') {
      return res.status(400).json({ error: 'invalid_settings_payload' });
    }

    await ensureUserSettingsRow(req.user.id);
    const { rows } = await pool.query(
      `UPDATE user_settings
       SET ais_persistence_enabled = $2,
           updated_at = now()
       WHERE owner_user_id = $1
       RETURNING ais_persistence_enabled, updated_at`,
      [req.user.id, aisPersistenceEnabled]
    );

    await refreshAisEnabledUsers();

    res.json({
      aisPersistenceEnabled: Boolean(rows[0]?.ais_persistence_enabled),
      updatedAt: rows[0]?.updated_at || new Date().toISOString()
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

// AIS history ingest/query
app.post('/api/ais/history/batch', ensureAuth, async (req, res) => {
  const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];
  const metadata = Array.isArray(req.body?.metadata) ? req.body.metadata : [];

  try {
    const settings = await getUserSettings(req.user.id);
    if (!settings.ais_persistence_enabled) {
      return res.json({
        ok: true,
        skipped: true,
        insertedLocations: 0,
        insertedMetadata: 0
      });
    }

    let insertedLocations = 0;
    let insertedMetadata = 0;

    await pool.query('BEGIN');

    for (const item of locations) {
      const mmsi = String(item?.mmsi || '').trim();
      const lon = Number(item?.lon);
      const lat = Number(item?.lat);
      if (!mmsi || !Number.isFinite(lon) || !Number.isFinite(lat)) {
        continue;
      }

      let observedAt = parseIsoDate(item.observedAt);
      if (!observedAt && Number.isFinite(Number(item?.time))) {
        const numericTime = Number(item.time);
        observedAt = new Date(numericTime > 1e12 ? numericTime : numericTime * 1000);
      }
      if (!observedAt || Number.isNaN(observedAt.getTime())) {
        observedAt = new Date();
      }

      await pool.query(
        `INSERT INTO ais_location_history
         (mmsi, observed_at, lon, lat, sog, cog, heading, nav_stat, rot, pos_acc, raim, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          mmsi,
          observedAt.toISOString(),
          lon,
          lat,
          Number.isFinite(Number(item?.sog)) ? Number(item.sog) : null,
          Number.isFinite(Number(item?.cog)) ? Number(item.cog) : null,
          Number.isFinite(Number(item?.heading)) ? Number(item.heading) : null,
          Number.isFinite(Number(item?.navStat)) ? Number(item.navStat) : null,
          Number.isFinite(Number(item?.rot)) ? Number(item.rot) : null,
          typeof item?.posAcc === 'boolean' ? item.posAcc : null,
          typeof item?.raim === 'boolean' ? item.raim : null,
          req.user.id
        ]
      );
      insertedLocations += 1;
    }

    for (const item of metadata) {
      const mmsi = String(item?.mmsi || '').trim();
      if (!mmsi) {
        continue;
      }

      let observedAt = parseIsoDate(item.observedAt);
      if (!observedAt && Number.isFinite(Number(item?.timestamp))) {
        const numericTime = Number(item.timestamp);
        observedAt = new Date(numericTime > 1e12 ? numericTime : numericTime * 1000);
      }
      if (!observedAt || Number.isNaN(observedAt.getTime())) {
        observedAt = new Date();
      }

      await pool.query(
        `INSERT INTO ais_metadata_history
         (mmsi, observed_at, name, destination, call_sign, imo, draught, eta, type, pos_type, ref_a, ref_b, ref_c, ref_d, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          mmsi,
          observedAt.toISOString(),
          item?.name || null,
          item?.destination || null,
          item?.callSign || item?.call_sign || null,
          item?.imo !== undefined && item?.imo !== null ? String(item.imo) : null,
          Number.isFinite(Number(item?.draught)) ? Number(item.draught) : null,
          Number.isFinite(Number(item?.eta)) ? Number(item.eta) : null,
          Number.isFinite(Number(item?.type)) ? Number(item.type) : null,
          Number.isFinite(Number(item?.posType)) ? Number(item.posType) : null,
          Number.isFinite(Number(item?.refA)) ? Number(item.refA) : null,
          Number.isFinite(Number(item?.refB)) ? Number(item.refB) : null,
          Number.isFinite(Number(item?.refC)) ? Number(item.refC) : null,
          Number.isFinite(Number(item?.refD)) ? Number(item.refD) : null,
          req.user.id
        ]
      );
      insertedMetadata += 1;
    }

    await pool.query('COMMIT');

    res.json({
      ok: true,
      skipped: false,
      insertedLocations,
      insertedMetadata
    });
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/ais/tracks', ensureAuth, async (req, res) => {
  try {
    const mmsis = parseMmsiListFromQuery(req.query);
    if (!mmsis.length) {
      return res.status(400).json({ error: 'missing_mmsi' });
    }

    const now = new Date();
    const defaultStart = new Date(now.getTime() - (6 * 60 * 60 * 1000));
    const start = parseIsoDate(req.query.start) || defaultStart;
    const end = parseIsoDate(req.query.end) || now;
    if (end <= start) {
      return res.status(400).json({ error: 'invalid_time_range' });
    }

    const locationsResult = await pool.query(
      `SELECT mmsi, observed_at, lon, lat, sog, cog, heading
       FROM ais_location_history
       WHERE owner_user_id = $1
         AND mmsi = ANY($2::text[])
         AND observed_at >= $3
         AND observed_at <= $4
       ORDER BY mmsi ASC, observed_at ASC`,
      [req.user.id, mmsis, start.toISOString(), end.toISOString()]
    );

    const metadataResult = await pool.query(
      `SELECT DISTINCT ON (mmsi)
          mmsi, name, destination, call_sign, imo, draught, type
       FROM ais_metadata_history
       WHERE owner_user_id = $1
         AND mmsi = ANY($2::text[])
         AND observed_at <= $3
       ORDER BY mmsi ASC, observed_at DESC`,
      [req.user.id, mmsis, end.toISOString()]
    );

    const metadataByMmsi = new Map();
    metadataResult.rows.forEach((row) => {
      metadataByMmsi.set(row.mmsi, {
        name: row.name,
        destination: row.destination,
        callSign: row.call_sign,
        imo: row.imo,
        draught: row.draught,
        type: row.type
      });
    });

    const tracksByMmsi = new Map();
    mmsis.forEach((mmsi) => {
      tracksByMmsi.set(mmsi, {
        mmsi,
        metadata: metadataByMmsi.get(mmsi) || null,
        points: []
      });
    });

    locationsResult.rows.forEach((row) => {
      if (!tracksByMmsi.has(row.mmsi)) return;
      tracksByMmsi.get(row.mmsi).points.push({
        timestamp: row.observed_at,
        lon: row.lon,
        lat: row.lat,
        sog: row.sog,
        cog: row.cog,
        heading: row.heading
      });
    });

    res.json({
      tracks: Array.from(tracksByMmsi.values()),
      range: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/ais/snapshot', ensureAuth, async (req, res) => {
  try {
    const requestedMinutes = Number(req.query?.minutes);
    const minutes = Number.isFinite(requestedMinutes)
      ? Math.min(24 * 60, Math.max(1, Math.round(requestedMinutes)))
      : 60;

    const end = new Date();
    const start = new Date(end.getTime() - (minutes * 60 * 1000));

    const locationsResult = await pool.query(
      `SELECT DISTINCT ON (mmsi)
          mmsi,
          observed_at,
          lon,
          lat,
          sog,
          cog,
          heading,
          nav_stat,
          rot,
          pos_acc,
          raim
       FROM ais_location_history
       WHERE owner_user_id = $1
         AND observed_at >= $2
         AND observed_at <= $3
       ORDER BY mmsi ASC, observed_at DESC`,
      [req.user.id, start.toISOString(), end.toISOString()]
    );

    const mmsis = locationsResult.rows.map((row) => row.mmsi).filter(Boolean);
    const metadataByMmsi = new Map();

    if (mmsis.length) {
      const metadataResult = await pool.query(
        `SELECT DISTINCT ON (mmsi)
            mmsi,
            observed_at,
            name,
            destination,
            call_sign,
            imo,
            draught,
            eta,
            type,
            pos_type,
            ref_a,
            ref_b,
            ref_c,
            ref_d
         FROM ais_metadata_history
         WHERE owner_user_id = $1
           AND mmsi = ANY($2::text[])
         ORDER BY mmsi ASC, observed_at DESC`,
        [req.user.id, mmsis]
      );

      metadataResult.rows.forEach((row) => {
        metadataByMmsi.set(row.mmsi, {
          observedAt: row.observed_at,
          name: row.name,
          destination: row.destination,
          callSign: row.call_sign,
          imo: row.imo,
          draught: row.draught,
          eta: row.eta,
          type: row.type,
          posType: row.pos_type,
          refA: row.ref_a,
          refB: row.ref_b,
          refC: row.ref_c,
          refD: row.ref_d
        });
      });
    }

    const vessels = locationsResult.rows.map((row) => ({
      mmsi: row.mmsi,
      location: {
        observedAt: row.observed_at,
        lon: row.lon,
        lat: row.lat,
        sog: row.sog,
        cog: row.cog,
        heading: row.heading,
        navStat: row.nav_stat,
        rot: row.rot,
        posAcc: row.pos_acc,
        raim: row.raim
      },
      metadata: metadataByMmsi.get(row.mmsi) || null
    }));

    res.json({
      vessels,
      range: {
        minutes,
        start: start.toISOString(),
        end: end.toISOString()
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/ais/latest-location', ensureAuth, async (req, res) => {
  try {
    const mmsi = String(req.query?.mmsi || '').trim();
    if (!mmsi) {
      return res.status(400).json({ error: 'missing_mmsi' });
    }

    const { rows } = await pool.query(
      `SELECT mmsi, observed_at, lon, lat, sog, cog, heading
       FROM ais_location_history
       WHERE owner_user_id = $1
         AND mmsi = $2
       ORDER BY observed_at DESC
       LIMIT 1`,
      [req.user.id, mmsi]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'not_found' });
    }

    res.json({
      mmsi: rows[0].mmsi,
      observedAt: rows[0].observed_at,
      lon: rows[0].lon,
      lat: rows[0].lat,
      sog: rows[0].sog,
      cog: rows[0].cog,
      heading: rows[0].heading
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

// Markers
app.get('/api/markers', ensureAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id, m.properties, ST_AsGeoJSON(m.geom) AS geom_json, m.created_at,
             u.username AS owner_username,
             COALESCE(array_remove(array_agg(ms.user_id), NULL), '{}') AS shared_user_ids
      FROM markers m
      LEFT JOIN users u ON u.id = m.owner_user_id
      LEFT JOIN marker_shares ms ON ms.marker_id = m.id
      WHERE m.owner_user_id = $1 OR ms.user_id = $1
      GROUP BY m.id, u.username
      ORDER BY m.id ASC
    `, [req.user.id]);
    res.json({ type: 'FeatureCollection', features: rows.map(r => featureFromRow(r, 'marker')) });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/markers', ensureAuth, async (req, res) => {
  try {
    const { lon, lat, title, description, color, sharedUserIds } = req.body || {};
    if (typeof lon !== 'number' || typeof lat !== 'number') return res.status(400).json({ error: 'invalid_coords' });
    const props = { title: title || '', description: description || '', color: color || '#00bcd4' };
    const { rows } = await pool.query(
      `INSERT INTO markers (geom, properties, owner_user_id) VALUES (ST_SetSRID(ST_Point($1, $2), 4326), $3::jsonb, $4) RETURNING id, properties, ST_AsGeoJSON(geom) as geom_json, created_at`,
      [lon, lat, JSON.stringify(props), req.user.id]
    );
    const markerId = rows[0].id;
    if (Array.isArray(sharedUserIds) && sharedUserIds.length) {
      const values = sharedUserIds.map((uid, i) => `($1, $${i + 2})`).join(',');
      await pool.query(`INSERT INTO marker_shares (marker_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`, [markerId, ...sharedUserIds]);
    }
    const ownerRow = await pool.query('SELECT $1::text as owner_username', [req.user.username]);
    const enriched = { ...rows[0], owner_username: req.user.username, shared_user_ids: sharedUserIds || [] };
    res.status(201).json(featureFromRow(enriched, 'marker'));
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.patch('/api/markers/:id', ensureAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    // Owner check
    const own = await pool.query('SELECT id FROM markers WHERE id = $1 AND owner_user_id = $2', [id, req.user.id]);
    if (!own.rows[0]) return res.status(403).json({ error: 'forbidden' });
    const { title, description, color, sharedUserIds } = req.body || {};
    const props = { title: title || '', description: description || '', color: color || '#00bcd4' };
    const { rows } = await pool.query(
      `UPDATE markers SET properties = $2::jsonb WHERE id = $1 RETURNING id, properties, ST_AsGeoJSON(geom) as geom_json, created_at`,
      [id, JSON.stringify(props)]
    );
    if (Array.isArray(sharedUserIds)) {
      await pool.query('DELETE FROM marker_shares WHERE marker_id = $1', [id]);
      if (sharedUserIds.length) {
        const values = sharedUserIds.map((uid, i) => `($1, $${i + 2})`).join(',');
        await pool.query(`INSERT INTO marker_shares (marker_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`, [id, ...sharedUserIds]);
      }
    }
    const enriched = { ...rows[0], owner_username: req.user.username, shared_user_ids: Array.isArray(sharedUserIds) ? sharedUserIds : undefined };
    res.json(featureFromRow(enriched, 'marker'));
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/markers/:id', ensureAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const own = await pool.query('SELECT id FROM markers WHERE id = $1 AND owner_user_id = $2', [id, req.user.id]);
    if (!own.rows[0]) return res.status(403).json({ error: 'forbidden' });
    const { rowCount } = await pool.query('DELETE FROM markers WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

// Polygons
app.get('/api/polygons', ensureAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.properties, ST_AsGeoJSON(p.geom) AS geom_json, p.created_at,
             u.username AS owner_username,
             COALESCE(array_remove(array_agg(ps.user_id), NULL), '{}') AS shared_user_ids
      FROM polygons p
      LEFT JOIN users u ON u.id = p.owner_user_id
      LEFT JOIN polygon_shares ps ON ps.polygon_id = p.id
      WHERE p.owner_user_id = $1 OR ps.user_id = $1
      GROUP BY p.id, u.username
      ORDER BY p.id ASC
    `, [req.user.id]);
    res.json({ type: 'FeatureCollection', features: rows.map(r => featureFromRow(r, 'polygon')) });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/polygons', ensureAuth, async (req, res) => {
  try {
    const { coordinates, geometry, title, description, color, sharedUserIds } = req.body || {};
    let geomJson;
    if (geometry && geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
      geomJson = geometry;
    } else if (Array.isArray(coordinates)) {
      geomJson = { type: 'Polygon', coordinates: [coordinates] };
    } else {
      return res.status(400).json({ error: 'invalid_geometry' });
    }
    const props = { title: title || '', description: description || '', color: color || '#ff9800' };
    const { rows } = await pool.query(
      `INSERT INTO polygons (geom, properties, owner_user_id) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), $2::jsonb, $3) RETURNING id, properties, ST_AsGeoJSON(geom) as geom_json, created_at`,
      [JSON.stringify(geomJson), JSON.stringify(props), req.user.id]
    );
    const polygonId = rows[0].id;
    if (Array.isArray(sharedUserIds) && sharedUserIds.length) {
      const values = sharedUserIds.map((uid, i) => `($1, $${i + 2})`).join(',');
      await pool.query(`INSERT INTO polygon_shares (polygon_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`, [polygonId, ...sharedUserIds]);
    }
    const enriched = { ...rows[0], owner_username: req.user.username, shared_user_ids: sharedUserIds || [] };
    res.status(201).json(featureFromRow(enriched, 'polygon'));
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

async function waitForDb(maxRetries = 60, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Database not ready after retries');
}

app.patch('/api/polygons/:id', ensureAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const own = await pool.query('SELECT id FROM polygons WHERE id = $1 AND owner_user_id = $2', [id, req.user.id]);
    if (!own.rows[0]) return res.status(403).json({ error: 'forbidden' });
    const { title, description, color, sharedUserIds } = req.body || {};
    const props = { title: title || '', description: description || '', color: color || '#ff9800' };
    const { rows } = await pool.query(
      `UPDATE polygons SET properties = $2::jsonb WHERE id = $1 RETURNING id, properties, ST_AsGeoJSON(geom) as geom_json, created_at`,
      [id, JSON.stringify(props)]
    );
    if (Array.isArray(sharedUserIds)) {
      await pool.query('DELETE FROM polygon_shares WHERE polygon_id = $1', [id]);
      if (sharedUserIds.length) {
        const values = sharedUserIds.map((uid, i) => `($1, $${i + 2})`).join(',');
        await pool.query(`INSERT INTO polygon_shares (polygon_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`, [id, ...sharedUserIds]);
      }
    }
    const enriched = { ...rows[0], owner_username: req.user.username, shared_user_ids: Array.isArray(sharedUserIds) ? sharedUserIds : undefined };
    res.json(featureFromRow(enriched, 'polygon'));
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/polygons/:id', ensureAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const own = await pool.query('SELECT id FROM polygons WHERE id = $1 AND owner_user_id = $2', [id, req.user.id]);
    if (!own.rows[0]) return res.status(403).json({ error: 'forbidden' });
    const { rowCount } = await pool.query('DELETE FROM polygons WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

// Circles
app.get('/api/circles', ensureAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.properties, ST_AsGeoJSON(c.center) AS center_json, c.radius_meters, c.created_at,
             u.username AS owner_username,
             COALESCE(array_remove(array_agg(cs.user_id), NULL), '{}') AS shared_user_ids
      FROM circles c
      LEFT JOIN users u ON u.id = c.owner_user_id
      LEFT JOIN circle_shares cs ON cs.circle_id = c.id
      WHERE c.owner_user_id = $1 OR cs.user_id = $1
      GROUP BY c.id, u.username
      ORDER BY c.id ASC
    `, [req.user.id]);
    const features = rows.map(r => {
      const center = JSON.parse(r.center_json);
      const properties = r.properties || {};
      properties.id = r.id;
      properties.created_at = r.created_at;
      properties._type = 'circle';
      properties.owner_username = r.owner_username || null;
      properties.shared_user_ids = r.shared_user_ids || [];
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: center.coordinates },
        properties: {
          ...properties,
          radius: r.radius_meters,
          center: center.coordinates
        }
      };
    });
    res.json({ type: 'FeatureCollection', features });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/circles', ensureAuth, async (req, res) => {
  try {
    const { center, radius, title, description, color, opacity, sharedUserIds } = req.body || {};
    if (!Array.isArray(center) || center.length !== 2) return res.status(400).json({ error: 'invalid_center' });
    if (typeof radius !== 'number' || !Number.isFinite(radius)) return res.status(400).json({ error: 'invalid_radius' });
    const props = { title: title || '', description: description || '', color: color || '#2196f3', opacity: opacity !== undefined ? opacity : 0.3 };
    const { rows } = await pool.query(
      `INSERT INTO circles (center, radius_meters, properties, owner_user_id) VALUES (ST_SetSRID(ST_Point($1, $2), 4326), $3, $4::jsonb, $5) RETURNING id, properties, ST_AsGeoJSON(center) as center_json, radius_meters, created_at`,
      [center[0], center[1], radius, JSON.stringify(props), req.user.id]
    );
    const circleId = rows[0].id;
    if (Array.isArray(sharedUserIds) && sharedUserIds.length) {
      const values = sharedUserIds.map((uid, i) => `($1, $${i + 2})`).join(',');
      await pool.query(`INSERT INTO circle_shares (circle_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`, [circleId, ...sharedUserIds]);
    }
    const enriched = { ...rows[0], owner_username: req.user.username, shared_user_ids: sharedUserIds || [] };
    const centerJson = JSON.parse(enriched.center_json);
    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: centerJson.coordinates },
      properties: {
        id: enriched.id,
        title: props.title,
        description: props.description,
        color: props.color,
        opacity: props.opacity,
        center: centerJson.coordinates,
        radius: enriched.radius_meters,
        created_at: enriched.created_at,
        _type: 'circle',
        owner_username: enriched.owner_username,
        shared_user_ids: enriched.shared_user_ids
      }
    };
    res.status(201).json(feature);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.patch('/api/circles/:id', ensureAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const own = await pool.query('SELECT id FROM circles WHERE id = $1 AND owner_user_id = $2', [id, req.user.id]);
    if (!own.rows[0]) return res.status(403).json({ error: 'forbidden' });
    const { title, description, color, opacity, sharedUserIds } = req.body || {};
    const props = { title: title || '', description: description || '', color: color || '#2196f3', opacity: opacity !== undefined ? opacity : 0.3 };
    const { rows } = await pool.query(
      `UPDATE circles SET properties = $2::jsonb WHERE id = $1 RETURNING id, properties, ST_AsGeoJSON(center) as center_json, radius_meters, created_at`,
      [id, JSON.stringify(props)]
    );
    if (Array.isArray(sharedUserIds)) {
      await pool.query('DELETE FROM circle_shares WHERE circle_id = $1', [id]);
      if (sharedUserIds.length) {
        const values = sharedUserIds.map((uid, i) => `($1, $${i + 2})`).join(',');
        await pool.query(`INSERT INTO circle_shares (circle_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`, [id, ...sharedUserIds]);
      }
    }
    const enriched = { ...rows[0], owner_username: req.user.username, shared_user_ids: Array.isArray(sharedUserIds) ? sharedUserIds : undefined };
    const centerJson = JSON.parse(enriched.center_json);
    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: centerJson.coordinates },
      properties: {
        id: enriched.id,
        title: props.title,
        description: props.description,
        color: props.color,
        opacity: props.opacity,
        center: centerJson.coordinates,
        radius: enriched.radius_meters,
        created_at: enriched.created_at,
        _type: 'circle',
        owner_username: enriched.owner_username,
        shared_user_ids: Array.isArray(sharedUserIds) ? sharedUserIds : undefined
      }
    };
    res.json(feature);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/circles/:id', ensureAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const own = await pool.query('SELECT id FROM circles WHERE id = $1 AND owner_user_id = $2', [id, req.user.id]);
    if (!own.rows[0]) return res.status(403).json({ error: 'forbidden' });
    const { rowCount } = await pool.query('DELETE FROM circles WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

// Layer Groups
app.get('/api/layer-groups', ensureAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, config, created_at FROM layer_groups WHERE owner_user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/layer-groups', ensureAuth, async (req, res) => {
  try {
    const { name, config } = req.body || {};
    if (!name || !config) return res.status(400).json({ error: 'missing_fields' });
    const { rows } = await pool.query(
      'INSERT INTO layer_groups (name, config, owner_user_id) VALUES ($1, $2::jsonb, $3) RETURNING id, name, config, created_at',
      [name, JSON.stringify(config), req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/layer-groups/:id', ensureAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { rowCount } = await pool.query(
      'DELETE FROM layer_groups WHERE id = $1 AND owner_user_id = $2',
      [id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'not_found_or_forbidden' });
    res.status(204).end();
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

// OSM Tile Cache
app.get('/api/osm-tiles', ensureAuth, async (req, res) => {
  try {
    const { layer_id } = req.query;
    let query, params;

    if (layer_id) {
      query = 'SELECT tile_key, bbox, feature_count FROM osm_tile_cache WHERE layer_id = $1 AND owner_user_id = $2';
      params = [layer_id, req.user.id];
    } else {
      // Return all cached tiles grouped by layer
      query = 'SELECT layer_id, tile_key, bbox, feature_count FROM osm_tile_cache WHERE owner_user_id = $1';
      params = [req.user.id];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/osm-tiles', ensureAuth, async (req, res) => {
  try {
    const { layer_id, tile_key, bbox, feature_count } = req.body || {};
    if (!layer_id || !tile_key || !bbox) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const { rows } = await pool.query(
      `INSERT INTO osm_tile_cache (layer_id, tile_key, bbox, feature_count, owner_user_id) 
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (layer_id, tile_key, owner_user_id) 
       DO UPDATE SET feature_count = $4, created_at = now()
       RETURNING id, layer_id, tile_key, bbox, feature_count`,
      [layer_id, tile_key, JSON.stringify(bbox), feature_count || 0, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/osm-tiles', ensureAuth, async (req, res) => {
  try {
    const { layer_id } = req.query;
    let query, params;

    if (layer_id) {
      query = 'DELETE FROM osm_tile_cache WHERE layer_id = $1 AND owner_user_id = $2';
      params = [layer_id, req.user.id];
    } else {
      // Clear all tile cache for user
      query = 'DELETE FROM osm_tile_cache WHERE owner_user_id = $1';
      params = [req.user.id];
    }

    await pool.query(query, params);
    res.status(204).end();
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'db_error' });
  }
});

app.listen(PORT, async () => {
  try {
    await waitForDb();
    await initDb();
    await startAisBackgroundIngestion();
    console.log(`[server] listening on :${PORT}`);
  } catch (e) {
    console.error('DB init failed', e);
    process.exit(1);
  }
});

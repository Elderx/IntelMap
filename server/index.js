const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mmlmap';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

const pool = new Pool({ connectionString: DATABASE_URL });

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
    CREATE TABLE IF NOT EXISTS layer_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      config JSONB NOT NULL,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Seed admin if no users
  const ucount = await pool.query('SELECT COUNT(*)::int AS c FROM users');
  if (ucount.rows[0].c === 0) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', ['admin', hash]);
    console.log('[server] Seeded default admin user (password from ADMIN_PASSWORD env or default)');
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

app.listen(PORT, async () => {
  try {
    await waitForDb();
    await initDb();
    console.log(`[server] listening on :${PORT}`);
  } catch (e) {
    console.error('DB init failed', e);
    process.exit(1);
  }
});

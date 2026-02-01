/**
 * AIS Backend Routes
 * API endpoints for vessel position history
 */

/**
 * Get vessel positions for a time range
 * GET /api/ais/history?from=TIMESTAMP&to=TIMESTAMP&bbox=minLon,minLat,maxLon,maxLat
 */
export async function getVesselHistory(req, res) {
  try {
    const { from, to, bbox } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to parameters required' });
    }

    let bboxCondition = '';
    const params = [from, to];

    if (bbox) {
      const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
      if (params.length !== 4) {
        return res.status(400).json({ error: 'Invalid bbox format' });
      }

      bboxCondition = `
        AND ST_Intersects(
          geom,
          ST_SetSRID(ST_MakeBox2D(
            ST_Point($3, $4),
            ST_Point($5, $6)
          ), 4326)
        )
      `;
      params.push(minLon, minLat, maxLon, maxLat);
    }

    const query = `
      SELECT
        mmsi,
        timestamp,
        ST_AsGeoJSON(geom) as geometry,
        speed,
        course,
        navigation_status,
        raw_data
      FROM vessel_positions
      WHERE timestamp >= $1 AND timestamp <= $2
        ${bboxCondition}
      ORDER BY timestamp DESC
      LIMIT 10000
    `;

    const result = await req.pool.query(query, params);

    res.json({
      vessels: result.rows,
      count: result.rowCount
    });
  } catch (err) {
    console.error('Error fetching vessel history:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Save vessel position (called internally)
 * @param {Object} vessel - Vessel data from AISStream
 */
export async function saveVesselPosition(pool, vessel) {
  const {
    mmsi, latitude, longitude, speed, course,
    navigationStatus, ...rest
  } = vessel;

  const timestamp = Date.now();

  const query = `
    INSERT INTO vessel_positions
      (mmsi, timestamp, geom, speed, course, navigation_status, raw_data)
    VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7, $8)
  `;

  const values = [
    mmsi, timestamp, longitude, latitude,
    speed, course, navigationStatus || null,
    JSON.stringify(vessel)
  ];

  try {
    await pool.query(query, values);
  } catch (err) {
    console.error('Error saving vessel position:', err);
  }
}

const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  try {
    if (!process.env.SOCKPI_DATABASE_URL) {
      return res.status(500).json({
        error: 'Database is not configured'
      });
    }

    const sql = neon(process.env.SOCKPI_DATABASE_URL);

    // Create shared KPI table automatically
    await sql`
      CREATE TABLE IF NOT EXISTS kpi_dashboard_state (
        id INTEGER PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT
      )
    `;

    // Load the latest shared KPI data
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT data, updated_at, updated_by
        FROM kpi_dashboard_state
        WHERE id = 1
      `;

      return res.status(200).json(
        rows.length ? rows[0] : { data: null }
      );
    }

    // Save KPI data
    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string'
          ? JSON.parse(req.body)
          : req.body;

      if (!body || !body.data || typeof body.data !== 'object') {
        return res.status(400).json({
          error: 'Invalid KPI data'
        });
      }

      const data = JSON.stringify(body.data);

      const updatedBy = String(
        body.updatedBy ||
        body.data.preparedBy ||
        'Admissions Team'
      ).slice(0, 120);

      const rows = await sql`
        INSERT INTO kpi_dashboard_state
          (id, data, updated_at, updated_by)
        VALUES
          (1, ${data}::jsonb, NOW(), ${updatedBy})

        ON CONFLICT (id)
        DO UPDATE SET
          data = EXCLUDED.data,
          updated_at = NOW(),
          updated_by = EXCLUDED.updated_by

        RETURNING updated_at, updated_by
      `;

      return res.status(200).json({
        ok: true,
        ...rows[0]
      });
    }

    res.setHeader('Allow', 'GET, POST');

    return res.status(405).json({
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('KPI API error:', error);

    return res.status(500).json({
      error: error.message || 'Database error'
    });
  }
};

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from React build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// PostgreSQL connection
const pool = new Pool(
  process.env.DATABASE_URL 
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'pms_dashboard',
        password: process.env.DB_PASSWORD || 'password',
        port: process.env.DB_PORT || 5432,
      }
);

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
  }
});

// Routes

// Get dashboard summary (4 main KPIs)
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const salesData = await pool.query(`
      SELECT 
        COALESCE(SUM(invoice_value), 0) as ytd_sales,
        COALESCE(AVG(sales_cycle), 0) as avg_sales_cycle,
        COALESCE(AVG(CASE WHEN sales_order = 'Won' THEN 1 ELSE 0 END) * 100, 0) as conversion_rate,
        COALESCE(AVG(invoice_value), 0) as avg_order_value
      FROM sales_pipeline 
      WHERE invoice_date >= DATE_TRUNC('year', CURRENT_DATE)
    `);

    const employabilityData = await pool.query(`
      SELECT 
        COALESCE(AVG(((admin_present + dl_present + idl_present)::float / 
                     (admin_present + dl_present + idl_present + admin_separated + dl_separated + idl_separated)) * 100), 0) as retention_rate,
        COALESCE(AVG(total_days_to_recruit), 0) as avg_recruitment_days
      FROM employability 
      WHERE date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    `);

    const qualityData = await pool.query(`
      SELECT 
        COALESCE(AVG((product_rejected::float / product_produced) * 100), 0) as rejection_rate,
        COALESCE(AVG((product_returned::float / product_shipped) * 100), 0) as return_rate,
        COALESCE(SUM(cost_of_repair + cost_of_remake), 0) as total_quality_cost
      FROM quality 
      WHERE date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    `);

    const deliveryData = await pool.query(`
      SELECT 
        COALESCE(AVG(CASE WHEN delayed = 0 THEN 1 ELSE 0 END) * 100, 0) as on_time_delivery,
        COALESCE(AVG(lead_time), 0) as avg_lead_time,
        COALESCE(SUM(CASE WHEN delayed = 1 THEN 1 ELSE 0 END), 0) as delayed_orders,
        COALESCE(SUM(delayed_order_value), 0) as delayed_order_value
      FROM delivery 
      WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    `);

    res.json({
      sales_pipeline: salesData.rows[0],
      employability: employabilityData.rows[0],
      quality: qualityData.rows[0],
      delivery: deliveryData.rows[0]
    });
  } catch (err) {
    console.error('Error fetching dashboard summary:', err);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Get detailed Sales Pipeline data
app.get('/api/sales-pipeline', async (req, res) => {
  try {
    const monthlyData = await pool.query(`
      SELECT 
        TO_CHAR(invoice_date, 'Mon-YY') as month,
        SUM(invoice_value) as total_sales,
        AVG(sales_cycle) as avg_cycle,
        COUNT(*) as total_orders
      FROM sales_pipeline 
      WHERE invoice_date IS NOT NULL
      GROUP BY TO_CHAR(invoice_date, 'Mon-YY'), DATE_TRUNC('month', invoice_date)
      ORDER BY DATE_TRUNC('month', invoice_date) DESC
      LIMIT 12
    `);

    const conversionFunnel = await pool.query(`
      SELECT 
        'Enquiries' as stage, COUNT(*) as count
      FROM sales_pipeline
      UNION ALL
      SELECT 
        'Leads' as stage, COUNT(*) as count
      FROM sales_pipeline WHERE lead = 'Yes'
      UNION ALL
      SELECT 
        'Opportunities' as stage, COUNT(*) as count
      FROM sales_pipeline WHERE lead_qualified_date IS NOT NULL
      UNION ALL
      SELECT 
        'Won' as stage, COUNT(*) as count
      FROM sales_pipeline WHERE sales_order = 'Won'
    `);

    const geographicData = await pool.query(`
      SELECT state, SUM(invoice_value) as total_value, COUNT(*) as orders
      FROM sales_pipeline 
      WHERE invoice_value IS NOT NULL
      GROUP BY state
      ORDER BY total_value DESC
    `);

    res.json({
      monthly_trends: monthlyData.rows,
      conversion_funnel: conversionFunnel.rows,
      geographic_distribution: geographicData.rows
    });
  } catch (err) {
    console.error('Error fetching sales pipeline data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get detailed Employability data
app.get('/api/employability', async (req, res) => {
  try {
    const departmentData = await pool.query(`
      SELECT 
        'Admin' as department, AVG(admin_present) as present, AVG(admin_separated) as separated
      FROM employability
      UNION ALL
      SELECT 
        'DL' as department, AVG(dl_present) as present, AVG(dl_separated) as separated
      FROM employability
      UNION ALL
      SELECT 
        'IDL' as department, AVG(idl_present) as present, AVG(idl_separated) as separated
      FROM employability
    `);

    const attritionReasons = await pool.query(`
      SELECT admin_reason_attrition as reason, COUNT(*) as count
      FROM employability 
      WHERE admin_reason_attrition IS NOT NULL
      GROUP BY admin_reason_attrition
      UNION ALL
      SELECT dl_reason_attrition as reason, COUNT(*) as count
      FROM employability 
      WHERE dl_reason_attrition IS NOT NULL
      GROUP BY dl_reason_attrition
      UNION ALL
      SELECT idl_reason_attrition as reason, COUNT(*) as count
      FROM employability 
      WHERE idl_reason_attrition IS NOT NULL
      GROUP BY idl_reason_attrition
      ORDER BY count DESC
    `);

    const retentionTrend = await pool.query(`
      SELECT 
        TO_CHAR(date, 'Mon-YY') as month,
        AVG((admin_present + dl_present + idl_present)::float / 
            (admin_present + dl_present + idl_present + admin_separated + dl_separated + idl_separated) * 100) as retention_rate
      FROM employability
      GROUP BY TO_CHAR(date, 'Mon-YY'), DATE_TRUNC('month', date)
      ORDER BY DATE_TRUNC('month', date) DESC
      LIMIT 12
    `);

    res.json({
      department_headcount: departmentData.rows,
      attrition_reasons: attritionReasons.rows,
      retention_trends: retentionTrend.rows
    });
  } catch (err) {
    console.error('Error fetching employability data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get detailed Quality data
app.get('/api/quality', async (req, res) => {
  try {
    const qualityTrends = await pool.query(`
      SELECT 
        TO_CHAR(date, 'Mon-YY') as month,
        AVG((product_rejected::float / product_produced) * 100) as rejection_rate,
        AVG((product_returned::float / product_shipped) * 100) as return_rate,
        SUM(cost_of_repair + cost_of_remake) as quality_costs
      FROM quality
      WHERE product_produced > 0
      GROUP BY TO_CHAR(date, 'Mon-YY'), DATE_TRUNC('month', date)
      ORDER BY DATE_TRUNC('month', date) DESC
      LIMIT 12
    `);

    const rejectionReasons = await pool.query(`
      SELECT reason_for_rejection as reason, COUNT(*) as count
      FROM quality 
      WHERE reason_for_rejection IS NOT NULL
      GROUP BY reason_for_rejection
      ORDER BY count DESC
    `);

    const costBreakdown = await pool.query(`
      SELECT 
        SUM(cost_of_repair) as repair_costs,
        SUM(cost_of_remake) as remake_costs,
        COUNT(CASE WHEN product_returned > 0 THEN 1 END) as return_incidents
      FROM quality
      WHERE date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    `);

    res.json({
      quality_trends: qualityTrends.rows,
      rejection_reasons: rejectionReasons.rows,
      cost_breakdown: costBreakdown.rows[0]
    });
  } catch (err) {
    console.error('Error fetching quality data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get detailed Delivery data
app.get('/api/delivery', async (req, res) => {
  try {
    const deliveryTrends = await pool.query(`
      SELECT 
        TO_CHAR(order_date, 'Mon-YY') as month,
        AVG(CASE WHEN delayed = 0 THEN 1 ELSE 0 END) * 100 as on_time_rate,
        AVG(lead_time) as avg_lead_time,
        SUM(CASE WHEN delayed = 1 THEN 1 ELSE 0 END) as delayed_orders
      FROM delivery
      GROUP BY TO_CHAR(order_date, 'Mon-YY'), DATE_TRUNC('month', order_date)
      ORDER BY DATE_TRUNC('month', order_date) DESC
      LIMIT 12
    `);

    const delayReasons = await pool.query(`
      SELECT reason_for_delay as reason, COUNT(*) as count, SUM(delayed_order_value) as value
      FROM delivery 
      WHERE reason_for_delay IS NOT NULL
      GROUP BY reason_for_delay
      ORDER BY count DESC
    `);

    const leadTimeDistribution = await pool.query(`
      SELECT 
        CASE 
          WHEN lead_time <= 30 THEN '≤30 days'
          WHEN lead_time <= 60 THEN '31-60 days'
          WHEN lead_time <= 90 THEN '61-90 days'
          ELSE '>90 days'
        END as lead_time_bucket,
        COUNT(*) as count
      FROM delivery
      GROUP BY 
        CASE 
          WHEN lead_time <= 30 THEN '≤30 days'
          WHEN lead_time <= 60 THEN '31-60 days'
          WHEN lead_time <= 90 THEN '61-90 days'
          ELSE '>90 days'
        END
      ORDER BY COUNT(*) DESC
    `);

    res.json({
      delivery_trends: deliveryTrends.rows,
      delay_reasons: delayReasons.rows,
      lead_time_distribution: leadTimeDistribution.rows
    });
  } catch (err) {
    console.error('Error fetching delivery data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Data management endpoints - Add new data
app.post('/api/sales-pipeline/add', async (req, res) => {
  try {
    const query = `
      INSERT INTO sales_pipeline (
        enquiry_date, lead, lead_qualified_date, sales_order, sales_order_date, 
        sales_cycle, invoice_date, invoice_value, city, state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      req.body.enquiry_date || null,
      req.body.lead,
      req.body.lead_qualified_date || null,
      req.body.sales_order,
      req.body.sales_order_date || null,
      req.body.sales_cycle || null,
      req.body.invoice_date || null,
      req.body.invoice_value || null,
      req.body.city || null,
      req.body.state || null
    ];
    
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding sales data:', err);
    res.status(500).json({ error: 'Failed to add sales data' });
  }
});

app.post('/api/employability/add', async (req, res) => {
  try {
    const query = `
      INSERT INTO employability (
        date, admin_present, admin_leave, admin_separated, admin_reason_attrition,
        dl_present, dl_leave, dl_separated, dl_reason_attrition,
        idl_present, idl_leave, idl_separated, idl_reason_attrition,
        total_days_to_recruit, hr_ir_count, finance_account_count, 
        sales_marketing_count, operations_count, it_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;
    
    const values = [
      req.body.date,
      req.body.admin_present || 0,
      req.body.admin_leave || 0,
      req.body.admin_separated || 0,
      req.body.admin_reason_attrition || null,
      req.body.dl_present || 0,
      req.body.dl_leave || 0,
      req.body.dl_separated || 0,
      req.body.dl_reason_attrition || null,
      req.body.idl_present || 0,
      req.body.idl_leave || 0,
      req.body.idl_separated || 0,
      req.body.idl_reason_attrition || null,
      req.body.total_days_to_recruit || null,
      req.body.hr_ir_count || 0,
      req.body.finance_account_count || 0,
      req.body.sales_marketing_count || 0,
      req.body.operations_count || 0,
      req.body.it_count || 0
    ];
    
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding employability data:', err);
    res.status(500).json({ error: 'Failed to add employability data' });
  }
});

app.post('/api/quality/add', async (req, res) => {
  try {
    const query = `
      INSERT INTO quality (
        date, product_produced, product_rejected, reason_for_rejection,
        product_shipped, product_returned, product_remake, cost_of_remake,
        product_repaired, cost_of_repair
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      req.body.date,
      req.body.product_produced || 0,
      req.body.product_rejected || 0,
      req.body.reason_for_rejection || null,
      req.body.product_shipped || 0,
      req.body.product_returned || 0,
      req.body.product_remake || 0,
      req.body.cost_of_remake || 0,
      req.body.product_repaired || 0,
      req.body.cost_of_repair || 0
    ];
    
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding quality data:', err);
    res.status(500).json({ error: 'Failed to add quality data' });
  }
});

app.post('/api/delivery/add', async (req, res) => {
  try {
    const query = `
      INSERT INTO delivery (
        order_date, order_value, estimated_ship_date, actual_ship_date,
        lead_time, delayed, delayed_order_value, reason_for_delay
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const values = [
      req.body.order_date,
      req.body.order_value || 0,
      req.body.estimated_ship_date || null,
      req.body.actual_ship_date || null,
      req.body.lead_time || null,
      req.body.delayed || 0,
      req.body.delayed_order_value || 0,
      req.body.reason_for_delay || null
    ];
    
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding delivery data:', err);
    res.status(500).json({ error: 'Failed to add delivery data' });
  }
});

// Get all data endpoints
app.get('/api/sales-pipeline/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sales_pipeline ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sales data:', err);
    res.status(500).json({ error: 'Failed to fetch sales data' });
  }
});

app.get('/api/employability/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employability ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employability data:', err);
    res.status(500).json({ error: 'Failed to fetch employability data' });
  }
});

app.get('/api/quality/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM quality ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching quality data:', err);
    res.status(500).json({ error: 'Failed to fetch quality data' });
  }
});

app.get('/api/delivery/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM delivery ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching delivery data:', err);
    res.status(500).json({ error: 'Failed to fetch delivery data' });
  }
});

// Delete endpoints
app.delete('/api/sales-pipeline/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sales_pipeline WHERE id = $1', [req.params.id]);
    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    console.error('Error deleting sales record:', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

app.delete('/api/employability/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM employability WHERE id = $1', [req.params.id]);
    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    console.error('Error deleting employability record:', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

app.delete('/api/quality/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM quality WHERE id = $1', [req.params.id]);
    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    console.error('Error deleting quality record:', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

app.delete('/api/delivery/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM delivery WHERE id = $1', [req.params.id]);
    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    console.error('Error deleting delivery record:', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// Catch all handler for React Router
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
const { Pool } = require('pg');
require('dotenv').config();

// First connect to postgres database to create our database
const adminPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'postgres', // Connect to default postgres database
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function setupDatabase() {
  try {
    console.log('Connecting to PostgreSQL...');
    
    // Check if database exists
    const dbCheck = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [process.env.DB_NAME || 'pms_dashboard']
    );
    
    if (dbCheck.rows.length === 0) {
      console.log('Creating database pms_dashboard...');
      await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME || 'pms_dashboard'}`);
      console.log('Database created successfully!');
    } else {
      console.log('Database pms_dashboard already exists.');
    }
    
    await adminPool.end();
    
    // Now connect to our database and create tables
    const appPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'pms_dashboard',
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 5432,
    });
    
    console.log('Creating tables...');
    
    // Create tables
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS sales_pipeline (
        id SERIAL PRIMARY KEY,
        enquiry_date DATE,
        lead VARCHAR(10),
        lead_qualified_date DATE,
        sales_order VARCHAR(20),
        sales_order_date DATE,
        month VARCHAR(20),
        sales_cycle INTEGER,
        invoice_date DATE,
        invoice_month VARCHAR(20),
        invoice_value DECIMAL(15,2),
        city VARCHAR(100),
        state VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS employability (
        id SERIAL PRIMARY KEY,
        date DATE,
        month VARCHAR(20),
        admin_present INTEGER,
        admin_leave INTEGER,
        admin_separated INTEGER,
        admin_reason_attrition VARCHAR(100),
        dl_present INTEGER,
        dl_leave INTEGER,
        dl_separated INTEGER,
        dl_reason_attrition VARCHAR(100),
        idl_present INTEGER,
        idl_leave INTEGER,
        idl_separated INTEGER,
        idl_reason_attrition VARCHAR(100),
        date_of_replacement DATE,
        total_days_to_recruit INTEGER,
        hr_ir_count INTEGER,
        finance_account_count INTEGER,
        sales_marketing_count INTEGER,
        operations_count INTEGER,
        it_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS quality (
        id SERIAL PRIMARY KEY,
        date DATE,
        month VARCHAR(20),
        product_produced INTEGER,
        product_rejected INTEGER,
        reason_for_rejection VARCHAR(100),
        product_shipped INTEGER,
        product_returned INTEGER,
        product_remake INTEGER,
        cost_of_remake DECIMAL(15,2),
        product_repaired INTEGER,
        cost_of_repair DECIMAL(15,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS delivery (
        id SERIAL PRIMARY KEY,
        order_date DATE,
        month VARCHAR(20),
        order_value DECIMAL(15,2),
        estimated_ship_date DATE,
        actual_ship_date DATE,
        ship_month VARCHAR(20),
        lead_time INTEGER,
        delayed INTEGER,
        delayed_order_value DECIMAL(15,2),
        reason_for_delay VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Insert sample data if tables are empty
    const salesCount = await appPool.query('SELECT COUNT(*) FROM sales_pipeline');
    if (parseInt(salesCount.rows[0].count) === 0) {
      console.log('Inserting sample data...');
      
      // Insert sample sales data
      await appPool.query(`
        INSERT INTO sales_pipeline (enquiry_date, lead, lead_qualified_date, sales_order, sales_order_date, month, sales_cycle, invoice_date, invoice_month, invoice_value, city, state) VALUES
        ('2025-01-27', 'Yes', '2025-03-13', 'Won', '2025-05-12', 'Apr-25', 105, '2025-06-11', 'Jun-25', 500000, 'Ahmedabad', 'GJ'),
        ('2025-02-01', 'Yes', '2025-03-18', 'Won', '2025-05-15', 'May-25', 120, '2025-07-01', 'Jul-25', 750000, 'Mumbai', 'MH'),
        ('2025-02-05', 'Yes', '2025-03-22', 'Won', '2025-06-01', 'Jun-25', 135, '2025-08-01', 'Aug-25', 1500000, 'Delhi', 'DL')
      `);
      
      // Insert sample employability data
      await appPool.query(`
        INSERT INTO employability (date, month, admin_present, admin_leave, admin_separated, admin_reason_attrition, dl_present, dl_leave, dl_separated, dl_reason_attrition, idl_present, idl_leave, idl_separated, idl_reason_attrition, total_days_to_recruit, hr_ir_count, finance_account_count, sales_marketing_count, operations_count, it_count) VALUES
        ('2025-01-23', 'Jan-25', 10, 1, 1, 'Better Opportunity', 10, 1, 1, 'Better Opportunity', 10, 1, 1, 'Better Opportunity', 60, 2, 2, 4, 8, 1),
        ('2025-01-24', 'Jan-25', 11, 0, 0, NULL, 11, 0, 0, NULL, 11, 0, 0, NULL, NULL, 2, 2, 4, 8, 1)
      `);
      
      // Insert sample quality data
      await appPool.query(`
        INSERT INTO quality (date, month, product_produced, product_rejected, reason_for_rejection, product_shipped, product_returned, product_remake, cost_of_remake, product_repaired, cost_of_repair) VALUES
        ('2025-01-23', 'Jan-25', 1200, 20, 'Specification', 1500, 2, 1, 100000, 3, 75000),
        ('2025-01-24', 'Jan-25', 1000, 22, NULL, 950, 1, 0, 0, 2, 25000)
      `);
      
      // Insert sample delivery data
      await appPool.query(`
        INSERT INTO delivery (order_date, month, order_value, estimated_ship_date, actual_ship_date, ship_month, lead_time, delayed, delayed_order_value, reason_for_delay) VALUES
        ('2025-01-23', 'Jan-25', 500000, '2025-02-23', '2025-02-23', 'Feb-25', 31, 0, 0, NULL),
        ('2025-01-24', 'Jan-25', 650000, '2025-02-28', '2025-03-01', 'Mar-25', 35, 1, 650000, 'No RM')
      `);
      
      console.log('Sample data inserted successfully!');
    }
    
    await appPool.end();
    console.log('Database setup completed successfully!');
    
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase();
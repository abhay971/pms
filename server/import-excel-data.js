const XLSX = require('xlsx');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'pms_dashboard',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function importExcelData() {
  try {
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile('../Daily Data - PMS 13.08.2025.xlsx');
    
    // Clear existing data
    await pool.query('DELETE FROM sales_pipeline');
    await pool.query('DELETE FROM employability');
    await pool.query('DELETE FROM quality');
    await pool.query('DELETE FROM delivery');
    
    // Import Sales Pipeline Data
    console.log('Importing Sales Pipeline data...');
    const salesData = XLSX.utils.sheet_to_json(workbook.Sheets['Sales Pipeline-Database']);
    
    for (const row of salesData) {
      if (row['Equiry Date']) {
        const enquiryDate = new Date(Math.round((row['Equiry Date'] - 25569) * 86400 * 1000));
        const leadQualifiedDate = row['Lead Qualified Date'] ? new Date(Math.round((row['Lead Qualified Date'] - 25569) * 86400 * 1000)) : null;
        const salesOrderDate = row['Sales Order Date'] ? new Date(Math.round((row['Sales Order Date'] - 25569) * 86400 * 1000)) : null;
        const invoiceDate = row['Invoice Date'] ? new Date(Math.round((row['Invoice Date'] - 25569) * 86400 * 1000)) : null;
        
        await pool.query(`
          INSERT INTO sales_pipeline (
            enquiry_date, lead, lead_qualified_date, sales_order, sales_order_date,
            sales_cycle, invoice_date, invoice_value, city, state
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          enquiryDate, row['Lead'], leadQualifiedDate, row['Sales Order'], salesOrderDate,
          row['Sales Cycle'], invoiceDate, row['Invoice Value'], row['City'], row['State']
        ]);
      }
    }
    
    // Import Employability Data
    console.log('Importing Employability data...');
    const employabilityData = XLSX.utils.sheet_to_json(workbook.Sheets['Employability-Database']);
    
    for (const row of employabilityData) {
      if (row['Date']) {
        const date = new Date(Math.round((row['Date'] - 25569) * 86400 * 1000));
        
        await pool.query(`
          INSERT INTO employability (
            date, admin_present, admin_leave, admin_separated, admin_reason_attrition,
            dl_present, dl_leave, dl_separated, dl_reason_attrition,
            idl_present, idl_leave, idl_separated, idl_reason_attrition,
            total_days_to_recruit, hr_ir_count, finance_account_count,
            sales_marketing_count, operations_count, it_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `, [
          date,
          row['Present'] || 0, row['Leave'] || 0, row['Separated'] || 0, row['Reason for Attrition'],
          row['Present__1'] || 0, row['Leave__1'] || 0, row['Separated__1'] || 0, row['Reason for Attrition__1'],
          row['Present__2'] || 0, row['Leave__2'] || 0, row['Separated__2'] || 0, row['Reason for Attrition__2'],
          row['Total Days to Recruit'], row['HR & IR'] || 0, row['Finance & Account'] || 0,
          row['Sales & Marketing'] || 0, row['Operations'] || 0, row['IT'] || 0
        ]);
      }
    }
    
    // Import Quality Data
    console.log('Importing Quality data...');
    const qualityData = XLSX.utils.sheet_to_json(workbook.Sheets['Quality-Database']);
    
    for (const row of qualityData) {
      if (row['Date']) {
        const date = new Date(Math.round((row['Date'] - 25569) * 86400 * 1000));
        
        await pool.query(`
          INSERT INTO quality (
            date, product_produced, product_rejected, reason_for_rejection,
            product_shipped, product_returned, product_remake, cost_of_remake,
            product_repaired, cost_of_repair
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          date, row['Product Produced'] || 0, row['Product Rejected'] || 0, row['Reason for Rejction'],
          row['Product Shipped'] || 0, row['Product Returned'] || 0, row['Product Remake'] || 0,
          row['Cost of Remake'] || 0, row['Product Repaired'] || 0, row['Cost of Repair'] || 0
        ]);
      }
    }
    
    // Import Delivery Data
    console.log('Importing Delivery data...');
    const deliveryData = XLSX.utils.sheet_to_json(workbook.Sheets['Delivery-Database']);
    
    for (const row of deliveryData) {
      if (row['Order Date']) {
        const orderDate = new Date(Math.round((row['Order Date'] - 25569) * 86400 * 1000));
        const estimatedShipDate = row['Estimated Ship Date'] ? new Date(Math.round((row['Estimated Ship Date'] - 25569) * 86400 * 1000)) : null;
        const actualShipDate = row['Actual Ship Date'] ? new Date(Math.round((row['Actual Ship Date'] - 25569) * 86400 * 1000)) : null;
        
        await pool.query(`
          INSERT INTO delivery (
            order_date, order_value, estimated_ship_date, actual_ship_date,
            lead_time, delayed, delayed_order_value, reason_for_delay
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          orderDate, row['Order Value'] || 0, estimatedShipDate, actualShipDate,
          row['Lead Time'] || 0, row['Delayed'] || 0, row['Delayed Order Value'] || 0,
          row['Reason for Delay']
        ]);
      }
    }
    
    console.log('Excel data imported successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('Error importing Excel data:', error);
    process.exit(1);
  }
}

importExcelData();
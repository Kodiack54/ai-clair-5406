/**
 * Database Routes - Schema documentation, tables, RLS policies
 *
 * Documents all database objects for a project
 */

const express = require('express');
const router = express.Router();
const supabase = require('../../../shared/db');

// Initialize Supabase client

// GET /api/database/:project/tables - Get table list with prefix
router.get('/:project/tables', async (req, res) => {
  try {
    const { project } = req.params;
    const { prefix } = req.query;

    // Query Supabase for tables
    // This queries the information_schema to get table info
    const { data, error } = await supabase.rpc('get_tables_info', {
      table_prefix: prefix || ''
    }).catch(() => ({ data: null, error: { message: 'RPC not available' } }));

    // Fallback: query from Susan's stored schemas
    if (error || !data) {
      const { data: schemas, error: schemaError } = await supabase
        .from('dev_ai_schemas')
        .select('*')
        .order('table_name');

      if (schemaError) throw schemaError;

      // Group by table
      const tables = {};
      schemas?.forEach(schema => {
        if (prefix && !schema.table_name.startsWith(prefix)) return;

        if (!tables[schema.table_name]) {
          tables[schema.table_name] = {
            name: schema.table_name,
            database: schema.database_name,
            description: schema.description,
            columns: []
          };
        }
        if (schema.schema_definition) {
          tables[schema.table_name].columns = schema.schema_definition;
        }
      });

      return res.json({
        success: true,
        project: decodeURIComponent(project),
        tableCount: Object.keys(tables).length,
        tables: Object.values(tables),
        source: 'susan_schemas'
      });
    }

    res.json({
      success: true,
      project: decodeURIComponent(project),
      tableCount: data?.length || 0,
      tables: data || [],
      source: 'information_schema'
    });
  } catch (error) {
    console.error('[Clair/Database] Tables error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/database/:project/schemas - Get schema info
router.get('/:project/schemas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dev_ai_schemas')
      .select('*')
      .order('database_name, table_name');

    if (error) throw error;

    // Group by database
    const byDatabase = {};
    data?.forEach(schema => {
      if (!byDatabase[schema.database_name]) {
        byDatabase[schema.database_name] = [];
      }
      byDatabase[schema.database_name].push(schema);
    });

    res.json({
      success: true,
      total: data?.length || 0,
      schemas: data || [],
      byDatabase
    });
  } catch (error) {
    console.error('[Clair/Database] Schemas error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/database/:project/rls - Get RLS policies
router.get('/:project/rls', async (req, res) => {
  try {
    const { prefix } = req.query;

    // Try to query RLS policies from Supabase
    // This requires a custom RPC function or direct pg_policies query
    const { data, error } = await supabase.rpc('get_rls_policies', {
      table_prefix: prefix || ''
    }).catch(() => ({ data: null, error: { message: 'RPC not available' } }));

    if (error || !data) {
      // Return placeholder explaining how to document RLS
      return res.json({
        success: true,
        message: 'RLS policies should be documented manually or via Supabase dashboard',
        policies: [],
        howToDocument: {
          step1: 'Go to Supabase Dashboard > Authentication > Policies',
          step2: 'Export or copy policy definitions',
          step3: 'Store in dev_ai_schemas table with type "rls_policy"'
        }
      });
    }

    res.json({
      success: true,
      policies: data || []
    });
  } catch (error) {
    console.error('[Clair/Database] RLS error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/database/:project/table/:name - Get specific table details
router.get('/:project/table/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const { data, error } = await supabase
      .from('dev_ai_schemas')
      .select('*')
      .eq('table_name', name)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: `Table ${name} not found in documentation`
      });
    }

    res.json({
      success: true,
      table: data
    });
  } catch (error) {
    console.error('[Clair/Database] Table detail error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/database/:project/document - Document a table manually
router.post('/:project/document', async (req, res) => {
  try {
    const { table_name, database_name, description, schema_definition } = req.body;

    if (!table_name) {
      return res.status(400).json({
        success: false,
        error: 'table_name is required'
      });
    }

    const { data, error } = await supabase
      .from('dev_ai_schemas')
      .upsert({
        table_name,
        database_name: database_name || 'supabase',
        description,
        schema_definition,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'database_name,table_name'
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      schema: data
    });
  } catch (error) {
    console.error('[Clair/Database] Document error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

#!/usr/bin/env node
/**
 * Researcher Data Export Script
 * 
 * Exports participant sessions, demographics, consent timestamps, audio metadata,
 * playback completion timestamps, and all question answers to CSV.
 * 
 * Usage:
 *   SUPABASE_URL=https://xyz.supabase.co SUPABASE_SERVICE_ROLE_KEY=ey... node scripts/export_responses_csv.js
 * Or via npm:
 *   npm run export:csv
 * 
 * To export tidy/long format:
 *   npm run export:csv -- --format=long
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fetchAllRows } from '../src/lib/pagination.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isLongFormat = process.argv.includes('--format=long');

if (!supabaseUrl || !serviceKey) {
  console.error('\nError: Missing required environment variables.');
  console.error('Please provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('\nExample usage:');
  console.error('  SUPABASE_URL="https://your-project.supabase.co" SUPABASE_SERVICE_ROLE_KEY="ey..." npm run export:csv\n');
  console.error('Alternatively, you can export directly from the Supabase SQL Editor:');
  console.error('  SELECT * FROM researcher_export_view;\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

function escapeCsvField(field) {
  if (field === null || field === undefined) return '""';
  const str = String(field).replace(/"/g, '""');
  return `"${str}"`;
}

async function exportResponses() {
  const targetView = isLongFormat ? 'researcher_responses_long_view' : 'researcher_export_view';
  console.log(`Connecting to Supabase at ${supabaseUrl}...`);
  console.log(`Querying ${targetView} (${isLongFormat ? 'Tidy/Long format' : 'Wide participant format'})...`);
  
  // Paginate: Supabase returns at most 1,000 rows per request and does not report
  // truncation, so a single request would silently drop most long-format rows.
  const ordering = isLongFormat
    ? [['participant_id'], ['recording_number'], ['question_number'], ['question_id']]
    : [['"Created At"'], ['"Participant ID"']];

  let data;
  try {
    data = await fetchAllRows(() => {
      let query = supabase.from(targetView).select('*');
      for (const [column] of ordering) query = query.order(column, { ascending: true });
      return query;
    });
  } catch (error) {
    console.error(`Failed to query ${targetView}:`, error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No participant responses found in database.');
    return;
  }

  console.log(`Retrieved ${data.length} records.`);

  const headers = Object.keys(data[0]);
  const csvRows = [headers.map(escapeCsvField).join(',')];

  for (const row of data) {
    const values = headers.map((header) => escapeCsvField(row[header]));
    csvRows.push(values.join(','));
  }

  const csvContent = csvRows.join('\n');
  const exportDir = path.resolve('exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const prefix = isLongFormat ? 'responses_long_' : 'responses_wide_';
  const filename = `${prefix}${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  const filePath = path.join(exportDir, filename);

  fs.writeFileSync(filePath, csvContent, 'utf8');
  console.log(`\nSuccessfully exported data to:\n  ${filePath}\n`);
}

exportResponses().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

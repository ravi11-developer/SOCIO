/**
 * SQL tests for the Supabase schema, run in an in-memory Postgres (PGlite).
 *
 *   npm run test:sql
 *
 * Builds a fresh database with supabase/full_clean_setup.sql (which applies every
 * migration), re-applies the latest migration to prove it is safe to run twice, and
 * then drives every participant RPC as the anonymous API role, checking validation,
 * the listening check, stage locks, admin-only access, the export views and allocation.
 *
 * Supabase-specific objects (roles, auth, storage) are stubbed in supabase_stubs.sql.
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
let passed = 0;
const ok = (name) => { passed += 1; console.log('  ok -', name); };

async function asRole(db, role, sql, params = [], sub = null) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${sub || ''}', false);`);
  await db.exec(`SET ROLE ${role};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('RESET ROLE;');
  }
}
async function expectError(promise, pattern, name) {
  try { await promise; } catch (e) { assert.match(e.message, pattern, `${name}: got "${e.message}"`); ok(name); return; }
  assert.fail(`${name}: expected an error matching ${pattern}`);
}
const rpc = (db, fn, args) => asRole(db, 'anon', `SELECT ${fn} AS r`, args).then((r) => r.rows[0].r);

const db = new PGlite();
await db.exec(fs.readFileSync(path.join(here, 'supabase_stubs.sql'), 'utf8'));
const setupSql = fs.readFileSync(path.join(repo, 'supabase', 'full_clean_setup.sql'), 'utf8');
await db.exec(setupSql);
ok('full_clean_setup.sql builds a fresh database');
await db.exec(fs.readFileSync(path.join(repo, 'supabase', 'migrations', '20261113000000_data_integrity_fixes.sql'), 'utf8'));
ok('the data integrity migration is safe to run again on an up-to-date database');
await db.query(`SELECT rpc_init_or_resume_session(NULL)`);
await expectError(db.exec(setupSql), /Refusing to run/, 'full_clean_setup.sql refuses to run once participants exist');
const still = await db.query(`SELECT count(*)::int AS n FROM participants`);
assert.equal(still.rows[0].n, 1);
ok('nothing was dropped by the refused run');
const paths = await db.query(`SELECT DISTINCT right(audio_storage_path, 9) AS ext FROM recordings`);
assert.deepEqual(paths.rows.map((r) => r.ext), ['.mp3.mpeg']);
ok('fresh setup uses the live storage paths (.mp3.mpeg)');
const bucket = await db.query(`SELECT id FROM storage.buckets`);
assert.deepEqual(bucket.rows.map((r) => r.id), ['audio_files']);
ok('fresh setup creates the audio_files bucket the site reads from');

// ---------- New participant flow as the anonymous role ----------
const s = await rpc(db, 'rpc_init_or_resume_session(NULL)', []);
assert.deepEqual(Object.keys(s.assigned_audio_1).sort(), ['audio_storage_path', 'duration_seconds']);
assert.ok(!JSON.stringify(s).match(/pure_|codemixed_|Hindi|English|male/i) || /\.mp3/.test(s.assigned_audio_1.audio_storage_path));
assert.equal(s.assigned_audio_1.code, undefined);
ok('session payload carries only file path and duration for each audio');
assert.deepEqual([...s.trait_order_1].sort((x, y) => x - y), [1,2,3,4,5,6,7,8,9,10,11,12]);
assert.deepEqual([...s.trait_order_2].sort((x, y) => x - y), [1,2,3,4,5,6,7,8,9,10,11,12]);
ok('new sessions get a permutation of the 12 traits for each audio');

await expectError(asRole(db, 'anon', 'SELECT * FROM recordings'), /permission denied/, 'anonymous visitors cannot read the recordings table');
await expectError(asRole(db, 'anon', 'SELECT * FROM researcher_export_view'), /permission denied/, 'anonymous visitors cannot read the wide export view');
await expectError(asRole(db, 'anon', 'SELECT * FROM researcher_responses_long_view'), /permission denied/, 'anonymous visitors cannot read the long export view');
await expectError(asRole(db, 'anon', 'SELECT * FROM audio_events'), /permission denied/, 'anonymous visitors cannot read audio events');
await expectError(asRole(db, 'anon', 'SELECT random_trait_order()'), /permission denied/, 'helper functions are not callable through the API');

const tok = s.session_token;
await expectError(rpc(db, `rpc_autosave_response($1,'q1_1','4')`, [tok]), /STAGE_LOCKED/, 'answers before listening are refused');
await expectError(rpc(db, `rpc_submit_consent_and_demographics($1,'female','north_indian','','English',5,true)`, [tok]), /VALIDATION/, 'empty first language is refused');
const consent = await rpc(db, `rpc_submit_consent_and_demographics($1,'female','north_indian','Hindi','English; Telugu',5,true)`, [tok]);
assert.equal(consent.current_stage, 'audio_1_pending');
ok('consent and demographics advance to audio 1');

// Listening check
let comp = await rpc(db, 'rpc_complete_audio($1,1)', [tok]);
assert.equal(comp.success, false); assert.equal(comp.reason, 'listen_incomplete');
let st = await db.query(`SELECT audio_1_started_at FROM experiment_sessions es JOIN participants p ON p.id = es.participant_id WHERE p.session_token = $1`, [tok]);
assert.ok(st.rows[0].audio_1_started_at, 'missing start time is recorded');
ok('completion without a recorded start is refused and the start time is recorded');
await rpc(db, 'rpc_record_audio_start($1,1)', [tok]);
comp = await rpc(db, 'rpc_complete_audio($1,1)', [tok]);
assert.equal(comp.success, false); assert.equal(comp.reason, 'listen_incomplete');
ok('completion straight after starting is refused');
await db.query(`UPDATE experiment_sessions SET audio_1_started_at = now() - interval '80 seconds' WHERE participant_id = (SELECT id FROM participants WHERE session_token = $1)`, [tok]);
comp = await rpc(db, 'rpc_complete_audio($1,1)', [tok]);
assert.equal(comp.success, true); assert.equal(comp.current_stage, 'questions_1_pending');
ok('completion after the full length is accepted');
comp = await rpc(db, 'rpc_complete_audio($1,1)', [tok]);
assert.equal(comp.success, true);
ok('repeated completion is idempotent');

// Audio events
const ev = await rpc(db, `rpc_record_audio_event($1,1,'pause',12.5)`, [tok]);
assert.equal(ev.success, true);
await rpc(db, `rpc_record_audio_event($1,1,'hidden',NULL)`, [tok]);
await expectError(rpc(db, `rpc_record_audio_event($1,1,'teleport',NULL)`, [tok]), /VALIDATION/, 'unknown audio event types are refused');
ok('audio events are recorded');

// Answer validation
await expectError(rpc(db, `rpc_autosave_response($1,'q1_1','7')`, [tok]), /VALIDATION/, 'rating 7 is refused');
await expectError(rpc(db, `rpc_autosave_response($1,'q1_1','0')`, [tok]), /VALIDATION/, 'rating 0 is refused');
await expectError(rpc(db, `rpc_autosave_response($1,'q1_1','3.5')`, [tok]), /VALIDATION/, 'rating 3.5 is refused');
await expectError(rpc(db, `rpc_autosave_response($1,'q1_99','3')`, [tok]), /VALIDATION/, 'unknown questions are refused');
await expectError(rpc(db, `rpc_autosave_response($1,'q1_comment',$2)`, [tok, 'x'.repeat(5001)]), /VALIDATION/, 'comments over 5000 characters are refused');
await expectError(rpc(db, `rpc_autosave_response($1,'q2_1','3')`, [tok]), /STAGE_LOCKED/, 'audio 2 answers are refused while on audio 1 questions');
await rpc(db, `rpc_autosave_response($1,'q1_1',' 5 ')`, [tok]);
for (let i = 2; i <= 12; i++) await rpc(db, `rpc_autosave_response($1,$2,$3)`, [tok, `q1_${i}`, String((i % 6) + 1)]);
await expectError(rpc(db, 'rpc_complete_questions_1($1)', [tok]), /required items/, 'questions 1 cannot finish without the comment');
await rpc(db, `rpc_autosave_response($1,'q1_comment','Sounds confident.')`, [tok]);
const q1 = await rpc(db, 'rpc_complete_questions_1($1)', [tok]);
assert.equal(q1.current_stage, 'audio_2_pending');
ok('valid answers are saved (ratings trimmed) and questions 1 completes');
await expectError(rpc(db, `rpc_autosave_response($1,'q1_1','2')`, [tok]), /STAGE_LOCKED/, 'audio 1 answers are locked after moving on');

await rpc(db, 'rpc_record_audio_start($1,2)', [tok]);
await db.query(`UPDATE experiment_sessions SET audio_2_started_at = now() - interval '80 seconds' WHERE participant_id = (SELECT id FROM participants WHERE session_token = $1)`, [tok]);
comp = await rpc(db, 'rpc_complete_audio($1,2)', [tok]);
assert.equal(comp.current_stage, 'questions_2_pending');
for (let i = 1; i <= 12; i++) await rpc(db, `rpc_autosave_response($1,$2,'4')`, [tok, `q2_${i}`]);
await rpc(db, `rpc_autosave_response($1,'q2_comment','Friendly.')`, [tok]);
const sub = await rpc(db, 'rpc_submit_experiment($1)', [tok]);
assert.equal(sub.current_stage, 'submitted');
ok('audio 2 and final submission complete');
await expectError(rpc(db, `rpc_autosave_response($1,'q2_comment','late edit')`, [tok]), /after final submission/, 'answers are locked after submission');

// ---------- Export views (service role, as the export script uses) ----------
const wide = await asRole(db, 'service_role', `SELECT * FROM researcher_export_view WHERE "Participant ID" = $1`, [s.participant_id]);
const w = wide.rows[0];
assert.equal(w['Session Status'], 'submitted');
assert.equal(w['A1_Leadership'], '5');
assert.equal(Number(w['Audio 1 Pauses']), 1);
assert.equal(Number(w['Audio 1 Tab Hidden']), 1);
assert.ok(Number(w['Audio 1 Listen Seconds']) >= 79);
assert.equal(w['A1 Trait Order'].split(',').length, 12);
const wideCols = wide.fields.map((f) => f.name);
assert.deepEqual(wideCols.slice(0, 3), ['Participant ID', 'Created At', 'Gender']);
assert.equal(wideCols[wideCols.indexOf('A2_Candid_Opinions') + 1], 'Audio 1 Listen Seconds');
ok('wide view keeps its original columns first and adds listening, event and trait-order columns');

const long = await asRole(db, 'service_role', `SELECT * FROM researcher_responses_long_view WHERE participant_id = $1 ORDER BY recording_number, question_number`, [s.participant_id]);
assert.equal(long.rows.length, 26);
const l1 = long.rows.find((r) => r.question_id === 'q1_1');
assert.equal(l1.answer_numeric, 5);
assert.equal(l1.session_status, 'submitted');
assert.equal(l1.trait_display_position, s.trait_order_1.indexOf(1) + 1);
assert.equal(long.rows.find((r) => r.question_id === 'q1_comment').trait_display_position, null);
assert.ok(long.rows.every((r) => r.final_answer_at));
ok('long view adds session status, numeric answers, display position and final answer time');

// Admin (authenticated + listed in admin_users) can read; other logged-in users cannot.
const adminId = '11111111-1111-1111-1111-111111111111';
const otherId = '22222222-2222-2222-2222-222222222222';
await db.query(`INSERT INTO auth.users (id, email) VALUES ($1,'admin@example.com'), ($2,'other@example.com')`, [adminId, otherId]);
await db.query(`INSERT INTO admin_users (user_id, email) VALUES ($1,'admin@example.com')`, [adminId]);
const adminEvents = await asRole(db, 'authenticated', `SELECT count(*)::int AS n FROM audio_events`, [], adminId);
assert.ok(adminEvents.rows[0].n >= 2);
const adminWide = await asRole(db, 'authenticated', `SELECT count(*)::int AS n FROM researcher_export_view`, [], adminId);
assert.ok(adminWide.rows[0].n >= 1);
const adminRec = await asRole(db, 'authenticated', `SELECT count(*)::int AS n FROM recordings`, [], adminId);
assert.equal(adminRec.rows[0].n, 10);
const otherWide = await asRole(db, 'authenticated', `SELECT count(*)::int AS n FROM researcher_export_view`, [], otherId);
assert.equal(otherWide.rows[0].n, 0);
ok('the admin can read events, views and recordings; a non-admin login sees no participant rows');

// ---------- Allocation ignores stale sessions ----------
await db.exec(`DELETE FROM participants;`);
// 20 stale sessions all on pure recording 1 (abandoned an hour ago).
for (let i = 0; i < 20; i++) {
  const x = (await db.query(`SELECT rpc_init_or_resume_session(NULL) AS s`)).rows[0].s;
  await db.query(`UPDATE experiment_sessions SET audio_1_recording_id = 1, audio_2_recording_id = 8, presentation_order = 'pure_first' WHERE participant_id = (SELECT id FROM participants WHERE session_token = $1)`, [x.session_token]);
}
await db.exec(`ALTER TABLE experiment_sessions DISABLE TRIGGER session_touch_activity; UPDATE experiment_sessions SET last_activity_at = now() - interval '2 hours'; ALTER TABLE experiment_sessions ENABLE TRIGGER session_touch_activity;`);
// 5 active sessions covering pure recordings 2 to 6.
for (const pid of [2, 3, 4, 5, 6]) {
  const x = (await db.query(`SELECT rpc_init_or_resume_session(NULL) AS s`)).rows[0].s;
  await db.query(`UPDATE experiment_sessions SET audio_1_recording_id = $2, audio_2_recording_id = 7, presentation_order = 'pure_first' WHERE participant_id = (SELECT id FROM participants WHERE session_token = $1)`, [x.session_token, pid]);
}
const fresh = (await db.query(`SELECT rpc_init_or_resume_session(NULL) AS s`)).rows[0].s;
const freshRow = await db.query(`SELECT audio_1_recording_id, audio_2_recording_id FROM experiment_sessions WHERE participant_id = (SELECT id FROM participants WHERE session_token = $1)`, [fresh.session_token]);
assert.ok([freshRow.rows[0].audio_1_recording_id, freshRow.rows[0].audio_2_recording_id].includes(1));
ok('allocation ignores abandoned sessions (recording 1 is chosen despite 20 stale uses)');

// Balance over many sequential participants who all finish.
await db.exec(`DELETE FROM participants;`);
const counts = {};
for (let i = 0; i < 60; i++) {
  const x = (await db.query(`SELECT rpc_init_or_resume_session(NULL) AS s`)).rows[0].s;
  const r = (await db.query(`SELECT audio_1_recording_id a, audio_2_recording_id b FROM experiment_sessions WHERE participant_id = (SELECT id FROM participants WHERE session_token = $1)`, [x.session_token])).rows[0];
  counts[r.a] = (counts[r.a] || 0) + 1; counts[r.b] = (counts[r.b] || 0) + 1;
  await db.query(`UPDATE experiment_sessions SET session_status = 'submitted', current_stage = 'submitted', submitted_at = now() WHERE participant_id = (SELECT id FROM participants WHERE session_token = $1)`, [x.session_token]);
}
for (let id = 1; id <= 6; id++) assert.ok(counts[id] >= 9 && counts[id] <= 11, `pure ${id}: ${counts[id]}`);
for (let id = 7; id <= 10; id++) assert.ok(counts[id] >= 14 && counts[id] <= 16, `code-mixed ${id}: ${counts[id]}`);
ok(`allocation stays balanced over 60 finished participants ${JSON.stringify(counts)}`);

console.log(`\n${passed} SQL checks passed`);

#!/usr/bin/env node
/**
 * Prepares the 10 study recordings for upload:
 *   1. Normalises every clip to the same loudness (two-pass EBU R128 loudnorm),
 *      because the original female clips are 6 to 16 LU quieter than the male clips.
 *   2. Encodes every clip identically (48 kHz, mono, 128 kbps MP3), because the
 *      originals mix 64k mono and 128k stereo, 44.1 kHz and 48 kHz.
 *   3. Gives each file a neutral random name (e.g. 3f9a1c27b0de.mp3), so the file
 *      name no longer reveals the guise to participants.
 *   4. Writes update_paths.sql, which points the database at the new files and records
 *      their real durations, and mapping.csv (code -> new file name).
 *
 * Requires ffmpeg and ffprobe on the PATH.
 *
 * Usage:
 *   node scripts/prepare_audio.mjs --in ./original_audio --out ./prepared_audio [--lufs -16]
 *
 * The input folder must contain the 10 recordings named by code, for example
 * pure_hindi_male.mp3.mpeg (as currently stored in Supabase) or pure_hindi_male.mp3.
 *
 * Afterwards:
 *   - Upload every .mp3 from the output folder to the "audio_files" bucket.
 *   - Run update_paths.sql in the Supabase SQL Editor.
 *   - Keep mapping.csv private (it reveals which file is which guise). The database's
 *     recordings table already holds the same mapping for analysis.
 *   - Delete the old, descriptively named files from the bucket.
 */
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const CODES = [
  'pure_hindi_male',
  'pure_hindi_female',
  'pure_english_male',
  'pure_english_female',
  'pure_bombay_hindi_male',
  'pure_bombay_hindi_female',
  'codemixed_hindi_male',
  'codemixed_hindi_female',
  'codemixed_bombay_english_male',
  'codemixed_bombay_english_female',
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const inDir = arg('in');
const outDir = arg('out');
const targetLufs = Number(arg('lufs', '-16'));
const TRUE_PEAK = -1.5;
const LRA = 11;

if (!inDir || !outDir || !Number.isFinite(targetLufs)) {
  console.error('Usage: node scripts/prepare_audio.mjs --in <folder with originals> --out <output folder> [--lufs -16]');
  process.exit(1);
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function parseLoudnormJson(text) {
  const start = text.lastIndexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Could not read loudnorm measurements from ffmpeg output.');
  return JSON.parse(text.slice(start, end + 1));
}

function analyseStderr(file) {
  // loudnorm prints its measurements to stderr, so merge stderr into stdout.
  const result = execFileSync(
    'sh',
    ['-c', `ffmpeg -hide_banner -nostats -i "$1" -af "loudnorm=I=${targetLufs}:TP=${TRUE_PEAK}:LRA=${LRA}:print_format=json" -f null - 2>&1`, 'sh', file],
    { encoding: 'utf8' }
  );
  return parseLoudnormJson(result);
}

function durationSeconds(file) {
  const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(out.trim());
}

function integratedLufs(file) {
  const out = execFileSync('sh', ['-c', 'ffmpeg -hide_banner -nostats -i "$1" -af ebur128 -f null - 2>&1', 'sh', file], { encoding: 'utf8' });
  const matches = [...out.matchAll(/I:\s+(-?\d+(?:\.\d+)?) LUFS/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : NaN;
}

fs.mkdirSync(outDir, { recursive: true });
const mapping = [];

for (const code of CODES) {
  const candidates = [`${code}.mp3.mpeg`, `${code}.mp3`, `${code}.wav`];
  const input = candidates.map((c) => path.join(inDir, c)).find((p) => fs.existsSync(p));
  if (!input) {
    console.error(`Missing input for ${code} (looked for ${candidates.join(', ')} in ${inDir})`);
    process.exit(1);
  }

  const m = analyseStderr(input);
  const neutralName = `${crypto.randomBytes(6).toString('hex')}.mp3`;
  const output = path.join(outDir, neutralName);
  const filter =
    `loudnorm=I=${targetLufs}:TP=${TRUE_PEAK}:LRA=${LRA}` +
    `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;

  execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-af', filter, '-ar', '48000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', output],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );

  const duration = durationSeconds(output);
  const before = Number(m.input_i);
  const after = integratedLufs(output);
  mapping.push({ code, file: neutralName, duration, before, after });
  console.log(`${code.padEnd(34)} ${before.toFixed(1)} LUFS -> ${after.toFixed(1)} LUFS, ${duration.toFixed(1)} s -> ${neutralName}`);
}

fs.writeFileSync(
  path.join(outDir, 'mapping.csv'),
  ['code,file,duration_seconds,lufs_before,lufs_after', ...mapping.map((r) => `${r.code},${r.file},${r.duration.toFixed(2)},${r.before},${r.after}`)].join('\n') + '\n'
);

const sql = [
  '-- Generated by scripts/prepare_audio.mjs. Run in the Supabase SQL Editor AFTER uploading the new files to the audio_files bucket.',
  'BEGIN;',
  ...mapping.map(
    (r) => `UPDATE public.recordings SET audio_storage_path = '${r.file}', duration_seconds = ${Math.floor(r.duration)} WHERE code = '${r.code}';`
  ),
  'COMMIT;',
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'update_paths.sql'), sql);

console.log(`\nWrote ${mapping.length} files, mapping.csv and update_paths.sql to ${outDir}`);
console.log('Keep mapping.csv private: it reveals which file is which guise.');

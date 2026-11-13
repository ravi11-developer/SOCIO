# Archived SQL (do not run)

These files describe earlier versions of the schema. They are kept only for history.
They do not match the live project (for example, they use `.mp3` storage paths and an
`audio-files` bucket, while the live project uses `.mp3.mpeg` paths and an `audio_files` bucket),
and running them on the live project would break audio playback or overwrite data.

- To set up a brand-new, empty project: run `supabase/full_clean_setup.sql`.
- To update the live project: run the files in `supabase/migrations/` in date order
  (`20261112000000_admin_dashboard.sql`, `20261113000000_optional_comments.sql`, then
  `20261113010000_data_integrity_fixes.sql`).

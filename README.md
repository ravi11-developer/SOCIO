# Audio-Based Research Questionnaire Application

A production-ready, distraction-free, responsive web application for an audio-based sociolinguistic research experiment accommodating ~200 participants with up to 20 concurrent users. 

Built with **React**, **Vite**, **Tailwind CSS**, and backed by **Supabase (PostgreSQL 15+, Row Level Security, and Storage)** with free-tier deployment on **Cloudflare Pages**.

---

## Table of Contents

1. [Application Overview & Architecture](#application-overview--architecture)
2. [10-Audio Library & Stratified Balanced Allocation](#10-audio-library--stratified-balanced-allocation)
3. [Experiment Flow & State Machine](#experiment-flow--state-machine)
4. [Project Folder Structure](#project-folder-structure)
5. [Prerequisites](#prerequisites)
6. [Local Development Setup](#local-development-setup)
7. [Supabase Setup & Database Migrations](#supabase-setup--database-migrations)
8. [Audio Storage Setup](#audio-storage-setup)
9. [Configuring Research Content & Placeholders](#configuring-research-content--placeholders)
10. [Running Automated Tests](#running-automated-tests)
11. [Researcher Data Access & CSV Export](#researcher-data-access--csv-export)
12. [GitHub & Cloudflare Pages Deployment](#github--cloudflare-pages-deployment)
13. [Security, Privacy & Attention Limitations](#security-privacy--attention-limitations)
14. [Updating the Live Project (November 2026 data-integrity release)](#14-updating-the-live-project-november-2026-data-integrity-release)
15. [Notes for Data Analysis](#15-notes-for-data-analysis)

---

## 1. Application Overview & Architecture

The application delivers an academic research experiment designed according to strict research ethics:
- **Anonymous Participation**: No personal names, email addresses, or phone numbers are collected. Each participant receives an anonymous public code (`P-XXXXXXXX`) and an encrypted `session_token`.
- **Restricted Audio Player**: Prevents fast-forwarding, rewind controls, and timeline seeking. Participants must listen from start to finish before unlocking the questionnaire.
- **5-Page Forward-Only Flow**: Participants cannot use the browser's back button or skip ahead to future stages.
- **Continuous Autosave**: Question answers are debounced and autosaved in real-time. If a participant refreshes or loses connection, answers and the completed stage are automatically restored.
- **Row Level Security (RLS)**: Public anonymous database queries on other participants' answers are strictly denied. All participant actions are verified through PostgreSQL stored procedures.

---

## 2. 10-Audio Library & Stratified Balanced Allocation

The audio catalog contains **10 distinct audio files** (5 Male, 5 Female) covering two main categories and five language varieties:

### Recording Matrix

| ID | Code | Category | Language Variety | Speaker Gender |
|:---:|---|---|---|:---:|
| 1 | `pure_hindi_male` | `pure` | Pure Hindi | Male |
| 2 | `pure_hindi_female` | `pure` | Pure Hindi | Female |
| 3 | `pure_english_male` | `pure` | Pure English | Male |
| 4 | `pure_english_female` | `pure` | Pure English | Female |
| 5 | `pure_bombay_hindi_male` | `pure` | Pure Bombay Hindi | Male |
| 6 | `pure_bombay_hindi_female` | `pure` | Pure Bombay Hindi | Female |
| 7 | `codemixed_hindi_male` | `code_mixed` | Code-Mixed Hindi | Male |
| 8 | `codemixed_hindi_female` | `code_mixed` | Code-Mixed Hindi | Female |
| 9 | `codemixed_bombay_english_male` | `code_mixed` | Code-Mixed Bombay English | Male |
| 10 | `codemixed_bombay_english_female` | `code_mixed` | Code-Mixed Bombay English | Female |

### Balanced Allocation Algorithm (Solving Sparse Sampling)
To guarantee valid statistical generalization across ~200 participants:
1. Each participant receives **exactly 1 Pure audio** (out of 6) and **1 Code-Mixed audio** (out of 4).
2. The database performs **Least-Allocated Stratified Balancing**: It queries current session allocation counts and selects the audio with the minimum count, preventing over-representation of any single dialect or gender.
3. **Cross-Gender Balancing**: If a participant is assigned a Male Pure audio, the system prioritizes a Female Code-Mixed audio (and vice versa) to maximize participant exposure to both genders.
4. **Order Counterbalancing**: 50% of participants hear Pure first then Code-Mixed, and 50% hear Code-Mixed first then Pure.

---

## 3. Experiment Flow & State Machine

The website consists of exactly **FIVE sequential pages**:

| Page | Content | Progress Indicator |
|---|---|:---:|
| **Page 1** | Instructions, Demographics (Gender, Ethnicity, L1, L2, Hindi proficiency) & Informed Consent (statement + required checkbox) | **20%** |
| **Page 2** | First Assigned Audio Recording (approx 1 min, restricted player) | **40%** |
| **Page 3** | 12 trait ratings (1 to 6, in a per-participant random order) + 1 open comment for the first audio | **60%** |
| **Page 4** | Second Assigned Audio Recording (restricted player) | **80%** |
| **Page 5** | 12 trait ratings + 1 open comment for the second audio + Final Submission & Completion Screen | **100%** |

### State Machine Transition Rules

```
consent_pending ──► audio_1_pending ──► questions_1_pending ──► audio_2_pending ──► questions_2_pending ──► submitted
```

1. **consent_pending**: Participant reviews study details, selects demographics, and checks mandatory informed consent.
2. **audio_1_pending**: Audio 1 player is mounted with the assigned recording. Continue button remains disabled until playback triggers the `ended` event.
3. **questions_1_pending**: 10 questions rendered for Audio 1. Participant cannot proceed until all required questions are answered.
4. **audio_2_pending**: Audio 2 player is mounted with the assigned recording.
5. **questions_2_pending**: 10 questions rendered for Audio 2.
6. **submitted**: Upon clicking "Submit Experiment", the session is permanently locked and replaced by the in-place completion screen.

---

## 4. Project Folder Structure

```
├── .env.example                     # Environment variables template
├── .gitignore                       # Git ignore rules for node_modules, dist, and secrets
├── index.html                       # HTML entry point with Inter font & viewport meta
├── package.json                     # Dependencies and npm scripts
├── postcss.config.js                # PostCSS configuration
├── tailwind.config.js               # Tailwind theme, colors, and layout widths
├── vite.config.js                   # Vite & Vitest configuration
├── exports/                         # Directory for exported researcher CSV files
├── scripts/
│   ├── export_responses_csv.js      # CLI utility to export participant data to CSV (paginated)
│   └── prepare_audio.mjs            # Loudness-normalise recordings and give them neutral names
├── supabase/
│   ├── full_clean_setup.sql         # Complete setup for a NEW, EMPTY project only (refuses to run on live data)
│   ├── migrations/
│   │   ├── 20261112000000_admin_dashboard.sql       # Admin dashboard, locked researcher views
│   │   └── 20261113000000_data_integrity_fixes.sql  # Validation, listening check, trait order, audio events
│   └── archive/                     # Old schema files kept for history (do not run)
├── src/
│   ├── main.jsx                     # React DOM entry point
│   ├── App.jsx                      # App shell with Header, ProgressBar, and stage router
│   ├── index.css                    # Tailwind base, utilities, and academic cards
│   ├── config/
│   │   └── experiment.js            # 10-audio catalog, placeholders & questions
│   ├── context/
│   │   └── ExperimentContext.jsx    # State machine provider, autosave & stage sync
│   ├── lib/
│   │   ├── supabaseClient.js        # Supabase client initializer
│   │   └── pagination.js            # Fetch every row past Supabase's 1,000-row limit
│   ├── services/
│   │   └── api.js                   # API calls to Supabase RPCs with offline fallback
│   └── components/
│       ├── audio/
│       │   └── RestrictedAudioPlayer.jsx  # Non-seekable audio player with time tracking
│       ├── common/
│       │   ├── Header.jsx           # Clean header with participant ID & autosave badge
│       │   └── ProgressBar.jsx      # Progress bar (20%, 40%, 60%, 80%, 100%)
│       ├── pages/
│       │   ├── Page1InstructionsConsent.jsx
│       │   ├── Page2Audio1.jsx
│       │   ├── Page3Questions1.jsx
│       │   ├── Page4Audio2.jsx
│       │   └── Page5Questions2.jsx  # Includes final submission & completion screen
│       └── questions/
│           └── QuestionList.jsx     # 10 textareas, autosave, validation & counter
└── tests/
    ├── setup.js                     # Vitest jsdom environment polyfills
    ├── allocation.test.js           # 10-audio library & balanced allocation tests
    ├── stateMachine.test.js         # State machine, isolation & persistence tests
    ├── audioPlayer.test.jsx         # Audio player restriction & completion tests
    ├── validation.test.jsx          # Form validation & required answer checks
    ├── dataIntegrity.test.jsx       # Consent, save flushing, retries, listening check, shared devices
    ├── liveMode.test.js             # API behaviour against a (mocked) live database
    ├── pagination.test.js           # Export pagination
    └── sql/run_sql_tests.mjs        # Database tests in in-memory Postgres (npm run test:sql)
```

---

## 5. Prerequisites

- **Node.js**: `v18.0.0` or higher (tested on Node 18 & 20)
- **npm**: `v9.0.0` or higher
- **Git**
- A free **Supabase** account ([supabase.com](https://supabase.com))
- A free **Cloudflare** account ([cloudflare.com](https://cloudflare.com)) for Pages hosting

---

## 6. Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/<your-repo-name>.git
   cd <your-repo-name>
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   *(Note: If you do not have Supabase credentials yet, the application will automatically run in local resilient simulation mode using browser storage for testing.)*

4. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173`.

---

## 7. Supabase Setup & Database Migrations

**There are two different situations. Do not mix them up.**

### A. A brand-new, empty Supabase project
1. Create the project (Free or Pro tier) and open the **SQL Editor**.
2. Paste the whole of [`supabase/full_clean_setup.sql`](supabase/full_clean_setup.sql) and click **Run**. It creates every table,
   function, policy and view, seeds the 10 recordings and 26 questions, creates the `audio_files` bucket and applies all migrations.
3. The script refuses to run (and changes nothing) if the `participants` table already holds any rows, so it cannot wipe a live study by accident.

### B. The live project that is already collecting data
Never run `full_clean_setup.sql` on it. Run the files in [`supabase/migrations/`](supabase/migrations/) in date order instead:
1. `20261112000000_admin_dashboard.sql` (already applied on the live project).
2. `20261113000000_data_integrity_fixes.sql` (see section 14).

Both are additive, idempotent and never drop tables or data. Older schema files are kept in `supabase/archive/` for history only; do not run them.

> **Free-tier pausing:** Supabase pauses Free projects that see too little database activity over a week. Before you send the study
> link out, and after any quiet period during collection, check in the Supabase dashboard that the project is not paused.

## 8. Audio Storage Setup

The site reads recordings from the public Supabase Storage bucket **`audio_files`**, using the `audio_storage_path` stored for each
recording in the `recordings` table. The live project currently stores them as `<code>.mp3.mpeg` (for example `pure_hindi_male.mp3.mpeg`).

On the live site there is **no fallback to the sample clip**: if a recording cannot be loaded, the participant sees an error with a Retry
button. (The 2-second `public/audio/sample_audio.mp3` is used only in local development and tests.)

### Recommended: normalise the recordings and give them neutral names

The original clips differ a lot in loudness (male clips about -14 LUFS, female clips between -21 and -30 LUFS) and in encoding
(64 kbps mono versus 128 kbps stereo). Because every participant hears one male and one female speaker, this could bias ratings by
speaker gender. The file names (`pure_hindi_male...`) also reveal the guise to anyone who looks at the network traffic.

[`scripts/prepare_audio.mjs`](scripts/prepare_audio.mjs) fixes both. It needs `ffmpeg` and `ffprobe` installed.

1. Download the 10 current files from the `audio_files` bucket into a folder called `original_audio/` (keep their names).
2. Run:
   ```bash
   node scripts/prepare_audio.mjs --in original_audio --out prepared_audio
   ```
   This writes 10 loudness-normalised (-16 LUFS), identically encoded (48 kHz mono 128 kbps) MP3 files with random names,
   plus `update_paths.sql` and `mapping.csv`.
3. Upload the 10 new `.mp3` files to the `audio_files` bucket.
4. Run `prepared_audio/update_paths.sql` in the SQL Editor (it points each recording at its new file and records its real duration).
5. Open the site once and check that both audio pages play, then delete the old descriptively named files from the bucket.
6. Keep `mapping.csv` private. Both folders are in `.gitignore`.

Do this between participants, not while someone is mid-session.

## 9. Configuring Research Content & Placeholders

All research text, instructions, questions, and audio file references can be edited in a single file:
[`src/config/experiment.js`](file:///home/ravi-sahu/Documents/SOCIO/src/config/experiment.js)

Key fields to update:
- `title`: `[PLACEHOLDER: INSERT EXPERIMENT TITLE]`
- `description`: `[PLACEHOLDER: INSERT RESEARCH DESCRIPTION]`
- `estimatedTime`: `[PLACEHOLDER: INSERT ESTIMATED COMPLETION TIME]`
- `consent.statement`: `[PLACEHOLDER: INSERT COMPLETE INFORMED CONSENT TEXT]`
- `demographics.ethnicity.options`: List of research-appropriate ethnicity options
- `audioLibrary`: Storage paths or URLs for each of the 10 audios
- `questionsAudio1.questions`: 10 questions for Audio 1
- `questionsAudio2.questions`: 10 questions for Audio 2
- `completion.message`: Final thank-you note

---

## 10. Running Automated Tests

Run the Vitest automated test suite:
```bash
npm run test
```

To run tests in interactive watch mode:
```bash
npm run test:watch
```

### What is tested

`npm run test` runs the front-end tests (Vitest, 65 tests):
- **Allocation & state machine** in local simulation mode (original tests).
- **Consent and demographics**: Start stays disabled until consent is ticked; languages are stored in a consistent format.
- **Autosave**: every pending answer is flushed and confirmed before "Continue" or "Submit"; saves for one question never overlap;
  failed saves are retried; submission is blocked if answers cannot be saved.
- **Audio**: completion is retried on network errors; a failed server listening check asks the participant to listen again;
  playback events are logged; no sample-clip fallback when connected to the live database.
- **Connection errors and shared devices**: a blocking "could not connect" screen instead of a broken session; the browser forgets
  the session after submission; `?new=1` starts a fresh participant.
- **Trait order** follows the per-participant random order; comments are capped at 5000 characters.
- **Pagination** of exports beyond Supabase's 1,000-row limit.

`npm run test:sql` runs 38 database checks in an in-memory Postgres (PGlite) against `full_clean_setup.sql` and the latest migration:
RPC validation, stage locks, the listening check, anonymous versus admin access, the export views and allocation balance.

## 11. Researcher Data Access & CSV Export

Researcher responses can be exported securely through two methods. Both the CLI script and the admin dashboard page through the
results, so exports are complete even though Supabase returns at most 1,000 rows per request.

### Method A: Automated CLI Script (Recommended)

1. **Wide Format (1 row per participant)**:
   ```bash
   SUPABASE_URL="https://your-project.supabase.co" \
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
   npm run export:csv
   ```
   Generates `exports/responses_wide_<timestamp>.csv` with columns:
   - `Participant ID`, `Created At`, `Gender`, `Ethnicity`, `Consent Timestamp`
   - `Audio 1 Code`, `Audio 1 Category`, `Audio 1 Language`, `Audio 1 Gender`, `Audio 1 Started`, `Audio 1 Completed`
   - `Audio 2 Code`, `Audio 2 Category`, `Audio 2 Language`, `Audio 2 Gender`, `Audio 2 Started`, `Audio 2 Completed`
   - `Current Stage`, `Session Status`, `Submitted At`
   - `A1_Q1` through `A1_Q10`, `A2_Q1` through `A2_Q10`

2. **Tidy / Long Format (1 row per question response for statistical modeling)**:
   ```bash
   SUPABASE_URL="https://your-project.supabase.co" \
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
   npm run export:csv -- --format=long
   ```
   Generates `exports/responses_long_<timestamp>.csv` with columns:
   - `participant_id`, `participant_gender`, `participant_ethnicity`, `presentation_order`
   - `recording_number`, `question_number`, `question_id`, `recording_id`, `audio_code`, `audio_category`, `language_variety`, `speaker_gender`, `answer`, `response_time`

### Method B: Directly in the Supabase SQL Editor
1. In the Supabase Dashboard, open **SQL Editor**.
2. Run either:
   ```sql
   SELECT * FROM researcher_export_view;
   ```
   or
   ```sql
   SELECT * FROM researcher_responses_long_view;
   ```
3. Click **Export** in the bottom right of the results pane and select **Download CSV**.

---

## 12. GitHub & Cloudflare Pages Deployment

### Step 1: Push Source Code to GitHub
```bash
git add .
git commit -m "feat: complete 10-audio research questionnaire application"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

### Step 2: Deploy to Cloudflare Pages (Free Tier)
1. Log into [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Select your repository.
4. Configure Build Settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Configure Environment Variables:
   Under **Environment variables (advanced)**, add:
   - `VITE_SUPABASE_URL`: `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `your-anon-public-key`
6. Click **Save and Deploy**. Cloudflare Pages will build and deploy the application to a free `*.pages.dev` subdomain with automatic HTTPS and edge caching!

---

## Admin Dashboard (`/admin`)

A private, live dashboard to watch participants, view answers, and permanently delete participants or individual answers. Only the account listed in `admin_users` can see any data: access is enforced by Postgres RLS, not by the page.

1. **Run the migration:** paste [`supabase/migrations/20261112000000_admin_dashboard.sql`](supabase/migrations/20261112000000_admin_dashboard.sql) into the Supabase SQL Editor and run it. It is additive and safe to re-run.
2. **Block sign-ups:** Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". Keep the Email provider enabled.
3. **Create your account:** Authentication → Users → **Add user** → **Create new user** with your email. Tick "Auto Confirm User".
4. **Make yourself admin:** in the SQL Editor run:
   ```sql
   INSERT INTO public.admin_users (user_id, email)
   SELECT id, email FROM auth.users WHERE email = 'you@example.com'
   ON CONFLICT (user_id) DO NOTHING;
   ```
5. **Allow the redirect:** Authentication → URL Configuration. Set **Site URL** to your production site, and add `https://<your-site>/admin` and `http://localhost:5173/admin` to **Redirect URLs**.
6. Open `https://<your-site>/admin`, enter your email, and click the link **in the same browser**.

Deletes are permanent. The audit log records who deleted what and when, but not the deleted answers.

---

## 13. Security, Privacy & Attention Limitations

### Participant Privacy
- The application collects zero PII (no names, emails, IP tracking, or cookies).
- Each participant session is tied to an unguessable UUID `session_token` stored locally in the browser to facilitate accidental refresh resumption without exposing identifying data.
- Row Level Security ensures participants cannot read or manipulate data belonging to other participants.

### Audio Attention Limitations in Web Browsers
Modern web standards in commercial browsers (Chrome, Safari, Firefox, Edge) operate in a sandboxed client environment. As a researcher, please note:
1. **Physical Attention**: A web browser cannot detect whether a participant is actively listening, has removed their headphones, or muted their physical hardware volume.
2. **Tab Visibility**: While client-side restrictions prevent forward seeking and timeline skipping, participants may switch tabs or turn down volume.
3. **Backend Verification**: The server records audio start and completion timestamps and refuses completion unless at least 85% of
   the recording's length has passed since playback started. Pauses, tab switches and load errors are logged in `audio_events` and
   summarised in the export views, so inattentive sessions can be identified.

---

## 14. Updating the Live Project (November 2026 data-integrity release)

Do these steps in order, ideally at a time when nobody is taking part.

1. **Database:** in the Supabase SQL Editor, run
   [`supabase/migrations/20261113000000_data_integrity_fixes.sql`](supabase/migrations/20261113000000_data_integrity_fixes.sql).
   It is safe on live data and safe to run twice. It:
   - records each recording's real length (54 to 73 s, previously all 60 s);
   - adds per-participant random trait order (`trait_order_1`, `trait_order_2`; existing sessions are recorded as the default order);
   - adds the `audio_events` table and `rpc_record_audio_event`;
   - makes `rpc_complete_audio` refuse completion before 85% of the recording's length has passed;
   - makes `rpc_autosave_response` validate answers (ratings must be 1 to 6, comments at most 5000 characters) and accept them only in
     the matching stage;
   - counts only submitted and recently active sessions when balancing audio allocation, and serialises allocation;
   - stops sending the recording's code, title, language and gender to the browser, and stops anonymous reads of `recordings`;
   - fixes `search_path` on every participant function;
   - adds new columns to both export views (existing columns unchanged).
2. **Front end:** merge this branch and let Cloudflare Pages rebuild. Old and new front ends both work with the new database.
3. **Audio (recommended):** follow "Recommended: normalise the recordings" in section 8.
4. **Check:** open the site in a private window, complete the study once as a test participant, check the row in `/admin`, export it,
   then delete the test participant from `/admin`.
5. **Supabase plan:** make sure the project is not paused (see section 7), and export a CSV regularly during collection.

### Participant-facing changes
- Page 1 now shows the instructions and the informed-consent statement, with a required consent checkbox.
- First language is a dropdown with "Other (please specify)"; second language is a multi-select with "None" and "Other".
- If an answer or the end-of-audio confirmation cannot be saved, the participant is told and can retry; nothing advances until saved.
- After submitting, the browser forgets the session. Reopening the site on that device shows "already completed" with a button to
  start a fresh session for another person. A link ending in `?new=1` also starts a fresh session.
- The page can be zoomed on phones again.

---

## 15. Notes for Data Analysis

- **Use only finished participants:** filter `Session Status = 'submitted'` (wide view) or `session_status = 'submitted'` (long view).
  Partial sessions belong to people who withdrew by leaving before submission.
- **Ratings:** `answer` is text; the long view also has `answer_numeric` (1 to 6) for rating items. `question_key` names the trait.
- **Presentation:** `recording_number` (1 or 2) is the order a clip was heard in; `presentation_order` says whether the pure or the
  code-mixed clip came first. `audio_code`, `audio_category`, `language_variety` and `speaker_gender` describe the guise.
- **Trait order:** `trait_display_position` (long view) and `A1 Trait Order` / `A2 Trait Order` (wide view) give the on-screen position
  of each trait. Participants who started before the migration saw the default order 1 to 12.
- **Listening quality:** `Audio N Listen Seconds`, `Audio N Pauses`, `Audio N Tab Hidden` and `Audio N Load Errors` (wide view) and
  `audio_listen_seconds` (long view). Listening time runs from the first play to completion, so it includes pauses and replays.
- **Timing:** `response_time` is when an answer was first given; `final_answer_at` is when it was last changed.
- **Languages:** first language is one name or `Other: <text>`; second languages are joined with `; ` or the value `None`.
- **Speaker gender pairing:** allocation always pairs one male and one female speaker per participant, so include speaker gender in
  models of the pure versus code-mixed contrast.


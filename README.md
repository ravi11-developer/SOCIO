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
| **Page 1** | Instructions, Demographics (Gender, Ethnicity) & Informed Consent | **20%** |
| **Page 2** | First Assigned Audio Recording (approx 1 min, restricted player) | **40%** |
| **Page 3** | 10 Questions for First Audio (multiline text, autosave, validation) | **60%** |
| **Page 4** | Second Assigned Audio Recording (restricted player) | **80%** |
| **Page 5** | 10 Questions for Second Audio + Final Submission & Completion Screen | **100%** |

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
│   └── export_responses_csv.js      # CLI utility to export participant data to CSV
├── supabase/
│   ├── migrations/
│   │   └── 20240101000000_initial_schema.sql  # Schema, RLS, functions & export views
│   └── seed.sql                     # Seed data for 10 audio recordings & 20 questions
├── src/
│   ├── main.jsx                     # React DOM entry point
│   ├── App.jsx                      # App shell with Header, ProgressBar, and stage router
│   ├── index.css                    # Tailwind base, utilities, and academic cards
│   ├── config/
│   │   └── experiment.js            # 10-audio catalog, placeholders & questions
│   ├── context/
│   │   └── ExperimentContext.jsx    # State machine provider, autosave & stage sync
│   ├── lib/
│   │   └── supabaseClient.js        # Supabase client initializer
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
    └── validation.test.jsx          # Form validation & required answer checks
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

1. Go to [https://supabase.com](https://supabase.com) and log in.
2. Click **New Project**:
   - Choose a project name (e.g. `audio-research-study`).
   - Set a strong database password (store this safely).
   - Select the region closest to your participants.
   - Choose the **Free Tier**.
3. Once the database is ready (~1-2 minutes), navigate to the **SQL Editor** in the left sidebar.
4. Click **New query** and copy the entire contents of [`supabase/migrations/20240101000000_initial_schema.sql`](file:///home/ravi-sahu/Documents/SOCIO/supabase/migrations/20240101000000_initial_schema.sql).
5. Click **Run** to execute the migration. This creates:
   - Tables: `participants`, `consent`, `recordings`, `questions`, `responses`, `experiment_sessions`.
   - Security: Row Level Security (RLS) policies.
   - Procedures: `rpc_init_or_resume_session` (with balanced allocation), `rpc_submit_consent_and_demographics`, `rpc_record_audio_start`, `rpc_complete_audio`, `rpc_autosave_response`, `rpc_complete_questions_1`, `rpc_submit_experiment`.
   - Views: `researcher_export_view` (wide format) and `researcher_responses_long_view` (tidy long format).
6. Next, open a new query in the SQL Editor and copy [`supabase/seed.sql`](file:///home/ravi-sahu/Documents/SOCIO/supabase/seed.sql).
7. Click **Run** to populate the 10 recordings and 20 questions.

---

## 8. Audio Storage Setup

1. In your Supabase dashboard, click **Storage** in the left sidebar.
2. Click **New Bucket**:
   - Name: `audio-files`
   - Set **Public bucket** to `ON` (or leave private if using signed URLs).
   - Click **Save**.
3. Inside the `audio-files` bucket, upload your 10 recordings:
   - `pure_hindi_male.mp3`
   - `pure_hindi_female.mp3`
   - `pure_english_male.mp3`
   - `pure_english_female.mp3`
   - `pure_bombay_hindi_male.mp3`
   - `pure_bombay_hindi_female.mp3`
   - `codemixed_hindi_male.mp3`
   - `codemixed_hindi_female.mp3`
   - `codemixed_bombay_english_male.mp3`
   - `codemixed_bombay_english_female.mp3`
4. Update their filenames or public URLs in `src/config/experiment.js`.

---

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

### What is tested (21 Automated Tests):
- **10-Audio Catalog & Stratified Balancing**: Allocations across sequential participants distribute evenly across all 10 audios and both genders.
- **Participant Initialization**: Unique session token generation and session resumption.
- **Consent Enforcement**: Participant cannot advance without checking consent.
- **Demographic Inputs**: Gender and Ethnicity required.
- **Non-Seekable Audio Player**: No scrubbing, no fast-forward/rewind controls.
- **Playback Completion Trigger**: Continue button unlocks only when playback reaches `ended`.
- **Loading Error Recovery**: Audio error displays retry button.
- **Questionnaire Validation**: Blocks incomplete submissions on Page 3 and Page 5.
- **Autosave & Persistence**: Answers are saved to local cache and Supabase; refresh restores all answers.
- **Participant Isolation**: Different participants' responses remain isolated.
- **Final Submission Lock**: Locks session and prevents duplicate submissions.

---

## 11. Researcher Data Access & CSV Export

Researcher responses can be exported securely through two methods:

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

## 13. Security, Privacy & Attention Limitations

### Participant Privacy
- The application collects zero PII (no names, emails, IP tracking, or cookies).
- Each participant session is tied to an unguessable UUID `session_token` stored locally in the browser to facilitate accidental refresh resumption without exposing identifying data.
- Row Level Security ensures participants cannot read or manipulate data belonging to other participants.

### Audio Attention Limitations in Web Browsers
Modern web standards in commercial browsers (Chrome, Safari, Firefox, Edge) operate in a sandboxed client environment. As a researcher, please note:
1. **Physical Attention**: A web browser cannot detect whether a participant is actively listening, has removed their headphones, or muted their physical hardware volume.
2. **Tab Visibility**: While client-side restrictions prevent forward seeking and timeline skipping, participants may switch tabs or turn down volume.
3. **Backend Verification**: To maximize research validity, the server records audio start and completion timestamps and verifies minimum playback duration before permitting stage advancement.

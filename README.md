# Northstar

A focused job application tracker with an overview, searchable application table, pipeline board, insights, and a Sankey-style application flow.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env`, then set `DATABASE_URL` to the General connection string from CockroachDB Cloud's **Connect** dialog. Keep `sslmode=verify-full` enabled. The npm scripts load `.env` automatically for local development.

Open `http://localhost:5173`. Application and profile data are persisted in CockroachDB. The server creates the required tables and indexes on startup. CSV import/export remains available for backups and portability.

### Migrate existing CSV data

If `data/applications.csv` or `data/profile.csv` exists, migrate it once after setting `DATABASE_URL`:

```bash
npm run db:migrate-csv
```

The migration replaces the applications currently in CockroachDB only when a local applications CSV contains rows. It does not delete the original files.

## Chrome extension

The companion extension reads the job posting in your active tab, pre-fills the details it can find, and flags missing fields for review before anything is saved.

1. Start Northstar with `npm run dev` or `npm start`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the `extension` folder in this project.
5. Pin **Northstar Job Capture**, open a job posting, and click the extension.

The first save asks for permission to connect to your Northstar address. This copy defaults to `https://application-tracker-production-2208.up.railway.app`. You can change the destination at any time under **Connection settings** in the extension.

## Deploy to Railway

Connect this repository to Railway. The included `railway.json` builds the Vite client and starts the Express server. Add `DATABASE_URL` and optionally `DATABASE_POOL_SIZE` as Railway environment variables. A persistent Railway volume is no longer required.

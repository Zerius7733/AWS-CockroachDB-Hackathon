# Northstar

A focused job application tracker with an overview, searchable application table, pipeline board, insights, and a Sankey-style application flow.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Application data is persisted in `data/applications.csv`; editable workspace profile details are stored in `data/profile.csv`.

The live CSV files are intentionally excluded from Git because they contain personal information. On a fresh installation, Northstar creates an empty `data/applications.csv` automatically. The `.example.csv` files document the expected columns without publishing real application data.

## Chrome extension

The companion extension reads the job posting in your active tab, pre-fills the details it can find, and flags missing fields for review before anything is saved.

1. Start Northstar with `npm run dev` or `npm start`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the `extension` folder in this project.
5. Pin **Northstar Job Capture**, open a job posting, and click the extension.

The first save asks for permission to connect to your Northstar address. This copy defaults to `https://application-tracker-production-2208.up.railway.app`. You can change the destination at any time under **Connection settings** in the extension.

## Deploy to Railway

Connect this repository to Railway. The included `railway.json` builds the Vite client and starts the Express server. Add a Railway volume mounted at `/app/data` if you want the CSV file to survive container replacements and redeploys. Without a volume, it persists only for the lifetime of the current container.

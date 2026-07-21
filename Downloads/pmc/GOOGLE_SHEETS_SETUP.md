# Google Sheets setup — PMC Medicine Stock Register

## What this does
Your app's shared data now lives in a Google Sheet instead of Supabase.
- `Medicines`, `Entries`, `ActivityLog`, `Settings` tabs are the real database —
  the app reads/writes these in full every time you load the page or save something.
- `Sheet1` is automatically regenerated every save to match your original
  "medicine × date" register layout (Medicine Name, Opening Balance, then
  In/Out/Present-Stock per date) — for reading in Sheets, not something the app
  reads back.

## Steps

1. **Create a Google Sheet** (or use an existing blank one) — any name is fine.
2. Open **Extensions → Apps Script**. Delete whatever's in `Code.gs` and paste
   in the contents of the `Code.gs` file I sent you.
3. Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" → choose **Web app**.
   - Description: anything (e.g. "PMC API").
   - Execute as: **Me**.
   - Who has access: **Anyone**. (Required — this is what lets the static
     Netlify/Vercel page call it without a Google login. It's still protected
     by the shared-secret key in the code, not open to the public internet.)
   - Click **Deploy**. The first time, Google will ask you to authorize the
     script's access to the spreadsheet — approve it.
4. Copy the **Web app URL** it gives you (ends in `/exec`).
5. In `index.html`, find this line near the top:
   ```js
   const GAS_URL = 'https://REPLACE-WITH-YOUR-APPS-SCRIPT-WEB-APP-URL/exec';
   ```
   Replace it with the URL you copied.
6. Redeploy `index.html` to Netlify/Vercel as usual.

## If you edit Code.gs later
Don't use "New deployment" again (that mints a new URL). Instead:
**Deploy → Manage deployments → pencil/edit icon → Version: New version → Deploy.**
This keeps the same URL so you don't have to touch `index.html` again.

## Test it
- Open the site, save an entry.
- Open your Google Sheet — the `Entries`/`Medicines` tabs should update within
  a few seconds, and `Sheet1` should reflect the new entry in its pivot.
- Open the site on a second device/browser — it should show the same data.

## Note on the shared secret
The key in `Code.gs` (`SECRET`) and the key in `index.html` (`GAS_KEY`) must
match exactly — they already do in the files I sent you, so no need to change
either unless you want to rotate it later (just update both to the same new
value).

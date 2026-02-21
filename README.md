# Habit Tracker (Free Stack)

This version is fully free:
- Static frontend host: Cloudflare Pages (connected to GitHub)
- Sheet writes: Google Apps Script Web App

## 1) Configure Google Apps Script

1. Open https://script.google.com
2. Create a new project.
3. Paste `google-apps-script/Code.gs` into the editor.
4. Change `getSheetByName("Sheet1")` if your tab name is different.
5. Deploy:
   - `Deploy -> New deployment -> Web app`
   - `Execute as`: Me
   - `Who has access`: Anyone
6. Copy the Web App `exec` URL.

Security and privacy note:
- Keep the Google Sheet itself private (only your Google account can open/view it).
- Sheet privacy is independent from Web App access. Using `Execute as: Me` allows writes to your private sheet without exposing sheet read access.
- If you switch Web App access to `Only myself`, cross-site browser auth can block requests from your hosted site.

## 2) Configure frontend

1. Edit `public/config.js`:
   - `appsScriptUrl` = your Apps Script `exec` URL

## 3) Deploy (free) with Cloudflare Pages

1. Push this repo to GitHub.
2. In Cloudflare Pages:
   - `Create a project -> Connect to Git`
   - Select this repo
   - Framework preset: `None`
   - Build command: leave empty
   - Build output directory: `public`
3. Deploy and copy the site URL.

## 4) iOS usage

1. Open your deployed URL in Safari.
2. Share -> `Add to Home Screen`.
3. Launch from Home Screen.

## Notes

- `public/app.js` posts your form directly to Apps Script.

# Desktop Application Update Guide

This document outlines how the auto-updating mechanism for the Brainstorm desktop application is configured, the code that powers it, and the commands required to publish a new release to your users.

## How it Works
Because the desktop application uses electron to bundle your website into an `.exe` file, the users' machines run a "frozen-in-time" snapshot of your project located in the `dist` folder. Simply saving your code locally or pushing it to GitHub does not automatically push updates to installed apps. 

To provide updates, the builder generates a new Windows Installer and uploads it to GitHub Releases alongside a `latest.yml` file. The installed desktop app checks this `.yml` file when it opens. If it sees a newer version, it automatically downloads it in the background and prompts the user to refresh the app!

## The Code That Handles It

The automatic updating mechanism relies on three core parts of your codebase:

### 1. `electron/main.js` (The Auto-Updater Script)
Your Electron entry file imports `electron-updater` which is responsible for pulling the newest configurations.
```js
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

// Once the app is packaged, this triggers the check to GitHub
if (app.isPackaged) {
  autoUpdater.checkForUpdatesAndNotify();
}
```

### 2. `electron-builder.yml` (The Publisher Configuration)
This configuration controls where the app looks for updates and where it pushes releases to.
```yaml
publish:
  provider: github
  owner: ammarsapru
  repo: brainstorm
```

### 3. `package.json` (The Version Controller)
The builder checks the `version` variable in this file. To create an update, this version string must be higher than the last one published.
```json
{
  "name": "brainstorm",
  "version": "1.0.0", // <-- Increment this before running your publish command!
  ...
}
```

---

## Required Commands for Releasing an Update

When you are ready to send a new update to everyone who has the desktop application installed:

### Step 1: Bump the version
Open `package.json` and change the `"version"` string (e.g. from `"0.0.0"` to `"1.0.0"` or `"1.0.1"`). 

### Step 2: Push your code to GitHub
Make sure your changes are committed and pushed to `ammarsapru/brainstorm` on GitHub so the repository is up to date.

### Step 3: Set your GitHub Token
To allow the command line to upload files directly to your GitHub Releases, you need a Personal Access Token (`GH_TOKEN`).
```bash
# In Powershell:
$env:GH_TOKEN="your_personal_access_token_here"
```
*(If you need one, generate it on GitHub > Settings > Developer Settings > Personal Access Tokens. Give it "repo" permissions.)*

### Step 4: Run the Publish Command
Use the custom script we added to your `package.json` to compile, build the UI, bundle it, and upload the artifacts to GitHub.
```bash
npm run desktop:publish
```

**What this command does:**
1. Runs `vite build` to compile the newest React interface files to the `dist` folder.
2. Runs `electron-builder --publish always` which creates the `.exe` Windows installer.
3. Automatically creates a new "Release" on your `ammarsapru/brainstorm` repository.
4. Uploads the `.exe` and the `latest.yml` control file so that all desktop apps globally flag an update is ready.

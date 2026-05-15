# GitHub Sync

Two-way sync your Obsidian vault — and any number of nested folders — with private GitHub repositories.

Unlike single-repo sync plugins, GitHub Sync treats your vault as a parent repo plus optional **submodules**: each top-level folder can map to its own GitHub repo. Great for keeping personal notes private while sharing project notes with a team, or keeping a public blog folder inside a private knowledge base.

## Features

- **Two-way sync** — pull remote changes and push local changes on a configurable interval, or on demand
- **Submodule support** — map any folder to its own GitHub repo, with independent sync settings
- **Auto-init empty repos** — point at a brand-new GitHub repo and the plugin seeds it with an initial commit; you don't need to know git
- **Setup wizard** — walks you through token → identity → first repo connection
- **Test connection** — diagnoses token validity, repo access, and the actual git auth path so you can tell where auth is failing
- **Conflict UI** — when local and remote diverge, side-by-side resolve modal instead of leaving you in a half-merged state
- **Optional AI commit messages** — DeepSeek or Gemini can suggest semantic commit messages based on your changes

## Installation

### Community plugins (after the plugin is approved)

1. Open **Settings → Community plugins**
2. Click **Browse**, search for **GitHub Sync**
3. Click **Install**, then **Enable**

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/leweii/obsidian-github-sync/releases/latest)
2. Copy them into `<your-vault>/.obsidian/plugins/github-sync/`
3. Restart Obsidian, then enable **GitHub Sync** under Settings → Community plugins

## Getting started

1. Open **Settings → GitHub Sync** (the setup wizard will appear automatically on first launch)
2. **Paste a GitHub Personal Access Token.** Click the **?** icon next to the token field to open the GitHub token creation page. Either token format is accepted:
   - Classic token (`ghp_…`) — needs the `repo` scope
   - Fine-grained token (`github_pat_…`) — give it **Contents: read & write** on the repos you want to sync
3. **Connect your main vault to a GitHub repo.** Paste the HTTPS URL (e.g. `https://github.com/you/my-vault.git`). The plugin handles the initial commit, push, and (if the repo is empty) seeds it with a README so git is happy.
4. **(Optional) Add submodules.** From the sync dashboard, click **Add Submodule** to map any sub-folder to a separate GitHub repo.

## Configuration

All settings live under **Settings → GitHub Sync**. The structural ones (remote URL, branch, ignore patterns, AI model preferences, submodule list) are mirrored into `.github-sync.json` at your vault root so they travel with the repo — clone on another machine and the config is already there. Secrets (your GitHub PAT, AI provider tokens) stay in Obsidian's local plugin storage and never leave the device.

| Setting | What it controls |
|---|---|
| **Personal access token** | The PAT used for all git auth. Stored locally only. |
| **Sync interval** | Auto-sync frequency in minutes. 0 disables auto-sync. |
| **Ignore patterns** | Glob patterns of paths the plugin will skip when staging. |
| **AI commit messages** | When enabled, the plugin asks your chosen LLM (DeepSeek or Gemini) to draft a commit message from the diff. |

## Troubleshooting

**`Permission denied` or `403` on push.** Open Settings → GitHub Sync → **Test connection**. The third row (`git auth`) exercises the same credential path your sync uses — if that row is red while the API rows are green, your local git is using stale credentials (most commonly the macOS Keychain). Either erase the cached credential or rotate the token.

**Plugin says repo is empty.** This is automatic — clicking **Add Submodule** or running the first sync will silently push a README to seed the default branch. No action needed.

## License

[MIT](./LICENSE)

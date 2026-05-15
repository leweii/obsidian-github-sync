# Smart Vault Sync

**AI-assisted two-way sync between your Obsidian vault and GitHub — including nested folders as separate repos — without ever touching a terminal.**

Most git-based Obsidian sync plugins assume you know git. This one doesn't. Three things make it different:

### 🧩 Real submodule support, not just one repo

Map any folder in your vault to its own GitHub repo. Keep personal notes private, sync a `Projects/` folder with your team, push a `Blog/` folder to a public repo — all from the same vault, each with independent sync settings. Adding a submodule is a single dialog: paste a URL, type a folder name, done.

### 🤖 AI-drafted commit messages

Built in, optional. Let DeepSeek or Gemini read your diff and propose a clean semantic commit message (`feat: …`, `fix: …`, `docs: …`). You always get to edit before committing. Tokens stay local, only the diff goes to the LLM, and you can exclude any path patterns from being sent.

### 👶 Designed for users who don't know git

- **Setup wizard** walks you through token → identity → first repo connection
- **`?` icon next to the token field** opens GitHub's PAT creation page directly — no need to know what a "personal access token" is
- **Empty repos are auto-initialized.** Create a new repo on github.com, paste the URL, click Add. The plugin silently seeds it with a README so git is happy. No "branch yet to be born" errors.
- **Test connection** diagnoses three layers (token validity, repo access, actual git auth path) and tells you exactly which step is failing, in plain language. No more `403` mysteries.
- **Conflict UI** — when local and remote diverge, you get a side-by-side resolve dialog, not a half-merged repo on disk.

## Installation

### Community plugins (once approved)

1. Open **Settings → Community plugins**
2. Click **Browse**, search for **Smart Vault Sync**
3. Click **Install**, then **Enable**

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/leweii/obsidian-github-sync/releases/latest)
2. Copy them into `<your-vault>/.obsidian/plugins/smart-vault-sync/`
3. Restart Obsidian, then enable **Smart Vault Sync** under Settings → Community plugins

## Getting started

The setup wizard appears automatically on first launch. Three short steps:

1. **Paste a GitHub Personal Access Token.** Click the **?** icon next to the input to open the GitHub token page. Either format works:
   - Classic (`ghp_…`) — needs the `repo` scope
   - Fine-grained (`github_pat_…`) — give it **Contents: read & write** on the repos you'll sync
2. **Connect your main vault to a GitHub repo.** Paste the HTTPS URL. The plugin handles the initial commit, push, and (if the repo is empty) seeds it so the first sync works.
3. **(Optional) Add submodules** from the dashboard. One submodule per folder you want in its own repo.

## How your data is stored

| File | Where | Contains | Travels with the repo? |
|---|---|---|---|
| `data.json` | `<vault>/.obsidian/plugins/smart-vault-sync/` | Your tokens, sync history, per-machine state | ❌ Local only |
| `.github-sync.json` | `<vault>/` | Remote URLs, branches, AI model choice, submodule list | ✅ Committed (so a fresh clone on a new machine picks up your config automatically) |

**Secrets never leave your device.** The plugin's own `.gitignore` excludes `.obsidian/`, and `.github-sync.json`'s schema has no token fields at all — there's no path by which the plugin can leak credentials into a commit.

## Troubleshooting

**`Permission denied` or `403` on push.** Open Settings → Smart Vault Sync → **Test connection**. The third row (`git auth`) exercises the same credential path your sync uses. If that row fails while the API rows pass, your local git is using stale credentials (most commonly the macOS Keychain) — erase the cached entry or rotate the token.

**Token sticks around after uninstall.** Obsidian preserves plugin data across reinstalls by design. To fully wipe credentials, delete `<vault>/.obsidian/plugins/smart-vault-sync/data.json`.

## License

[MIT](./LICENSE)

import { requestUrl } from "obsidian";

/**
 * Parse owner/repo from any GitHub URL form we accept (https or ssh-style,
 * with or without `.git` suffix). Returns null when it doesn't look like
 * github.com.
 */
export function parseOwnerRepo(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com[:/]([\w.\-]+)\/([\w.\-]+?)(\.git)?\/?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * If the remote GitHub repo has no commits, create an initial README via
 * the Contents API so subsequent git operations (clone, submodule add,
 * push --set-upstream) have a default branch to work with.
 *
 * No-op if the remote already has commits, isn't on github.com, or we
 * have no token. Throws only on a hard failure that we want to surface
 * to the user.
 *
 * Why this matters: non-technical users routinely create a GitHub repo
 * via the web UI and try to connect it before pushing anything. Bare git
 * fails with cryptic "branch yet to be born" / "couldn't find remote ref"
 * messages — this turns the empty-repo case into a silent success.
 */
export async function ensureRemoteHasCommits(
  remoteUrl: string,
  token: string,
): Promise<void> {
  if (!token) return; // no creds → leave it to git layer
  const parsed = parseOwnerRepo(remoteUrl);
  if (!parsed) return; // not github.com — nothing to do via API
  const { owner, repo } = parsed;

  const headers = {
    Authorization: `token ${token}`,
    "User-Agent": "ObsidianGitHubSync",
  };

  // Probe: GitHub returns 409 "Git Repository is empty." for repos with no commits.
  const probe = await requestUrl({
    url: `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
    headers,
    throw: false,
  });
  if (probe.status !== 409) return; // 200 = has commits; 404/401/403 = let git surface it

  // Create an initial README on the repo's default branch (empty repos
  // auto-create the default branch on first PUT — don't pass an explicit
  // `branch` because that branch doesn't exist yet).
  const res = await requestUrl({
    url: `https://api.github.com/repos/${owner}/${repo}/contents/README.md`,
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Initialize repository",
      content: btoa(`# ${repo}\n`),
    }),
    throw: false,
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Couldn't initialize empty repository (HTTP ${res.status}).`);
  }
}

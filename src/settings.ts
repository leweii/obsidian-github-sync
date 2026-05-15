import { App, Notice, PluginSettingTab, Setting, requestUrl, setIcon } from "obsidian";
import type GitHubSyncPlugin from "./main";
import type { SyncHistoryEntry } from "./types";
import { L, setLang, tf, type Lang } from "./i18n";
import { isValidGitHubUrl } from "./git/SubmoduleManager";

export interface SubmoduleConfig {
  id: string;
  localPath: string;
  remoteUrl: string;
  branch: string;
  autoSync: boolean;
  syncInterval: number;
}

export interface AISettings {
  enabled: boolean;
  silentMode: boolean;
  silentMinConfidence: number;
  deepseekToken: string;
  deepseekModel: string;
  geminiToken: string;
  geminiModel: string;
  sendFilePaths: boolean;
  sendGitMetadata: boolean;
  sendSurroundingContext: boolean;
  excludePatterns: string[];
}

export interface GitHubSyncSettings {
  setupComplete: boolean;
  language: Lang;
  syncOnStartup: boolean;
  autoSyncInterval: number;
  gitUser: string;
  gitEmail: string;
  githubToken: string;
  mainRepoUrl: string;
  mainRepoBranch: string;
  submodules: SubmoduleConfig[];
  ignorePatterns: string[];
  historyLimit: number;
  syncHistory: SyncHistoryEntry[];
  confirmBeforeSync: boolean;
  ai: AISettings;
}

export const DEFAULT_SETTINGS: GitHubSyncSettings = {
  setupComplete: false,
  language: "en",
  syncOnStartup: true,
  autoSyncInterval: 30,
  gitUser: "",
  gitEmail: "",
  githubToken: "",
  mainRepoUrl: "",
  mainRepoBranch: "main",
  submodules: [],
  ignorePatterns: [
    ".DS_Store",
    ".obsidian/**",
    ".trash/**",
  ],
  historyLimit: 20,
  syncHistory: [],
  confirmBeforeSync: false,
  ai: {
    enabled: true,
    silentMode: false,
    silentMinConfidence: 3,
    deepseekToken: "",
    deepseekModel: "deepseek-v4-flash",
    geminiToken: "",
    geminiModel: "gemini-1.5-flash",
    sendFilePaths: true,
    sendGitMetadata: true,
    sendSurroundingContext: true,
    excludePatterns: [".env", ".env.*", "secrets/**", "*.private.md", "private/**", "**/credentials.*"],
  },
};

export class GitHubSyncSettingTab extends PluginSettingTab {
  plugin: GitHubSyncPlugin;

  constructor(app: App, plugin: GitHubSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ghs-settings");

    this.renderSilentHero(containerEl);
    this.renderRepository(containerEl);
    this.renderAccount(containerEl);
    this.renderAI(containerEl);
    this.renderGeneral(containerEl);
  }

  // ── Smart-sync hero (signature feature) ──────────────────────

  private renderSilentHero(parent: HTMLElement): void {
    const t = L().settings;
    const ai = this.plugin.settings.ai;
    const hasKey = !!(ai.deepseekToken || ai.geminiToken);

    const hero = parent.createDiv("ghs-silent-hero");
    if (ai.silentMode) hero.addClass("is-active");

    const left = hero.createDiv("ghs-silent-left");
    const icon = left.createDiv("ghs-silent-icon");
    setIcon(icon, "zap");

    const text = left.createDiv("ghs-silent-text");
    text.createDiv({ cls: "ghs-silent-title", text: t.silentTitle });

    const badge = text.createDiv({
      cls: `ghs-silent-badge ${hasKey ? "ready" : "warn"}`,
    });
    setIcon(badge.createSpan(), hasKey ? "check-circle" : "alert-circle");
    badge.createSpan({ text: hasKey ? t.silentBadgeReady : t.silentBadgeNoKey });

    const right = hero.createDiv("ghs-silent-right");
    const toggleWrap = right.createEl("div", { cls: "checkbox-container" });
    const toggleInput = toggleWrap.createEl("input", { type: "checkbox" });
    toggleInput.checked = ai.silentMode;
    if (ai.silentMode) toggleWrap.addClass("is-enabled");

    const setSilent = async (on: boolean) => {
      this.plugin.settings.ai.silentMode = on;
      await this.plugin.saveSettings();
      this.display();
    };

    const handleToggle = async () => {
      const nextOn = toggleInput.checked;
      const a = this.plugin.settings.ai;
      const currentHasKey = !!(a.deepseekToken || a.geminiToken);
      if (nextOn && !currentHasKey) {
        // Revert visually until user finishes the setup modal
        toggleInput.checked = false;
        toggleWrap.removeClass("is-enabled");
        const { AIProviderSetupModal } = require("./ui/AIProviderSetupModal");
        new AIProviderSetupModal(this.app, this.plugin, (saved: boolean) => {
          if (saved) {
            this.plugin.settings.ai.silentMode = true;
            this.plugin.saveSettings().then(() => this.display());
          } else {
            this.display();
          }
        }).open();
        return;
      }
      toggleWrap.toggleClass("is-enabled", nextOn);
      await setSilent(nextOn);
    };

    toggleInput.onchange = handleToggle;
    toggleWrap.onclick = (e) => {
      if (e.target === toggleInput) return;
      toggleInput.checked = !toggleInput.checked;
      toggleInput.dispatchEvent(new Event("change"));
    };

    if (ai.silentMode) {
      const tuning = hero.createDiv("ghs-silent-tuning");
      const label = tuning.createDiv("ghs-silent-tuning-label");
      label.setText(t.confidenceLabel);
      const slider = tuning.createEl("input", { type: "range" });
      slider.min = "1";
      slider.max = "5";
      slider.step = "1";
      slider.value = String(ai.silentMinConfidence);
      const valueEl = tuning.createDiv("ghs-silent-tuning-value");
      valueEl.setText(String(ai.silentMinConfidence));
      slider.oninput = () => valueEl.setText(slider.value);
      slider.onchange = async () => {
        this.plugin.settings.ai.silentMinConfidence = parseInt(slider.value, 10);
        await this.plugin.saveSettings();
      };
    }
  }

  // ── 1. Repository ────────────────────────────────────────────

  private renderRepository(parent: HTMLElement): void {
    const t = L().settings;
    this.sectionHeader(parent, t.sectionRepo);

    const s = this.plugin.settings;
    let urlInputEl: HTMLInputElement | null = null;
    let branchInputEl: HTMLInputElement | null = null;
    const statusEl = createDiv("ghs-inline-badge ghs-repo-status");
    statusEl.style.display = "none";

    const isValidUrl = (u: string) => isValidGitHubUrl(u.trim());

    // Editable URL field.
    new Setting(parent)
      .setName(t.repoUrlLabel)
      .setDesc(t.repoUrlDesc)
      .addText((tx) => {
        urlInputEl = tx.inputEl;
        tx.setPlaceholder(t.repoUrlPlaceholder)
          .setValue(s.mainRepoUrl)
          .onChange((v) => {
            this.plugin.settings.mainRepoUrl = v.trim();
          });
        tx.inputEl.style.minWidth = "320px";
      });

    // Editable branch field.
    new Setting(parent)
      .setName(t.repoBranchLabel)
      .addText((tx) => {
        branchInputEl = tx.inputEl;
        tx.setPlaceholder(t.repoBranchPlaceholder)
          .setValue(s.mainRepoBranch || "main")
          .onChange((v) => {
            this.plugin.settings.mainRepoBranch = v.trim() || "main";
          });
      });

    // Auto-sync interval (editable inline, replaces the old "Reconfigure" button).
    new Setting(parent)
      .setName(s.autoSyncInterval > 0
        ? tf(t.autoSyncEvery, s.autoSyncInterval)
        : t.autoSyncDisabled)
      .addSlider((sl) =>
        sl.setLimits(0, 120, 5)
          .setValue(s.autoSyncInterval)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.autoSyncInterval = v;
            await this.plugin.saveSettings();
            this.plugin.scheduler.start();
            this.display();
          })
      );

    // Connect / Save & sync button.
    new Setting(parent)
      .setName("")
      .addButton((b) => {
        const initial = s.mainRepoUrl ? t.repoSaveAndSync : t.repoInitialize;
        b.setButtonText(initial).setCta().onClick(async () => {
          const url = urlInputEl?.value.trim() ?? "";
          const branch = branchInputEl?.value.trim() || "main";
          if (!url) { new Notice(t.repoUrlInvalid); return; }
          if (!isValidUrl(url)) { new Notice(t.repoUrlInvalid); return; }

          b.setDisabled(true);
          b.setButtonText(t.repoConnecting);
          this.showRepoStatus(statusEl, "loading", t.repoConnecting);

          try {
            await this.plugin.connectMainRepo(url, branch);
            this.showRepoStatus(statusEl, "valid", t.repoConnected);
            b.setDisabled(false);
            b.setButtonText(t.repoSaveAndSync);
          } catch (e) {
            this.showRepoStatus(statusEl, "invalid", tf(t.repoConnectFailed, (e as Error).message));
            b.setDisabled(false);
            b.setButtonText(initial);
          }
        });
      });
    parent.appendChild(statusEl);

    // Submodules list (read-only — managed in the dashboard).
    if (s.submodules.length > 0) {
      const subHeader = parent.createDiv("ghs-subsection-header");
      subHeader.createEl("h4", { text: t.repoSubmodules });
      subHeader.createSpan({ cls: "ghs-subsection-meta", text: `${s.submodules.length}` });
      for (const sub of s.submodules) {
        new Setting(parent)
          .setName(sub.localPath)
          .setDesc(`${sub.remoteUrl} · ${sub.branch}`)
          .setClass("ghs-readonly-setting");
      }
    }
  }

  private showRepoStatus(badge: HTMLElement, kind: "loading" | "valid" | "invalid", text: string): void {
    badge.empty();
    badge.style.display = "";
    badge.removeClass("loading", "valid", "invalid");
    badge.addClass(kind);
    setIcon(
      badge.createSpan(),
      kind === "loading" ? "loader-2" : kind === "valid" ? "check-circle" : "alert-circle"
    );
    badge.createSpan({ text });
  }

  // ── 2. Account (token + identity) ────────────────────────────

  private renderAccount(parent: HTMLElement): void {
    const t = L().settings;
    this.sectionHeader(parent, t.sectionAccount);

    let tokenInputEl: HTMLInputElement | null = null;
    const testBadge = createDiv("ghs-inline-badge ghs-test-badge");
    testBadge.style.display = "none";

    new Setting(parent)
      .setName(t.tokenLabel)
      .addExtraButton((b) =>
        b.setIcon("eye").setTooltip(t.tokenShowHide).onClick(() => {
          if (!tokenInputEl) return;
          tokenInputEl.type = tokenInputEl.type === "password" ? "text" : "password";
        })
      )
      .addText((text) => {
        tokenInputEl = text.inputEl;
        text.inputEl.type = "password";
        text
          .setPlaceholder(t.tokenPlaceholder)
          .setValue(this.plugin.settings.githubToken)
          .onChange(async (v) => {
            this.plugin.settings.githubToken = v;
            await this.plugin.saveSettings();
            this.plugin.reinitGit();
          });
      })
      .addButton((b) =>
        b.setButtonText(L().common.test).onClick(() => this.testConnection(testBadge))
      );
    parent.appendChild(testBadge);

    new Setting(parent)
      .setName(t.nameLabel)
      .addText((text) =>
        text
          .setPlaceholder(t.namePlaceholder)
          .setValue(this.plugin.settings.gitUser)
          .onChange(async (v) => {
            this.plugin.settings.gitUser = v;
            await this.plugin.saveSettings();
            this.plugin.reinitGit();
          })
      );

    new Setting(parent)
      .setName(t.emailLabel)
      .addText((text) =>
        text
          .setPlaceholder(t.emailPlaceholder)
          .setValue(this.plugin.settings.gitEmail)
          .onChange(async (v) => {
            this.plugin.settings.gitEmail = v;
            await this.plugin.saveSettings();
            this.plugin.reinitGit();
          })
      );
  }

  // ── 3. AI providers (keys only) ──────────────────────────────

  private renderAI(parent: HTMLElement): void {
    const t = L().settings;
    this.sectionHeader(parent, t.sectionAI);

    let dsInputEl: HTMLInputElement | null = null;
    new Setting(parent)
      .setName(t.deepseekLabel)
      .addExtraButton((b) =>
        b.setIcon("eye").setTooltip(t.tokenShowHide).onClick(() => {
          if (!dsInputEl) return;
          dsInputEl.type = dsInputEl.type === "password" ? "text" : "password";
        })
      )
      .addText((text) => {
        dsInputEl = text.inputEl;
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-…")
          .setValue(this.plugin.settings.ai.deepseekToken)
          .onChange(async (v) => {
            this.plugin.settings.ai.deepseekToken = v.trim();
            await this.plugin.saveSettings();
          });
      });

    let gmInputEl: HTMLInputElement | null = null;
    new Setting(parent)
      .setName(t.geminiLabel)
      .addExtraButton((b) =>
        b.setIcon("eye").setTooltip(t.tokenShowHide).onClick(() => {
          if (!gmInputEl) return;
          gmInputEl.type = gmInputEl.type === "password" ? "text" : "password";
        })
      )
      .addText((text) => {
        gmInputEl = text.inputEl;
        text.inputEl.type = "password";
        text
          .setPlaceholder("AIza…")
          .setValue(this.plugin.settings.ai.geminiToken)
          .onChange(async (v) => {
            this.plugin.settings.ai.geminiToken = v.trim();
            await this.plugin.saveSettings();
          });
      });
  }

  // ── 4. General (language + tools) ────────────────────────────

  private renderGeneral(parent: HTMLElement): void {
    const t = L().settings;
    this.sectionHeader(parent, t.sectionGeneral);

    new Setting(parent)
      .setName(t.sectionLanguage)
      .addDropdown((dd) =>
        dd
          .addOption("en", t.languageEn)
          .addOption("zh", t.languageZh)
          .setValue(this.plugin.settings.language ?? "en")
          .onChange(async (v) => {
            this.plugin.settings.language = v as Lang;
            setLang(v as Lang);
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(parent)
      .setName(t.clearHistory)
      .addButton((b) =>
        b.setButtonText(L().common.clear).setWarning().onClick(async () => {
          this.plugin.settings.syncHistory = [];
          await this.plugin.saveSettings();
          new Notice(t.historyCleared);
        })
      );
  }

  // ── Helpers ──────────────────────────────────────────────────

  private sectionHeader(parent: HTMLElement, title: string, desc?: string): void {
    const wrap = parent.createDiv("ghs-section-header");
    const titleRow = wrap.createDiv("ghs-section-title-row");
    titleRow.createEl("h3", { text: title, cls: "setting-item-heading" });
    if (desc) wrap.createEl("p", { text: desc, cls: "ghs-section-desc" });
  }

  private async testConnection(badge: HTMLElement): Promise<void> {
    const t = L().settings;
    badge.empty();
    badge.style.display = "";
    badge.removeClass("valid", "invalid", "loading");
    badge.addClass("loading");
    setIcon(badge.createSpan(), "loader-2");
    badge.createSpan({ text: t.testVerifying });

    const token = this.plugin.settings.githubToken;
    if (!token) {
      badge.empty();
      badge.removeClass("loading");
      badge.addClass("invalid");
      setIcon(badge.createSpan(), "alert-circle");
      badge.createSpan({ text: t.testNoToken });
      return;
    }

    try {
      const res = await requestUrl({
        url: "https://api.github.com/user",
        headers: { Authorization: `token ${token}`, "User-Agent": "ObsidianGitHubSync" },
        throw: false,
      });
      badge.empty();
      badge.removeClass("loading");
      if (res.status === 200) {
        badge.addClass("valid");
        setIcon(badge.createSpan(), "check-circle");
        badge.createSpan({ text: tf(t.testConnected, res.json.login) });
      } else {
        badge.addClass("invalid");
        setIcon(badge.createSpan(), "alert-circle");
        badge.createSpan({ text: tf(t.testReturned, res.status) });
      }
    } catch (e) {
      badge.empty();
      badge.removeClass("loading");
      badge.addClass("invalid");
      setIcon(badge.createSpan(), "alert-circle");
      badge.createSpan({ text: tf(t.testFailed, (e as Error).message) });
    }
  }
}

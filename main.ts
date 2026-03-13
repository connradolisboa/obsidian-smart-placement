import { MarkdownView, Notice, Plugin } from "obsidian";
import {
  SmartNotePlacementSettings,
  DEFAULT_SETTINGS,
  SmartNotePlacementSettingTab,
} from "./settings";
import { getLinkTextAtCursor, handleLinkClick, processLinkText } from "./linkHandler";
import { Logger, createLogger } from "./logger";

export default class SmartNotePlacementPlugin extends Plugin {
  settings: SmartNotePlacementSettings = DEFAULT_SETTINGS;
  logger: Logger = createLogger(false);

  async onload(): Promise<void> {
    await this.loadSettings();
    this.logger = createLogger(this.settings.debugLogging);
    this.addSettingTab(new SmartNotePlacementSettingTab(this.app, this));

    this.registerDomEvent(
      document,
      "click",
      (evt: MouseEvent) => {
        const target = evt.target as HTMLElement;

        const isInternalLink =
          target.classList.contains("cm-hmd-internal-link") ||
          target.classList.contains("internal-link") ||
          target.closest(".cm-hmd-internal-link") !== null ||
          target.closest(".internal-link") !== null;

        if (!isInternalLink) return;

        // Fire-and-forget; errors are surfaced via Notice inside handleLinkClick
        handleLinkClick(this.app, this.settings, target, evt, this.logger).catch((err) => {
          this.logger.error("Smart Note Placement: unexpected error", err);
        });
      },
      { capture: true }
    );

    // Intercept CMD+Enter (Mac) / Ctrl+Enter (Win/Linux) for keyboard-driven
    // link following. Use capture so we run before CodeMirror's key handler.
    this.registerDomEvent(
      document,
      "keydown",
      (evt: KeyboardEvent) => {
        if (evt.key !== "Enter" || (!evt.metaKey && !evt.ctrlKey)) return;

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const rawLinkText = getLinkTextAtCursor(view.editor);
        if (!rawLinkText) return;

        processLinkText(this.app, this.settings, rawLinkText, evt, this.logger).catch(
          (err) => {
            this.logger.error("Smart Note Placement: unexpected error", err);
          }
        );
      },
      { capture: true }
    );

    // Command palette entry — primary way to trigger the plugin on mobile
    // where keyboard shortcuts are unavailable.
    this.addCommand({
      id: "follow-smart-link",
      name: "Follow smart link at cursor",
      editorCallback: (editor) => {
        const rawLinkText = getLinkTextAtCursor(editor);
        if (!rawLinkText) {
          new Notice("Smart Note Placement: No link found at cursor.");
          return;
        }
        processLinkText(
          this.app,
          this.settings,
          rawLinkText,
          new Event("command"),
          this.logger
        ).catch((err) => {
          this.logger.error("Smart Note Placement: unexpected error", err);
        });
      },
    });
  }

  onunload(): void {
    // registerDomEvent listeners are cleaned up automatically by the Plugin base class
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.logger = createLogger(this.settings.debugLogging);
  }
}

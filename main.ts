import { MarkdownView, Plugin } from "obsidian";
import {
  SmartNotePlacementSettings,
  DEFAULT_SETTINGS,
  SmartNotePlacementSettingTab,
} from "./settings";
import { getLinkTextAtCursor, handleLinkClick, processLinkText } from "./linkHandler";

export default class SmartNotePlacementPlugin extends Plugin {
  settings: SmartNotePlacementSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
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
        handleLinkClick(this.app, this.settings, target, evt).catch((err) => {
          console.error("Smart Note Placement: unexpected error", err);
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

        processLinkText(this.app, this.settings, rawLinkText, evt).catch(
          (err) => {
            console.error("Smart Note Placement: unexpected error", err);
          }
        );
      },
      { capture: true }
    );
  }

  onunload(): void {
    // registerDomEvent listeners are cleaned up automatically by the Plugin base class
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

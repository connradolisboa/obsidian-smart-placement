import { Plugin } from "obsidian";
import {
  SmartNotePlacementSettings,
  DEFAULT_SETTINGS,
  SmartNotePlacementSettingTab,
} from "./settings";
import { handleLinkClick } from "./linkHandler";

export default class SmartNotePlacementPlugin extends Plugin {
  settings: SmartNotePlacementSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new SmartNotePlacementSettingTab(this.app, this));

    this.registerDomEvent(document, "click", (evt: MouseEvent) => {
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
  }
}

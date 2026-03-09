import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type SmartNotePlacementPlugin from "./main";

export interface SmartNotePlacementSettings {
  sameFolderPrefix: string;
  folderNotePrefix: string;
  defaultFolder: string;
}

export const DEFAULT_SETTINGS: SmartNotePlacementSettings = {
  sameFolderPrefix: "&",
  folderNotePrefix: "@",
  defaultFolder: "",
};

const INVALID_CHARS = /[\[\]|]/;

function validatePrefix(value: string): string | null {
  if (value.length === 0) return "Prefix cannot be empty.";
  if (INVALID_CHARS.test(value)) return 'Prefix cannot contain [, ], or |.';
  return null;
}

export class SmartNotePlacementSettingTab extends PluginSettingTab {
  plugin: SmartNotePlacementPlugin;

  constructor(app: App, plugin: SmartNotePlacementPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Smart Note Placement" });

    new Setting(containerEl)
      .setName("Same-folder prefix")
      .setDesc(
        'Prefix character that creates the linked file in the same folder as the current note. Default: "&"'
      )
      .addText((text) =>
        text
          .setPlaceholder("&")
          .setValue(this.plugin.settings.sameFolderPrefix)
          .onChange(async (value) => {
            const err = validatePrefix(value);
            if (err) {
              new Notice(`Same-folder prefix: ${err}`);
              return;
            }
            if (value === this.plugin.settings.folderNotePrefix) {
              new Notice("Prefixes must be different.");
              return;
            }
            this.plugin.settings.sameFolderPrefix = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Folder-note prefix")
      .setDesc(
        'Prefix character that uses folder-note logic for the linked file. Default: "@"'
      )
      .addText((text) =>
        text
          .setPlaceholder("@")
          .setValue(this.plugin.settings.folderNotePrefix)
          .onChange(async (value) => {
            const err = validatePrefix(value);
            if (err) {
              new Notice(`Folder-note prefix: ${err}`);
              return;
            }
            if (value === this.plugin.settings.sameFolderPrefix) {
              new Notice("Prefixes must be different.");
              return;
            }
            this.plugin.settings.folderNotePrefix = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default folder")
      .setDesc(
        "Fallback folder path (relative to vault root) used when no prefix matches. Leave empty for vault root."
      )
      .addText((text) =>
        text
          .setPlaceholder("e.g. Notes")
          .setValue(this.plugin.settings.defaultFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}

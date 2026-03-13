import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type SmartNotePlacementPlugin from "./main";

export interface CustomPrefixEntry {
  prefix: string;
  folder: string;
  template?: string;
}

export interface SmartNotePlacementSettings {
  sameFolderPrefix: string;
  sameFolderTemplate?: string;
  folderNotePrefix: string;
  folderNoteTemplate?: string;
  customPrefixes: CustomPrefixEntry[];
  defaultFolder: string;
  debugLogging: boolean;
}

export const DEFAULT_SETTINGS: SmartNotePlacementSettings = {
  sameFolderPrefix: "&",
  folderNotePrefix: "@",
  customPrefixes: [],
  defaultFolder: "",
  debugLogging: false,
};

const INVALID_CHARS = /[\[\]|]/;

function validatePrefix(
  value: string,
  others: string[]
): string | null {
  if (value.length === 0) return "Prefix cannot be empty.";
  if (INVALID_CHARS.test(value)) return 'Prefix cannot contain [, ], or |.';
  if (others.includes(value)) return "Prefix must be unique.";
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

    // --- Built-in Prefixes ---
    containerEl.createEl("h3", { text: "Built-in Prefixes" });

    new Setting(containerEl)
      .setName("Same-folder prefix")
      .setDesc('Creates the linked file in the same folder as the current note. Default: "&"')
      .addText((text) =>
        text
          .setPlaceholder("&")
          .setValue(this.plugin.settings.sameFolderPrefix)
          .onChange(async (value) => {
            const others = [
              this.plugin.settings.folderNotePrefix,
              ...this.plugin.settings.customPrefixes.map((e) => e.prefix),
            ];
            const err = validatePrefix(value, others);
            if (err) { new Notice(`Same-folder prefix: ${err}`); return; }
            this.plugin.settings.sameFolderPrefix = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Same-folder template")
      .setDesc("Optional path to a template file applied when creating a same-folder note.")
      .addText((text) =>
        text
          .setPlaceholder("e.g. Templates/Note.md")
          .setValue(this.plugin.settings.sameFolderTemplate ?? "")
          .onChange(async (value) => {
            this.plugin.settings.sameFolderTemplate = value.trim() || undefined;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Folder-note prefix")
      .setDesc('Uses folder-note logic for the linked file. Default: "@"')
      .addText((text) =>
        text
          .setPlaceholder("@")
          .setValue(this.plugin.settings.folderNotePrefix)
          .onChange(async (value) => {
            const others = [
              this.plugin.settings.sameFolderPrefix,
              ...this.plugin.settings.customPrefixes.map((e) => e.prefix),
            ];
            const err = validatePrefix(value, others);
            if (err) { new Notice(`Folder-note prefix: ${err}`); return; }
            this.plugin.settings.folderNotePrefix = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Folder-note template")
      .setDesc("Optional path to a template file applied when creating a folder-note.")
      .addText((text) =>
        text
          .setPlaceholder("e.g. Templates/FolderNote.md")
          .setValue(this.plugin.settings.folderNoteTemplate ?? "")
          .onChange(async (value) => {
            this.plugin.settings.folderNoteTemplate = value.trim() || undefined;
            await this.plugin.saveSettings();
          })
      );

    // --- Default Folder ---
    containerEl.createEl("h3", { text: "Default Folder" });

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

    // --- Custom Prefixes ---
    containerEl.createEl("h3", { text: "Custom Prefixes" });

    const { customPrefixes } = this.plugin.settings;
    for (let i = 0; i < customPrefixes.length; i++) {
      const entry = customPrefixes[i];
      const row = new Setting(containerEl);
      row.settingEl.addClass("snp-custom-prefix-row");
      row
        .addText((text) =>
          text
            .setPlaceholder("prefix")
            .setValue(entry.prefix)
            .onChange(async (value) => {
              const others = [
                this.plugin.settings.sameFolderPrefix,
                this.plugin.settings.folderNotePrefix,
                ...customPrefixes
                  .filter((_, j) => j !== i)
                  .map((e) => e.prefix),
              ];
              const err = validatePrefix(value, others);
              if (err) { new Notice(`Custom prefix: ${err}`); return; }
              entry.prefix = value;
              await this.plugin.saveSettings();
            })
        )
        .addText((text) =>
          text
            .setPlaceholder("folder path")
            .setValue(entry.folder)
            .onChange(async (value) => {
              entry.folder = value.trim();
              await this.plugin.saveSettings();
            })
        )
        .addText((text) =>
          text
            .setPlaceholder("template path (optional)")
            .setValue(entry.template ?? "")
            .onChange(async (value) => {
              entry.template = value.trim() || undefined;
              await this.plugin.saveSettings();
            })
        )
        .addButton((btn) =>
          btn
            .setButtonText("Remove")
            .onClick(async () => {
              customPrefixes.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            })
        );
      row.nameEl.remove();
    }

    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText("+ Add custom prefix")
          .onClick(async () => {
            customPrefixes.push({ prefix: "", folder: "" });
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // --- Debug ---
    containerEl.createEl("h3", { text: "Debug" });

    new Setting(containerEl)
      .setName("Enable debug logging")
      .setDesc("Logs [SNP] prefixed messages to the developer console.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debugLogging)
          .onChange(async (value) => {
            this.plugin.settings.debugLogging = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

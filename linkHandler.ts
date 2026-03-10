import { App, Editor, Notice, TFile, normalizePath } from "obsidian";
import type { SmartNotePlacementSettings } from "./settings";
import type { Logger } from "./logger";
import { resolveFolderNoteTarget } from "./folderNoteUtils";

type PrefixConfig = {
  kind: "sameFolder" | "folderNote" | "custom";
  folder?: string;
  template?: string;
};

function resolvePrefix(
  settings: SmartNotePlacementSettings,
  rawLinkText: string
): { prefix: string; config: PrefixConfig } | null {
  // Sort longest-first so "&&" isn't shadowed by "&"
  const sorted = [...settings.customPrefixes].sort(
    (a, b) => b.prefix.length - a.prefix.length
  );
  for (const entry of sorted) {
    if (entry.prefix && rawLinkText.startsWith(entry.prefix)) {
      return { prefix: entry.prefix, config: { kind: "custom", folder: entry.folder, template: entry.template } };
    }
  }
  if (rawLinkText.startsWith(settings.sameFolderPrefix)) {
    return { prefix: settings.sameFolderPrefix, config: { kind: "sameFolder", template: settings.sameFolderTemplate } };
  }
  if (rawLinkText.startsWith(settings.folderNotePrefix)) {
    return { prefix: settings.folderNotePrefix, config: { kind: "folderNote", template: settings.folderNoteTemplate } };
  }
  return null;
}

/**
 * Extract the raw link text from a clicked internal-link element.
 * CodeMirror splits link tokens across multiple spans, so we walk up
 * to the nearest ancestor that carries the full link text via data-href.
 */
function extractLinkText(target: HTMLElement): string | null {
  // Try data-href on the element or its closest ancestor
  const anchor =
    target.closest("[data-href]") ??
    target.closest(".cm-hmd-internal-link") ??
    target.closest(".internal-link");

  if (!anchor) return null;

  const href = anchor.getAttribute("data-href");
  if (href) return href;

  // Fallback: collect text content of siblings in the same link token group
  return (anchor as HTMLElement).innerText ?? null;
}

/**
 * Check whether a link target file already exists in the vault.
 */
function linkTargetExists(app: App, linkText: string, sourcePath: string): boolean {
  const resolved = app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
  return resolved instanceof TFile;
}

/**
 * Rewrite the wiki-link in the source file using offset-based replacement
 * from metadataCache when available, with regex fallback.
 */
async function rewriteLink(
  app: App,
  sourceFile: TFile,
  originalLinkText: string,
  newFilePath: string,
  displayName: string,
  logger: Logger
): Promise<void> {
  const cache = app.metadataCache.getFileCache(sourceFile);
  const newLink = `[[${newFilePath}|${displayName}]]`;

  if (cache?.links?.length) {
    const matches = cache.links.filter(
      (lc) => lc.original === `[[${originalLinkText}]]`
    );
    if (matches.length > 0) {
      const content = await app.vault.read(sourceFile);
      // Process end-to-start so earlier offsets aren't shifted by replacements
      const sorted = [...matches].sort(
        (a, b) => b.position.start.offset - a.position.start.offset
      );
      let result = content;
      for (const lc of sorted) {
        const s = lc.position.start.offset;
        const e = lc.position.end.offset;
        result = result.slice(0, s) + newLink + result.slice(e);
      }
      if (result !== content) await app.vault.modify(sourceFile, result);
      return;
    }
    logger.debug("rewriteLink: cache miss for", originalLinkText, "— regex fallback");
  } else {
    logger.debug("rewriteLink: no cache — regex fallback");
  }

  // Regex fallback — preserved for cache-miss after folder-note promotion
  const content = await app.vault.read(sourceFile);
  const esc = originalLinkText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const updated = content.replace(new RegExp(`\\[\\[${esc}\\]\\]`, "g"), newLink);
  if (updated !== content) await app.vault.modify(sourceFile, updated);
}

/**
 * Apply a template file's content to a newly created file.
 */
async function applyTemplate(
  app: App,
  newFile: TFile,
  templatePath: string,
  logger: Logger
): Promise<void> {
  const tmplFile = app.vault.getAbstractFileByPath(templatePath);
  if (tmplFile instanceof TFile) {
    const content = await app.vault.read(tmplFile);
    await app.vault.modify(newFile, content);
  } else {
    logger.debug("Template file not found:", templatePath);
  }
}

/**
 * Extract the link text under the cursor in the given editor.
 * Returns the link target (before any | alias or # heading), or null if the
 * cursor is not inside a wiki-link.
 */
export function getLinkTextAtCursor(editor: Editor): string | null {
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line);
  const ch = cursor.ch;

  // Match [[linkTarget]], [[linkTarget|alias]], [[linkTarget#heading]]
  const regex = /\[\[([^|\]#]+)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const linkStart = match.index;
    const closeIdx = line.indexOf("]]", linkStart + 2);
    const linkEnd = closeIdx >= 0 ? closeIdx + 2 : line.length;
    if (ch >= linkStart && ch <= linkEnd) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Core logic: create/open a prefixed wiki-link target.
 */
export async function processLinkText(
  app: App,
  settings: SmartNotePlacementSettings,
  rawLinkText: string,
  evt: Event,
  logger: Logger
): Promise<boolean> {
  const resolved = resolvePrefix(settings, rawLinkText);
  if (!resolved) return false;

  const { prefix, config } = resolved;

  // Only intercept unresolved (not-yet-existing) links
  if (linkTargetExists(app, rawLinkText, "")) return false;

  evt.preventDefault();
  evt.stopPropagation();

  const fileName = rawLinkText.slice(prefix.length).trim();
  if (!fileName) {
    new Notice("Smart Note Placement: Link text after prefix is empty.");
    return true;
  }

  // Determine source file (the currently active editor's file)
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice("Smart Note Placement: No active file found.");
    return true;
  }

  let targetFolderPath: string;

  if (config.kind === "sameFolder") {
    targetFolderPath = activeFile.parent?.path ?? "";
  } else if (config.kind === "folderNote") {
    const resolvedFolder = await resolveFolderNoteTarget(app, activeFile, logger);
    if (resolvedFolder === null) return true; // error already shown
    targetFolderPath = resolvedFolder;
  } else {
    // custom
    targetFolderPath = config.folder ?? "";
  }

  const newFilePath = normalizePath(
    targetFolderPath ? `${targetFolderPath}/${fileName}.md` : `${fileName}.md`
  );

  // If target already exists, just open it
  const existingFile = app.vault.getAbstractFileByPath(newFilePath);
  if (existingFile instanceof TFile) {
    await app.workspace.openLinkText(fileName, activeFile.path);
    return true;
  }

  let newFile: TFile;
  try {
    newFile = await app.vault.create(newFilePath, "");
  } catch (err) {
    logger.error(`Failed to create "${newFilePath}":`, err);
    new Notice(
      `Smart Note Placement: Failed to create "${newFilePath}". ${String(err)}`
    );
    return true;
  }

  if (config.template) {
    await applyTemplate(app, newFile, config.template, logger);
  }

  // Rewrite the link in the (possibly moved) source file.
  // After a folder-note promotion, activeFile may have been renamed.
  // We re-fetch the active file to get the current TFile reference.
  const currentSourceFile = app.workspace.getActiveFile() ?? activeFile;
  const relativePath = targetFolderPath
    ? `${targetFolderPath}/${fileName}`
    : fileName;

  await rewriteLink(
    app,
    currentSourceFile,
    rawLinkText,
    relativePath,
    fileName,
    logger
  );

  await app.workspace.openLinkText(fileName, currentSourceFile.path);
  return true;
}

/**
 * Handle a prefixed wiki-link click.
 */
export async function handleLinkClick(
  app: App,
  settings: SmartNotePlacementSettings,
  target: HTMLElement,
  evt: MouseEvent,
  logger: Logger
): Promise<boolean> {
  const rawLinkText = extractLinkText(target);
  if (!rawLinkText) return false;
  return processLinkText(app, settings, rawLinkText, evt, logger);
}

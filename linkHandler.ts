import { App, Notice, TFile, normalizePath } from "obsidian";
import type { SmartNotePlacementSettings } from "./settings";
import { resolveFolderNoteTarget } from "./folderNoteUtils";

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
 * Rewrite the wiki-link in the source file, replacing the prefixed form with
 * a clean aliased link: [[folderPath/FileName|FileName]]
 */
async function rewriteLink(
  app: App,
  sourceFile: TFile,
  originalLinkText: string,
  newFilePath: string,
  displayName: string
): Promise<void> {
  const content = await app.vault.read(sourceFile);

  // Match [[& File Name]], [[@ File Name]], [[&File Name]], etc.
  // We escape the prefix for use in regex
  const escapedOriginal = originalLinkText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\[\\[${escapedOriginal}\\]\\]`,
    "g"
  );

  const newLink = `[[${newFilePath}|${displayName}]]`;
  const updated = content.replace(pattern, newLink);

  if (updated !== content) {
    await app.vault.modify(sourceFile, updated);
  }
}

/**
 * Handle a prefixed wiki-link click.
 *
 * @param app        Obsidian App instance
 * @param settings   Plugin settings
 * @param target     The clicked HTML element
 * @param evt        The original MouseEvent (so we can call preventDefault)
 * @returns true if the event was handled, false to let Obsidian handle it
 */
export async function handleLinkClick(
  app: App,
  settings: SmartNotePlacementSettings,
  target: HTMLElement,
  evt: MouseEvent
): Promise<boolean> {
  const rawLinkText = extractLinkText(target);
  if (!rawLinkText) return false;

  const { sameFolderPrefix, folderNotePrefix } = settings;

  let prefix: string | null = null;
  if (rawLinkText.startsWith(sameFolderPrefix)) {
    prefix = sameFolderPrefix;
  } else if (rawLinkText.startsWith(folderNotePrefix)) {
    prefix = folderNotePrefix;
  }

  if (!prefix) return false;

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

  if (prefix === sameFolderPrefix) {
    // & prefix: same folder as current file
    targetFolderPath = activeFile.parent?.path ?? "";
  } else {
    // @ prefix: folder-note logic
    const resolved = await resolveFolderNoteTarget(app, activeFile);
    if (resolved === null) return true; // error already shown
    targetFolderPath = resolved;
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

  try {
    await app.vault.create(newFilePath, "");
  } catch (err) {
    new Notice(
      `Smart Note Placement: Failed to create "${newFilePath}". ${String(err)}`
    );
    return true;
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
    fileName
  );

  await app.workspace.openLinkText(fileName, currentSourceFile.path);
  return true;
}

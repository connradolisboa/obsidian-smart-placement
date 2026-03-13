import { App, Notice, TFile, TFolder } from "obsidian";
import { normalizePath } from "obsidian";
import type { Logger } from "./logger";

export function isFolderNote(app: App, file: TFile): boolean {
  // Case 1: sibling folder pattern — Business.md alongside Business/
  const siblingFolderPath = file.path.replace(/\.md$/, "");
  if (app.vault.getAbstractFileByPath(siblingFolderPath) instanceof TFolder) {
    return true;
  }
  // Case 2: inside-folder pattern — Business/Business.md
  return file.basename === file.parent?.name;
}

/**
 * Resolve the target folder for the @ (folder-note) prefix.
 *
 * Case A – current file IS a folder note:
 *   Return the matching sibling folder path.
 *
 * Case B – current file is NOT a folder note:
 *   1. Create a subfolder named after the current file.
 *   2. Move (rename) the current file into that subfolder.
 *   3. Return the subfolder path (new file lives there too).
 *
 * Returns the resolved folder path, or null on unrecoverable error.
 */
export async function resolveFolderNoteTarget(
  app: App,
  currentFile: TFile,
  logger: Logger
): Promise<string | null> {
  if (isFolderNote(app, currentFile)) {
    // Case A1: sibling folder pattern — Business.md → Business/
    const siblingFolderPath = currentFile.path.replace(/\.md$/, "");
    if (app.vault.getAbstractFileByPath(siblingFolderPath) instanceof TFolder) {
      return siblingFolderPath;
    }
    // Case A2: inside-folder pattern — Business/Business.md → Business/
    return currentFile.parent?.path ?? "";
  }

  // Case B: promote current file into a folder note
  const parentPath = currentFile.parent?.path ?? "";
  const baseName = currentFile.basename;
  const newFolderPath = normalizePath(
    parentPath ? `${parentPath}/${baseName}` : baseName
  );
  const newFilePath = normalizePath(`${newFolderPath}/${baseName}.md`);

  try {
    // Create the subfolder
    const existingFolder = app.vault.getAbstractFileByPath(newFolderPath);
    if (!(existingFolder instanceof TFolder)) {
      await app.vault.createFolder(newFolderPath);
    }
  } catch (err) {
    logger.error(`Failed to create folder "${newFolderPath}":`, err);
    new Notice(
      `Smart Note Placement: Failed to create folder "${newFolderPath}". ${String(err)}`
    );
    return null;
  }

  try {
    // Move current file into the new folder, preserving backlinks
    await app.fileManager.renameFile(currentFile, newFilePath);
  } catch (err) {
    logger.error(`Failed to move "${currentFile.path}" to "${newFilePath}":`, err);
    new Notice(
      `Smart Note Placement: Failed to move "${currentFile.path}" to "${newFilePath}". ${String(err)}`
    );
    return null;
  }

  return newFolderPath;
}

# Smart Note Placement: Implementation Plan — Features 1, 2, 3, 14, 17

## Context

The plugin currently has two hardcoded prefix behaviors (`&` same-folder, `@` folder-note) with no extensibility, a desktop-only restriction, fragile regex-based link rewriting, and no logging. This plan adds:

1. **Mobile Support** — remove `isDesktopOnly`
2. **More Prefix Slots** — user-defined custom prefix → folder mappings
3. **Template Support** — simple file content copy applied on file creation
14. **Regex Safety in Link Rewriting** — offset-based rewrite using Obsidian's `metadataCache`
17. **Error Boundary / Logging** — toggleable `[SNP]` debug logger

---

## Files to Modify

| File | Changes |
|------|---------|
| `manifest.json` | Remove `isDesktopOnly` |
| `logger.ts` | **New file** — Logger factory |
| `settings.ts` | New interface fields + expanded settings UI |
| `main.ts` | Logger instantiation + threading |
| `linkHandler.ts` | Custom prefix resolution, template application, offset-based rewriteLink |
| `folderNoteUtils.ts` | Logger parameter |

---

## Step 1 — `manifest.json`

Remove `"isDesktopOnly": true`. No other changes needed; all Obsidian APIs used are mobile-compatible.

---

## Step 2 — `logger.ts` (new file)

```typescript
export interface Logger {
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(enabled: boolean): Logger {
  const p = "[SNP]";
  return {
    debug: (...args) => { if (enabled) console.debug(p, ...args); },
    error: (...args) => console.error(p, ...args), // always logs
  };
}
```

---

## Step 3 — `settings.ts`

### Updated Interface

```typescript
export interface CustomPrefixEntry {
  prefix: string;
  folder: string;
  template?: string;  // optional path to template file
}

export interface SmartNotePlacementSettings {
  sameFolderPrefix: string;
  sameFolderTemplate?: string;    // new
  folderNotePrefix: string;
  folderNoteTemplate?: string;    // new
  customPrefixes: CustomPrefixEntry[];  // new
  defaultFolder: string;
  debugLogging: boolean;          // new
}

export const DEFAULT_SETTINGS: SmartNotePlacementSettings = {
  sameFolderPrefix: "&",
  folderNotePrefix: "@",
  customPrefixes: [],
  defaultFolder: "",
  debugLogging: false,
};
```

`Object.assign({}, DEFAULT_SETTINGS, await this.loadData())` in `loadSettings` handles missing fields for existing users — no migration needed.

### Settings UI Layout

```
[h2] Smart Note Placement

[h3] Built-in Prefixes
  Same-folder prefix:     [&]
  Same-folder template:   [Templates/Note.md      ]   (optional)

  Folder-note prefix:     [@]
  Folder-note template:   [Templates/FolderNote.md]   (optional)

[h3] Default Folder
  Default folder:         [Notes]

[h3] Custom Prefixes
  [#]  [Resources]  [Templates/Resource.md]  [Remove]
  [!]  [Fleeting ]  [                     ]  [Remove]
  [+ Add custom prefix]

[h3] Debug
  Enable debug logging: [toggle]
```

### Custom Prefix UI Behavior
- **Add**: push `{ prefix: "", folder: "", template: undefined }` → save → `this.display()` to re-render.
- **Remove**: splice at index `i` → save → re-render.
- **Prefix change**: validate (non-empty, no `[]/|`, no collision with any other prefix), save.
- **Folder/template change**: trim, save.

### Validation
Update `validatePrefix` to also check for collision against: `sameFolderPrefix`, `folderNotePrefix`, and all `customPrefixes[j].prefix` for `j !== i`.

---

## Step 4 — `main.ts`

1. Import `Logger`, `createLogger` from `./logger`.
2. Add `logger: Logger` property. Initialize after `loadSettings`:
   ```typescript
   this.logger = createLogger(this.settings.debugLogging);
   ```
3. In `saveSettings`, recreate after save:
   ```typescript
   this.logger = createLogger(this.settings.debugLogging);
   ```
4. Replace bare `console.error` in catch blocks with `this.logger.error(...)`.
5. Pass `this.logger` as last arg to `handleLinkClick` and `processLinkText`.

---

## Step 5 — `folderNoteUtils.ts`

Add `logger: Logger` as last parameter to `resolveFolderNoteTarget`. In each catch block, add `logger.error(...)` alongside the existing `new Notice(...)`.

---

## Step 6 — `linkHandler.ts`

### A. `resolvePrefix` helper

```typescript
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
    if (rawLinkText.startsWith(entry.prefix)) {
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
```

Custom prefixes are checked first (longest-first) so multi-char customs like `&&` aren't shadowed by `&`.

### B. `processLinkText` changes

- Replace `if/else if` prefix chain with `resolvePrefix(settings, rawLinkText)`.
- For `custom` kind: `targetFolderPath = config.folder ?? ""`.
- Capture `create` return: `const newFile = await app.vault.create(newFilePath, "")`.
- Apply template after creation:
  ```typescript
  if (config.template) {
    const tmplFile = app.vault.getAbstractFileByPath(config.template);
    if (tmplFile instanceof TFile) {
      const content = await app.vault.read(tmplFile);
      await app.vault.modify(newFile, content);
    } else {
      logger.debug("Template file not found:", config.template);
    }
  }
  ```
- Pass `logger` to `resolveFolderNoteTarget`.

### C. `rewriteLink` — offset-based (Feature 14)

```typescript
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
    // Match lc.original (verbatim "[[...]]" text) — more precise than lc.link
    const matches = cache.links.filter(
      lc => lc.original === `[[${originalLinkText}]]`
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
```

Key improvements over regex-only:
- Uses `lc.original` (verbatim document text) — immune to Obsidian's link normalization.
- Skips links inside code fences (metadataCache excludes them) — regex could incorrectly match those.
- Regex fallback retained for the `@` prefix case where cache may be stale after file rename.

---

## Verification

1. **Build**: `npm run build` — no TypeScript errors.
2. **Mobile**: Load plugin in Obsidian mobile; verify link clicks trigger file creation.
3. **Feature 2**: Add custom prefix `#` → `Resources/`. Click `[[# My Resource]]` — file appears in `Resources/`.
4. **Feature 3**: Set `sameFolderTemplate` to a template file path. Click `[[& New Note]]` — new file contains template content.
5. **Feature 14**: Enable debug logging, click a prefixed link, check DevTools console — no "regex fallback" message should appear for normal `&` links.
6. **Feature 17**: Enable debug logging in settings, click a link — console shows `[SNP]` prefixed messages.
7. **Regression**: Existing `&` and `@` prefix behaviors unchanged for users with no templates configured.

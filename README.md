# Smart Note Placement

An [Obsidian](https://obsidian.md) plugin that intercepts wiki-link clicks and keyboard shortcuts to create new notes in the right place automatically — based on a prefix character at the start of the link text.

No more hunting for the right folder after creating a note. Just write `[[& My Note]]` or `[[@ Project]]` and the plugin handles folder placement for you.

## Features

- **Same-folder prefix** (`&`) — creates the new note in the same folder as the current note
- **Folder-note prefix** (`@`) — places the new note inside a subfolder, automatically promoting the current note to a folder note if needed
- **Custom prefixes** — define any prefix → folder mapping you want, with optional templates and date tokens
- **Template support** — apply a template file's content whenever a new note is created
- **Date tokens in folder paths** — use `{year}`, `{month}`, `{quarter}`, `{day}`, `{week}`, `{weekday}` in custom folder paths
- **`now` keyword** — write `[[& now]]` to create a timestamped note (`2026-05-04 1430`)
- **Default folder** — fallback folder for unprefixed links that don't exist yet
- **Mobile support** — works on Obsidian iOS and Android
- **Keyboard shortcut** — `Cmd+Enter` / `Ctrl+Enter` follows the smart link at the cursor
- **Command palette** — "Follow smart link at cursor" for mobile and custom hotkeys
- **Debug logging** — optional `[SNP]` console output for troubleshooting

## How It Works

When you click a wiki-link (or press `Cmd/Ctrl+Enter` with the cursor inside one), Smart Note Placement checks whether the link text starts with a known prefix. If it does **and** the target file doesn't exist yet, the plugin:

1. Strips the prefix to get the file name
2. Determines the target folder based on the prefix rule
3. Creates the note there
4. Rewrites the wiki-link in your source file to point at the new path
5. Opens the new note

If the target file already exists, the plugin opens it normally without rewriting anything.

## Usage

### Same-folder prefix (`&`)

```
[[& My Sibling Note]]
```

Creates `My Sibling Note.md` in the same folder as the currently open note.

**Folder-note awareness:** If your current note is a folder note (e.g. `Projects/Projects.md`), `&` places the new note one level up (inside `Projects/`'s parent), keeping folder-note siblings at the right level.

### Folder-note prefix (`@`)

```
[[@ Sub-topic]]
```

Places `Sub-topic.md` inside a subfolder named after the current note. If the current note isn't already a folder note, the plugin promotes it:

1. Creates a subfolder named after the current note
2. Moves the current note into that subfolder
3. Creates `Sub-topic.md` inside the subfolder

Example: you're in `Projects.md` and click `[[@ Design]]`. The plugin creates `Projects/` and moves `Projects.md` to `Projects/Projects.md`, then creates `Projects/Design.md`.

### `now` keyword

```
[[& now]]
```

The filename `now` (case-insensitive) expands to the current timestamp: `2026-05-04 1430`. Works with any prefix.

### Custom prefixes

In **Settings → Smart Note Placement → Custom Prefixes**, add rows with:

| Field | Description |
|-------|-------------|
| Prefix | The character(s) that trigger this rule (e.g. `#`, `!`, `%%`) |
| Folder | Target folder path, relative to vault root. Supports date tokens. |
| Template | Optional path to a template file (e.g. `Templates/Resource.md`) |

Example: prefix `#`, folder `Resources` — then `[[# My Article]]` creates `Resources/My Article.md`.

Custom prefixes are matched longest-first, so `&&` won't be shadowed by `&`.

### Date tokens in folder paths

Custom folder paths (and the default folder) support these tokens, resolved at the moment the note is created:

| Token | Example output |
|-------|---------------|
| `{year}` | `2026` |
| `{month}` | `05` |
| `{quarter}` | `Q2` |
| `{day}` | `04` |
| `{week}` | `18` (ISO week number) |
| `{weekday}` | `Sunday` |

Example folder path: `Journal/{year}/{month}` → `Journal/2026/05`

### Default folder

If a link has no matching prefix and the target file doesn't exist, Obsidian's default behavior runs. You can configure a **Default folder** in settings to override where Obsidian places those new files.

## Settings

Open **Settings → Smart Note Placement** to configure:

**Built-in Prefixes**
- Same-folder prefix (default: `&`)
- Same-folder template (optional)
- Folder-note prefix (default: `@`)
- Folder-note template (optional)

**Default Folder** — fallback for unprefixed links (leave empty for vault root)

**Custom Prefixes** — unlimited prefix → folder → template rows

**Debug** — enable `[SNP]` console logging for troubleshooting

## Installation

### From the Community Plugin Browser (recommended)

1. Open Obsidian **Settings → Community plugins**
2. Disable Safe mode if prompted
3. Click **Browse** and search for "Smart Note Placement"
4. Click **Install**, then **Enable**

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/connradolisboa/obsidian-better-create/releases/latest)
2. Copy them into `.obsidian/plugins/smart-note-placement/` inside your vault
3. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Development

```bash
# Clone into your vault's plugins folder
git clone https://github.com/connradolisboa/obsidian-better-create.git .obsidian/plugins/smart-note-placement

cd .obsidian/plugins/smart-note-placement
npm install

# Watch mode (rebuilds on save)
npm run dev

# Production build
npm run build
```

Enable the plugin in Obsidian after building. Use **Cmd/Ctrl+R** to reload Obsidian during development.

## License

MIT

# ImageDropper 0.1.0

A dockable, dependency-free Adobe Premiere Pro UXP panel. Drag local images or image URLs, or use the picker, clipboard, and URL field. ImageDropper saves **copies** to its image folder, imports them into an `ImageDropper` project bin, and optionally inserts them sequentially at the active sequence's current playhead on V1–V8. Source files are not modified or deleted.

## Supported versions and an important correction

**Premiere Pro 25.6.0 or later (released UXP), UXP Developer Tool 2.2 or later.** Although the requested target was 25.3+, Adobe documents the Premiere UXP DOM methods used here (`Project.getActiveProject`, `Project.importFiles`, `SequenceEditor.createInsertProjectItemAction`, etc.) as **introduced in 25.6**. Premiere 25.3 does not have a documented supported version of these APIs; claiming 25.3 compatibility would make an unrunnable plugin. The manifest therefore requires 25.6.0. Upgrade Premiere before loading this version. Reference: [Adobe Premiere UXP API](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/), [Adobe UXP changelog](https://developer.adobe.com/premiere-pro/uxp/changelog/).

## Exact Windows installation and testing steps

1. Install **Adobe Premiere Pro 25.6+** and **Adobe UXP Developer Tool 2.2+** through Creative Cloud Desktop. An older Premiere installation such as 25.3 will not load this manifest.
2. Start Premiere. In Premiere **Settings > Plugins**, turn on **Enable developer mode**, then restart Premiere.
3. Open or create a Premiere project and an active sequence. Place the playhead at a free section of V1, or choose an empty video track under **Video Track** (see track-safety note below).
4. Start UXP Developer Tool; click **Add Plugin**; select `ImageDropper\manifest.json` from this source folder. Do not select `index.html`.
5. Click **Load & Watch**. In Premiere choose **Window > UXP Plugins > ImageDropper**. Dock and resize the panel as desired. If changing `manifest.json`, use **Unload**, then **Load & Watch** again.
6. **Local drag**: drop a `.jpg`, `.jpeg`, `.png`, or `.webp` from File Explorer onto the large drop area. Check for a new file in the image folder, a Project Item in the ImageDropper bin, and a new clip at the playhead.
7. **Google Images drag**: open Google Images in Chrome or Edge, search, drag an image onto the panel. The panel tries image bytes, HTML image source, `text/uri-list`, then a text URL. If the browser offers only a page link or the image site blocks downloading, use **Copy image address** followed by **Paste Image / URL**, or paste the direct URL into **Import Image URL**. This is a browser/UXP data-transfer limitation, not an assumed filesystem path.
8. **URL test**: click **Import Image URL**, paste a public direct HTTPS JPG/PNG/WEBP image URL, click **Import**; check the status and image folder.
9. **Multiple images**: Ctrl-select several images in Explorer and drop them together (or pick several using **Choose Image**). Verify that they appear sequentially on the selected track, each with the chosen duration.
10. **Timeline insertion**: set Duration to `5.0`, Timeline to **Add to Timeline**, Track to **V1**, and move the playhead to a free point. Confirm each still's length in the sequence. Try V2/V3 with an empty track.
11. **Project Panel Only**: change Timeline to **Project Panel Only**, import another image, and verify that no sequence clip was inserted. This mode also works without an active sequence.
12. **Fit to Frame**: choose Fit, insert an image with dimensions different from the sequence, and confirm uniform Motion Scale; repeat with Fill (crops edges uniformly) and Keep Original (does not alter scale).
13. **Invalid URL**: submit `not-a-url` or an HTML search-result page. Verify the visible error message; no HTML should be saved as an image.
14. **Unsupported file**: drop a GIF or text file and verify the unsupported-format error. URLs must return a supported image Content-Type and valid image bytes.
15. **No active project**: close all projects and attempt an import; verify **No active project**. With an active project but no active sequence, set **Add to Timeline** and attempt an import; verify **No active sequence**. Change to Project Panel Only to import without a sequence.
16. For debugging, inspect the plugin's **Debug** console in UXP Developer Tool; errors include full details while the panel displays concise status text.

## Settings, files and permissions

- Defaults: 5 seconds (allowed range 0.1–600), Add to Timeline, Fit to Frame, V1, Create ImageDropper Bin, Auto Add To Timeline. Change controls to save them across sessions using UXP `localStorage`.
- Images are written under the UXP **plugin data folder**: `ImageDropper/Images/`. `ImageDropper/Cache/` is reserved for future cache data. **Open Image Folder** launches Windows File Explorer after UXP asks for consent. In Settings, **Choose…** selects a different image folder with a UXP persistent access token; **Use plugin folder** restores the plugin data folder. The panel never writes into its read-only installation directory.
- Downloaded URL → filename mappings are stored in `localStorage`, scoped to the selected folder. Reusing the same URL avoids re-downloading when the cached file still exists; a previously imported Project Item is reused if found in the selected project bin. Importing the URL again can insert the same Project Item as a new timeline clip.
- The manifest asks for `network.domains: "all"` because dragged images can originate from *any* website, `localFileSystem: "request"` for user-selected files/folders, `clipboard: "read"`, and `launchProcess.extensions: [""]` solely to open a folder. No API keys, frameworks, remote scripts, external programs, or paid services are used.
- Downloads require an HTTP(S) response with `image/jpeg`, `image/png` or `image/webp`, matching file magic and valid image dimensions. Maximum download/local image size is **25 MB**. HTTP errors, unsupported formats and missing access report to the status area. Browser HTTP redirects are followed by the UXP fetch implementation; the final URL is checked to be HTTP(S). Some sites require cookies, block CORS/UXP fetch, or return thumbnails instead of source images; these cannot be bypassed without a server or credentials.
- Images kept in the plugin data folder **may be removed on plugin uninstall or clearing UXP data**. For long-lived Premiere projects, choose an ordinary permanent Windows folder in Settings and back it up with your project.

## Premiere API implementation and limitations

The official 25.6+ `premierepro` module is isolated in `premiere.js`: `Project.getActiveProject`, `project.getActiveSequence`, `project.getRootItem`, `FolderItem.createBinAction`, `project.importFiles`, `sequence.getPlayerPosition`, `SequenceEditor.getEditor`, `SequenceEditor.createInsertProjectItemAction`, `VideoTrack.getTrackItems`, `VideoClipTrackItem.createSetEndAction`, and Motion's `ComponentParam.createSetValueAction`. Actions are created within `project.lockedAccess` and committed via `project.executeTransaction` to support Undo.

- **Safety first:** Premiere's official *insert* action ripples subsequent clips; *overwrite* could replace existing content. ImageDropper rejects insertion if the selected video track already has clips at or after the playhead, rather than silently moving/deleting existing clips. Select a free track or move the playhead beyond that track's end. Inserting a new higher-numbered track may create that track. This guard cannot guarantee that other Premiere edit states (such as source-patching or linked audio) will not influence Premiere's own insertion behavior; verify on a test project before using production timelines.
- Length is set on each newly created **timeline clip**, not on its source Project Item, so reinserting cached images does not change existing clips. Durations are rounded by Premiere to sequence frames; a 0.1-second request in a low-frame-rate sequence may become a few frames. Exact frame precision depends on Premiere's sequence timebase.
- Fit and Fill set *uniform* Motion Scale on the newly inserted clip using image header dimensions and `sequence.getFrameSize`; they do not distort the source. A localized/nonstandard Motion component may not expose the English `Scale` parameter: the panel shows an explicit error rather than claiming scale succeeded. Sequences with nonsquare pixel aspect ratios or nondefault Premiere media-scaling preferences can require a manual adjustment. Project Panel Only leaves scale unchanged because no timeline clip exists yet.
- Although WEBP is accepted and validated, actual WEBP import relies on **Premiere's installed codec**; an unsupported codec will produce an import error rather than pretending success.
- Google Images sometimes supplies only an HTML preview, a results page, a `data:` thumbnail, or no usable drag MIME payload. The manual URL and file picker are deliberate fallbacks. Clipboard image bytes are used only when the UXP host exposes a binary payload compatible with `ArrayBuffer`/`Blob`; otherwise use the URL or file picker.
- Batch operations are best-effort. Each failed image is reported; images already saved/imported are retained. Insertion, duration and scale are distinct undoable actions, not one atomic batch transaction.

## Source layout

`manifest.json` — plugin metadata and permissions; `index.html` / `styles.css` — dockable panel; `index.js` — UI controller and import queue; `dragdrop.js` — drop and clipboard MIME extraction; `downloader.js` — network validation and safe download; `storage.js` — UXP files, settings and duplicate cache; `premiere.js` — host API and sequence safety; `utils.js` — URL, signature, filename and duration validation.

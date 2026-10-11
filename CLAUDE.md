# Squish

Squishy local file conversion in the browser. Drop a file, pick a format, get
it back. Nothing leaves the device. Single-page app, vanilla JS, no framework,
no build step.

Project style: no em-dashes in any written content, including UI copy and
docs. Docs follow the Google developer documentation style guide.

## Status

Released as 1.0.0 on 2026-10-11 (see `CHANGELOG.md`). Every `available`
converter has a real engine.

| Engine | Conversions | Implementation |
| --- | --- | --- |
| `raster` | png/jpg/webp/bmp/gif to png/jpg/webp | canvas, in core |
| `svgRaster` | svg to png/jpg/webp | canvas, in core |
| `svgDxf` | svg to dxf | in core, splines or polylines |
| `pdfRaster` | pdf to png/jpg (zip for several pages) | pdf.js, `squish-engines.js` |
| `docs` | md/txt/html/rtf to pdf/docx/html/md/txt | block model in core; marked, docx, pdf-lib in engines |
| `pdfDocx` | pdf to docx | pdf.js text layer, `pdfTextToBlocks` in core |
| `ffmpeg` | video to mp4/webm/gif/mp3; audio to mp3/wav/m4a/flac/ogg | ffmpeg.wasm, core from unpkg |

Engine signature: `(file, opts, onProgress(fraction, label?), toExt) => Promise<Blob | {blob, name}>`.
Returning `{blob, name}` overrides the download name (the multi-page zip uses
it). `onProgress` labels show up under the progress bar.

## Files

| File | Purpose |
| --- | --- |
| `squish.html` | The app. Styles plus UI script inline; loads `squish-core.js` then `squish-engines.js` with plain `<script src>` tags. |
| `squish-core.js` | Format library, converter registry, option schemas, the three canvas/DXF engines, and every pure helper the heavy engines need (page ranges, zip writer, block model, RTF reader, PDF text grouping, ffmpeg argument builder). UMD-ish IIFE: sets `globalThis.SquishCore` and `module.exports`. No DOM access at load time so Node can `require` it. |
| `squish-engines.js` | Browser only. Lazy-imports the vendored libraries and replaces the four placeholder engines on `SquishCore.ENGINES`. Also holds `blocksFromHtml` (DOMParser), the docx writer, and the pdf writer. |
| `vendor/` | Pinned ESM builds of pdfjs-dist, marked, docx, pdf-lib, @ffmpeg/ffmpeg, @ffmpeg/util. See `vendor/VERSIONS.md`. Re-download with `npm run vendor`. |
| `scripts/serve.cjs` | Dependency-free static server (`npm run serve`, port 8788) with correct MIME types for `.mjs` and `.wasm`. |
| `scripts/vendor.sh` | Downloads the pinned libraries from unpkg. |
| `scripts/make-fixtures.cjs` | Regenerates `fixtures/` (two-page PDF, 1 s wav and mp4, md, html, rtf, txt). |
| `squish.test.cjs` | Node suite for the pure logic (`npm test`). 166 passing. Also checks for em-dashes, the stated ffmpeg size, and exact dev-dependency pins. |
| `scripts/serve.test.cjs` | Checks the dev server refuses paths outside the repo. Runs as part of `npm test`. |
| `squish-tests.html` | Browser runner that does real conversions through every engine. Add `?ffmpeg=1` to include the ffmpeg group (downloads the 31 MB core). |
| `tests/e2e/conversions.spec.js` | Playwright (`npm run test:e2e`): asserts the browser runner is green and drives `squish.html` for pdf, md, wav, and two failure cases. |
| `.github/workflows/test.yml` | CI: `npm test` and the Playwright suite on every push to `main` and every pull request. |
| `CHANGELOG.md` | Release notes. Add an entry for every release. |

## Architecture

`squish-core.js` stays free of browser-only library code so the Node tests
keep working. `squish-engines.js` loads after core and overwrites the four
placeholder entries on `SquishCore.ENGINES`. Until it loads, those
placeholders reject with "squish-engines.js is not loaded".

### Lazy library loading

`loadLib(name, onP)` in engines.js does a dynamic `import()` of the vendored
ESM build (paths are relative to the page URL, so the app and `vendor/` must
be deployed side by side). Each library loads once per page. The ffmpeg
wasm core is the exception: it is 31 MB, which exceeds the static asset
limit of 25 MiB per file on the intended host, so it is fetched from
`https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/` as blob URLs with a
download progress label.

Pinned versions: pdfjs-dist 4.10.38, marked 15.0.12, docx 9.5.1, pdf-lib
1.17.1, @ffmpeg/ffmpeg 0.12.15, @ffmpeg/util 0.12.2, @ffmpeg/core 0.12.10.

Gotchas learned the hard way:

- pdf.js `page.render` with the default display intent schedules work with
  `requestAnimationFrame`, which never fires in a hidden tab. Engines render
  with `intent: "print"` so background tabs and headless browsers finish.
- The app's own progress loop also uses `requestAnimationFrame`. A user who
  switches tabs mid-conversion sees the result when they come back.
- `@ffmpeg/ffmpeg`'s ESM `classes.js` imports `./utils.js` as well as the
  obvious files; all of `index, classes, const, errors, types, utils, worker`
  must be vendored or the dynamic import 404s.
- pdf-lib writes pages inside compressed object streams, so do not grep
  generated PDFs for `/Type /Page`; parse them with pdf.js instead.

### Engine by engine

**pdfRaster (pdf to png/jpg).** pdf.js renders each page to a canvas at
`dpi/72`, honoring the `pages` option (`parsePageRange`, ranges like
`1-3, 5`, blank means all). One page returns one image. Several pages return
a store-only zip (`zipStore` in core, no dependency) named `<base>.zip` with
`<base>-p01.png` entries. A range that matches nothing throws
"No pages matched".

**docs (documents).** Source is parsed into a block model
`[{type: h1|h2|h3|p|li|ol|code|quote|hr, runs: [{text, b, i, code, href}]}]`:
md via marked to HTML then `blocksFromHtml` (DOMParser); html via
`blocksFromHtml`; txt via `blocksFromText` (paragraphs on blank lines); rtf
via `rtfToBlocks` (`\par`, `\b`, `\i`, `\'xx`, `\uN`, nested and `\*`
groups). Emitters: `blocksToHtml`, `blocksToMd`, `blocksToTxt` in core;
`blocksToDocx` (docx library, real headings, bullets, numbering, hyperlinks)
and `blocksToPdf` (pdf-lib, Letter, 72 pt margins, Helvetica family plus
Courier, word wrap that also splits words wider than the column, page
breaks) in engines. `pdfSafeText` in core maps text to what the standard
fonts can draw: accented letters fall back to their base letter, anything
else becomes `?`. Links pass through `safeHref`, which keeps only http(s),
mailto, relative, and anchor links. Images in md or html input become an
`[image: alt]` placeholder.

**pdfDocx (pdf to docx).** pdf.js `getTextContent()` per page, then
`pdfTextToBlocks` in core groups items into lines by y, lines into paragraphs
by vertical gap, and flags headings by font size relative to the body median.
The result feeds `blocksToDocx`. A PDF with no text layer throws the
scanned-pages message. The pre-conversion image-based warning
(`detectImagePdf`) in the UI is unchanged.

**ffmpeg (video and audio).** `ffmpegArgs(fromExt, toExt, opts, inName,
outName)` in core builds the argument list: `target` to CRF (balanced 23,
small 28, quality 18), `resolution` to `scale=-2:H`, explicit `bitrate`,
`fps`, `trim` (`-ss`/`-t`; `parseTrim` accepts seconds, `m:ss`, or
`h:mm:ss`, and the engine rejects anything else up front with `trimError`), gif via the single-pass
`split/palettegen/paletteuse` graph, audio `quality` to a bitrate ladder,
`samplerate`, `channels`. The engine keeps one `FFmpeg` instance per page,
writes the input to the ffmpeg FS, runs, reads the output, and deletes both
files. If `exec` rejects, the wasm runtime is dead, so the engine terminates
that instance and the next conversion loads a fresh one. ffmpeg `progress` events drive the bar with a "converting on your
device" label.

### UI

Done. Engines report `onProgress(fraction, label)`, the UI follows real
progress after the paced minimum, labels replace the generic phrases, and a
failure shows "hmm, that didn't work" with the engine's own message (or a
friendlier one for network and memory errors). The vote button keeps a local
tally only.

## Testing

- `npm test` runs `squish.test.cjs`. Keep it green and add tests for every
  new pure function.
- `npm run test:e2e` runs Playwright against `scripts/serve.cjs` (it starts
  the server itself). The first test opens `squish-tests.html?ffmpeg=1` and
  fails on any red row or uncaught page error; the others drive the app.
- When a change touches the browser-only code, also open
  `squish-tests.html` in a real browser at least once.

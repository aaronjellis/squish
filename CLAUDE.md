# Squish

Squishy local file conversion in the browser. Drop a file, pick a format, get
it back. Nothing leaves the device. Single-page app, vanilla JS, no framework,
no build step.

Project style: no em-dashes in any written content, including UI copy and
docs. Docs follow the Google developer documentation style guide.

## Status

Released as 1.1.0 on 2026-10-12 (see `CHANGELOG.md`). Every `available`
converter has a real engine, and every format in the picker is used by one.

| Engine | Conversions | Implementation |
| --- | --- | --- |
| `raster` | png/jpg/webp/bmp/gif/avif/ico to png/jpg/webp/ico/jxl | canvas plus an in-house ICO writer, in core; jxl output through `canvasToJxl` in engines |
| `svgRaster` | svg to png/jpg/webp/jxl | canvas, in core |
| `svgDxf` | svg to dxf | geometry in core (`shapesToDxf`: paths, lines, rects, circles, ellipses, polygons, arcs, transforms); DOM walk in engines |
| `imageDecode` | heic/heif/tiff/tif/psd/jxl to png/jpg/webp/jxl | libheif-js, UTIF, ag-psd, jSquash JXL (libjxl wasm) in engines; jxl tries the browser's native decoder first |
| `data` | csv to json, json to csv | in core |
| `mesh` | stl/obj/3mf to stl/obj/3mf | in core (binary STL, OBJ, 3MF with a zip reader that inflates) |
| `pdfPptx` | pdf to pptx | pdf.js pages as picture slides via pptxgenjs |
| `pdfRaster` | pdf to png/jpg (zip for several pages) | pdf.js, `squish-engines.js` |
| `docs` | md/txt/html/rtf to pdf/docx/epub/html/md/txt | block model v2 in core (nested lists, underline, tables); marked, docx, pdf-lib, fontkit plus DejaVu in engines |
| `pdfDocx` | pdf to docx | pdf.js text layer, `pdfTextToBlocks` in core |
| `ffmpeg` | video to mp4/webm/mov/gif/mp3/m4a; audio to mp3/wav/m4a/flac/ogg/opus/aac | ffmpeg.wasm, core from unpkg |

Engine signature: `(file, opts, onProgress(fraction, label?), toExt) => Promise<Blob | {blob, name}>`.
`opts.signal` is an optional `AbortSignal`; engines call `throwIfAborted` between
steps and the Cancel button aborts it.
Returning `{blob, name}` overrides the download name (the multi-page zip uses
it). `onProgress` labels show up under the progress bar.

## Files

| File | Purpose |
| --- | --- |
| `squish.html` | The app. Styles plus UI script inline; loads `squish-core.js` then `squish-engines.js` with plain `<script src>` tags. |
| `squish-core.js` | Format library, converter registry, option schemas, the three canvas/DXF engines, and every pure helper the heavy engines need (page ranges, zip writer, block model, RTF reader, PDF text grouping, ffmpeg argument builder). UMD-ish IIFE: sets `globalThis.SquishCore` and `module.exports`. No DOM access at load time so Node can `require` it. |
| `squish-engines.js` | Browser only. Lazy-imports the vendored libraries and replaces the four placeholder engines on `SquishCore.ENGINES`. Also holds `blocksFromHtml` (DOMParser), the docx writer, and the pdf writer. |
| `vendor/` | Pinned ESM builds of pdfjs-dist, marked, docx, pdf-lib, @ffmpeg/ffmpeg, @ffmpeg/util, and the @jsquash/jxl codec builds. See `vendor/VERSIONS.md`. Re-download with `npm run vendor`. |
| `scripts/serve.cjs` | Dependency-free static server (`npm run serve`, port 8788) with correct MIME types for `.mjs` and `.wasm`. |
| `scripts/vendor.sh` | Downloads the pinned libraries from unpkg. |
| `scripts/make-fixtures.cjs` | Regenerates `fixtures/` (two-page PDF, 1 s wav and mp4, md, html, rtf, txt, the 48 by 32 test image as png, heic, tiff, psd, and a lossless jxl). |
| `squish.test.cjs` | Node suite for the pure logic (`npm test`). 289 passing. Also checks for em-dashes, the stated ffmpeg size, and exact dev-dependency pins. |
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

Pinned versions are listed in `vendor/VERSIONS.md` with licenses. UMD builds
(fontkit, UTIF, ag-psd, pptxgenjs) load through a script tag (`kind: "script"`
in `LIBS`); the rest are ESM `import()`s. The DejaVu fonts (3 MB) load only
when a PDF needs characters outside WinAnsi; characters no font covers (emoji,
CJK) are drawn by the browser with the system font and embedded as images.

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
- `page.getTextContent()` items that share a baseline are merged into one
  line, so two-column detection runs on items first (`splitColumns`), then
  lines are built per column.
- Node's small-ICU `TextDecoder` leaves Windows-1252 bytes 0x80 to 0x9F as
  control characters; `decodeText` maps them by hand (`CP1252`).
- libheif-js's default export is an async factory; call it once and cache.
- The jSquash JXL glue files are Emscripten factories that locate their
  `.wasm` with `import.meta.url`, so they work with a plain `import()` and
  no bundler. Pass `wasmBinary` to run them in Node (the fixture script does).
- The jSquash encoder is synchronous and blocks the main thread. Effort 4 is
  the compromise; 7 (the library default) takes several times longer.
- The harness that drives these sessions turns typed `\\uXXXX` into the
  character. Build such escapes with `String.fromCharCode` instead.

### Engine by engine

**jxl (JPEG XL in and out).** Reading: `decodeToCanvas` checks the signature
(`isJxl` in core: bare codestream `FF 0A` or the ISOBMFF container), tries
`createImageBitmap` so browsers with native JPEG XL (Safari 17, Chrome 155,
recent Firefox) skip the download, and otherwise loads the jSquash decoder
(850 KB wasm, 315 KB gzipped) through `jxlDecode`. Writing: the raster,
svgRaster, and imageDecode engines hand their canvas to `canvasToJxl` in
engines, which refuses anything over `JXL_MAX_PIXELS` (16 megapixels,
`jxlSizeError`), loads the single-thread jSquash encoder (1.4 MB wasm, 514 KB
gzipped), and encodes with `jxlEncodeOptions` from core: effort 4, the quality
slider, or lossless modular mode when the **Lossless** checkbox is on. The
multi-thread encoder builds are not vendored because they need
SharedArrayBuffer and cross-origin isolation headers. Options can carry
`targets: ["jxl"]`; `optionsFor(conv, to)` filters them and the UI only
renders the matches. The `check` option type (a styled checkbox) and
`disables: ["quality"]` (dims the named option while checked) were added for
this.

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
tally and, when `<html data-vote-endpoint="…">` is set by the host, POSTs
`{from, to, page}` there and GETs `{votes: [{from, to, count}]}` for the
requested-formats panel (`#statsDlg`, a `<dialog>`). `summarizeVotes` in core
merges server totals with the local tally.

## Testing

- `npm test` runs `squish.test.cjs`. Keep it green and add tests for every
  new pure function.
- `npm run test:e2e` runs Playwright against `scripts/serve.cjs` (it starts
  the server itself). The first test opens `squish-tests.html?ffmpeg=1` and
  fails on any red row or uncaught page error; the others drive the app.
- When a change touches the browser-only code, also open
  `squish-tests.html` in a real browser at least once.

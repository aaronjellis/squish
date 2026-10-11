# Squish

Squishy local file conversion in the browser. Drop a file, pick a format,
get it back. Nothing leaves your device.

## Run it

```bash
npm run serve
```

Then open `http://localhost:8788/squish.html`. Opening `squish.html` from
disk also works for images and SVG, but the document, PDF, and media engines
need an http origin because they load modules from `vendor/`.

## What it converts

| From | To | Engine |
| --- | --- | --- |
| png, jpg, webp, bmp, gif | png, jpg, webp | canvas |
| svg | png, jpg, webp | canvas |
| svg | dxf | in-house emitter (splines or polylines) |
| pdf | png, jpg | pdf.js |
| pdf | docx | pdf.js text layer plus docx |
| md, txt, html, rtf | pdf, docx, html, md, txt | marked, docx, pdf-lib |
| mp4, mov, webm, avi, mkv | mp4, webm, gif, mp3 | ffmpeg.wasm |
| mp3, wav, m4a, flac, ogg, aac | mp3, wav, m4a, flac, ogg | ffmpeg.wasm |

## Privacy

Squish reads and converts files inside your browser tab. Your files are never
uploaded.

The app makes two kinds of network request:

- Its own files: the page, its scripts, and the libraries in `vendor/`.
- A one-time download of the ffmpeg engine (31 MB) from unpkg.com, the first
  time you convert video or audio.

The format request button keeps its tally in your browser's local storage.

## Known limits

- PDF output uses the standard PDF fonts. Emoji and non-Latin scripts show
  as `?`.
- PDF to Word needs real, selectable text. Squish does not do OCR.
- Very large videos can run out of memory in a browser tab.

## Deploy it

Squish is static files with no build step. To deploy it, serve these from the
same folder over http or https:

- `squish.html`
- `squish-core.js`
- `squish-engines.js`
- `vendor/`

No special headers are needed. The single-threaded ffmpeg build works without
cross-origin isolation.

## Test it

```bash
npm test                 # Node suite for the pure logic, plus the dev server
npm run test:e2e         # Playwright: real conversions in headless Chromium
```

`squish-tests.html` is the browser runner the end-to-end suite drives. To
include the ffmpeg tests, open it with `?ffmpeg=1`.

## Fixtures and vendored code

```bash
npm run fixtures         # regenerate fixtures/ (needs ffmpeg for the mp4)
npm run vendor           # re-download the pinned libraries
```

## License

MIT. See `LICENSE`.

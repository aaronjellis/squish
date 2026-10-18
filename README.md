# Squish

Squishy local file conversion in the browser. Drop a file, pick a format,
get it back. Nothing leaves your device.

## Run it

```bash
npm run serve
```

Then open `http://localhost:8788/squish.html`. Opening `squish.html` from
disk also works for images and SVG, but the document, PDF, media, and other
library-backed engines need an http origin because they load modules from
`vendor/`.

## What it converts

| From | To | Engine |
| --- | --- | --- |
| png, jpg, webp, bmp, gif, avif, ico | png, jpg, webp, ico, jxl | canvas; libjxl (wasm) for jxl, and a lossless JPEG repack for jpg to jxl |
| heic, tiff, psd, jxl | png, jpg, webp, jxl | libheif, UTIF, ag-psd, libjxl (wasm); a jxl made from a JPEG restores that JPEG byte for byte |
| svg | png, jpg, webp, jxl | canvas; libjxl (wasm) for jxl |
| svg | dxf | in-house emitter (true splines, shapes, arcs, transforms) |
| pdf | png, jpg | pdf.js |
| pdf | docx | pdf.js text layer plus docx |
| pdf | pptx | pdf.js pages as picture slides |
| md, txt, html, rtf | pdf, docx, epub, html, md, txt | marked, docx, pdf-lib, in-house EPUB |
| csv | json | in-house |
| json | csv | in-house |
| stl, obj, 3mf | stl, obj, 3mf | in-house |
| mp4, mov, webm, avi, mkv | mp4, webm, mov, gif, mp3, m4a | ffmpeg.wasm |
| mp3, wav, m4a, flac, ogg, aac, opus | mp3, wav, m4a, flac, ogg, opus, aac | ffmpeg.wasm |

Documents keep headings, bold, italics, underline, links, nested lists,
tables, quotes, and code blocks. PDFs embed a Unicode font when the text
needs one. Emoji and other characters no font covers are drawn with your
system font, so they look the way they do on your screen.

## Privacy

Squish reads and converts files inside your browser tab. Your files are never
uploaded.

The app makes two kinds of network request:

- Its own files: the page, its scripts, the libraries, and the fonts in
  `vendor/`, each fetched only when a conversion needs it.
- A one-time download of the ffmpeg engine (31 MB) from unpkg.com, the first
  time you convert video or audio.

The format request button keeps its tally in your browser's local storage,
and the **view requested formats** link shows it in the app. A host that wants
to collect votes sets `data-vote-endpoint` on the `<html>` element; the app
then posts each vote (the two format names, nothing else) there and reads
totals from it. Every conversion has a Cancel button.

## Known limits

- AVIF can be read but not written. Browsers don't expose an AVIF encoder.
- JPEG XL output is capped at 16 megapixels, the most the wasm encoder
  handles in a browser tab. Resize larger images first. The reversible
  JPEG repack has no such cap because it never touches pixels.
- The reversible JPEG repack refuses arithmetic-coded, 12-bit, and CMYK
  JPEGs. Turn the option off to convert those the normal way. Very small
  JPEGs can come out slightly larger because of the container overhead.
- PDF to Word and PDF to PowerPoint need real, selectable text. Squish does
  not do OCR. Slides are pictures of the pages, not editable text.
- Characters no bundled font covers (emoji, CJK) are pictures in PDF
  output, so they aren't searchable there.
- Mesh conversion is mesh to mesh. Colors, materials, textures, and
  separate parts are merged or dropped.
- Very large videos can run out of memory in a browser tab.

## Deploy it

Squish is static files with no build step. To deploy it, serve these from the
same folder over http or https:

- `squish.html`
- `squish-core.js`
- `squish-engines.js`
- `vendor/`

No special headers are needed. The single-threaded ffmpeg build works without
cross-origin isolation. Library licenses are listed in `vendor/VERSIONS.md`
and shipped next to each library.

## Test it

```bash
npm test                 # Node suite for the pure logic, plus the dev server
npm run test:e2e         # Playwright: real conversions in headless Chromium
```

`squish-tests.html` is the browser runner the end-to-end suite drives. To
include the ffmpeg tests, open it with `?ffmpeg=1`.

## Fixtures and vendored code

```bash
npm run fixtures         # regenerate fixtures/ (needs ffmpeg and macOS sips for some)
npm run vendor           # re-download the pinned libraries and fonts
```

## License

MIT. See `LICENSE`. Vendored libraries keep their own licenses, including
libheif (LGPL-3.0, used unmodified as a separate file).

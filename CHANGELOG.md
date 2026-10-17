# Changelog

## Unreleased

### Added

- JPEG XL in both directions. A `.jxl` file converts to PNG, JPG, or WebP,
  using the browser's own decoder when it has one and a 300 KB wasm decoder
  otherwise. Any image or SVG converts to `.jxl` through a 500 KB wasm
  encoder, with the quality slider or a new **Lossless** checkbox.
- The JPEG XL encoder runs in a Web Worker, so the page keeps animating
  during a long encode and **Cancel** stops it at once.

## 1.1.0 (2026-10-12)

Every format in the picker now does something, and the finished engines fill
the gaps found in 1.0.0.

### Added

- HEIC, TIFF, and PSD input, flattened to PNG, JPG, or WebP.
- AVIF and ICO input, and ICO output with sizes from 16 to 256 px.
- CSV to JSON and JSON to CSV.
- EPUB output from Markdown, text, HTML, and RTF.
- STL, OBJ, and 3MF mesh conversion, including deflated 3MF files from
  slicers.
- PDF to PowerPoint, one picture slide per page.
- MOV and M4A from video; Opus and AAC from audio.
- Nested lists, underline, and tables in every document format.
- Unicode text in PDFs: a DejaVu font is embedded (and subset) when the text
  needs it. Emoji and other characters no font covers are drawn with your
  system font and embedded as pictures.
- SVG to DXF reads rect, circle, ellipse, polygon, and polyline elements,
  turns arcs into true curves, and applies group transforms.
- A Cancel button for every conversion, including ffmpeg mid-run.
- Two-column PDFs are read in column order when converting to Word.
- Text files in Windows-1252 or UTF-16 are decoded correctly.

### Changed

- PDF to Excel is no longer listed. It was never going to be good.

### Known limits

- AVIF can be read but not written.
- Characters no bundled font covers are pictures in PDF output.
- Mesh conversion drops colors, materials, textures, and part structure.
- DWG and STEP remain on the request list.

## 1.0.0 (2026-10-11)

First public release. Every conversion Squish offers now runs for real, in
the browser, with nothing uploaded.

### Added

- PDF to PNG or JPG with pdf.js. Pick the sharpness and the pages. Several
  pages download as one zip.
- Document conversion between Markdown, plain text, HTML, RTF, Word, and PDF.
  Headings, bold, italics, links, lists, quotes, and code blocks carry over.
- PDF to Word for PDFs with a text layer, with headings detected from font
  size.
- Video to MP4, WebM, GIF, or MP3, and audio to MP3, WAV, M4A, FLAC, or OGG,
  with ffmpeg.wasm. Options cover quality, resolution, bitrate, frame rate,
  trim, sample rate, and channels.
- Progress labels that say what is happening, including the one-time video
  engine download.
- A failure screen that explains what went wrong in plain language.
- A Node test suite, a browser test runner, Playwright end-to-end tests, and
  GitHub Actions CI.

### Changed

- The format request button keeps its tally in your browser only. It no
  longer posts anywhere.

### Known limits

- PDF output uses the standard PDF fonts, so emoji and non-Latin scripts
  show as `?`. Accented Latin letters fall back to their base letter when the
  font lacks them.
- PDF to Word needs real, selectable text. Squish does not do OCR.
- Video conversion speed depends on your device. Very large videos can run
  out of memory in a browser tab.

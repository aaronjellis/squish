# Changelog

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

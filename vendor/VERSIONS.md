# Vendored libraries

Downloaded by `scripts/vendor.sh` from unpkg. Do not edit by hand.

| Library | Version | Files |
| --- | --- | --- |
| pdfjs-dist | 4.10.38 | pdfjs/pdf.min.mjs, pdfjs/pdf.worker.min.mjs |
| marked | 15.0.12 | marked/marked.esm.js |
| docx | 9.5.1 | docx/index.mjs |
| pdf-lib | 1.17.1 | pdf-lib/pdf-lib.esm.min.js |
| @ffmpeg/ffmpeg | 0.12.15 | ffmpeg/*.js |
| @ffmpeg/util | 0.12.2 | ffmpeg-util/*.js |

The ffmpeg wasm core (@ffmpeg/core 0.12.10, 31 MB) is not vendored. It loads
from unpkg at runtime because the host caps static files at 25 MiB.

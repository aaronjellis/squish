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
| @pdf-lib/fontkit | 1.1.1 | fontkit/fontkit.umd.min.js (MIT) |
| libheif-js | 1.23.5 | libheif/libheif-bundle.mjs (LGPL-3.0, used unmodified as a separate file; see libheif/LICENSE) |
| utif | 3.1.0 | utif/UTIF.js (MIT) |
| ag-psd | 31.0.3 | ag-psd/bundle.js (MIT) |
| pptxgenjs | 4.0.1 | pptxgenjs/pptxgen.bundle.js (MIT) |
| dejavu-fonts-ttf | 2.37 | dejavu/*.ttf (Bitstream Vera license, see dejavu/LICENSE). Loaded only when a PDF needs characters outside WinAnsi. |

The ffmpeg wasm core (@ffmpeg/core 0.12.10, 31 MB) is not vendored. It loads
from unpkg at runtime because the host caps static files at 25 MiB.

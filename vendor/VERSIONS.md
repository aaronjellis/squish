# Vendored libraries

Downloaded by `scripts/vendor.sh` from unpkg, except the JPEG transcoder, which
`.github/workflows/build-jxl-transcode.yml` builds from pinned sources. Do not
edit by hand.

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
| @jsquash/jxl | 1.3.0 | jsquash-jxl/codec/dec/jxl_dec.{js,wasm}, jsquash-jxl/codec/enc/jxl_enc.{js,wasm} (Apache-2.0, libjxl compiled to wasm; single-thread encoder only) |
| jpeg-to-jxl glue | 0.2.0 | jpeg-to-jxl/dist/transcode.{js,wasm} (BSD-3-Clause, see jpeg-to-jxl/LICENSE; libjxl JPEG transcoding and reconstruction, single thread). Built by the workflow from libjxl v0.12.0 with emsdk 3.1.51 and wasm-opt -Oz, sources in scripts/jxl-transcode/. transcode.wasm is 2726933 bytes, sha256 e78b7fcf31f94d7cfa720121ab683ba644e37aed48ba5a9f94e088162d044399. |
| dejavu-fonts-ttf | 2.37 | dejavu/*.ttf (Bitstream Vera license, see dejavu/LICENSE). Loaded only when a PDF needs characters outside WinAnsi. |

The ffmpeg wasm core (@ffmpeg/core 0.12.10, 31 MB) is not vendored. It loads
from unpkg at runtime because the host caps static files at 25 MiB.

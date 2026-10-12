#!/usr/bin/env bash
# Downloads the pinned browser builds into vendor/. Re-run after changing a pin.
set -euo pipefail
cd "$(dirname "$0")/.."
PDFJS=4.10.38; MARKED=15.0.12; DOCX=9.5.1; PDFLIB=1.17.1; FFMPEG=0.12.15; FFUTIL=0.12.2
FONTKIT=1.1.1; DEJAVU=2.37
LIBHEIF=1.23.5; UTIF=3.1.0; AGPSD=31.0.3
get() { mkdir -p "vendor/$2"; curl -fsSL "https://unpkg.com/$1" -o "vendor/$2/$3" && echo "vendor/$2/$3"; }
get "pdfjs-dist@$PDFJS/build/pdf.min.mjs"          pdfjs   pdf.min.mjs
get "pdfjs-dist@$PDFJS/build/pdf.worker.min.mjs"   pdfjs   pdf.worker.min.mjs
get "marked@$MARKED/lib/marked.esm.js"             marked  marked.esm.js
get "docx@$DOCX/dist/index.mjs"                    docx    index.mjs
get "pdf-lib@$PDFLIB/dist/pdf-lib.esm.min.js"      pdf-lib pdf-lib.esm.min.js
for f in index classes const errors types utils worker; do
  get "@ffmpeg/ffmpeg@$FFMPEG/dist/esm/$f.js" ffmpeg "$f.js"
done
for f in index const errors types; do
  get "@ffmpeg/util@$FFUTIL/dist/esm/$f.js" ffmpeg-util "$f.js"
done
get "@pdf-lib/fontkit@$FONTKIT/dist/fontkit.umd.min.js" fontkit fontkit.umd.min.js
# fontkit ships no license file in the npm package; this is its MIT text.
cat > vendor/fontkit/LICENSE <<LIC
MIT License

Copyright (c) 2014 Devon Govett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
LIC
echo "vendor/fontkit/LICENSE"
for f in DejaVuSans DejaVuSans-Bold DejaVuSans-Oblique DejaVuSans-BoldOblique DejaVuSansMono; do
  get "dejavu-fonts-ttf@$DEJAVU/ttf/$f.ttf" dejavu "$f.ttf"
done
get "dejavu-fonts-ttf@$DEJAVU/LICENSE" dejavu LICENSE
get "libheif-js@$LIBHEIF/libheif-wasm/libheif-bundle.mjs" libheif libheif-bundle.mjs
get "libheif-js@$LIBHEIF/LICENSE" libheif LICENSE
get "utif@$UTIF/UTIF.js" utif UTIF.js
get "utif@$UTIF/LICENSE" utif LICENSE
get "ag-psd@$AGPSD/dist/bundle.js" ag-psd bundle.js
get "ag-psd@$AGPSD/LICENSE" ag-psd LICENSE
cat > vendor/VERSIONS.md <<MD
# Vendored libraries

Downloaded by \`scripts/vendor.sh\` from unpkg. Do not edit by hand.

| Library | Version | Files |
| --- | --- | --- |
| pdfjs-dist | $PDFJS | pdfjs/pdf.min.mjs, pdfjs/pdf.worker.min.mjs |
| marked | $MARKED | marked/marked.esm.js |
| docx | $DOCX | docx/index.mjs |
| pdf-lib | $PDFLIB | pdf-lib/pdf-lib.esm.min.js |
| @ffmpeg/ffmpeg | $FFMPEG | ffmpeg/*.js |
| @ffmpeg/util | $FFUTIL | ffmpeg-util/*.js |
| @pdf-lib/fontkit | $FONTKIT | fontkit/fontkit.umd.min.js (MIT) |
| libheif-js | $LIBHEIF | libheif/libheif-bundle.mjs (LGPL-3.0, used unmodified as a separate file; see libheif/LICENSE) |
| utif | $UTIF | utif/UTIF.js (MIT) |
| ag-psd | $AGPSD | ag-psd/bundle.js (MIT) |
| dejavu-fonts-ttf | $DEJAVU | dejavu/*.ttf (Bitstream Vera license, see dejavu/LICENSE). Loaded only when a PDF needs characters outside WinAnsi. |

The ffmpeg wasm core (@ffmpeg/core 0.12.10, 31 MB) is not vendored. It loads
from unpkg at runtime because the host caps static files at 25 MiB.
MD
echo "vendor/VERSIONS.md"

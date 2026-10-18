#!/usr/bin/env bash
# Downloads the pinned browser builds into vendor/. Re-run after changing a pin.
set -euo pipefail
cd "$(dirname "$0")/.."
PDFJS=4.10.38; MARKED=15.0.12; DOCX=9.5.1; PDFLIB=1.17.1; FFMPEG=0.12.15; FFUTIL=0.12.2
FONTKIT=1.1.1; DEJAVU=2.37
LIBHEIF=1.23.5; UTIF=3.1.0; AGPSD=31.0.3; PPTX=4.0.1; JSQJXL=1.3.0
# The JPEG transcoder is not downloaded. .github/workflows/build-jxl-transcode.yml builds it from
# libjxl at this tag with this Emscripten SDK; copy the artifact into vendor/jpeg-to-jxl/dist/ and
# update the size and hash here (see scripts/jxl-transcode/README.md).
JXL_TRANSCODE_GLUE=0.2.0; JXL_TRANSCODE_LIBJXL=v0.12.0; JXL_TRANSCODE_EMSDK=3.1.51
JXL_TRANSCODE_WASM_BYTES=2726933; JXL_TRANSCODE_WASM_SHA256=e78b7fcf31f94d7cfa720121ab683ba644e37aed48ba5a9f94e088162d044399
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
get "pptxgenjs@$PPTX/dist/pptxgen.bundle.js" pptxgenjs pptxgen.bundle.js
get "pptxgenjs@$PPTX/LICENSE" pptxgenjs LICENSE
# JPEG XL: only the decoder and the single-thread encoder. The multi-thread encoder builds need
# SharedArrayBuffer, which needs cross-origin isolation headers the host does not send.
for f in jxl_dec.js jxl_dec.wasm; do get "@jsquash/jxl@$JSQJXL/codec/dec/$f" jsquash-jxl/codec/dec "$f"; done
for f in jxl_enc.js jxl_enc.wasm; do get "@jsquash/jxl@$JSQJXL/codec/enc/$f" jsquash-jxl/codec/enc "$f"; done
get "@jsquash/jxl@$JSQJXL/LICENSE" jsquash-jxl LICENSE
# JPEG transcoding (jpg to jxl without re-encoding pixels, and back): libjxl's JxlEncoderAddJPEGFrame and
# JxlDecoderSetJPEGBuffer behind jpeg-to-jxl's C glue, compiled single thread (no SharedArrayBuffer) by
# the GitHub Actions workflow, not fetched from unpkg. This script only checks the files are present.
for f in transcode.js transcode.wasm; do
  [ -f "vendor/jpeg-to-jxl/dist/$f" ] || echo "missing vendor/jpeg-to-jxl/dist/$f: run the Build JPEG transcoder workflow" >&2
done
# jpeg-to-jxl declares BSD-3-Clause in package.json but ships no license file; this is that text. The wasm
# also contains libjxl (BSD-3-Clause), highway (Apache-2.0), brotli (MIT), Little-CMS (MIT), and libjpeg (IJG).
mkdir -p vendor/jpeg-to-jxl
cat > vendor/jpeg-to-jxl/LICENSE <<LIC
BSD 3-Clause License

Copyright (c) 2026, ChefJulio (jpeg-to-jxl)
Copyright (c) the JPEG XL Project Authors (libjxl)

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

The transcode.wasm binary also contains highway (Apache-2.0), brotli (MIT),
Little-CMS (MIT), and the Independent JPEG Group's libjpeg; their notices
apply to those parts.
LIC
echo "vendor/jpeg-to-jxl/LICENSE"
cat > vendor/VERSIONS.md <<MD
# Vendored libraries

Downloaded by \`scripts/vendor.sh\` from unpkg, except the JPEG transcoder, which
\`.github/workflows/build-jxl-transcode.yml\` builds from pinned sources. Do not
edit by hand.

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
| pptxgenjs | $PPTX | pptxgenjs/pptxgen.bundle.js (MIT) |
| @jsquash/jxl | $JSQJXL | jsquash-jxl/codec/dec/jxl_dec.{js,wasm}, jsquash-jxl/codec/enc/jxl_enc.{js,wasm} (Apache-2.0, libjxl compiled to wasm; single-thread encoder only) |
| jpeg-to-jxl glue | $JXL_TRANSCODE_GLUE | jpeg-to-jxl/dist/transcode.{js,wasm} (BSD-3-Clause, see jpeg-to-jxl/LICENSE; libjxl JPEG transcoding and reconstruction, single thread). Built by the workflow from libjxl $JXL_TRANSCODE_LIBJXL with emsdk $JXL_TRANSCODE_EMSDK and wasm-opt -Oz, sources in scripts/jxl-transcode/. transcode.wasm is $JXL_TRANSCODE_WASM_BYTES bytes, sha256 $JXL_TRANSCODE_WASM_SHA256. |
| dejavu-fonts-ttf | $DEJAVU | dejavu/*.ttf (Bitstream Vera license, see dejavu/LICENSE). Loaded only when a PDF needs characters outside WinAnsi. |

The ffmpeg wasm core (@ffmpeg/core 0.12.10, 31 MB) is not vendored. It loads
from unpkg at runtime because the host caps static files at 25 MiB.
MD
echo "vendor/VERSIONS.md"

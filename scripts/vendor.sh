#!/usr/bin/env bash
# Downloads the pinned browser builds into vendor/. Re-run after changing a pin.
set -euo pipefail
cd "$(dirname "$0")/.."
PDFJS=4.10.38; MARKED=15.0.12; DOCX=9.5.1; PDFLIB=1.17.1; FFMPEG=0.12.15; FFUTIL=0.12.2
get() { mkdir -p "vendor/$2"; curl -fsSL "https://unpkg.com/$1" -o "vendor/$2/$3"; echo "vendor/$2/$3"; }
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

The ffmpeg wasm core (@ffmpeg/core 0.12.10, 31 MB) is not vendored. It loads
from unpkg at runtime because the host caps static files at 25 MiB.
MD
echo "vendor/VERSIONS.md"

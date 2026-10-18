#!/usr/bin/env bash
# Builds the JPEG transcoder wasm (vendor/jpeg-to-jxl/dist/transcode.{js,wasm})
# from libjxl at a release tag plus the C glue in scripts/jxl-transcode/.
#
# Needs an activated Emscripten SDK (emcmake and emcc on PATH; wasm-opt comes
# from $EMSDK/upstream/bin or PATH), CMake 3.16 or newer, and git. The
# GitHub Actions workflow .github/workflows/build-jxl-transcode.yml runs it
# with emsdk pinned; see scripts/jxl-transcode/README.md for the pins.
#
# Environment:
#   LIBJXL_TAG   libjxl git tag to build (default v0.12.0)
#   WORK_DIR     scratch directory for the checkout and CMake build
#                (default build/jxl-transcode, ignored by git)
#   OUT_DIR      where transcode.js and transcode.wasm land
#                (default $WORK_DIR/dist)
set -euo pipefail
cd "$(dirname "$0")/.."

LIBJXL_TAG="${LIBJXL_TAG:-v0.12.0}"
WORK_DIR="${WORK_DIR:-build/jxl-transcode}"
OUT_DIR="${OUT_DIR:-$WORK_DIR/dist}"
SRC_DIR="$WORK_DIR/libjxl"
CMAKE_DIR="$WORK_DIR/cmake"
# Submodules libjxl's CMake needs for this configuration: highway and brotli
# for the codec, lcms because skcms is off, libpng and zlib because libjxl
# bundles libpng under Emscripten. testdata, googletest, sjpeg, and
# libjpeg-turbo are not needed.
SUBMODULES="third_party/brotli third_party/highway third_party/lcms third_party/skcms third_party/libpng third_party/zlib"

if ! command -v emcmake >/dev/null 2>&1; then
  echo "emcmake not found. Install and activate the Emscripten SDK first:" >&2
  echo "  https://emscripten.org/docs/getting_started/downloads.html" >&2
  exit 1
fi

started=$(date +%s)
echo "==> emcc $(emcc --version | head -1)"

if [ -d "$SRC_DIR/.git" ] && [ "$(git -C "$SRC_DIR" describe --tags --exact-match 2>/dev/null || true)" = "$LIBJXL_TAG" ]; then
  echo "==> Reusing libjxl $LIBJXL_TAG in $SRC_DIR"
else
  echo "==> Cloning libjxl $LIBJXL_TAG"
  rm -rf "$SRC_DIR"
  mkdir -p "$WORK_DIR"
  git clone --quiet --depth 1 --branch "$LIBJXL_TAG" https://github.com/libjxl/libjxl.git "$SRC_DIR"
  # shellcheck disable=SC2086
  git -C "$SRC_DIR" submodule update --quiet --init --depth 1 -- $SUBMODULES
fi
echo "    libjxl commit $(git -C "$SRC_DIR" rev-parse HEAD)"

echo "==> Configuring"
rm -rf "$CMAKE_DIR"
emcmake cmake -S scripts/jxl-transcode -B "$CMAKE_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DLIBJXL_DIR="$(cd "$SRC_DIR" && pwd)"

echo "==> Building"
cmake --build "$CMAKE_DIR" --parallel

mkdir -p "$OUT_DIR"
cp "$CMAKE_DIR/transcode.js" "$CMAKE_DIR/transcode.wasm" "$OUT_DIR/"

# A second wasm-opt pass on top of emcc's own shaves a few percent more. Prefer
# the Emscripten-bundled binary because it understands the features emcc emits.
WASM_OPT=""
if [ -n "${EMSDK:-}" ] && [ -x "$EMSDK/upstream/bin/wasm-opt" ]; then
  WASM_OPT="$EMSDK/upstream/bin/wasm-opt"
elif command -v wasm-opt >/dev/null 2>&1; then
  WASM_OPT="wasm-opt"
fi
if [ -z "$WASM_OPT" ]; then
  echo "wasm-opt not found; the build is not reproducible without it" >&2
  exit 1
fi
before=$(wc -c < "$OUT_DIR/transcode.wasm")
echo "==> wasm-opt -Oz ($("$WASM_OPT" --version 2>&1 | head -1))"
"$WASM_OPT" -Oz \
  --enable-bulk-memory \
  --enable-sign-ext \
  --enable-mutable-globals \
  --enable-nontrapping-float-to-int \
  "$OUT_DIR/transcode.wasm" -o "$OUT_DIR/transcode.wasm"
after=$(wc -c < "$OUT_DIR/transcode.wasm")
echo "    $before to $after bytes"

elapsed=$(( $(date +%s) - started ))
gz=$(gzip -9 -c "$OUT_DIR/transcode.wasm" | wc -c | tr -d ' ')
js=$(wc -c < "$OUT_DIR/transcode.js" | tr -d ' ')
echo
echo "==> Done in ${elapsed}s"
echo "    $OUT_DIR/transcode.wasm  $after bytes ($gz gzipped)"
echo "    $OUT_DIR/transcode.js    $js bytes"
(cd "$OUT_DIR" && shasum -a 256 transcode.js transcode.wasm)

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## JPEG transcoder build"
    echo
    echo "| | |"
    echo "| --- | --- |"
    echo "| libjxl | $LIBJXL_TAG ($(git -C "$SRC_DIR" rev-parse --short HEAD)) |"
    echo "| emcc | $(emcc --version | head -1 | sed 's/.*) //') |"
    echo "| transcode.wasm | $after bytes ($gz gzipped) |"
    echo "| transcode.js | $js bytes |"
    echo "| build time | ${elapsed}s |"
    echo
    echo '```'
    (cd "$OUT_DIR" && shasum -a 256 transcode.js transcode.wasm)
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi

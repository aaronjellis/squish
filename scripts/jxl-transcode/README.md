# JPEG transcoder build

`vendor/jpeg-to-jxl/dist/transcode.js` and `transcode.wasm` are built from
these sources, not downloaded from a package registry. The glue and CMake
file come from [jpeg-to-jxl](https://github.com/ChefJulio/jpeg-to-jxl) at
tag v0.2.0 (BSD-3-Clause, see `LICENSE`). The published 0.2.0 package was
compiled from an unpinned libjxl `main` checkout; this build pins libjxl to a
release tag so anyone can rebuild the same bytes.

## Pins

| Input | Value |
| --- | --- |
| libjxl | tag `v0.12.0`, submodules brotli, highway, lcms, skcms, libpng, zlib |
| Emscripten SDK | 3.1.51 |
| libjpeg | Emscripten's `USE_LIBJPEG=1` port |
| wasm-opt | the binaryen bundled with that emsdk, `-Oz` |

The current vendored output, its size, and its hash are recorded in
`vendor/VERSIONS.md`.

## Measurements (2026-10-18)

Two runs on `ubuntu-latest`, one from a push and one from
`workflow_dispatch`, produced byte-identical files:

| | |
| --- | --- |
| transcode.wasm | 2,726,933 bytes (1,051,675 gzipped) |
| transcode.js | 7,886 bytes, identical to the published 0.2.0 glue |
| build step | 3 min 05 s and 2 min 43 s; the whole job under 4 min |
| wasm sha256 | `e78b7fcf31f94d7cfa720121ab683ba644e37aed48ba5a9f94e088162d044399` |

The published 0.2.0 wasm was 2,723,323 bytes from a libjxl `main` snapshot
of 2026-03-26; v0.12.0 is 3.6 KB larger. The browser runner's byte-identical
round trips pass with either.

## To rebuild

Aaron's Mac has no emsdk or CMake, so the build runs in GitHub Actions:

1. Open **Actions**, pick **Build JPEG transcoder**, and run it, or run
   `gh workflow run build-jxl-transcode.yml`. The inputs default to the pins
   above. Any push that changes these sources also triggers a run.
2. Download the `jxl-transcode-libjxl-*` artifact from the run and copy
   `transcode.js` and `transcode.wasm` into `vendor/jpeg-to-jxl/dist/`.
3. Update `vendor/VERSIONS.md` with the tag, emsdk version, size, and hashes
   from the run summary, then run `npm test`, open `squish-tests.html`, and
   run `npm run test:e2e`.

To build locally with an activated emsdk:

```bash
bash scripts/build-jxl-transcode.sh
```

The script clones libjxl into `build/jxl-transcode/` (ignored by git) and
writes the output to `build/jxl-transcode/dist/`. Set `LIBJXL_TAG`,
`WORK_DIR`, or `OUT_DIR` to change those.

## Exports

`_jpeg_to_jxl`, `_jxl_to_jpeg`, `_jxl_to_jpeg_lossy`, `_jxl_free`, `_malloc`,
and `_free`, plus the `HEAPU8` and `HEAPU32` views. `squish-jxl-worker.js`
uses the first two. Single thread (`USE_PTHREADS=0`), so no
SharedArrayBuffer or cross-origin isolation headers are needed.

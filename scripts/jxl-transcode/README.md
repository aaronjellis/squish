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

The current vendored output, its size, and its hashes are recorded in
`vendor/VERSIONS.md`.

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

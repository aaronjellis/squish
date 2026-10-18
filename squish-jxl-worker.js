/* ============================================================
   SQUISH JPEG XL WORKER. Runs the libjxl wasm codecs off the
   main thread so the page stays responsive and Cancel can
   terminate a long job. Loaded by squish-engines.js as a
   module worker; the vendor paths are relative to this file, so
   deploy it next to squish.html and vendor/.
   Jobs (ev.data.kind, default "encode"):
   - encode: {id, data, width, height, options}, data is a
     transferred ArrayBuffer of RGBA bytes; the jSquash encoder.
   - transcode: {id, data}, a JPEG file; libjxl repacks its DCT
     coefficients into a JPEG XL with a jbrd box (no pixels).
   - reconstruct: {id, data}, a JPEG XL with a jbrd box; libjxl
     gives back the original JPEG byte for byte.
   Replies {id, stage} as it goes, then either {id, ok: true,
   buffer} (transferred) or {id, ok: false, stage, message}.
   ============================================================ */
let encoderReady = null, transcoderReady = null;

function loadEncoder() {
  if (!encoderReady) {
    encoderReady = import("./vendor/jsquash-jxl/codec/enc/jxl_enc.js")
      .then(mod => mod.default({ noInitialRun: true }))
      .catch(e => { encoderReady = null; throw e; });
  }
  return encoderReady;
}
function loadTranscoder() {
  if (!transcoderReady) {
    transcoderReady = import("./vendor/jpeg-to-jxl/dist/transcode.js")
      .then(mod => mod.default({}))
      .catch(e => { transcoderReady = null; throw e; });
  }
  return transcoderReady;
}

// Copies input into the wasm heap, calls fn(inPtr, len, sizePtr, ...extra), and copies the result out.
// Returns null when libjxl reported failure (fn returned a null pointer).
function callTranscoder(m, fn, input, ...extra) {
  const inPtr = m._malloc(input.length);
  if (!inPtr) throw new Error("out of memory");
  const sizePtr = m._malloc(4);
  try {
    m.HEAPU8.set(input, inPtr);
    const outPtr = fn(inPtr, input.length, sizePtr, ...extra);
    if (!outPtr) return null;
    const n = m.HEAPU32[sizePtr >> 2];
    const buffer = m.HEAPU8.slice(outPtr, outPtr + n).buffer;
    m._jxl_free(outPtr);
    return buffer;
  } finally { m._free(inPtr); m._free(sizePtr); }
}

self.onmessage = async ev => {
  const { id, data, width, height, options } = ev.data, kind = ev.data.kind || "encode";
  const fail = (stage, message) => self.postMessage({ id, ok: false, stage, message: String(message) });
  if (kind === "transcode" || kind === "reconstruct") {
    let m;
    try {
      if (!transcoderReady) self.postMessage({ id, stage: "loading" });
      m = await loadTranscoder();
    } catch (e) { fail("load", (e && e.message) || e); return; }
    self.postMessage({ id, stage: kind });
    let buffer = null;
    try {
      buffer = kind === "transcode"
        ? callTranscoder(m, m._jpeg_to_jxl, new Uint8Array(data), 3)   // effort 3: more gains almost nothing
        : callTranscoder(m, m._jxl_to_jpeg, new Uint8Array(data));
    } catch (e) { fail(kind, (e && e.message) || e); return; }
    if (!buffer || !buffer.byteLength) { fail(kind, "libjxl refused the file"); return; }
    self.postMessage({ id, ok: true, buffer }, [buffer]);
    return;
  }
  let m;
  try {
    if (!encoderReady) self.postMessage({ id, stage: "loading" });
    m = await loadEncoder();
  } catch (e) { fail("load", (e && e.message) || e); return; }
  self.postMessage({ id, stage: "encoding" });
  let out = null;
  try { out = m.encode(new Uint8ClampedArray(data), width, height, options); } catch (e) { out = null; }
  if (!out || !out.byteLength) { fail("encode", "empty result"); return; }
  // Copy out of the wasm heap into a standalone buffer that can be transferred.
  const buffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  self.postMessage({ id, ok: true, buffer }, [buffer]);
};

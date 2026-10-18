/* ============================================================
   SQUISH JPEG XL WORKER. Runs the jSquash libjxl encoder off
   the main thread so the page stays responsive and Cancel can
   terminate a long encode. Loaded by squish-engines.js as a
   module worker; the vendor path is relative to this file, so
   deploy it next to squish.html and vendor/.
   Protocol: receives {id, data, width, height, options} with
   data as a transferred ArrayBuffer of RGBA bytes. Replies
   {id, stage: "loading" | "encoding"} as it goes, then either
   {id, ok: true, buffer} (transferred) or {id, ok: false,
   stage: "load" | "encode", message}.
   ============================================================ */
let encoderReady = null;

function loadEncoder() {
  if (!encoderReady) {
    encoderReady = import("./vendor/jsquash-jxl/codec/enc/jxl_enc.js")
      .then(mod => mod.default({ noInitialRun: true }))
      .catch(e => { encoderReady = null; throw e; });
  }
  return encoderReady;
}

self.onmessage = async ev => {
  const { id, data, width, height, options } = ev.data;
  let m;
  try {
    if (!encoderReady) self.postMessage({ id, stage: "loading" });
    m = await loadEncoder();
  } catch (e) {
    self.postMessage({ id, ok: false, stage: "load", message: String((e && e.message) || e) });
    return;
  }
  self.postMessage({ id, stage: "encoding" });
  let out = null;
  try { out = m.encode(new Uint8ClampedArray(data), width, height, options); } catch (e) { out = null; }
  if (!out || !out.byteLength) {
    self.postMessage({ id, ok: false, stage: "encode", message: "empty result" });
    return;
  }
  // Copy out of the wasm heap into a standalone buffer that can be transferred.
  const buffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  self.postMessage({ id, ok: true, buffer }, [buffer]);
};

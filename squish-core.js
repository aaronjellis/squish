/* ============================================================
   SQUISH CORE. Single source of truth for the converter
   registry, format knowledge, conversion engines, and the
   SVG→DXF emitter. Loaded by:
     • squish.html         (the app UI)
     • squish-tests.html   (browser test runner, real conversions)
     • squish.test.cjs     (Node pure-logic suite)
   No DOM/document references at load time, so it can be
   required in Node. Engines that need the DOM (canvas/Image)
   only touch it when actually called (i.e. in a browser).
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- Format knowledge library ---------- */
  const FORMATS = {
    png:{name:"PNG image",cat:"image",desc:"Lossless image with transparency. Great for logos, screenshots, and crisp graphics."},
    jpg:{name:"JPEG photo",cat:"image",desc:"Compressed photo format. Best for photos where small size beats perfect detail."},
    webp:{name:"WebP image",cat:"image",desc:"Modern format with excellent compression. Smaller than PNG/JPEG. Ideal for the web."},
    avif:{name:"AVIF image",cat:"image",desc:"Next-gen image format with the best compression today. Newer, less universal."},
    jxl:{name:"JPEG XL image",cat:"image",desc:"The newest image format. Smaller than JPEG, lossless when you want it, keeps transparency. Browsers started shipping it in 2026."},
    gif:{name:"GIF",cat:"image",desc:"Short looping animations. Limited colors, perfect for reactions and memes."},
    bmp:{name:"Bitmap",cat:"image",desc:"Uncompressed raw image. Rarely needed today; very large."},
    tiff:{name:"TIFF image",cat:"image",desc:"High-quality lossless image for print and scanning. Large files."},
    heic:{name:"HEIC photo",cat:"image",desc:"Apple's efficient photo format. Lovely quality, awkward outside Apple."},
    ico:{name:"Icon",cat:"image",desc:"App and website icon file (favicons)."},
    psd:{name:"Photoshop file",cat:"image",desc:"Photoshop's layered, editable image format."},
    svg:{name:"SVG vector",cat:"vector",desc:"Scalable vector graphic. Razor-sharp at any size. Best for logos."},
    ai:{name:"Illustrator art",cat:"vector",desc:"Adobe Illustrator's native vector format. Fully editable artwork."},
    eps:{name:"EPS vector",cat:"vector",desc:"Older vector format used in print workflows."},
    pdf:{name:"PDF document",cat:"doc",desc:"Fixed-layout document that looks identical everywhere. Best for sharing & printing."},
    docx:{name:"Word document",cat:"doc",desc:"Editable text document. Use when someone needs to change the words."},
    txt:{name:"Plain text",cat:"doc",desc:"Just text, no formatting. Tiny and universal."},
    md:{name:"Markdown",cat:"doc",desc:"Lightweight text formatting. Popular for notes, docs, and READMEs."},
    html:{name:"Web page",cat:"doc",desc:"HTML. Opens in any browser."},
    rtf:{name:"Rich text",cat:"doc",desc:"Basic formatted text that opens in almost any word processor."},
    epub:{name:"EPUB e-book",cat:"doc",desc:"Reflowable e-book for e-readers and phones."},
    pptx:{name:"PowerPoint",cat:"doc",desc:"Editable slide presentation."},
    csv:{name:"CSV data",cat:"doc",desc:"Plain-text table. The universal way to move data between apps."},
    json:{name:"JSON data",cat:"doc",desc:"Structured data used by apps and APIs."},
    dxf:{name:"DXF drawing",cat:"cad",desc:"2D CAD exchange format. Best for getting line & curve geometry into Onshape or Fusion."},
    dwg:{name:"DWG drawing",cat:"cad",desc:"AutoCAD's native format. The standard for 2D/3D technical drawings."},
    step:{name:"STEP 3D model",cat:"cad",desc:"Universal 3D solid-model exchange. The go-to for sharing parts between CAD apps."},
    stp:{name:"STEP 3D model",cat:"cad",desc:"Universal 3D solid-model exchange (same as STEP)."},
    iges:{name:"IGES 3D model",cat:"cad",desc:"Older 3D CAD exchange for surfaces and solids."},
    igs:{name:"IGES 3D model",cat:"cad",desc:"Older 3D CAD exchange (same as IGES)."},
    stl:{name:"STL mesh",cat:"cad",desc:"Triangle mesh for 3D printing. Just the surface, no curves or units."},
    "3mf":{name:"3MF 3D print",cat:"cad",desc:"Modern 3D-printing format. Carries color, materials, and real units, unlike STL."},
    obj:{name:"OBJ mesh",cat:"cad",desc:"3D mesh with texture support. Common in graphics and rendering."},
    mp4:{name:"MP4 video",cat:"video",desc:"The universal video format. Best all-round choice for sharing."},
    mov:{name:"QuickTime video",cat:"video",desc:"Apple's video format. High quality, larger files."},
    webm:{name:"WebM video",cat:"video",desc:"Open web video. Small files, great in browsers."},
    mkv:{name:"Matroska video",cat:"video",desc:"Flexible container holding multiple tracks. Common for high-quality video."},
    avi:{name:"AVI video",cat:"video",desc:"Older video container. Very compatible but inefficient."},
    mp3:{name:"MP3 audio",cat:"audio",desc:"Universal compressed audio. Best for sharing music and voice."},
    wav:{name:"WAV audio",cat:"audio",desc:"Uncompressed studio-quality audio. Large files."},
    m4a:{name:"M4A audio",cat:"audio",desc:"Efficient AAC audio. Better quality than MP3 at the same size."},
    flac:{name:"FLAC audio",cat:"audio",desc:"Lossless compressed audio. Perfect quality, moderate size."},
    ogg:{name:"Ogg audio",cat:"audio",desc:"Open compressed audio format."},
    aac:{name:"AAC audio",cat:"audio",desc:"Efficient audio used by Apple and streaming."},
    opus:{name:"Opus audio",cat:"audio",desc:"Modern low-latency audio. Excellent for voice and streaming."},
    zip:{name:"ZIP archive",cat:"archive",desc:"A compressed bundle of files."},
  };
  const CAT_COLOR={image:"#ff8a7a",vector:"#ffd166",doc:"#6a9bff",cad:"#3fd6c4",video:"#b98bff",audio:"#9be072",archive:"#ff7eb6"};
  const CAT_GLYPH={image:"🖼",vector:"✒",doc:"📄",cad:"📐",video:"🎬",audio:"🎵",archive:"🗜"};

  /* ---------- Option schemas ---------- */
  const optQuality={key:"quality",label:"Quality",type:"slider",min:40,max:100,step:1,def:85,unit:"%",hint:"Higher keeps more detail and makes a bigger file."};
  const optResizeAdv={key:"resize",label:"Resize",type:"select",advanced:true,choices:[["1","Keep original size"],["0.5","50% smaller"],["0.25","25%"],["2","2× larger"]],def:"1",hint:"Scaling up can't add detail that isn't in the source."};
  function optDpiSimple(){return {key:"dpi",label:"How sharp?",type:"select",choices:[["96","For screen / sharing"],["150","Good quality"],["300","For printing"]],def:"150",hint:"Sharper looks crisper and makes a bigger file."};}
  const optLossless={key:"lossless",label:"Lossless",type:"check",def:false,targets:["jxl"],disables:["quality"],hint:"Keeps every pixel exactly. Bigger file, and the quality slider is ignored."};
  // jpg to jxl can repack the JPEG's DCT coefficients instead of decoding and re-encoding pixels (libjxl's
  // JxlEncoderAddJPEGFrame). The result is smaller, loses nothing, and converts back to the identical JPEG.
  const optTranscode={key:"transcode",label:"Keep the JPEG data exactly (reversible)",type:"check",def:true,targets:["jxl"],sources:["jpg","jpeg"],disables:["quality","lossless","resize"],
    hint:"Repacks the JPEG without re-encoding pixels. About 20% smaller, and converting back to JPG gives you the identical file."};
  // The reverse: a JPEG XL that carries a jbrd box can give back the original JPEG byte for byte. The UI sets
  // the jpegReconstruction flag after sniffing the file, so the option only appears when it can work.
  const optRestore={key:"restore",label:"Restore the original JPEG",type:"check",def:true,targets:["jpg"],sources:["jxl"],needs:"jpegReconstruction",disables:["quality","resize"],
    hint:"This JPEG XL was made from a JPEG and still carries it. You get that exact file back, byte for byte."};
  // An option can name the outputs it applies to (targets), the inputs it applies to (sources), and a flag the
  // host must set about the file (needs). Options without those show for every conversion.
  function optionsFor(conv,to,from,flags){to=norm(to);from=from==null?null:norm(from);
    return ((conv&&conv.options)||[]).filter(o=>(!o.targets||o.targets.map(norm).includes(to))
      &&(!o.sources||(from!=null&&o.sources.map(norm).includes(from)))
      &&(!o.needs||!!(flags&&flags[o.needs])));}

  /* ---------- Converter registry: add an entry, get a feature ---------- */
  const CONVERTERS = [
    {from:["png","jpg","jpeg","webp","bmp","gif","avif","ico"], to:["png","jpg","webp","ico","jxl"], engine:"raster", status:"available",
     options:[optQuality, optLossless, optTranscode, optResizeAdv],
     caveats:["JPEG and WebP are lossy. Below 70% you'll start to see artifacts.",
              "JPEG XL is new. Older browsers and apps may not open it yet.",
              "Transparency disappears when converting to JPEG (it fills with white).",
              "An ICO holds square copies at 16 to 256 px. Larger images are scaled down."]},
    {from:["svg"], to:["png","jpg","webp","jxl"], engine:"svgRaster", status:"available",
     options:[optDpiSimple(), optQuality, optLossless, {key:"bg",label:"Background",type:"seg",advanced:true,
       choices:[["transparent","Transparent"],["white","White"]],def:"transparent",
       hint:"What fills empty areas (a JPEG can't be transparent)."}],
     caveats:["This bakes it into a fixed-size image. It won't scale cleanly anymore."]},
    {from:["svg"], to:["dxf"], engine:"svgDxf", status:"available",
     options:[
       {key:"curveMode",label:"Curve handling",type:"seg",choices:[["splines","Splines"],["polylines","Polylines"]],def:"splines",
        hint:"Splines keep true curves (best for Onshape / Fusion). Polylines flatten curves into short straight segments."},
       {key:"tolerance",label:"Flatten tolerance",type:"select",advanced:true,choices:[["0.1","Fine (0.1)"],["0.5","Medium (0.5)"],["1","Coarse (1.0)"]],def:"0.5",
        hint:"Only used in Polylines mode. Smaller is smoother but heavier."},
       {key:"units",label:"Units",type:"select",advanced:true,choices:[["mm","Millimeters"],["in","Inches"]],def:"mm",
        hint:"Unit the DXF declares for the imported geometry."},
     ],
     caveats:["Text and embedded images in the SVG aren't exported. Outline your text first."]},
    {from:["heic","heif","tiff","tif","psd","jxl"], to:["png","jpg","webp","jxl"], engine:"imageDecode", status:"available",
     options:[optQuality, optLossless, optRestore, optResizeAdv],
     caveats:["Layers, text, and adjustments are flattened to the composite image."]},
    {from:["pdf"], to:["png","jpg"], engine:"pdfRaster", status:"available",
     options:[optDpiSimple(), {key:"pages",label:"Pages",type:"text",advanced:true,def:"",placeholder:"e.g. 1-3, 5",hint:"Leave blank to export every page."}],
     caveats:["Each page becomes its own image."]},
    {from:["md","txt","html","rtf"], to:["pdf","docx","epub","html","md","txt"], engine:"docs", status:"available", options:[], caveats:[]},
    {from:["csv"], to:["json"], engine:"data", status:"available", options:[], caveats:["The first row becomes the field names. Numbers and true/false are converted."]},
    {from:["json"], to:["csv"], engine:"data", status:"available", options:[], caveats:["Needs an array of objects or rows. Nested objects are written as JSON text inside the cell."]},
    {from:["pdf"], to:["pptx"], engine:"pdfPptx", status:"available",
     options:[optDpiSimple(), {key:"pages",label:"Pages",type:"text",advanced:true,def:"",placeholder:"e.g. 1-3, 5",hint:"Leave blank to include every page."}],
     caveats:["Each page becomes a picture slide. The text isn't editable in PowerPoint."]},
    {from:["pdf"], to:["docx"], engine:"pdfDocx", status:"available", options:[],
     caveats:["⚠ Only works well for PDFs that already have real, selectable text.",
              "If it's scanned pages or pictures of text, Squish can't make it editable. We don't do OCR (that would mean uploading your file).",
              "Exact fonts and layout are often lost going PDF → Word."]},
    {from:["mp4","mov","webm","avi","mkv"], to:["mp4","webm","mov","gif","mp3","m4a"], engine:"ffmpeg", status:"available",
     options:[
       {key:"target",label:"Optimize for",type:"select",choices:[["balanced","Balanced (recommended)"],["small","Smallest file"],["quality","Best quality"]],def:"balanced",
        hint:"We pick the right settings so it looks good without bloating the file."},
       {key:"resolution",label:"Resolution",type:"select",choices:[["keep","Keep original"],["1080","1080p"],["720","720p"],["480","480p"]],def:"keep",
        hint:"Downscaling shrinks the file. Upscaling won't add real detail."},
       {key:"bitrate",label:"Video bitrate",type:"select",advanced:true,choices:[["auto","Auto (match optimize-for)"],["8000","8 Mbps (high)"],["4000","4 Mbps"],["2000","2 Mbps"],["1000","1 Mbps (small)"]],def:"auto",
        hint:"Exact data rate. Higher = better quality and a bigger file."},
       {key:"fps",label:"Frame rate",type:"select",advanced:true,choices:[["keep","Keep original"],["60","60 fps"],["30","30 fps"],["24","24 fps (cinematic)"],["15","15 fps (tiny)"]],def:"keep",
        hint:"Frames per second. Lower trims size. Great for GIFs."},
       {key:"trim",label:"Trim to a clip",type:"text",advanced:true,def:"",placeholder:"e.g. 0:05-0:12",hint:"Clip to just the part you want (used for video → GIF too)."},
     ], caveats:["Runs entirely on your device, so a long video takes a while. The first conversion downloads a 31 MB engine."]},
    {from:["mp3","wav","m4a","flac","ogg","aac","opus"], to:["mp3","wav","m4a","flac","ogg","opus","aac"], engine:"ffmpeg", status:"available",
     options:[optQuality,
       {key:"samplerate",label:"Sample rate",type:"select",advanced:true,choices:[["keep","Keep original"],["48000","48 kHz"],["44100","44.1 kHz (CD)"],["22050","22 kHz"]],def:"keep",hint:"Audio samples per second."},
       {key:"channels",label:"Channels",type:"select",advanced:true,choices:[["keep","Keep original"],["2","Stereo"],["1","Mono (smaller)"]],def:"keep",hint:"Mono roughly halves most files."}],
     caveats:["The first conversion downloads a 31 MB audio engine. After that it's quick."]},
    {from:["stl","obj","3mf"], to:["stl","obj","3mf"], engine:"mesh", status:"available", options:[],
     caveats:["Mesh to mesh only. Colors, materials, textures, and separate parts are merged or dropped."]},
    // PLANNED: shown with descriptions, route to vote
    {from:["dxf","svg","ai","eps","step","stp","iges","igs"], to:["dwg"], engine:null, status:"planned", options:[], caveats:[]},
    {from:["step","stp","iges","igs"], to:["stl","3mf"], engine:null, status:"planned", options:[], caveats:[]},
    {from:["stl","obj","3mf"], to:["step"], engine:null, status:"planned", options:[], caveats:[]},
  ];

  const IMPOSSIBLE = [
    {from:["pdf","docx","txt","jpg","png","svg"], to:["mp4","mov","webm"], why:"A document or still image has no motion or timeline, so there's nothing to turn into a video."},
    {from:["mp4","mov","mp3","wav"], to:["docx","txt"], why:"Audio and video have no text to pull out without transcription, which we don't do on-device."},
  ];

  /* ---------- Helpers ---------- */
  const norm = e => (e==="jpeg" ? "jpg" : e==="heif" ? "heic" : e==="tif" ? "tiff" : e);
  const extOf = n => (String(n).split(".").pop()||"").toLowerCase();
  function findConverter(from,to){from=norm(from);to=norm(to);return CONVERTERS.find(c=>c.from.map(norm).includes(from)&&c.to.map(norm).includes(to));}
  function possibleTargets(from){from=norm(from);const set=new Map();
    CONVERTERS.forEach(c=>{if(c.from.map(norm).includes(from))c.to.forEach(t=>{t=norm(t);if(t===from)return;if(!set.has(t)||c.status==="available")set.set(t,c.status);});});return set;}
  function impossibleReason(from,to){from=norm(from);to=norm(to);const h=IMPOSSIBLE.find(p=>p.from.map(norm).includes(from)&&p.to.map(norm).includes(to));return h?h.why:null;}
  function fmtBytes(b){if(b<1024)return b+" B";if(b<1048576)return (b/1024).toFixed(0)+" KB";return (b/1048576).toFixed(1)+" MB";}

  /* ---------- Page ranges ("1-3, 5"; blank = all) ---------- */
  function parsePageRange(str,total){
    const s=String(str||"").trim();
    if(!s)return Array.from({length:total},(_,i)=>i+1);
    const out=new Set();
    s.split(/[,\s]+/).forEach(part=>{
      const m=part.match(/^(\d+)(?:-(\d+))?$/);if(!m)return;
      let a=parseInt(m[1],10),b=m[2]?parseInt(m[2],10):a;if(a>b)[a,b]=[b,a];
      for(let i=Math.max(1,a);i<=Math.min(total,b);i++)out.add(i);
    });
    return [...out].sort((x,y)=>x-y);
  }

  /* ---------- ICO container (PNG entries) ---------- */
  function icoFromPngs(entries){
    const dir=6+16*entries.length,total=dir+entries.reduce((n,e)=>n+e.png.length,0),out=new Uint8Array(total),v=new DataView(out.buffer);
    v.setUint16(0,0,true);v.setUint16(2,1,true);v.setUint16(4,entries.length,true);
    let off=dir;entries.forEach((e,i)=>{const p=6+16*i;out[p]=e.w>=256?0:e.w;out[p+1]=e.h>=256?0:e.h;out[p+2]=0;out[p+3]=0;
      v.setUint16(p+4,1,true);v.setUint16(p+6,32,true);v.setUint32(p+8,e.png.length,true);v.setUint32(p+12,off,true);out.set(e.png,off);off+=e.png.length;});
    return out;
  }

  /* ---------- Store-only zip writer (no dependency) ---------- */
  const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
  // entries: [{name, data, deflate?}] where deflate holds raw-deflated bytes (method 8); otherwise stored.
  function zipWrite(entries){
    const enc=new TextEncoder();const parts=[],centrals=[];let offset=0;
    const dosTime=0,dosDate=(1<<5)|1; // 1980-01-01 00:00, so output is reproducible
    entries.forEach(e=>{
      const name=enc.encode(e.name),data=e.data,crc=crc32(data),body=e.deflate||data,method=e.deflate?8:0;
      const lh=new Uint8Array(30+name.length),v=new DataView(lh.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(8,method,true);
      v.setUint16(10,dosTime,true);v.setUint16(12,dosDate,true);v.setUint32(14,crc,true);
      v.setUint32(18,body.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);v.setUint16(28,0,true);
      lh.set(name,30);
      const ch=new Uint8Array(46+name.length),c=new DataView(ch.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,method,true);
      c.setUint16(12,dosTime,true);c.setUint16(14,dosDate,true);c.setUint32(16,crc,true);
      c.setUint32(20,body.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);
      c.setUint16(30,0,true);c.setUint16(32,0,true);c.setUint16(34,0,true);c.setUint16(36,0,true);c.setUint32(38,0,true);c.setUint32(42,offset,true);
      ch.set(name,46);
      parts.push(lh,body);centrals.push(ch);offset+=lh.length+body.length;
    });
    const cdSize=centrals.reduce((n,c)=>n+c.length,0);
    const end=new Uint8Array(22),ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);
    ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);
    ev.setUint32(12,cdSize,true);ev.setUint32(16,offset,true);ev.setUint16(20,0,true);
    const out=new Uint8Array(offset+cdSize+22);let p=0;
    [...parts,...centrals,end].forEach(b=>{out.set(b,p);p+=b.length;});
    return out;
  }
  function zipStore(entries){return zipWrite(entries);}
  // Reads stored and deflated entries. Inflate uses DecompressionStream (browsers and Node 18+).
  async function unzip(bytes){
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-70000);i--){if(v.getUint32(i,true)===0x06054b50){eocd=i;break;}}
    if(eocd<0)throw new Error("Squish couldn't read this file as a zip archive.");
    const bad=()=>new Error("Squish couldn't read this file as a zip archive. It may be damaged.");
    const count=v.getUint16(eocd+10,true);let p=v.getUint32(eocd+16,true);const dec=new TextDecoder(),out=[];
    for(let i=0;i<count;i++){
      if(p+46>bytes.length)throw bad();
      if(v.getUint32(p,true)!==0x02014b50)break;
      const method=v.getUint16(p+10,true),csize=v.getUint32(p+20,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),lo=v.getUint32(p+42,true);
      if(p+46+nl>bytes.length||lo+30>bytes.length)throw bad();
      const name=dec.decode(bytes.subarray(p+46,p+46+nl));
      const lnl=v.getUint16(lo+26,true),lel=v.getUint16(lo+28,true),start=lo+30+lnl+lel;
      if(start+csize>bytes.length)throw bad();
      const raw=bytes.subarray(start,start+csize);let data;
      if(method===0)data=raw;
      else if(method===8)data=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      else throw new Error("This zip uses a compression method Squish can't read ("+method+").");
      out.push({name,data});p+=46+nl+el+cl;
    }
    return out;
  }

  let benchScore=1;
  (function(){try{const t=performance.now();let x=0;for(let i=0;i<3e6;i++)x+=Math.sqrt(i)*0.5;const ms=performance.now()-t;
    benchScore=Math.max(0.4,Math.min(3,60/ms));const cores=(typeof navigator!=='undefined'&&navigator.hardwareConcurrency)||4;benchScore*=cores/4;}catch(e){}})();

  /* ---------- Conversion engines ----------
     Signature: (file, opts, onProgress, toExt) -> Promise<Blob | {blob, name}>
     onProgress(fraction 0..1, label?) lets an engine describe what it is doing.
     Returning {blob, name} overrides the download name (used for zips).
     raster/svgRaster/svgDxf are implemented here. The library-backed engines
     (pdfRaster, docs, pdfDocx, ffmpeg) are placeholders that squish-engines.js
     replaces at load time in the browser. */
  function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});}
  function canvasBlob(c,mime,q){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("That image is too large for this browser to draw. Try a smaller size or a lower sharpness setting.")),mime,q));}
  function mimeFor(ext){return ext==="jpg"?"image/jpeg":ext==="webp"?"image/webp":ext==="ico"?"image/x-icon":ext==="jxl"?"image/jxl":"image/png";}
  function notLoaded(){return Promise.reject(new Error("squish-engines.js is not loaded, so this converter is unavailable."));}

  /* ---------- JPEG XL (the wasm codec lives in squish-engines.js) ---------- */
  const JXL_MAX_PIXELS=16e6; // the single-thread wasm encoder runs out of memory somewhere past this
  const JXL_CONTAINER=[0,0,0,0x0c,0x4a,0x58,0x4c,0x20,0x0d,0x0a,0x87,0x0a];
  function isJxl(bytes){if(!bytes||bytes.length<2)return false;if(bytes[0]===0xff&&bytes[1]===0x0a)return true;
    return bytes.length>=JXL_CONTAINER.length&&JXL_CONTAINER.every((b,i)=>bytes[i]===b);}
  function jxlSizeError(w,h){const px=w*h;if(!(px>JXL_MAX_PIXELS))return null;
    return "This image is "+Math.round(px/1e6)+" megapixels. The JPEG XL encoder can handle about "+(JXL_MAX_PIXELS/1e6)+" megapixels in a browser. Try the Resize option.";}
  const optOn=v=>v===true||v==="1"||v==="true"||v==="on";
  // Maps the UI options to libjxl's encoder settings. Effort 4 keeps the wasm encoder quick; 7 is the library default and slow.
  function jxlEncodeOptions(opts){const lossless=optOn(opts&&opts.lossless);let q=parseInt(opts&&opts.quality,10);if(!(q>=0))q=85;q=Math.min(100,q);
    return {effort:4,quality:lossless?100:q,progressive:false,epf:-1,lossyPalette:false,decodingSpeedTier:0,photonNoiseIso:0,lossyModular:false,lossless};}
  function canvasToJxl(){return notLoaded();} // replaced by squish-engines.js
  function jpegToJxl(){return notLoaded();}   // replaced by squish-engines.js: JPEG file to JPEG XL without re-encoding
  function jxlToJpeg(){return notLoaded();}   // replaced by squish-engines.js: JPEG XL with jbrd back to the original JPEG
  function isJpeg(bytes){return !!bytes&&bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;}
  // Scans the ISOBMFF boxes of a JPEG XL container for a jbrd (JPEG reconstruction) box. libjxl writes it before
  // the codestream, so the first few KB of a file are enough. A bare codestream (FF 0A) never has one.
  function jxlHasJpegReconstruction(bytes){
    if(!bytes||bytes.length<JXL_CONTAINER.length||!JXL_CONTAINER.every((b,i)=>bytes[i]===b))return false;
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let i=0;
    while(i+8<=bytes.length){
      let size=dv.getUint32(i),hdr=8;
      if(size===1){if(i+16>bytes.length)return false;size=dv.getUint32(i+8)*4294967296+dv.getUint32(i+12);hdr=16;}
      if(bytes[i+4]===0x6a&&bytes[i+5]===0x62&&bytes[i+6]===0x72&&bytes[i+7]===0x64)return true; // "jbrd"
      if(size===0||size<hdr)return false; // runs to the end of the file, or malformed
      i+=size;
    }
    return false;
  }

  const ENGINES = {
    async raster(file,opts,onP,toExt){
      if(toExt==="jxl"&&optOn(opts.transcode))return api.jpegToJxl(file,opts,onP); // repack the JPEG, no pixels involved
      const img=await loadImage(URL.createObjectURL(file));onP(.4);
      if(toExt==="ico"){
        const max=Math.max(img.width,img.height);let sizes=[16,32,48,64,128,256].filter(z=>z<=max);if(!sizes.length)sizes=[Math.min(256,max)];
        const entries=[];
        for(const z of sizes){const c=document.createElement("canvas");c.width=z;c.height=z;const ctx=c.getContext("2d");
          const k=z/max,w=Math.max(1,Math.round(img.width*k)),h=Math.max(1,Math.round(img.height*k));
          ctx.drawImage(img,Math.round((z-w)/2),Math.round((z-h)/2),w,h);
          entries.push({w:z,h:z,png:new Uint8Array(await (await canvasBlob(c,"image/png")).arrayBuffer())});}
        onP(.9);return new Blob([icoFromPngs(entries)],{type:"image/x-icon"});
      }
      const scale=parseFloat(opts.resize||"1");
      const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
      const ctx=c.getContext("2d");if(toExt==="jpg"){ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);}
      ctx.drawImage(img,0,0,c.width,c.height);onP(.8);
      if(toExt==="jxl")return api.canvasToJxl(c,opts,onP);
      return await canvasBlob(c,mimeFor(toExt),(parseInt(opts.quality||85))/100);
    },
    async svgRaster(file,opts,onP,toExt){
      const txt=await file.text();const dpi=parseInt(opts.dpi||"150"),scale=dpi/96;
      const img=await loadImage("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(txt));onP(.4);
      const w=(img.width||300)*scale,h=(img.height||300)*scale;
      const c=document.createElement("canvas");c.width=Math.round(w);c.height=Math.round(h);
      const ctx=c.getContext("2d");if(toExt==="jpg"||opts.bg==="white"){ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);}
      ctx.drawImage(img,0,0,c.width,c.height);onP(.8);
      if(toExt==="jxl")return api.canvasToJxl(c,opts,onP);
      return await canvasBlob(c,mimeFor(toExt),(parseInt(opts.quality||90))/100);
    },
    async svgDxf(file,opts,onP){const txt=await file.text();onP(.3);
      const dxf=api.svgToDxf(txt,opts.curveMode||"splines",parseFloat(opts.tolerance||"0.5"));onP(.9);
      return new Blob([dxf],{type:"application/dxf"});},
    async data(file,opts,onP,toExt){
      throwIfAborted(opts&&opts.signal);
      const text=decodeText(new Uint8Array(await file.arrayBuffer()));onP(0.5,"reading the data");
      if(toExt==="json")return new Blob([csvToJson(text)],{type:"application/json"});
      if(toExt==="csv")return new Blob([jsonToCsv(text)],{type:"text/csv"});
      throw new Error("Squish can't write ."+toExt+" from this file.");
    },
    async mesh(file,opts,onP,toExt){
      throwIfAborted(opts&&opts.signal);
      const from=norm(extOf(file.name)),bytes=new Uint8Array(await file.arrayBuffer());onP(0.2,"reading the mesh");
      let m;
      if(from==="stl")m=parseStl(bytes);else if(from==="obj")m=parseObj(decodeText(bytes));else if(from==="3mf")m=await parse3mf(bytes);
      else throw new Error("Squish can't read ."+from+" meshes.");
      onP(0.7,"writing the "+toExt.toUpperCase());
      if(toExt==="stl")return new Blob([toStl(m)],{type:"model/stl"});
      if(toExt==="obj")return new Blob([toObj(m)],{type:"model/obj"});
      if(toExt==="3mf")return new Blob([to3mf(m)],{type:"model/3mf"});
      throw new Error("Squish can't write ."+toExt+" meshes.");
    },
    imageDecode:notLoaded,
    pdfRaster:notLoaded,
    docs:notLoaded,
    pdfDocx:notLoaded,
    pdfPptx:notLoaded,
    ffmpeg:notLoaded,
  };

  /* ---------- SVG geometry: transforms, shapes, arcs ---------- */
  const IDENTITY=[1,0,0,1,0,0];
  function mulMatrix(m,n){return [m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];}
  function applyMatrix(m,p){return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];}
  function parseTransform(str){
    let m=IDENTITY.slice();const re=/([a-zA-Z]+)\s*\(([^)]*)\)/g;let t;
    while((t=re.exec(String(str||"")))){
      const a=t[2].split(/[\s,]+/).filter(Boolean).map(Number),r=Math.PI/180;let n=null;
      switch(t[1]){
        case "matrix":if(a.length===6)n=a;break;
        case "translate":n=[1,0,0,1,a[0]||0,a[1]||0];break;
        case "scale":n=[a[0]||1,0,0,a.length>1?a[1]:(a[0]||1),0,0];break;
        case "rotate":{const c=Math.cos((a[0]||0)*r),si=Math.sin((a[0]||0)*r);n=[c,si,-si,c,0,0];
          if(a.length>2)n=mulMatrix(mulMatrix([1,0,0,1,a[1],a[2]],n),[1,0,0,1,-a[1],-a[2]]);break;}
        case "skewX":n=[1,0,Math.tan((a[0]||0)*r),1,0,0];break;
        case "skewY":n=[1,Math.tan((a[0]||0)*r),0,1,0,0];break;
      }
      if(n)m=mulMatrix(m,n);
    }
    return m;
  }
  // SVG arc (endpoint form) to cubic Béziers, per the SVG implementation notes (F.6.5).
  function arcToCubics(x1,y1,rx,ry,phiDeg,fA,fS,x2,y2){
    rx=Math.abs(rx);ry=Math.abs(ry);if(!rx||!ry||(x1===x2&&y1===y2))return [{x1,y1,x2,y2,x:x2,y:y2}];
    const phi=phiDeg*Math.PI/180,cp=Math.cos(phi),sp=Math.sin(phi);
    const dx=(x1-x2)/2,dy=(y1-y2)/2,x1p=cp*dx+sp*dy,y1p=-sp*dx+cp*dy;
    const lam=(x1p*x1p)/(rx*rx)+(y1p*y1p)/(ry*ry);if(lam>1){rx*=Math.sqrt(lam);ry*=Math.sqrt(lam);}
    const num=rx*rx*ry*ry-rx*rx*y1p*y1p-ry*ry*x1p*x1p,den=rx*rx*y1p*y1p+ry*ry*x1p*x1p;
    let k=den?Math.sqrt(Math.max(0,num/den)):0;if(fA===fS)k=-k;
    const cxp=k*rx*y1p/ry,cyp=-k*ry*x1p/rx;
    const cx=cp*cxp-sp*cyp+(x1+x2)/2,cy=sp*cxp+cp*cyp+(y1+y2)/2;
    const ang=(ux,uy,vx,vy)=>Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
    const t1=Math.atan2((y1p-cyp)/ry,(x1p-cxp)/rx);let dt=ang((x1p-cxp)/rx,(y1p-cyp)/ry,(-x1p-cxp)/rx,(-y1p-cyp)/ry);
    if(!fS&&dt>0)dt-=2*Math.PI;if(fS&&dt<0)dt+=2*Math.PI;
    const n=Math.max(1,Math.ceil(Math.abs(dt)/(Math.PI/2)-1e-9)),out=[],seg=dt/n;
    const pt=a=>[cx+rx*Math.cos(a)*cp-ry*Math.sin(a)*sp,cy+rx*Math.cos(a)*sp+ry*Math.sin(a)*cp];
    const dp=a=>[-rx*Math.sin(a)*cp-ry*Math.cos(a)*sp,-rx*Math.sin(a)*sp+ry*Math.cos(a)*cp];
    for(let i=0;i<n;i++){const a0=t1+i*seg,a1=a0+seg,al=4/3*Math.tan(seg/4);
      const p0=pt(a0),p3=pt(a1),d0=dp(a0),d1=dp(a1);
      out.push({x1:p0[0]+al*d0[0],y1:p0[1]+al*d0[1],x2:p3[0]-al*d1[0],y2:p3[1]-al*d1[1],x:p3[0],y:p3[1]});}
    out[out.length-1].x=x2;out[out.length-1].y=y2;return out;
  }
  const KAPPA=0.5522847498;
  function ellipseSegs(cx,cy,rx,ry){const K=KAPPA;
    return [{cmd:"M",x:cx+rx,y:cy},
      {cmd:"C",x1:cx+rx,y1:cy+K*ry,x2:cx+K*rx,y2:cy+ry,x:cx,y:cy+ry},
      {cmd:"C",x1:cx-K*rx,y1:cy+ry,x2:cx-rx,y2:cy+K*ry,x:cx-rx,y:cy},
      {cmd:"C",x1:cx-rx,y1:cy-K*ry,x2:cx-K*rx,y2:cy-ry,x:cx,y:cy-ry},
      {cmd:"C",x1:cx+K*rx,y1:cy-ry,x2:cx+rx,y2:cy-K*ry,x:cx+rx,y:cy},{cmd:"Z"}];
  }
  function shapeSegs(shape){
    const a=shape.attrs||{},num=k=>parseFloat(a[k]||"0")||0,K=KAPPA;
    switch(shape.tag){
      case "path":return parsePath(a.d||"");
      case "line":return [{cmd:"M",x:num("x1"),y:num("y1")},{cmd:"L",x:num("x2"),y:num("y2")}];
      case "rect":{const x=num("x"),y=num("y"),w=num("width"),h=num("height");let rx=parseFloat(a.rx),ry=parseFloat(a.ry);
        if(isNaN(rx)&&isNaN(ry))rx=ry=0;if(isNaN(rx))rx=ry;if(isNaN(ry))ry=rx;rx=Math.min(rx,w/2);ry=Math.min(ry,h/2);
        if(!rx||!ry)return [{cmd:"M",x,y},{cmd:"L",x:x+w,y},{cmd:"L",x:x+w,y:y+h},{cmd:"L",x,y:y+h},{cmd:"Z"}];
        return [{cmd:"M",x:x+rx,y},{cmd:"L",x:x+w-rx,y},{cmd:"C",x1:x+w-rx+K*rx,y1:y,x2:x+w,y2:y+ry-K*ry,x:x+w,y:y+ry},
          {cmd:"L",x:x+w,y:y+h-ry},{cmd:"C",x1:x+w,y1:y+h-ry+K*ry,x2:x+w-rx+K*rx,y2:y+h,x:x+w-rx,y:y+h},
          {cmd:"L",x:x+rx,y:y+h},{cmd:"C",x1:x+rx-K*rx,y1:y+h,x2:x,y2:y+h-ry+K*ry,x,y:y+h-ry},
          {cmd:"L",x,y:y+ry},{cmd:"C",x1:x,y1:y+ry-K*ry,x2:x+rx-K*rx,y2:y,x:x+rx,y},{cmd:"Z"}];}
      case "circle":return ellipseSegs(num("cx"),num("cy"),num("r"),num("r"));
      case "ellipse":return ellipseSegs(num("cx"),num("cy"),num("rx"),num("ry"));
      case "polygon":case "polyline":{const pts=String(a.points||"").trim().split(/[\s,]+/).map(Number).filter(n=>!isNaN(n));const segs=[];
        for(let i=0;i+1<pts.length;i+=2)segs.push({cmd:i?"L":"M",x:pts[i],y:pts[i+1]});
        if(shape.tag==="polygon"&&segs.length)segs.push({cmd:"Z"});return segs;}
      default:return [];
    }
  }
  function shapesToDxf(shapes,mode,tol){
    const lines=[],polys=[],splines=[];
    shapes.forEach(sh=>{const m=sh.ctm||IDENTITY;const T=p=>applyMatrix(m,p);let cur=[0,0],start=[0,0];
      shapeSegs(sh).forEach(s=>{
        if(s.cmd==="M"){cur=T([s.x,s.y]);start=cur.slice();}
        else if(s.cmd==="L"){const p=T([s.x,s.y]);lines.push([cur[0],cur[1],p[0],p[1]]);cur=p;}
        else if(s.cmd==="C"){const c1=T([s.x1,s.y1]),c2=T([s.x2,s.y2]),p=T([s.x,s.y]);
          mode==="splines"?splines.push({deg:3,pts:[cur,c1,c2,p]}):polys.push(flattenCubic(cur,c1,c2,p,tol));cur=p;}
        else if(s.cmd==="Q"){const c1=T([s.x1,s.y1]),p=T([s.x,s.y]);
          mode==="splines"?splines.push({deg:2,pts:[cur,c1,p]}):polys.push(flattenQuad(cur,c1,p,tol));cur=p;}
        else if(s.cmd==="Z"){if(cur[0]!==start[0]||cur[1]!==start[1])lines.push([cur[0],cur[1],start[0],start[1]]);cur=start.slice();}
      });});
    return buildDxf(lines,polys,splines);
  }
  // The DOM walk lives in squish-engines.js (it replaces this on SquishCore).
  function svgToDxf(){throw new Error("svgToDxf needs a DOM; squish-engines.js provides it.");}
  // Robust SVG path tokenizer. Handles M L H V C S Q T A Z (+ relative forms),
  // implicit repeated coordinates, and smooth-curve reflection. Converts
  // everything down to M / L / C / Q / Z so the DXF emitter stays simple.
  // Never overruns the token list (so a weird path can't throw).
  function parsePath(d){
    const re=/([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;let m;const toks=[];
    while((m=re.exec(d)))toks.push(m[1]?{c:m[1]}:{n:parseFloat(m[2])});
    const out=[];let i=0,cmd=null,cx=0,cy=0,sx=0,sy=0,pcx=null,pcy=null,pqx=null,pqy=null;
    const has=n=>{for(let k=0;k<n;k++){const t=toks[i+k];if(!t||t.c!==undefined)return false;}return true;};
    const rd=n=>{const a=[];for(let k=0;k<n;k++)a.push(toks[i++].n);return a;};
    while(i<toks.length){
      if(toks[i].c!==undefined){cmd=toks[i].c;i++;}
      if(!cmd)break;
      const rel=cmd===cmd.toLowerCase(),C=cmd.toUpperCase();
      if(C==="Z"){out.push({cmd:"Z"});cx=sx;cy=sy;pcx=pcy=pqx=pqy=null;continue;}
      if(C==="M"){if(!has(2))break;let[x,y]=rd(2);if(rel){x+=cx;y+=cy;}cx=x;cy=y;sx=x;sy=y;out.push({cmd:"M",x,y});cmd=rel?"l":"L";pcx=pcy=pqx=pqy=null;continue;}
      if(C==="L"){if(!has(2))break;let[x,y]=rd(2);if(rel){x+=cx;y+=cy;}out.push({cmd:"L",x,y});cx=x;cy=y;pcx=pcy=pqx=pqy=null;continue;}
      if(C==="H"){if(!has(1))break;let[x]=rd(1);if(rel)x+=cx;out.push({cmd:"L",x,y:cy});cx=x;pcx=pcy=pqx=pqy=null;continue;}
      if(C==="V"){if(!has(1))break;let[y]=rd(1);if(rel)y+=cy;out.push({cmd:"L",x:cx,y});cy=y;pcx=pcy=pqx=pqy=null;continue;}
      if(C==="C"){if(!has(6))break;let[x1,y1,x2,y2,x,y]=rd(6);if(rel){x1+=cx;y1+=cy;x2+=cx;y2+=cy;x+=cx;y+=cy;}out.push({cmd:"C",x1,y1,x2,y2,x,y});pcx=x2;pcy=y2;pqx=pqy=null;cx=x;cy=y;continue;}
      if(C==="S"){if(!has(4))break;let[x2,y2,x,y]=rd(4);if(rel){x2+=cx;y2+=cy;x+=cx;y+=cy;}let x1=cx,y1=cy;if(pcx!=null){x1=2*cx-pcx;y1=2*cy-pcy;}out.push({cmd:"C",x1,y1,x2,y2,x,y});pcx=x2;pcy=y2;pqx=pqy=null;cx=x;cy=y;continue;}
      if(C==="Q"){if(!has(4))break;let[x1,y1,x,y]=rd(4);if(rel){x1+=cx;y1+=cy;x+=cx;y+=cy;}out.push({cmd:"Q",x1,y1,x,y});pqx=x1;pqy=y1;pcx=pcy=null;cx=x;cy=y;continue;}
      if(C==="T"){if(!has(2))break;let[x,y]=rd(2);if(rel){x+=cx;y+=cy;}let x1=cx,y1=cy;if(pqx!=null){x1=2*cx-pqx;y1=2*cy-pqy;}out.push({cmd:"Q",x1,y1,x,y});pqx=x1;pqy=y1;pcx=pcy=null;cx=x;cy=y;continue;}
      if(C==="A"){if(!has(7))break;let[rx,ry,rot,laf,sf,x,y]=rd(7);if(rel){x+=cx;y+=cy;}
        arcToCubics(cx,cy,rx,ry,rot,laf?1:0,sf?1:0,x,y).forEach(c=>out.push({cmd:"C",x1:c.x1,y1:c.y1,x2:c.x2,y2:c.y2,x:c.x,y:c.y}));cx=x;cy=y;pcx=pcy=pqx=pqy=null;continue;}
      i++; // unknown token, skip one to stay safe
    }
    return out;
  }
  function flattenCubic(p0,p1,p2,p3,tol){const n=Math.max(2,Math.ceil(8/Math.max(tol,.05))),pts=[];
    for(let t=0;t<=1;t+=1/n){const mt=1-t;pts.push([mt*mt*mt*p0[0]+3*mt*mt*t*p1[0]+3*mt*t*t*p2[0]+t*t*t*p3[0],mt*mt*mt*p0[1]+3*mt*mt*t*p1[1]+3*mt*t*t*p2[1]+t*t*t*p3[1]]);}return pts;}
  function flattenQuad(p0,p1,p2,tol){const n=Math.max(2,Math.ceil(6/Math.max(tol,.05))),pts=[];
    for(let t=0;t<=1;t+=1/n){const mt=1-t;pts.push([mt*mt*p0[0]+2*mt*t*p1[0]+t*t*p2[0],mt*mt*p0[1]+2*mt*t*p1[1]+t*t*p2[1]]);}return pts;}
  function buildDxf(lines,polys,splines){const L=[],Y=v=>-v;L.push("0","SECTION","2","ENTITIES");
    lines.forEach(([x1,y1,x2,y2])=>L.push("0","LINE","8","0","10",x1,"20",Y(y1),"11",x2,"21",Y(y2)));
    polys.forEach(pts=>{L.push("0","LWPOLYLINE","8","0","90",pts.length,"70","0");pts.forEach(([x,y])=>L.push("10",x,"20",Y(y)));});
    splines.forEach(sp=>{const k=sp.deg,ctrl=sp.pts,n=ctrl.length,knots=[];for(let i=0;i<n+k+1;i++)knots.push(i<=k?0:(i>=n?(n-k):(i-k)));
      L.push("0","SPLINE","8","0","210","0","220","0","230","1","70","8","71",k,"72",knots.length,"73",n,"74","0");
      knots.forEach(kn=>L.push("40",kn));ctrl.forEach(([x,y])=>L.push("10",x,"20",Y(y),"30","0"));});
    L.push("0","ENDSEC","0","EOF");return L.join("\n");}

  /* ---------- Cancellation ---------- */
  function throwIfAborted(signal){if(signal&&signal.aborted){const e=new Error("Cancelled. Nothing was changed.");e.cancelled=true;throw e;}}

  /* ---------- Text decoding: BOMs, strict UTF-8, Windows-1252 fallback ---------- */
  // Bytes 0x80..0x9F are Windows-1252 punctuation, not C1 controls. Mapped by hand because
  // Node's small-ICU TextDecoder leaves them as controls while browsers map them.
  const CP1252={0x80:0x20AC,0x82:0x201A,0x83:0x0192,0x84:0x201E,0x85:0x2026,0x86:0x2020,0x87:0x2021,0x88:0x02C6,0x89:0x2030,0x8A:0x0160,0x8B:0x2039,0x8C:0x0152,0x8E:0x017D,
    0x91:0x2018,0x92:0x2019,0x93:0x201C,0x94:0x201D,0x95:0x2022,0x96:0x2013,0x97:0x2014,0x98:0x02DC,0x99:0x2122,0x9A:0x0161,0x9B:0x203A,0x9C:0x0153,0x9E:0x017E,0x9F:0x0178};
  function decode1252(bytes){let out="";for(let i=0;i<bytes.length;i++){const b=bytes[i];out+=String.fromCharCode(CP1252[b]||b);}return out;}
  function decodeText(bytes){
    if(!bytes||!bytes.length)return "";
    if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF)return new TextDecoder("utf-8").decode(bytes.subarray(3));
    if(bytes[0]===0xFF&&bytes[1]===0xFE)return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    if(bytes[0]===0xFE&&bytes[1]===0xFF)return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
    catch(e){return decode1252(bytes);}
  }

  /* ---------- CSV and JSON ---------- */
  function detectDelimiter(line){
    const counts={",":0,";":0,"\t":0,"|":0};let q=false;
    for(const ch of line){if(ch==='"')q=!q;else if(!q&&ch in counts)counts[ch]++;}
    const best=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];return best[1]?best[0]:",";
  }
  function parseCsv(text){
    const s=String(text||"").replace(/^\uFEFF/,"");if(!s.trim())return [];
    const d=detectDelimiter(s.split(/\r?\n/)[0]);const rows=[];let row=[],cell="",q=false,i=0;
    while(i<s.length){const ch=s[i];
      if(q){if(ch==='"'){if(s[i+1]==='"'){cell+='"';i+=2;continue;}q=false;i++;continue;}cell+=ch;i++;continue;}
      if(ch==='"'){q=true;i++;continue;}
      if(ch===d){row.push(cell);cell="";i++;continue;}
      if(ch==="\r"){i++;continue;}
      if(ch==="\n"){row.push(cell);rows.push(row);row=[];cell="";i++;continue;}
      cell+=ch;i++;}
    if(cell!==""||row.length){row.push(cell);rows.push(row);}
    return rows.filter(r=>r.length>1||r[0]!=="");
  }
  function csvCell(v){if(v==null)return "";const t=typeof v==="object"?JSON.stringify(v):String(v);return /[",\r\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;}
  function toCsv(rows){return rows.map(r=>r.map(csvCell).join(",")).join("\n")+"\n";}
  // Numbers convert only when the digits survive the round trip, so "02134" and long IDs stay strings.
  function csvValue(t){if(t==="")return "";if(/^-?\d+(\.\d+)?$/.test(t)&&String(Number(t))===t)return Number(t);if(t==="true")return true;if(t==="false")return false;return t;}
  function csvToJson(text){
    const rows=parseCsv(text);if(!rows.length)return "[]\n";const head=rows[0];
    return JSON.stringify(rows.slice(1).map(r=>{const o={};head.forEach((h,i)=>{o[h||("col"+(i+1))]=csvValue(r[i]==null?"":r[i]);});return o;}),null,2)+"\n";
  }
  function jsonToCsv(text){
    let v;try{v=JSON.parse(text);}catch(e){throw new Error("That file isn't valid JSON. "+e.message);}
    const findArray=x=>{if(Array.isArray(x))return x;if(x&&typeof x==="object"){for(const k of Object.keys(x)){const a=findArray(x[k]);if(a)return a;}}return null;};
    const arr=findArray(v);if(!arr)throw new Error("Squish needs a JSON array (or an object containing one) to make a CSV.");
    if(!arr.length)return "\n";
    if(arr.every(Array.isArray))return toCsv(arr);
    const keys=[];arr.forEach(o=>{if(o&&typeof o==="object"&&!Array.isArray(o))Object.keys(o).forEach(k=>{if(!keys.includes(k))keys.push(k);});});
    return toCsv([keys,...arr.map(o=>keys.map(k=>o&&typeof o==="object"?o[k]:""))]);
  }

  /* ---------- Document block model ----------
     Block: {type: h1|h2|h3|p|li|ol|code|quote|hr, runs: [{text, b, i, code, href}]}
     li = bullet item, ol = numbered item. Consecutive items form one list. */
  function safeHref(href){
    const h=String(href||"").trim();if(!h)return null;
    const scheme=h.replace(/[\u0000-\u0020]/g,"").match(/^([a-z][a-z0-9+.-]*):/i);
    if(!scheme)return h; // relative path or #anchor
    return /^(https?|mailto)$/i.test(scheme[1])?h:null;
  }
  function runsText(runs){return (runs||[]).map(r=>r.text||"").join("");}
  function escapeHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function blocksFromText(text){
    return String(text).replace(/\r\n?/g,"\n").split(/\n[ \t]*\n+/).map(p=>p.trim()).filter(Boolean)
      .map(p=>({type:"p",runs:[{text:p.replace(/\s*\n\s*/g," ")}]}));
  }
  function cellText(cell){return runsText(cell).replace(/\s*\n\s*/g," ");}
  function blocksToTxt(blocks){
    let counters=[],out="";
    const isItem=b=>b&&(b.type==="li"||b.type==="ol");
    blocks.forEach((b,i)=>{
      let line;
      if(b.type==="table"){line=b.rows.map(r=>r.map(cellText).join("\t")).join("\n");counters=[];}
      else{
        const t=runsText(b.runs),lvl=b.level||0;
        if(b.type==="ol"){counters=counters.slice(0,lvl+1);counters[lvl]=(counters[lvl]||0)+1;line="  ".repeat(lvl)+counters[lvl]+". "+t;}
        else if(b.type==="li")line="  ".repeat(lvl)+"- "+t;
        else{counters=[];line=b.type==="hr"?"----------":b.type==="quote"?"> "+t:t;}
      }
      const prev=blocks[i-1];
      const tight=isItem(prev)&&isItem(b)&&!((prev.level||0)===0&&(b.level||0)===0&&prev.type!==b.type);
      out+=(i?(tight?"\n":"\n\n"):"")+line;
    });
    return out+"\n";
  }
  function mdRun(r){
    let t=r.text||"";if(!t)return "";
    if(r.code)return "`"+t.replace(/`/g,"\\`")+"`";
    t=t.replace(/([*_\\\[\]])/g,"\\$1");
    if(r.b)t="**"+t+"**";if(r.i)t="*"+t+"*";if(r.u)t="<u>"+t+"</u>";
    const href=safeHref(r.href);
    if(href)t="["+t+"]("+(/[\s()<>]/.test(href)?"<"+href.replace(/[<>]/g,encodeURIComponent)+">":href)+")";
    return t;
  }
  function mdCell(cell){return cell.map(mdRun).join("").replace(/\|/g,"\\|").replace(/\s*\n\s*/g," ");}
  function blocksToMd(blocks){
    let counters=[],out="";
    const isItem=b=>b&&(b.type==="li"||b.type==="ol");
    blocks.forEach((b,i)=>{
      let line;
      if(b.type==="table"){
        const rows=b.rows.map(r=>"| "+r.map(mdCell).join(" | ")+" |");
        const cols=(b.rows[0]||[]).length;rows.splice(1,0,"| "+Array(cols).fill("---").join(" | ")+" |");
        line=rows.join("\n");counters=[];
      }else{
        const t=b.runs.map(mdRun).join(""),lvl=b.level||0;
        if(b.type==="ol"){counters=counters.slice(0,lvl+1);counters[lvl]=(counters[lvl]||0)+1;}else if(b.type!=="li")counters=[];
        switch(b.type){
          case "h1":line="# "+t;break;case "h2":line="## "+t;break;case "h3":line="### "+t;break;
          case "li":line="  ".repeat(lvl)+"- "+t;break;case "ol":line="   ".repeat(lvl)+counters[lvl]+". "+t;break;
          case "code":line="```\n"+runsText(b.runs)+"\n```";break;
          case "quote":line="> "+t;break;case "hr":line="---";break;
          default:line=t.replace(/^(\s*)(#|>|[-+*](?=\s)|\d+(?=[.)]\s))/,(mm,sp,mk)=>sp+(/^\d/.test(mk)?mk:"\\"+mk)).replace(/^(\s*\d+)([.)])(?=\s)/,"$1\\$2");
        }
      }
      const prev=blocks[i-1];
      const tight=isItem(prev)&&isItem(b)&&!((prev.level||0)===0&&(b.level||0)===0&&prev.type!==b.type);
      out+=(i?(tight?"\n":"\n\n"):"")+line;
    });
    return out+"\n";
  }
  function htmlRun(r,xhtml){
    let t=escapeHtml(r.text||"");
    if(xhtml)t=t.replace(/\n/g,"<br/>");
    if(r.code)t="<code>"+t+"</code>";if(r.b)t="<strong>"+t+"</strong>";if(r.i)t="<em>"+t+"</em>";if(r.u)t="<u>"+t+"</u>";
    const href=safeHref(r.href);
    if(href)t='<a href="'+escapeHtml(href)+'">'+t+"</a>";
    return t;
  }
  function htmlBody(blocks,xhtml){
    const body=[],stack=[];const hr=xhtml?"<hr/>":"<hr>";
    const closeLi=top=>{if(!top.liOpen)return;if(top.liIndex===body.length-1)body[body.length-1]+="</li>";else body.push("</li>");top.liOpen=false;};
    const closeTop=()=>{const top=stack.pop();closeLi(top);body.push(top.type==="li"?"</ul>":"</ol>");};
    const closeAll=()=>{while(stack.length)closeTop();};
    const item=(T,L,t)=>{
      while(stack.length&&stack[stack.length-1].level>L)closeTop();
      if(stack.length&&stack[stack.length-1].level===L&&stack[stack.length-1].type!==T)closeTop();
      if(!stack.length||stack[stack.length-1].level<L){const lvl=stack.length?stack[stack.length-1].level+1:0;body.push(T==="li"?"<ul>":"<ol>");stack.push({type:T,level:lvl,liOpen:false,liIndex:-1});}
      else closeLi(stack[stack.length-1]);
      body.push("<li>"+t);const top=stack[stack.length-1];top.liOpen=true;top.liIndex=body.length-1;
    };
    blocks.forEach(b=>{
      if(b.type==="li"||b.type==="ol"){item(b.type,b.level||0,b.runs.map(r=>htmlRun(r,xhtml)).join(""));return;}
      closeAll();
      if(b.type==="table"){
        const row=(r,tag)=>"<tr>"+r.map(c=>"<"+tag+">"+c.map(x=>htmlRun(x,xhtml)).join("")+"</"+tag+">").join("")+"</tr>";
        const rows=b.rows||[];body.push("<table>");
        if(b.header&&rows.length){body.push("<thead>",row(rows[0],"th"),"</thead>","<tbody>",...rows.slice(1).map(r=>row(r,"td")),"</tbody>");}
        else body.push("<tbody>",...rows.map(r=>row(r,"td")),"</tbody>");
        body.push("</table>");return;
      }
      const t=(b.runs||[]).map(r=>htmlRun(r,xhtml)).join("");
      if(b.type==="code")body.push("<pre><code>"+escapeHtml(runsText(b.runs))+"</code></pre>");
      else if(b.type==="quote")body.push("<blockquote><p>"+t+"</p></blockquote>");
      else if(b.type==="hr")body.push(hr);
      else if(/^h[1-3]$/.test(b.type))body.push("<"+b.type+">"+t+"</"+b.type+">");
      else body.push("<p>"+t+"</p>");
    });
    closeAll();
    return body.join("\n");
  }
  const DOC_CSS="body{max-width:720px;margin:40px auto;padding:0 20px;font-family:system-ui,sans-serif;line-height:1.55}pre{background:#f4f4f4;padding:12px;overflow:auto}blockquote{border-left:3px solid #ccc;margin:0;padding-left:14px;color:#555}";
  function blocksToHtml(blocks,title){
    return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      +'<title>'+escapeHtml(title||"Document")+'</title>\n<style>'+DOC_CSS+'</style>\n</head>\n<body>\n'+htmlBody(blocks,false)+'\n</body>\n</html>\n';
  }
  function blocksToXhtml(blocks,title){
    return '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">\n<head>\n'
      +'<meta charset="utf-8"/>\n<title>'+escapeHtml(title||"Document")+'</title>\n<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n'+htmlBody(blocks,true)+'\n</body>\n</html>\n';
  }

  /* ---------- EPUB 3 package (entries for zipStore; mimetype must come first, stored) ---------- */
  function uuid(){const h=[];for(let i=0;i<32;i++)h.push(Math.floor(Math.random()*16).toString(16));h[12]="4";h[16]=(8+Math.floor(Math.random()*4)).toString(16);
    const x=h.join("");return x.slice(0,8)+"-"+x.slice(8,12)+"-"+x.slice(12,16)+"-"+x.slice(16,20)+"-"+x.slice(20);}
  function epubEntries(blocks,title){
    const enc=new TextEncoder(),t=escapeHtml(title||"Document"),now=new Date().toISOString().replace(/\.\d+Z$/,"Z");
    const opf='<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en">\n'
      +'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n<dc:identifier id="pub-id">urn:uuid:'+uuid()+'</dc:identifier>\n<dc:title>'+t+'</dc:title>\n<dc:language>en</dc:language>\n'
      +'<meta property="dcterms:modified">'+now+'</meta>\n</metadata>\n<manifest>\n'
      +'<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n'
      +'<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>\n'
      +'<item id="css" href="style.css" media-type="text/css"/>\n</manifest>\n<spine>\n<itemref idref="chapter"/>\n</spine>\n</package>\n';
    const nav='<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n<head><meta charset="utf-8"/><title>'+t+'</title></head>\n'
      +'<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="chapter.xhtml">'+t+'</a></li></ol></nav></body>\n</html>\n';
    const container='<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles>\n<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n</rootfiles>\n</container>\n';
    return [
      {name:"mimetype",data:enc.encode("application/epub+zip")},
      {name:"META-INF/container.xml",data:enc.encode(container)},
      {name:"OEBPS/content.opf",data:enc.encode(opf)},
      {name:"OEBPS/nav.xhtml",data:enc.encode(nav)},
      {name:"OEBPS/chapter.xhtml",data:enc.encode(blocksToXhtml(blocks,title))},
      {name:"OEBPS/style.css",data:enc.encode(DOC_CSS+"\n")},
    ];
  }

  /* ---------- Minimal RTF reader: paragraphs, bold, italic, escapes ---------- */
  function rtfToBlocks(rtf){
    const src=String(rtf),blocks=[];
    const SKIP=new Set(["fonttbl","colortbl","stylesheet","info","pict","object","header","footer","footnote",
      "listtable","listoverridetable","themedata","colorschememapping","latentstyles","datastore","xmlnstbl","generator"]);
    let runs=[],cur="",state={b:false,i:false,u:false,uc:1},stack=[],depth=0,skipDepth=0,i=0;
    const flushRun=()=>{if(cur){const r={text:cur,b:state.b,i:state.i};if(state.u)r.u=true;runs.push(r);cur="";}};
    const flushPara=()=>{flushRun();if(runs.some(r=>r.text.trim()))blocks.push({type:"p",runs});runs=[];};
    while(i<src.length){
      const ch=src[i];
      if(ch==="{"){depth++;i++;if(!skipDepth){flushRun();stack.push({b:state.b,i:state.i,u:state.u,uc:state.uc});if(src.startsWith("\\*",i))skipDepth=depth;}continue;}
      if(ch==="}"){if(skipDepth===depth){skipDepth=0;stack.pop();}else if(!skipDepth){flushRun();state=stack.pop()||state;}depth--;i++;continue;}
      if(ch==="\\"){
        const m=/^\\([a-zA-Z]+)(-?\d+)? ?|^\\'([0-9a-fA-F]{2})|^\\([\s\S])/.exec(src.slice(i,i+40));
        if(!m){i++;continue;}
        i+=m[0].length;
        if(skipDepth)continue;
        if(m[3]!==undefined){const code=parseInt(m[3],16);cur+=String.fromCharCode(CP1252[code]||code);continue;}
        if(m[4]!==undefined){const c=m[4];if(c==="\\"||c==="{"||c==="}")cur+=c;else if(c==="~")cur+="\u00a0";else if(c==="\n"||c==="\r")flushPara();continue;}
        const w=m[1],n=m[2];
        if(SKIP.has(w)){skipDepth=depth;continue;}
        if(w==="par")flushPara();
        else if(w==="line")cur+="\n";
        else if(w==="tab")cur+="\t";
        else if(w==="b"){flushRun();state.b=n!=="0";}
        else if(w==="i"){flushRun();state.i=n!=="0";}
        else if(w==="ul"){flushRun();state.u=n!=="0";}
        else if(w==="ulnone"){flushRun();state.u=false;}
        else if(w==="uc"){state.uc=Math.max(0,parseInt(n,10)||0);}
        else if(w==="u"){let code=parseInt(n,10);if(code<0)code+=65536;cur+=String.fromCharCode(code);
          // skip the fallback characters that follow (\'xx counts as one)
          for(let k=0;k<state.uc;k++){if(src.startsWith("\\'",i))i+=4;else if(src[i]&&!"\\{}".includes(src[i]))i++;else break;}}
        continue; // every other control word is ignored
      }
      if(ch==="\r"||ch==="\n"){i++;continue;}
      if(!skipDepth)cur+=ch;
      i++;
    }
    flushPara();
    return blocks;
  }

  /* ---------- Text for pdf-lib standard fonts (WinAnsi only) ---------- */
  const PDF_EXTRA_CHARS=new Set([0x152,0x153,0x160,0x161,0x178,0x17D,0x17E,0x192,0x2C6,0x2DC,0x2013,0x2014,0x2018,0x2019,0x201A,0x201C,0x201D,0x201E,0x2020,0x2021,0x2022,0x2026,0x2030,0x2039,0x203A,0x20AC,0x2122]);
  function pdfSafeText(s){let out="";for(const ch of String(s).replace(/\t/g,"    ")){const k=ch.codePointAt(0);
    const ok=c=>{const n=c.codePointAt(0);return c==="\n"||c==="\r"||(n>=0x20&&n<=0x7E)||(n>=0xA0&&n<=0xFF)||PDF_EXTRA_CHARS.has(n);};
    if(ok(ch)){out+=ch;continue;}
    const base=ch.normalize("NFKD").replace(/[\u0300-\u036f]/g,"");
    out+=(base&&base!==ch&&[...base].every(ok))?base:"?";}return out;}

  /* ---------- PDF text items -> blocks (lines by y, paragraphs by gap, headings by size) ---------- */
  // Two-column pages: find the widest vertical strip in the middle of the page that no text
  // item covers. If each side has text, read the left column first, then the right.
  function splitColumns(items){
    if(items.length<6)return null;
    const minX=Math.min(...items.map(i=>i.x)),maxX=Math.max(...items.map(i=>i.x+i.width)),pageW=maxX-minX;
    if(pageW<=0)return null;
    const iv=items.map(i=>[i.x,i.x+i.width]).sort((a,b)=>a[0]-b[0]);const gaps=[];let end=iv[0][1];
    for(let k=1;k<iv.length;k++){if(iv[k][0]>end+0.5)gaps.push([end,iv[k][0]]);end=Math.max(end,iv[k][1]);}
    const mid=gaps.filter(g=>{const c=(g[0]+g[1])/2;return c>minX+0.3*pageW&&c<minX+0.7*pageW;}).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];
    if(!mid||mid[1]-mid[0]<0.04*pageW)return null;
    const split=(mid[0]+mid[1])/2,left=items.filter(i=>i.x<split),right=items.filter(i=>i.x>=split);
    return left.length>=3&&right.length>=3?[left,right]:null;
  }
  function pdfTextToBlocks(pages){
    const lines=[];
    pages.forEach((items,pi)=>{
      const its=(items||[]).filter(t=>t.str&&t.str.trim()).map(t=>({...t,size:t.size||10,width:t.width||0}));
      const groups=splitColumns(its)||[its];
      groups.forEach((group,gi)=>{
        group.sort((a,b)=>(b.y-a.y)||(a.x-b.x));
        let line=null,first=true;
        group.forEach(t=>{
          const tol=Math.max(2,t.size*0.5);
          if(line&&Math.abs(line.y-t.y)<=tol){
            const gap=t.x-line.xEnd;
            if(gap>t.size*0.15&&!/\s$/.test(line.text)&&!/^\s/.test(t.str))line.text+=" ";
            line.text+=t.str;line.xEnd=Math.max(line.xEnd,t.x+t.width);line.size=Math.max(line.size,t.size);
          }else{line={text:t.str,size:t.size,y:t.y,x:t.x,xEnd:t.x+t.width,page:pi,colBreak:gi>0&&first};first=false;lines.push(line);}
        });
      });
    });
    if(!lines.length)return [];
    const sizes=lines.map(l=>l.size).sort((a,b)=>a-b),body=sizes[Math.floor(sizes.length/2)];
    const paras=[];let para=null;
    lines.forEach((l,i)=>{
      const prev=lines[i-1];
      const fresh=!prev||prev.page!==l.page||l.colBreak||(prev.y-l.y)>l.size*1.8||Math.abs(prev.size-l.size)>body*0.15;
      if(fresh){para={lines:[l],size:l.size};paras.push(para);}else{para.lines.push(l);para.size=Math.max(para.size,l.size);}
    });
    return paras.map(p=>{
      const text=p.lines.map(l=>l.text.trim()).join(" ").replace(/\s+/g," ");
      const short=p.lines.length<=2;let type="p";
      if(short&&p.size>=body*1.6)type="h1";else if(short&&p.size>=body*1.3)type="h2";else if(short&&p.size>=body*1.15)type="h3";
      return {type,runs:[{text}]};
    });
  }

  /* ---------- ffmpeg argument builder (pure, so it is testable) ---------- */
  function parseTime(t){
    const m=String(t).trim().match(/^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/);if(!m)return null;
    const parts=[m[1],m[2],m[3]].filter(v=>v!==undefined).map(Number);
    return parts.reduce((acc,v)=>acc*60+v,0);
  }
  function parseTrim(s){
    const m=String(s||"").trim().match(/^([\d:.]+)\s*-\s*([\d:.]+)$/);
    if(!m)return null;
    const start=parseTime(m[1]),end=parseTime(m[2]);
    return start!=null&&end!=null&&end>start?{start,end}:null;
  }
  function trimError(s){
    const t=String(s||"").trim();if(!t||parseTrim(t))return null;
    const m=t.match(/^([\d:.]+)\s*-\s*([\d:.]+)$/);
    if(m&&parseTime(m[1])!=null&&parseTime(m[2])!=null)return "The trim end has to come after the start.";
    return "Trim needs a start and end like m:ss-m:ss, for example 0:05-0:12.";
  }
  function audioKbps(q){q=parseInt(q||85,10);return q>=90?320:q>=75?256:q>=60?192:q>=50?128:96;}
  const MEDIA_MIME={mp4:"video/mp4",webm:"video/webm",mov:"video/quicktime",gif:"image/gif",mp3:"audio/mpeg",wav:"audio/wav",m4a:"audio/mp4",flac:"audio/flac",ogg:"audio/ogg",opus:"audio/ogg",aac:"audio/aac"};
  function ffmpegArgs(fromExt,toExt,opts,inName,outName){
    opts=opts||{};const args=[];
    const trim=parseTrim(opts.trim);
    if(trim)args.push("-ss",String(trim.start),"-t",String(+(trim.end-trim.start).toFixed(3)));
    args.push("-i",inName);
    const target=opts.target||"balanced";
    const crf={balanced:23,small:28,quality:18}[target]||23;
    const scale=opts.resolution&&opts.resolution!=="keep"?"scale=-2:"+opts.resolution:null;
    const fps=opts.fps&&opts.fps!=="keep"?String(opts.fps):null;
    const kbps=opts.bitrate&&opts.bitrate!=="auto"?String(opts.bitrate):null;
    if(toExt==="gif"){
      const chain=["fps="+(fps||"12")];if(scale)chain.push(scale+":flags=lanczos");
      args.push("-an","-vf",chain.join(",")+",split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse","-loop","0");
    }else if(toExt==="mp4"||toExt==="mov"||toExt==="webm"){
      if(scale)args.push("-vf",scale);
      else if(toExt!=="webm")args.push("-vf","scale=trunc(iw/2)*2:trunc(ih/2)*2"); // yuv420p needs even dimensions
      if(fps)args.push("-r",fps);
      if(toExt==="mp4"||toExt==="mov"){
        args.push("-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p");
        if(kbps)args.push("-b:v",kbps+"k");else args.push("-crf",String(crf));
        args.push("-c:a","aac","-b:a","128k","-movflags","+faststart");
        if(toExt==="mov")args.push("-f","mov");
      }else{
        const vb=kbps||{balanced:"2000",small:"1000",quality:"4000"}[target]||"2000";
        args.push("-c:v","libvpx","-b:v",vb+"k","-deadline","realtime","-cpu-used","8","-c:a","libopus","-b:a","96k");
      }
    }else{
      args.push("-vn");
      const kb=audioKbps(opts.quality);
      if(toExt==="mp3")args.push("-c:a","libmp3lame","-b:a",kb+"k");
      else if(toExt==="wav")args.push("-c:a","pcm_s16le");
      else if(toExt==="m4a")args.push("-c:a","aac","-b:a",Math.min(kb,256)+"k");
      else if(toExt==="flac")args.push("-c:a","flac");
      else if(toExt==="ogg")args.push("-c:a","libvorbis","-q:a",String(Math.max(0,Math.min(10,Math.round((parseInt(opts.quality||85,10)-40)/6)))));
      else if(toExt==="opus")args.push("-c:a","libopus","-b:a",Math.min(kb,256)+"k","-vbr","on");
      else if(toExt==="aac")args.push("-c:a","aac","-b:a",Math.min(kb,256)+"k","-f","adts");
      if(opts.samplerate&&opts.samplerate!=="keep")args.push("-ar",String(opts.samplerate));
      if(opts.channels&&opts.channels!=="keep")args.push("-ac",String(opts.channels));
    }
    args.push(outName);
    return args;
  }

  /* ---------- Mesh formats: STL, OBJ, 3MF ---------- */
  // Mesh = {vertices: flat xyz numbers, triangles: flat 0-based indices}
  function parseStl(bytes){
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length>=84){const n=v.getUint32(80,true);
      if(84+50*n===bytes.length){const verts=[],tris=[],index=new Map();
        for(let i=0;i<n;i++){const base=84+50*i+12;
          for(let k=0;k<3;k++){const x=v.getFloat32(base+k*12,true),y=v.getFloat32(base+k*12+4,true),z=v.getFloat32(base+k*12+8,true);
            const key=x+","+y+","+z;let idx=index.get(key);if(idx===undefined){idx=verts.length/3;index.set(key,idx);verts.push(x,y,z);}tris.push(idx);}}
        return {vertices:verts,triangles:tris};}}
    const text=decodeText(bytes);const re=/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;const verts=[],tris=[],index=new Map();let m;
    while((m=re.exec(text))){const x=+m[1],y=+m[2],z=+m[3];const key=x+","+y+","+z;let idx=index.get(key);if(idx===undefined){idx=verts.length/3;index.set(key,idx);verts.push(x,y,z);}tris.push(idx);}
    tris.length-=tris.length%3;
    if(!tris.length)throw new Error("Squish couldn't find any triangles in this STL file.");
    return {vertices:verts,triangles:tris};
  }
  function parseObj(text){
    const verts=[],tris=[];
    String(text).split(/\r?\n/).forEach(line=>{
      const t=line.trim().split(/\s+/);if(t[0]==="v"&&t.length>=4)verts.push(+t[1],+t[2],+t[3]);
      else if(t[0]==="f"&&t.length>=4){const n=verts.length/3;const idx=t.slice(1).map(tok=>{let i=parseInt(tok.split("/")[0],10);return i<0?n+i:i-1;}).filter(i=>i>=0&&i<n);
        for(let k=1;k+1<idx.length;k++)tris.push(idx[0],idx[k],idx[k+1]);}
    });
    if(!tris.length)throw new Error("Squish couldn't find any faces in this OBJ file.");
    return {vertices:verts,triangles:tris};
  }
  function modelXml3mf(mesh){
    const V=mesh.vertices,T=mesh.triangles;let x='<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<resources>\n<object id="1" type="model">\n<mesh>\n<vertices>\n';
    for(let i=0;i<V.length;i+=3)x+='<vertex x="'+V[i]+'" y="'+V[i+1]+'" z="'+V[i+2]+'"/>\n';
    x+='</vertices>\n<triangles>\n';
    for(let i=0;i<T.length;i+=3)x+='<triangle v1="'+T[i]+'" v2="'+T[i+1]+'" v3="'+T[i+2]+'"/>\n';
    return x+'</triangles>\n</mesh>\n</object>\n</resources>\n<build>\n<item objectid="1"/>\n</build>\n</model>\n';
  }
  function to3mf(mesh){const enc=new TextEncoder();
    return zipWrite([
      {name:"[Content_Types].xml",data:enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n')},
      {name:"_rels/.rels",data:enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n')},
      {name:"3D/3dmodel.model",data:enc.encode(modelXml3mf(mesh))}]);
  }
  async function parse3mf(bytes){
    const entries=await unzip(bytes);const dec=new TextDecoder();
    const rels=entries.find(e=>e.name==="_rels/.rels");let target=null;
    if(rels){const m=dec.decode(rels.data).match(/Target="\/?([^"]+\.model)"/i);if(m)target=m[1];}
    const model=entries.find(e=>target&&e.name===target)||entries.find(e=>/\.model$/i.test(e.name));
    if(!model)throw new Error("Squish couldn't find a 3D model inside this 3MF file.");
    const xml=dec.decode(model.data);const verts=[],tris=[];
    const meshRe=/<mesh[\s>][\s\S]*?<\/mesh>/g;let mm;
    while((mm=meshRe.exec(xml))){const block=mm[0],offset=verts.length/3;
      const vr=/<vertex\s+[^>]*?x="([^"]+)"[^>]*?y="([^"]+)"[^>]*?z="([^"]+)"/g;let v;while((v=vr.exec(block)))verts.push(+v[1],+v[2],+v[3]);
      const tr=/<triangle\s+[^>]*?v1="(\d+)"[^>]*?v2="(\d+)"[^>]*?v3="(\d+)"/g;let t;while((t=tr.exec(block)))tris.push(offset+ +t[1],offset+ +t[2],offset+ +t[3]);}
    if(!tris.length)throw new Error("Squish couldn't find any triangles in this 3MF file.");
    return {vertices:verts,triangles:tris};
  }
  function toStl(mesh){
    const V=mesh.vertices,T=mesh.triangles,n=T.length/3,out=new Uint8Array(84+50*n),v=new DataView(out.buffer);
    new TextEncoder().encodeInto("Squish binary STL",out);v.setUint32(80,n,true);
    for(let i=0;i<n;i++){const a=T[i*3]*3,b=T[i*3+1]*3,c=T[i*3+2]*3;
      const ux=V[b]-V[a],uy=V[b+1]-V[a+1],uz=V[b+2]-V[a+2],wx=V[c]-V[a],wy=V[c+1]-V[a+1],wz=V[c+2]-V[a+2];
      let nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
      const p=84+50*i;v.setFloat32(p,nx,true);v.setFloat32(p+4,ny,true);v.setFloat32(p+8,nz,true);
      [a,b,c].forEach((idx,k)=>{v.setFloat32(p+12+k*12,V[idx],true);v.setFloat32(p+16+k*12,V[idx+1],true);v.setFloat32(p+20+k*12,V[idx+2],true);});
      v.setUint16(p+48,0,true);}
    return out;
  }
  function toObj(mesh){
    const V=mesh.vertices,T=mesh.triangles;let o="# Squish\n";
    for(let i=0;i<V.length;i+=3)o+="v "+V[i]+" "+V[i+1]+" "+V[i+2]+"\n";
    for(let i=0;i<T.length;i+=3)o+="f "+(T[i]+1)+" "+(T[i+1]+1)+" "+(T[i+2]+1)+"\n";
    return o;
  }

  /* ---------- Vote summary: local tallies merged with server totals ---------- */
  // requests: {"svg→dwg": n} from this browser; stats: {"input_png": n, ...}; server: [{from,to,count}] or null.
  function summarizeVotes(requests,stats,server){
    const ARROW=String.fromCharCode(0x2192),rows=new Map();
    (server||[]).forEach(v=>{if(v&&v.from&&v.to)rows.set(v.from+ARROW+v.to,{from:v.from,to:v.to,count:+v.count||0,mine:0});});
    Object.entries(requests||{}).forEach(([pair,n])=>{const [from,to]=pair.split(ARROW);if(!from||!to)return;
      const r=rows.get(pair);if(r)r.mine=+n||0;else rows.set(pair,{from,to,count:+n||0,mine:+n||0});});
    const requested=[...rows.values()].sort((a,b)=>(b.count-a.count)||(b.mine-a.mine)||(a.from+a.to).localeCompare(b.from+b.to));
    const dropped=Object.entries(stats||{}).filter(([k])=>k.startsWith("input_")).map(([k,n])=>({ext:k.slice(6),count:+n||0})).sort((a,b)=>(b.count-a.count)||a.ext.localeCompare(b.ext));
    return {requested,dropped};
  }

  /* ---------- PDF heuristics (no OCR, just guidance) ---------- */
  async function detectImagePdf(file){try{const buf=new Uint8Array(await file.slice(0,Math.min(file.size,2e6)).arrayBuffer());
    let s="";for(let i=0;i<buf.length;i++)s+=String.fromCharCode(buf[i]);
    const hasFont=/\/(Font|BaseFont)/.test(s),hasText=/(BT[\s\S]{0,400}?(Tj|TJ))/.test(s),hasImage=/\/(Image|DCTDecode|JPXDecode|CCITTFaxDecode)/.test(s);
    return hasImage&&!hasFont&&!hasText;}catch(e){return false;}}
  async function detectPdfPages(file){try{const buf=new Uint8Array(await file.slice(0,Math.min(file.size,8e6)).arrayBuffer());
    let s="";for(let i=0;i<buf.length;i++)s+=String.fromCharCode(buf[i]);
    const m=s.match(/\/Type\s*\/Page[^s]/g);let n=m?m.length:0;const cm=s.match(/\/Count\s+(\d+)/);if(cm)n=Math.max(n,parseInt(cm[1]));
    return Math.max(1,n||1);}catch(e){return 1;}}

  // Does this JPEG XL file carry its original JPEG? Reads the first MB, which is far past where libjxl puts the jbrd box.
  async function detectJxlJpeg(file){try{const buf=new Uint8Array(await file.slice(0,Math.min(file.size,1e6)).arrayBuffer());return jxlHasJpegReconstruction(buf);}catch(e){return false;}}
  /* ---------- detectImagePdfFromString / pages: sync helpers for tests ---------- */
  function pdfLooksImageBased(s){const hasFont=/\/(Font|BaseFont)/.test(s),hasText=/(BT[\s\S]{0,400}?(Tj|TJ))/.test(s),hasImage=/\/(Image|DCTDecode|JPXDecode|CCITTFaxDecode)/.test(s);return hasImage&&!hasFont&&!hasText;}
  function pdfPageCount(s){const m=s.match(/\/Type\s*\/Page[^s]/g);let n=m?m.length:0;const cm=s.match(/\/Count\s+(\d+)/);if(cm)n=Math.max(n,parseInt(cm[1]));return Math.max(1,n||1);}

  /* ---------- exports ---------- */
  const api={FORMATS,CAT_COLOR,CAT_GLYPH,optQuality,optResizeAdv,optDpiSimple,optLossless,optionsFor,CONVERTERS,IMPOSSIBLE,
    norm,extOf,findConverter,possibleTargets,impossibleReason,fmtBytes,benchScore,throwIfAborted,summarizeVotes,parsePageRange,crc32,zipStore,zipWrite,unzip,icoFromPngs,parseStl,parseObj,parse3mf,modelXml3mf,to3mf,toStl,toObj,decodeText,parseCsv,toCsv,csvToJson,jsonToCsv,runsText,escapeHtml,blocksFromText,blocksToTxt,blocksToMd,blocksToHtml,blocksToXhtml,epubEntries,rtfToBlocks,pdfSafeText,pdfTextToBlocks,parseTrim,trimError,safeHref,audioKbps,MEDIA_MIME,ffmpegArgs,
    ENGINES,loadImage,canvasBlob,mimeFor,isJxl,jxlSizeError,jxlEncodeOptions,canvasToJxl,JXL_MAX_PIXELS,
    optTranscode,optRestore,optOn,isJpeg,jxlHasJpegReconstruction,jpegToJxl,jxlToJpeg,
    svgToDxf,parsePath,flattenCubic,flattenQuad,buildDxf,parseTransform,mulMatrix,applyMatrix,arcToCubics,shapeSegs,shapesToDxf,
    detectImagePdf,detectPdfPages,detectJxlJpeg,pdfLooksImageBased,pdfPageCount};
  root.SquishCore=api;
  if (typeof module!=="undefined" && module.exports) module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);

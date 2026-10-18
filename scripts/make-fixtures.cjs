#!/usr/bin/env node
// Generates tiny fixture files for the browser and Playwright tests.
// Run: node scripts/make-fixtures.cjs   (the mp4 needs ffmpeg on PATH)
const fs=require("fs"),path=require("path"),{execFileSync}=require("child_process");
const dir=path.join(__dirname,"..","fixtures");fs.mkdirSync(dir,{recursive:true});
const write=(name,data,enc)=>{fs.writeFileSync(path.join(dir,name),data,enc);console.log("fixtures/"+name);};

// Two-page PDF with real text. Object numbers: 1 catalog, 2 pages, 3 font, 4 bold font,
// 5 page 1, 6 content 1, 7 page 2, 8 content 2. The xref offsets are computed.
function stream(s){return "<< /Length "+Buffer.byteLength(s,"latin1")+" >>\nstream\n"+s+"\nendstream";}
const c1="BT /F2 24 Tf 72 700 Td (Squish fixture) Tj ET\n"
  +"BT /F1 12 Tf 72 660 Td (This is page one. It has real selectable text.) Tj ET\n"
  +"BT /F1 12 Tf 72 644 Td (A second line of body text on page one.) Tj ET";
const c2="BT /F2 18 Tf 72 700 Td (Page two heading) Tj ET\n"
  +"BT /F1 12 Tf 72 670 Td (This is page two of the fixture.) Tj ET";
const page=(contents)=>"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents "+contents+" 0 R >>";
const objs=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [5 0 R 7 0 R] /Count 2 >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  page(6),stream(c1),page(8),stream(c2)];
let pdf="%PDF-1.4\n";const offs=[];
objs.forEach((o,i)=>{offs.push(Buffer.byteLength(pdf,"latin1"));pdf+=(i+1)+" 0 obj\n"+o+"\nendobj\n";});
const xref=Buffer.byteLength(pdf,"latin1");
pdf+="xref\n0 "+(objs.length+1)+"\n0000000000 65535 f \n"+offs.map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("")
  +"trailer\n<< /Size "+(objs.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
write("two-page.pdf",pdf,"latin1");

// One second of 440 Hz mono 16-bit PCM at 8 kHz.
const sr=8000,n=sr,pcm=Buffer.alloc(n*2);
for(let i=0;i<n;i++)pcm.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/sr)*12000),i*2);
const h=Buffer.alloc(44);
h.write("RIFF",0);h.writeUInt32LE(36+pcm.length,4);h.write("WAVE",8);h.write("fmt ",12);h.writeUInt32LE(16,16);
h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(sr,24);h.writeUInt32LE(sr*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);
h.write("data",36);h.writeUInt32LE(pcm.length,40);
write("one-second.wav",Buffer.concat([h,pcm]));

// One second of 64x64 test pattern with a sine tone, via system ffmpeg.
try{
  execFileSync("ffmpeg",["-y","-loglevel","error","-f","lavfi","-i","testsrc=duration=1:size=64x64:rate=10",
    "-f","lavfi","-i","sine=frequency=440:duration=1","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest",
    path.join(dir,"one-second.mp4")]);
  console.log("fixtures/one-second.mp4");
}catch(e){console.warn("skipped one-second.mp4 (ffmpeg not available): "+e.message);}

write("short.md",`# Squish fixture

A paragraph with **bold**, *italic*, \`code\`, and a [link](https://example.com). Emoji: 🎉

## List

- one
- two

1. first
2. second

> A quote.

\`\`\`
let x = 1;
\`\`\`

---

Last paragraph.
`);
write("sample.html",`<!doctype html><html><head><title>Sample</title><style>p{color:red}</style></head>
<body><h2>Sample heading</h2><p>Hello <strong>bold</strong> and <a href="https://example.com">a link</a>.</p>
<ul><li>alpha</li><li>beta</li></ul><pre>code here</pre></body></html>
`);
write("sample.rtf",String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0\fswiss Helvetica;}}\f0\fs24 Hello {\b bold} world\par Second \'e9 paragraph\par}`);
write("sample.txt","First paragraph of plain text.\n\nSecond paragraph.\n");
write("latin1.txt",Buffer.from("caf\xe9 \x93quoted\x94\n","latin1"));
write("people.csv",'name,city,note\nAnn,Oslo,"likes tea, not coffee"\nBo,Lima,\n');
write("people.json",JSON.stringify([{name:"Ann",city:"Oslo",age:34},{name:"Bo",city:"Lima",age:27}],null,2)+"\n");
// A 1x1 AVIF (libavif test image) so the browser decode path has an input.
write("fx.avif",Buffer.from("AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABgAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACBtZGF0EgAKCBgABogQEAwgMgwf8AAAWAAAAAAs","base64"));
write("table.md",`# Table fixture

| Name | Age |
| --- | --- |
| Ann | 34 |
| Bo | 27 |

- top
  - nested
- back

Some <u>underlined</u> text.
`);
write("unicode.md","# Unicode\n\nΩμέγα Привет naïve 🎉 日本語 "+[0x2764,0xFE0F,0x20,0x263A,0xFE0F,0x20,0x2714,0xFE0F,0x20,0x1F600].map(c=>String.fromCodePoint(c)).join("")+"\n");
// A 48x32 PNG, then HEIC, TIFF, and PSD copies via macOS sips (skipped elsewhere).
// fxPixel is the test pattern; squish-tests.html checks decoded pixels against it.
const fxPixel=(x,y)=>[(x*5)%256,(y*7)%256,128,255];
(function(){
  const zlib=require("zlib");const w=48,h=32,rows=[];
  for(let y=0;y<h;y++){const row=[0];for(let x=0;x<w;x++)row.push(...fxPixel(x,y));rows.push(Buffer.from(row));}
  const crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0;}
  const crc=b=>{let c=0xFFFFFFFF;for(const x of b)c=crcT[(c^x)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
  const chunk=(t,d)=>{const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk("IHDR",ihdr),chunk("IDAT",zlib.deflateSync(Buffer.concat(rows))),chunk("IEND",Buffer.alloc(0))]);
  write("fx.png",png);
  for(const f of ["heic","tiff","psd"]){
    try{execFileSync("sips",["-s","format",f,path.join(dir,"fx.png"),"--out",path.join(dir,"fx."+f)],{stdio:"ignore"});console.log("fixtures/fx."+f);}
    catch(e){console.warn("skipped fx."+f+" (sips not available)");}
  }
})();
// The same 48x32 pattern as a lossless JPEG XL, through the vendored jSquash encoder.
(async function(){
  const C=require("../squish-core.js"),{pathToFileURL}=require("url"),v=path.join(__dirname,"..","vendor","jsquash-jxl");
  const factory=(await import(pathToFileURL(path.join(v,"codec","enc","jxl_enc.js")).href)).default;
  const enc=await factory({noInitialRun:true,wasmBinary:fs.readFileSync(path.join(v,"codec","enc","jxl_enc.wasm"))});
  const w=48,h=32,px=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)px.set(fxPixel(x,y),(y*w+x)*4);
  const out=enc.encode(px,w,h,C.jxlEncodeOptions({lossless:true}));
  const jxl=Buffer.from(out.buffer,out.byteOffset,out.byteLength);write("fx.jxl",jxl);
  // The same picture as a baseline JPEG (libjpeg at quality 90, through the vendored transcoder's lossy path,
  // since Node has no JPEG encoder), then that JPEG repacked losslessly into a JPEG XL that carries a jbrd box.
  const t=path.join(__dirname,"..","vendor","jpeg-to-jxl","dist");
  const make=(await import(pathToFileURL(path.join(t,"transcode.js")).href)).default;
  const m=await make({wasmBinary:fs.readFileSync(path.join(t,"transcode.wasm"))});
  const call=(fn,input,...extra)=>{const inPtr=m._malloc(input.length);m.HEAPU8.set(input,inPtr);const sizePtr=m._malloc(4);
    try{const outPtr=fn(inPtr,input.length,sizePtr,...extra);if(!outPtr)throw new Error("transcoder returned nothing");
      const n=m.HEAPU32[sizePtr>>2],res=Buffer.from(m.HEAPU8.subarray(outPtr,outPtr+n));m._jxl_free(outPtr);return res;}
    finally{m._free(inPtr);m._free(sizePtr);}};
  const jpg=call(m._jxl_to_jpeg_lossy,jxl,90);write("fx.jpg",jpg);
  write("fx-from-jpeg.jxl",call(m._jpeg_to_jxl,jpg,3));
  // A photo-like JPEG (160 by 120, gradients plus deterministic noise) so the size tests see real savings;
  // on a tiny file like fx.jpg the container overhead outweighs them.
  let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
  const pw=160,ph=120,pp=new Uint8ClampedArray(pw*ph*4);
  for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){const i=(y*pw+x)*4,n=(rnd()-0.5)*48;
    pp[i]=x*1.5+n;pp[i+1]=y*2+n;pp[i+2]=(x+y)*0.9+n;pp[i+3]=255;}
  const photoJxl=enc.encode(pp,pw,ph,C.jxlEncodeOptions({lossless:true}));
  write("photo.jpg",call(m._jxl_to_jpeg_lossy,Buffer.from(photoJxl.buffer,photoJxl.byteOffset,photoJxl.byteLength),90));
})().catch(e=>{console.error("fx.jxl / fx.jpg failed: "+(e&&e.message));process.exitCode=1;});
// Mesh fixtures: a unit cube as binary STL, OBJ, and a deflated 3MF (as slicers write them).
(function(){
  const C=require("../squish-core.js"),zlib=require("zlib"),enc=new TextEncoder();
  const cube={vertices:[0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1],
    triangles:[0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]};
  write("cube.stl",C.toStl(cube));write("cube.obj",C.toObj(cube));
  const model=enc.encode(C.modelXml3mf(cube));
  const stored=C.to3mf(cube);
  write("cube.3mf",C.zipWrite([
    {name:"[Content_Types].xml",data:enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')},
    {name:"_rels/.rels",data:enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')},
    {name:"3D/3dmodel.model",data:model,deflate:new Uint8Array(zlib.deflateRawSync(Buffer.from(model)))}]));
})();
write("shapes.svg",`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
<g transform="translate(50,20)"><rect width="40" height="20" rx="4"/><circle cx="100" cy="10" r="10"/></g>
<polygon points="0,90 20,70 40,90"/><path d="M150 50 A20 20 0 0 1 190 50"/></svg>
`);

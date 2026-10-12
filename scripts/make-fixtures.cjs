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
write("unicode.md","# Unicode\n\nΩμέγα Привет naïve 🎉 日本語\n");
// A 48x32 PNG, then HEIC, TIFF, and PSD copies via macOS sips (skipped elsewhere).
(function(){
  const zlib=require("zlib");const w=48,h=32,rows=[];
  for(let y=0;y<h;y++){const row=[0];for(let x=0;x<w;x++)row.push((x*5)%256,(y*7)%256,128,255);rows.push(Buffer.from(row));}
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
write("shapes.svg",`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
<g transform="translate(50,20)"><rect width="40" height="20" rx="4"/><circle cx="100" cy="10" r="10"/></g>
<polygon points="0,90 20,70 40,90"/><path d="M150 50 A20 20 0 0 1 190 50"/></svg>
`);

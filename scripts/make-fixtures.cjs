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
write("shapes.svg",`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
<g transform="translate(50,20)"><rect width="40" height="20" rx="4"/><circle cx="100" cy="10" r="10"/></g>
<polygon points="0,90 20,70 40,90"/><path d="M150 50 A20 20 0 0 1 190 50"/></svg>
`);

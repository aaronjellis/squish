/* ============================================================
   SQUISH: Node test suite (pure, deterministic logic)
   Run:  node squish.test.cjs
   Covers the parts that don't need a browser: the converter
   registry, format library, SVG path parsing, and the SVG→DXF
   emitter (spline + polyline math). Canvas/DOM conversions are
   covered by squish-tests.html (run in a browser).
   ============================================================ */
const C = require("./squish-core.js");

let pass=0, fail=0; const fails=[];
function ok(name, cond){ if(cond){pass++; /*console.log("  ✓",name);*/} else {fail++; fails.push(name); console.log("  ✗ "+name);} }
function eq(name,a,b){ ok(name+"  (got "+JSON.stringify(a)+")", a===b); }
function section(t){ console.log("\n"+t); }

/* ---------- 1. Registry integrity ---------- */
section("Registry integrity");
let badFrom=[],badTo=[],badEngine=[];
C.CONVERTERS.forEach((cv,i)=>{
  cv.from.forEach(f=>{ if(!C.FORMATS[C.norm(f)]) badFrom.push(C.norm(f)); });
  cv.to.forEach(t=>{ if(!C.FORMATS[C.norm(t)]) badTo.push(C.norm(t)); });
  if(cv.status==="available" && !C.ENGINES[cv.engine]) badEngine.push(cv.engine);
  if(cv.status==="planned" && cv.engine!==null) badEngine.push("planned-with-engine:"+cv.engine);
});
ok("every converter 'from' ext exists in FORMATS"+(badFrom.length?": missing: "+[...new Set(badFrom)]:""), badFrom.length===0);
ok("every converter 'to' ext exists in FORMATS"+(badTo.length?": missing: "+[...new Set(badTo)]:""), badTo.length===0);
ok("every available converter maps to a real engine"+(badEngine.length?": "+badEngine:""), badEngine.length===0);

/* every FORMATS entry has a non-empty description + known category */
let noDesc=[],badCat=[]; const cats=new Set(Object.keys(C.CAT_COLOR));
for(const [ext,f] of Object.entries(C.FORMATS)){ if(!f.desc||f.desc.length<10)noDesc.push(ext); if(!cats.has(f.cat))badCat.push(ext); }
ok("every format has a real description"+(noDesc.length?": "+noDesc:""), noDesc.length===0);
ok("every format has a known category"+(badCat.length?": "+badCat:""), badCat.length===0);

/* ---------- 2. Lookup logic ---------- */
section("Lookup + capability logic");
ok("png→jpg resolves to raster engine", C.findConverter("png","jpg")?.engine==="raster");
ok("jpeg normalizes to jpg", C.norm("jpeg")==="jpg" && !!C.findConverter("jpeg","webp"));
ok("svg→dxf resolves to svgDxf engine", C.findConverter("svg","dxf")?.engine==="svgDxf");
ok("png→png is NOT offered (same format)", !C.possibleTargets("png").has("png"));
ok("possibleTargets(png) includes jpg & webp", C.possibleTargets("png").has("jpg") && C.possibleTargets("png").has("webp"));
ok("possibleTargets(pdf) marks pptx as planned", C.possibleTargets("pdf").get("pptx")==="planned");
ok("pdf→docx is available (with caveats)", C.findConverter("pdf","docx")?.status==="available");
ok("impossible: pdf→mp4 has a reason", !!C.impossibleReason("pdf","mp4"));
ok("impossible: mp4→docx has a reason", !!C.impossibleReason("mp4","docx"));
ok("possible: png→webp has NO impossible reason", !C.impossibleReason("png","webp"));
eq("fmtBytes(500)","500 B",C.fmtBytes(500));
eq("fmtBytes(2048)","2 KB",C.fmtBytes(2048));
eq("fmtBytes(1572864)","1.5 MB",C.fmtBytes(1572864));

/* ---------- 3. SVG path parser ---------- */
section("SVG path parser");
let segs = C.parsePath("M10 10 L90 10 C90 50 50 90 10 90 Q10 50 10 10 Z");
eq("parses M,L,C,Q,Z in order", segs.map(s=>s.cmd).join(","), "M,L,C,Q,Z");
ok("cubic carries 3 control points", segs[2].x1===90 && segs[2].x2===50 && segs[2].x===10);
// relative coords resolve to absolute
let rel = C.parsePath("M0 0 l10 0 l0 10");
ok("relative 'l' resolves to absolute", rel[1].x===10 && rel[2].x===10 && rel[2].y===10);
// implicit repeated L after M
let imp = C.parsePath("M0 0 5 5 10 10");
ok("implicit lineto after M", imp.length===3 && imp[2].x===10 && imp[2].y===10);
// H/V become horizontal/vertical lines
let hv = C.parsePath("M5 5 H20 V30");
ok("H → horizontal line to (20,5)", hv[1].cmd==="L" && hv[1].x===20 && hv[1].y===5);
ok("V → vertical line to (20,30)", hv[2].cmd==="L" && hv[2].x===20 && hv[2].y===30);
// S reflects the previous cubic's control point into a new cubic
let sm = C.parsePath("M0 0 C0 10 10 10 10 0 S20 -10 20 0");
ok("S becomes a cubic (C)", sm[2].cmd==="C");
// prev cubic ended at (10,0) with 2nd control (10,10); reflection → (2*10-10, 2*0-10) = (10,-10)
ok("S reflects prev control point", sm[2].x1===10 && sm[2].y1===-10 && sm[2].x2===20);
// T reflects the previous quad control point
let tm = C.parsePath("M0 0 Q5 10 10 0 T20 0");
ok("T becomes a quad (Q)", tm[2].cmd==="Q");
// Arc does not throw and yields a segment to its endpoint
let arc = C.parsePath("M0 0 A5 5 0 0 1 10 10");
ok("A → line to endpoint (no throw)", arc[1].cmd==="L" && arc[1].x===10 && arc[1].y===10);
// a malformed / truncated path must not throw and must return something usable
let trunc;
try{ trunc = C.parsePath("M0 0 C10 10 20"); ok("truncated path doesn't throw", true); }
catch(e){ ok("truncated path doesn't throw", false, String(e)); }
// unsupported junk is skipped, not fatal
try{ C.parsePath("M0 0 L10 10 ?garbage? 5 5"); ok("junk tokens don't throw", true); }
catch(e){ ok("junk tokens don't throw", false, String(e)); }

/* ---------- 4. Bézier flattening ---------- */
section("Bézier flattening");
let fc = C.flattenCubic([0,0],[0,10],[10,10],[10,0],0.5);
ok("flattenCubic returns a polyline of points", fc.length>=8);
ok("flattenCubic endpoints are correct", fc[0][0]===0 && fc[fc.length-1][0]===10);
let finer = C.flattenCubic([0,0],[0,10],[10,10],[10,0],0.1);
ok("finer tolerance => more points", finer.length > fc.length);
let fq = C.flattenQuad([0,0],[10,20],[20,0],0.5);
ok("flattenQuad endpoints correct", fq[0][0]===0 && fq[fq.length-1][0]===20);

/* ---------- 5. DXF emitter ---------- */
section("DXF emitter (LINE / LWPOLYLINE / SPLINE)");
function dxfFromSegs(segs, mode){
  const lines=[],polys=[],splines=[];let cur=[0,0],start=[0,0];
  segs.forEach(s=>{
    if(s.cmd==="M"){cur=[s.x,s.y];start=[...cur];}
    else if(s.cmd==="L"){lines.push([cur[0],cur[1],s.x,s.y]);cur=[s.x,s.y];}
    else if(s.cmd==="C"){mode==="splines"?splines.push({deg:3,pts:[cur,[s.x1,s.y1],[s.x2,s.y2],[s.x,s.y]]}):polys.push(C.flattenCubic(cur,[s.x1,s.y1],[s.x2,s.y2],[s.x,s.y],0.5));cur=[s.x,s.y];}
    else if(s.cmd==="Q"){mode==="splines"?splines.push({deg:2,pts:[cur,[s.x1,s.y1],[s.x,s.y]]}):polys.push(C.flattenQuad(cur,[s.x1,s.y1],[s.x,s.y],0.5));cur=[s.x,s.y];}
    else if(s.cmd==="Z"){lines.push([cur[0],cur[1],start[0],start[1]]);cur=[...start];}
  });
  return C.buildDxf(lines,polys,splines);
}
// proper DXF reader: group code / value pairs -> entities
function entities(dxf){const t=dxf.split("\n"),ents=[];let cur=null;
  for(let i=0;i+1<t.length;i+=2){const code=t[i],val=t[i+1];
    if(code==="0"){if(cur)ents.push(cur);cur={type:val,pairs:[]};}
    else if(cur)cur.pairs.push([code,val]);}
  if(cur)ents.push(cur);return ents;}
const codeVal=(e,c)=>{const p=e.pairs.find(x=>x[0]===c);return p?p[1]:null;};
const countCode=(e,c)=>e.pairs.filter(x=>x[0]===c).length;

let dxfS = dxfFromSegs(segs,"splines");
let entS = entities(dxfS);
ok("DXF starts with SECTION/ENTITIES", dxfS.startsWith("0\nSECTION\n2\nENTITIES"));
ok("DXF ends with EOF", dxfS.trim().endsWith("EOF"));
eq("splines mode emits 2 SPLINE entities (one C, one Q)", entS.filter(e=>e.type==="SPLINE").length, 2);
ok("splines mode emits NO polylines", entS.filter(e=>e.type==="LWPOLYLINE").length===0);
// knot vector length must equal controlPoints + degree + 1 for each spline
function knotCheck(ents){
  const sp=ents.filter(e=>e.type==="SPLINE");
  return sp.length>0 && sp.every(e=>{
    const k=parseInt(codeVal(e,"71")), nKnots=parseInt(codeVal(e,"72")), nCtrl=parseInt(codeVal(e,"73"));
    const actualKnots=countCode(e,"40"), actualCtrl=countCode(e,"10");
    return nKnots===nCtrl+k+1 && actualKnots===nKnots && actualCtrl===nCtrl;
  });
}
ok("SPLINE knot vectors are valid (knots = ctrl + degree + 1)", knotCheck(entS));
let dxfP = dxfFromSegs(segs,"polylines");
let entP = entities(dxfP);
ok("polylines mode emits LWPOLYLINE entities", entP.filter(e=>e.type==="LWPOLYLINE").length>0);
ok("polylines mode emits NO splines", entP.filter(e=>e.type==="SPLINE").length===0);
// Y axis is flipped (SVG y-down -> CAD y-up): first LINE (10,10)->(90,10) becomes y=-10
const firstLine = entS.find(e=>e.type==="LINE");
ok("Y axis flipped for CAD orientation", codeVal(firstLine,"20")==="-10");
// closing Z produced the final closing LINE back to the start
ok("close-path (Z) emits a closing LINE", entS.filter(e=>e.type==="LINE").length>=2);

/* ---------- 6. PDF heuristics ---------- */
section("PDF heuristics (sync helpers)");
ok("text PDF (has /Font + BT..Tj) is NOT image-based", C.pdfLooksImageBased("/Font /Helvetica BT (hi) Tj ET")===false);
ok("scanned PDF (/Image DCTDecode, no font) IS image-based", C.pdfLooksImageBased("/XObject /Image /DCTDecode stream")===true);
eq("page count from /Count", C.pdfPageCount("/Count 7"), 7);
eq("page count defaults to 1", C.pdfPageCount("nothing here"), 1);

/* ---------- 7. Engine placeholders ---------- */
section("Engine placeholders");
ok("md→docx resolves to the docs engine", C.findConverter("md","docx")?.engine==="docs");
ok("no converter still points at 'pandoc'", !C.CONVERTERS.some(c=>c.engine==="pandoc"));
ok("simulate() is gone", typeof C.simulate==="undefined");
(async()=>{
  let msg="";try{await C.ENGINES.pdfRaster({},{},()=>{},"png");}catch(e){msg=String(e.message);}
  ok("placeholder engine rejects with a clear message", /squish-engines\.js/.test(msg));
})();

/* ---------- 8. Page ranges ---------- */
section("Page ranges");
eq("blank means all pages", JSON.stringify(C.parsePageRange("",3)), "[1,2,3]");
eq("single page", JSON.stringify(C.parsePageRange("2",3)), "[2]");
eq("range plus single, sorted and deduped", JSON.stringify(C.parsePageRange("3, 1-2, 2",5)), "[1,2,3]");
eq("reversed range is accepted", JSON.stringify(C.parsePageRange("4-2",5)), "[2,3,4]");
eq("clamped to the document", JSON.stringify(C.parsePageRange("0-99",2)), "[1,2]");
eq("nothing matched returns empty", JSON.stringify(C.parsePageRange("9",2)), "[]");
eq("junk tokens are ignored", JSON.stringify(C.parsePageRange("a, 1, x-y",3)), "[1]");

/* ---------- 9. Zip writer ---------- */
section("Zip writer (store only)");
const enc=new TextEncoder();
eq("crc32 of 'hello' matches the reference", C.crc32(enc.encode("hello")).toString(16), "3610a686");
eq("crc32 of empty input is 0", C.crc32(new Uint8Array(0)), 0);
const zipped=C.zipStore([{name:"a.txt",data:enc.encode("hello")},{name:"dir/b.bin",data:new Uint8Array([1,2,3])}]);
const dv=new DataView(zipped.buffer,zipped.byteOffset,zipped.byteLength);
ok("starts with a local file header", dv.getUint32(0,true)===0x04034b50);
ok("ends with an end-of-central-directory record", dv.getUint32(zipped.length-22,true)===0x06054b50);
eq("central directory lists 2 entries", dv.getUint16(zipped.length-22+10,true), 2);
// walk the local headers and read each entry back
function readZip(u8){const v=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);const out=[];let p=0;
  while(v.getUint32(p,true)===0x04034b50){const crc=v.getUint32(p+14,true),size=v.getUint32(p+18,true),nl=v.getUint16(p+26,true),el=v.getUint16(p+28,true);
    const name=new TextDecoder().decode(u8.subarray(p+30,p+30+nl));const data=u8.subarray(p+30+nl+el,p+30+nl+el+size);out.push({name,data,crc});p+=30+nl+el+size;}
  return out;}
const entries=readZip(zipped);
eq("first entry name", entries[0]?.name, "a.txt");
eq("first entry content", new TextDecoder().decode(entries[0]?.data||new Uint8Array()), "hello");
eq("first entry crc matches", entries[0]?.crc.toString(16), "3610a686");
eq("second entry name keeps the folder", entries[1]?.name, "dir/b.bin");
eq("second entry bytes", JSON.stringify([...(entries[1]?.data||[])]), "[1,2,3]");
const cdOffset=dv.getUint32(zipped.length-22+16,true);
ok("central directory offset points at a central header", dv.getUint32(cdOffset,true)===0x02014b50);

/* ---------- 10. Block model: text parser and emitters ---------- */
section("Block model");
const tb=C.blocksFromText("First para\nstill first.\r\n\r\nSecond para.\n\n\n");
eq("text splits on blank lines", tb.length, 2);
eq("newlines inside a paragraph become spaces", tb[0].runs[0].text, "First para still first.");
eq("second paragraph text", tb[1].runs[0].text, "Second para.");
const sample=[
  {type:"h1",runs:[{text:"Title"}]},
  {type:"p",runs:[{text:"Hello "},{text:"bold",b:true},{text:" and "},{text:"em",i:true},{text:" and "},{text:"code",code:true},{text:" and "},{text:"link",href:"https://example.com"}]},
  {type:"li",runs:[{text:"one"}]},{type:"li",runs:[{text:"two"}]},
  {type:"ol",runs:[{text:"first"}]},{type:"ol",runs:[{text:"second"}]},
  {type:"quote",runs:[{text:"quoted"}]},
  {type:"code",runs:[{text:"let x = 1;\nlet y = 2;"}]},
  {type:"hr",runs:[]},
  {type:"p",runs:[{text:"a < b & c"}]},
];
const md=C.blocksToMd(sample);
ok("md: h1", md.startsWith("# Title\n"));
ok("md: inline styles", md.includes("**bold**") && md.includes("*em*") && md.includes("`code`") && md.includes("[link](https://example.com)"));
ok("md: bullets are tight", md.includes("- one\n- two\n"));
ok("md: numbered list counts", md.includes("1. first\n2. second\n"));
ok("md: quote", md.includes("> quoted"));
ok("md: fenced code keeps newlines", md.includes("```\nlet x = 1;\nlet y = 2;\n```"));
ok("md: hr", md.includes("\n---\n"));
const txt=C.blocksToTxt(sample);
ok("txt: no markup", !/[*`#\[\]]/.test(txt.split("let x")[0]));
ok("txt: numbered items", txt.includes("1. first") && txt.includes("2. second"));
ok("txt: bullets", txt.includes("- one"));
const html=C.blocksToHtml(sample,"My Doc");
ok("html: document skeleton", html.startsWith("<!doctype html>") && html.includes("<title>My Doc</title>") && html.includes("</html>"));
ok("html: heading and inline", html.includes("<h1>Title</h1>") && html.includes("<strong>bold</strong>") && html.includes("<em>em</em>") && html.includes("<code>code</code>"));
ok("html: link", html.includes('<a href="https://example.com">link</a>'));
ok("html: lists are wrapped", html.includes("<ul>\n<li>one</li>\n<li>two</li>\n</ul>") && html.includes("<ol>\n<li>first</li>\n<li>second</li>\n</ol>"));
ok("html: escapes text", html.includes("<p>a &lt; b &amp; c</p>"));
ok("html: code block", html.includes("<pre><code>let x = 1;\nlet y = 2;</code></pre>"));
eq("html: title is escaped", C.blocksToHtml([],"<x>").includes("<title>&lt;x&gt;</title>"), true);

/* ---------- 11. RTF parser ---------- */
section("RTF parser");
const rtf=String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0\fswiss Helvetica;}}{\colortbl;\red0\green0\blue0;}{\*\generator Squish}\f0\fs24 Hello {\b bold} world\par Second \'e9 para with \u8220?quotes\u8221? and a \{brace\}\par\par}`;
const rb=C.rtfToBlocks(rtf);
eq("two paragraphs", rb.length, 2);
eq("first paragraph text", C.runsText(rb[0].runs), "Hello bold world");
ok("bold run is marked", rb[0].runs.some(r=>r.text==="bold"&&r.b===true));
ok("text after the group is not bold", rb[0].runs.some(r=>r.text===" world"&&!r.b));
eq("hex and unicode escapes decode", C.runsText(rb[1].runs), "Second \u00e9 para with \u201cquotes\u201d and a {brace}");
ok("font table and generator groups are dropped", !/Helvetica|Squish/.test(rb.map(b=>C.runsText(b.runs)).join("")));
eq("italic toggles off with \\i0", C.rtfToBlocks(String.raw`{\rtf1 \i on\i0  off\par}`)[0].runs.map(r=>!!r.i).join(","), "true,false");
eq("plain text with no \\par is one paragraph", C.rtfToBlocks(String.raw`{\rtf1 just text}`).length, 1);

/* ---------- 12. PDF text to blocks ---------- */
section("PDF text to blocks");
const it=(str,x,y,size,width)=>({str,x,y,size,width});
const pdfPages=[[
  it("Big Title",72,700,24,120),
  it("This is body",72,660,12,70), it("text on one line.",145,660,12,90),
  it("Second line of the same paragraph.",72,644,12,180),
  it("A new paragraph after a gap.",72,600,12,150),
],[
  it("Page two heading",72,700,18,140),
  it("Body on page two.",72,670,12,100),
]];
const pb=C.pdfTextToBlocks(pdfPages);
eq("largest short line becomes h1", pb[0].type+":"+C.runsText(pb[0].runs), "h1:Big Title");
eq("items on one line are joined with a space", C.runsText(pb[1].runs), "This is body text on one line. Second line of the same paragraph.");
eq("a vertical gap starts a new paragraph", C.runsText(pb[2].runs), "A new paragraph after a gap.");
eq("mid-size short line becomes h2", pb[3].type, "h2");
eq("page break starts a new paragraph", C.runsText(pb[4].runs), "Body on page two.");
eq("five blocks total", pb.length, 5);
eq("empty input gives no blocks", C.pdfTextToBlocks([[]]).length, 0);
ok("whitespace-only items are ignored", C.pdfTextToBlocks([[it(" ",0,0,12,2)]]).length===0);

/* ---------- 13. ffmpeg arguments ---------- */
section("ffmpeg arguments");
eq("trim m:ss-m:ss", JSON.stringify(C.parseTrim("0:05-1:12")), '{"start":5,"end":72}');
eq("trim with decimals", JSON.stringify(C.parseTrim("0:05.5 - 0:10")), '{"start":5.5,"end":10}');
eq("trim with words is rejected", C.parseTrim("five-twelve"), null);
eq("blank trim is null", C.parseTrim(""), null);
eq("reversed trim is null", C.parseTrim("1:00-0:30"), null);
eq("audio kbps from quality", [40,55,70,85,95].map(C.audioKbps).join(","), "96,128,192,256,320");
const A=(f,t,o)=>C.ffmpegArgs(f,t,o,"in."+f,"out."+t);
let a=A("mov","mp4",{target:"balanced",resolution:"keep",bitrate:"auto",fps:"keep",trim:""});
ok("mp4: h264 with crf 23 and faststart", a.includes("libx264")&&a[a.indexOf("-crf")+1]==="23"&&a.includes("+faststart")&&a.includes("yuv420p"));
ok("mp4: input then output last", a[a.indexOf("-i")+1]==="in.mov"&&a[a.length-1]==="out.mp4");
ok("mp4: keeping resolution only adds the even-dimension scale", a[a.indexOf("-vf")+1]==="scale=trunc(iw/2)*2:trunc(ih/2)*2");
a=A("mp4","mp4",{target:"small",resolution:"720",fps:"30"});
ok("mp4: small target is crf 28", a[a.indexOf("-crf")+1]==="28");
ok("mp4: 720p scale keeps aspect with even width", a[a.indexOf("-vf")+1]==="scale=-2:720");
ok("mp4: fps becomes -r 30", a[a.indexOf("-r")+1]==="30");
a=A("mp4","mp4",{target:"quality",bitrate:"4000"});
ok("mp4: explicit bitrate replaces crf", a.includes("-b:v")&&a[a.indexOf("-b:v")+1]==="4000k"&&!a.includes("-crf"));
a=A("mp4","mp4",{trim:"0:05-0:12"});
ok("trim: -ss before -i and -t duration", a.indexOf("-ss")<a.indexOf("-i")&&a[a.indexOf("-ss")+1]==="5"&&a[a.indexOf("-t")+1]==="7");
a=A("mp4","webm",{target:"balanced"});
ok("webm: vp8 + opus with a bitrate", a.includes("libvpx")&&a.includes("libopus")&&a[a.indexOf("-b:v")+1]==="2000k");
a=A("mp4","gif",{fps:"keep",resolution:"480"});
const vf=a[a.indexOf("-vf")+1];
ok("gif: palette filter graph with fps and scale", vf.startsWith("fps=12,scale=-2:480:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"));
ok("gif: no audio, loops forever", a.includes("-an")&&a[a.indexOf("-loop")+1]==="0");
a=A("mp4","mp3",{});
ok("video to mp3 drops video and uses lame", a.includes("-vn")&&a.includes("libmp3lame"));
a=A("wav","mp3",{quality:"85",samplerate:"44100",channels:"1"});
ok("mp3: bitrate, sample rate, channels", a[a.indexOf("-b:a")+1]==="256k"&&a[a.indexOf("-ar")+1]==="44100"&&a[a.indexOf("-ac")+1]==="1");
ok("wav output is pcm_s16le", A("mp3","wav",{}).includes("pcm_s16le"));
ok("m4a output is aac", A("wav","m4a",{}).includes("aac"));
ok("flac output is flac", A("wav","flac",{}).includes("flac"));
a=A("wav","ogg",{quality:"100"});
ok("ogg: vorbis with quality 10", a.includes("libvorbis")&&a[a.indexOf("-q:a")+1]==="10");
eq("media mime for gif", C.MEDIA_MIME.gif, "image/gif");
eq("media mime for m4a", C.MEDIA_MIME.m4a, "audio/mp4");

/* ---------- 14. Review fixes ---------- */
section("Review fixes");
// 1. pdf text sanitizer keeps newlines and WinAnsi, replaces the rest
eq("pdfSafeText keeps newlines", C.pdfSafeText("a\nb"), "a\nb");
eq("pdfSafeText keeps Latin-1 and curly quotes", C.pdfSafeText("caf"+String.fromCharCode(0xe9)+" "+String.fromCharCode(0x201c)+"q"+String.fromCharCode(0x201d)), "caf"+String.fromCharCode(0xe9)+" "+String.fromCharCode(0x201c)+"q"+String.fromCharCode(0x201d));
eq("pdfSafeText turns an emoji into one ?", C.pdfSafeText("x"+String.fromCodePoint(0x1F389)+"y"), "x?y");
eq("pdfSafeText expands tabs", C.pdfSafeText("a\tb"), "a    b");
// 2. rtf \'xx in 0x80..0x9F is cp1252, not a C1 control
eq("rtf cp1252 curly quotes and dashes", C.runsText(C.rtfToBlocks(String.raw`{\rtf1 He said \'93hi\'94 \'97 ok\'85}`)[0].runs), "He said "+String.fromCharCode(0x201c)+"hi"+String.fromCharCode(0x201d)+" "+String.fromCharCode(0x2014)+" ok"+String.fromCharCode(0x2026));
eq("rtf \'e9 still decodes as Latin-1", C.runsText(C.rtfToBlocks(String.raw`{\rtf1 caf\'e9}`)[0].runs), "caf"+String.fromCharCode(0xe9));
// 3. \ucN controls how many fallback characters follow \uN
eq("rtf \\uc0 skips no fallback characters", C.runsText(C.rtfToBlocks(String.raw`{\rtf1\uc0 \u26085 \u26412  done}`)[0].runs), String.fromCharCode(0x65e5)+String.fromCharCode(0x672c)+" done");
eq("rtf \\uc is restored when a group closes", C.runsText(C.rtfToBlocks(String.raw`{\rtf1 {\uc0 \u26085 }\u8220?y}`)[0].runs), String.fromCharCode(0x65e5)+String.fromCharCode(0x201c)+"y");
// 5. mp4 output pads odd dimensions when no scale is requested
a=A("mov","mp4",{resolution:"keep"});
ok("mp4 without a resolution still gets an even-dimension scale", a[a.indexOf("-vf")+1]==="scale=trunc(iw/2)*2:trunc(ih/2)*2");
a=A("mov","mp4",{resolution:"720"});
ok("mp4 with a resolution keeps the plain scale", a[a.indexOf("-vf")+1]==="scale=-2:720");
ok("gif is unaffected by the even-dimension rule", !A("mp4","gif",{}).join(" ").includes("trunc("));

/* ---------- 15. Release polish ---------- */
section("Release polish");
const fs=require("fs"),path=require("path");
// links: only http(s), mailto, relative, and anchors survive
eq("safeHref keeps https", C.safeHref("https://example.com/a"), "https://example.com/a");
eq("safeHref keeps mailto", C.safeHref("mailto:a@b.c"), "mailto:a@b.c");
eq("safeHref keeps relative and anchors", [C.safeHref("docs/a.html"),C.safeHref("#top"),C.safeHref("/x")].join(","), "docs/a.html,#top,/x");
eq("safeHref drops javascript:", C.safeHref("javascript:alert(1)"), null);
eq("safeHref drops obfuscated javascript:", C.safeHref(" JaVa\tScript:alert(1)"), null);
eq("safeHref drops data:", C.safeHref("data:text/html,hi"), null);
ok("html emitter drops unsafe links but keeps the text", (h=>!h.includes("javascript")&&h.includes("<p>click</p>"))(C.blocksToHtml([{type:"p",runs:[{text:"click",href:"javascript:alert(1)"}]}],"t")));
ok("md emitter drops unsafe links but keeps the text", (m=>!m.includes("javascript")&&m.includes("click"))(C.blocksToMd([{type:"p",runs:[{text:"click",href:"javascript:alert(1)"}]}])));
// pdf text: accented letters outside WinAnsi fall back to their base letter
eq("pdfSafeText strips accents it can't draw", C.pdfSafeText("Dvo"+String.fromCharCode(0x159)+String.fromCharCode(0xe1)+"k "+String.fromCharCode(0x17a)), "Dvor"+String.fromCharCode(0xe1)+"k z");
eq("pdfSafeText still uses ? for CJK", C.pdfSafeText(String.fromCharCode(0x65e5)), "?");
// trim: more formats, and a clear message for the rest
eq("trim accepts plain seconds", JSON.stringify(C.parseTrim("5-12")), '{"start":5,"end":12}');
eq("trim accepts h:mm:ss", JSON.stringify(C.parseTrim("1:02:03-1:02:10")), '{"start":3723,"end":3730}');
eq("trimError is null for blank", C.trimError(""), null);
eq("trimError is null for a valid range", C.trimError("0:05-0:12"), null);
ok("trimError explains the format", /m:ss-m:ss/.test(C.trimError("five to twelve")||""));
ok("trimError explains a reversed range", /after/.test(C.trimError("0:30-0:10")||""));
// markdown: text that looks like structure is escaped; awkward hrefs are wrapped
const mdEsc=C.blocksToMd([{type:"p",runs:[{text:"# not a heading"}]},{type:"p",runs:[{text:"1. not a list"}]},{type:"p",runs:[{text:"- not a bullet"}]},{type:"p",runs:[{text:"> not a quote"}]}]);
ok("md escapes a leading #", mdEsc.includes("\\# not a heading"));
ok("md escapes a leading number-dot", mdEsc.includes("1\\. not a list"));
ok("md escapes a leading dash", mdEsc.includes("\\- not a bullet"));
ok("md escapes a leading >", mdEsc.includes("\\> not a quote"));
ok("md wraps hrefs with spaces or parens in <>", C.blocksToMd([{type:"p",runs:[{text:"w",href:"https://x.org/a (b)"}]}]).includes("[w](<https://x.org/a (b)>)"));
// canvasBlob rejects instead of resolving null
(async()=>{let msg="";try{await C.canvasBlob({toBlob(cb){cb(null);}},"image/png");}catch(e){msg=e.message;}
  ok("canvasBlob rejects with a clear message when the canvas is too big", /too large/i.test(msg));})();
// text hygiene across shipped and doc files
const DASH=String.fromCharCode(0x2014);
const files=["squish.html","squish-core.js","squish-engines.js","squish-tests.html","squish.test.cjs","README.md","CHANGELOG.md","CLAUDE.md","vendor/VERSIONS.md",".github/workflows/test.yml","scripts/vendor.sh"];
const dashy=files.filter(f=>fs.readFileSync(path.join(__dirname,f),"utf8").includes(DASH));
ok("no em-dashes in shipped or doc files"+(dashy.length?" ("+dashy+")":""), dashy.length===0);
const OLD_SIZE=new RegExp("3"+"2 MB");
const sizes=files.filter(f=>OLD_SIZE.test(fs.readFileSync(path.join(__dirname,f),"utf8")));
ok("the ffmpeg core size is stated one way (31 MB)"+(sizes.length?" ("+sizes+")":""), sizes.length===0);
const pkg=require("./package.json");
ok("dev dependencies are pinned exactly", Object.values(pkg.devDependencies||{}).every(v=>/^\d+\.\d+\.\d+$/.test(v)));

/* ---------- summary ---------- */
function finish(){
  console.log("\n────────────────────────────");
  console.log(`  ${pass} passed, ${fail} failed`);
  if(fail){console.log("  FAILED: "+fails.join(" | "));process.exit(1);}
  else console.log("  ✅ all green");
}
setTimeout(finish, 50);

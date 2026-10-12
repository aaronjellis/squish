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
ok("possibleTargets(pdf) marks pptx as available and dwg as planned", C.possibleTargets("pdf").get("pptx")==="available" && C.possibleTargets("svg").get("dwg")==="planned");
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
ok("A → cubic curve ending at the endpoint (no throw)", arc[1].cmd==="C" && Math.abs(arc[arc.length-1].x-10)<1e-9 && Math.abs(arc[arc.length-1].y-10)<1e-9);
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

/* ---------- 16. SVG shapes, arcs, transforms ---------- */
section("SVG shapes, arcs, transforms");
const I=[1,0,0,1,0,0];
eq("blank transform is identity", JSON.stringify(C.parseTransform("")), JSON.stringify(I));
eq("translate", JSON.stringify(C.applyMatrix(C.parseTransform("translate(10,5)"),[1,1])), "[11,6]");
eq("scale with one value", JSON.stringify(C.applyMatrix(C.parseTransform("scale(2)"),[3,4])), "[6,8]");
ok("rotate 90 about origin", (p=>Math.abs(p[0])<1e-9&&Math.abs(p[1]-10)<1e-9)(C.applyMatrix(C.parseTransform("rotate(90)"),[10,0])));
ok("rotate about a center", (p=>Math.abs(p[0]-5)<1e-9&&Math.abs(p[1]-5)<1e-9)(C.applyMatrix(C.parseTransform("rotate(90 5 5)"),[5,5])));
eq("matrix() and chained transforms compose left to right", JSON.stringify(C.applyMatrix(C.parseTransform("translate(10) scale(2)"),[1,0])), "[12,0]");
const rectSegs=C.shapeSegs({tag:"rect",attrs:{x:"0",y:"0",width:"10",height:"5"}});
eq("rect is a closed 4-line path", rectSegs.map(s=>s.cmd).join(""), "MLLLZ");
ok("rounded rect uses curves", C.shapeSegs({tag:"rect",attrs:{x:"0",y:"0",width:"10",height:"5",rx:"1"}}).some(s=>s.cmd==="C"));
eq("circle is 4 cubics", C.shapeSegs({tag:"circle",attrs:{cx:"0",cy:"0",r:"5"}}).filter(s=>s.cmd==="C").length, 4);
eq("polygon closes, polyline does not", C.shapeSegs({tag:"polygon",attrs:{points:"0,0 10,0 10,10"}}).map(s=>s.cmd).join("")+"|"+C.shapeSegs({tag:"polyline",attrs:{points:"0,0 10,0 10,10"}}).map(s=>s.cmd).join(""), "MLLZ|MLL");
const arcQ=C.arcToCubics(10,0,10,10,0,0,1,0,10);
ok("quarter arc becomes one cubic", arcQ.length===1);
ok("arc cubic midpoint lies on the circle", (()=>{const s=arcQ[0];const t=0.5,mt=0.5;const x=mt**3*10+3*mt*mt*t*s.x1+3*mt*t*t*s.x2+t**3*s.x;const y=mt**3*0+3*mt*mt*t*s.y1+3*mt*t*t*s.y2+t**3*s.y;return Math.abs(Math.hypot(x,y)-10)<0.03;})());
eq("half arc becomes two cubics", C.arcToCubics(10,0,10,10,0,1,1,-10,0).length, 2);
ok("path A command now produces a curve", C.parsePath("M10 0 A10 10 0 0 1 0 10").some(s=>s.cmd==="C"));
const dxfT=C.shapesToDxf([{tag:"rect",attrs:{x:"0",y:"0",width:"10",height:"5"},ctm:C.parseTransform("translate(100,50)")}],"splines",0.5);
ok("group transform moves a rect", /\n10\n100\n20\n-50\n/.test(dxfT) && /\n10\n110\n/.test(dxfT));
ok("a circle under scale(2) emits splines with control points at radius 10", (()=>{const d=C.shapesToDxf([{tag:"circle",attrs:{cx:"0",cy:"0",r:"5"},ctm:C.parseTransform("scale(2)")}],"splines",0.5);return /\nSPLINE\n/.test(d)&&/\n10\n10\n20\n(-0|0)\n/.test(d);})());
eq("shapesToDxf still emits a line for <line>", (C.shapesToDxf([{tag:"line",attrs:{x1:"0",y1:"0",x2:"1",y2:"1"},ctm:I}],"splines",0.5).match(/\nLINE\n/g)||[]).length, 1);

/* ---------- 17. Text decoding ---------- */
section("Text decoding");
const u8=a=>new Uint8Array(a);
eq("utf-8 decodes", C.decodeText(u8([0x63,0x61,0x66,0xc3,0xa9])), "caf"+String.fromCharCode(0xe9));
eq("utf-8 BOM is stripped", C.decodeText(u8([0xef,0xbb,0xbf,0x68,0x69])), "hi");
eq("invalid utf-8 falls back to windows-1252", C.decodeText(u8([0x63,0x61,0x66,0xe9,0x20,0x93,0x71,0x94])), "caf"+String.fromCharCode(0xe9)+" "+String.fromCharCode(0x201c)+"q"+String.fromCharCode(0x201d));
eq("utf-16le BOM decodes", C.decodeText(u8([0xff,0xfe,0x68,0x00,0x69,0x00])), "hi");
eq("utf-16be BOM decodes", C.decodeText(u8([0xfe,0xff,0x00,0x68,0x00,0x69])), "hi");
eq("empty input is empty", C.decodeText(u8([])), "");

/* ---------- 18. CSV and JSON ---------- */
section("CSV and JSON");
eq("simple rows", JSON.stringify(C.parseCsv("a,b\n1,2\n")), '[["a","b"],["1","2"]]');
eq("quoted comma, escaped quote, newline in quotes", JSON.stringify(C.parseCsv('x,y\r\n"a, b","say ""hi""\nthere"')), '[["x","y"],["a, b","say \\"hi\\"\\nthere"]]');
eq("semicolon delimiter is detected", JSON.stringify(C.parseCsv("a;b\n1;2")), '[["a","b"],["1","2"]]');
eq("tab delimiter is detected", JSON.stringify(C.parseCsv("a\tb\n1\t2")), '[["a","b"],["1","2"]]');
eq("toCsv quotes only what needs it", C.toCsv([["a","b, c",'q"'],[1,true,null]]), 'a,"b, c","q"""\n1,true,\n');
const jj=JSON.parse(C.csvToJson("name,age,ok\nAnn,34,true\nBo,,false\n"));
eq("csvToJson uses the header and converts numbers and booleans", JSON.stringify(jj), '[{"name":"Ann","age":34,"ok":true},{"name":"Bo","age":"","ok":false}]');
eq("jsonToCsv from an array of objects unions the keys", C.jsonToCsv('[{"a":1,"b":"x"},{"b":"y","c":true}]'), "a,b,c\n1,x,\n,y,true\n");
eq("jsonToCsv from an array of arrays", C.jsonToCsv('[["h1","h2"],[1,2]]'), "h1,h2\n1,2\n");
eq("jsonToCsv finds the first array inside an object", C.jsonToCsv('{"meta":1,"rows":[{"a":1}]}'), "a\n1\n");
ok("jsonToCsv rejects a scalar", (()=>{try{C.jsonToCsv("42");return false;}catch(e){return /array/.test(e.message);}})());
ok("csv and json converters are registered", C.findConverter("csv","json")?.engine==="data"&&C.findConverter("json","csv")?.engine==="data");
(async()=>{const b=await C.ENGINES.data(new File(["a,b\n1,2"],"t.csv"),{},()=>{},"json");const txt=await b.text();
  ok("data engine csv to json returns JSON with numbers", b.type==="application/json"&&txt.includes('"a": 1'));
  const c=await C.ENGINES.data(new File(['[{"x":"y, z"}]'],"t.json"),{},()=>{},"csv");
  eq("data engine json to csv quotes commas", await c.text(), 'x\n"y, z"\n');})();

/* ---------- 19. More ffmpeg outputs ---------- */
section("More ffmpeg outputs");
ok("mov output uses h264 in a mov container", (a=>a.includes("libx264")&&a[a.indexOf("-f")+1]==="mov")(A("mp4","mov",{})));
ok("opus output caps the bitrate at 256k with vbr", (a=>a.includes("libopus")&&a[a.indexOf("-b:a")+1]==="256k"&&a.includes("-vbr"))(A("wav","opus",{quality:"95"})));
ok("aac output is raw ADTS", (a=>a.includes("aac")&&a[a.indexOf("-f")+1]==="adts")(A("wav","aac",{})));
ok("video to m4a drops the video", (a=>a.includes("-vn")&&a.includes("aac"))(A("mp4","m4a",{})));
eq("mime for mov, opus, aac", [C.MEDIA_MIME.mov,C.MEDIA_MIME.opus,C.MEDIA_MIME.aac].join("|"), "video/quicktime|audio/ogg|audio/aac");
ok("registry offers mov and m4a from video, opus and aac from audio", C.findConverter("mp4","mov")?.engine==="ffmpeg"&&C.findConverter("mov","m4a")?.engine==="ffmpeg"&&C.findConverter("wav","opus")?.engine==="ffmpeg"&&C.findConverter("mp3","aac")?.engine==="ffmpeg");

/* ---------- 20. ICO ---------- */
section("ICO");
const png1=new Uint8Array([0x89,0x50,0x4e,0x47,1,2,3]),png2=new Uint8Array([0x89,0x50,0x4e,0x47,9,8]);
const ico=C.icoFromPngs([{w:16,h:16,png:png1},{w:256,h:256,png:png2}]);
const iv=new DataView(ico.buffer);
ok("ICONDIR header: reserved 0, type 1, count 2", iv.getUint16(0,true)===0&&iv.getUint16(2,true)===1&&iv.getUint16(4,true)===2);
ok("entry 1: 16x16, size and offset point at the png", ico[6]===16&&ico[7]===16&&iv.getUint32(14,true)===7&&iv.getUint32(18,true)===6+32);
ok("entry 2: 256 is written as 0", ico[22]===0&&ico[23]===0&&iv.getUint32(34,true)===6+32+7);
ok("png bytes follow the directory in order", ico[38]===0x89&&ico[6+32+7]===0x89);
ok("raster accepts avif and ico, and writes ico", C.findConverter("avif","png")?.engine==="raster"&&C.findConverter("ico","png")?.engine==="raster"&&C.findConverter("png","ico")?.engine==="raster");
eq("mime for ico", C.mimeFor("ico"), "image/x-icon");

/* ---------- 21. EPUB ---------- */
section("EPUB");
const ep=C.epubEntries([{type:"h1",runs:[{text:"T"}]},{type:"p",runs:[{text:"a<b"},{text:"\n"},{text:"c"}]},{type:"hr",runs:[]}],"My Book");
eq("mimetype is the first entry", ep[0].name+":"+new TextDecoder().decode(ep[0].data), "mimetype:application/epub+zip");
ok("container.xml points at the opf", ep[1].name==="META-INF/container.xml"&&/full-path="OEBPS\/content\.opf"/.test(new TextDecoder().decode(ep[1].data)));
const opf=new TextDecoder().decode(ep.find(e=>e.name==="OEBPS/content.opf").data);
ok("opf has title, identifier, manifest, and spine", /<dc:title>My Book<\/dc:title>/.test(opf)&&/<dc:identifier id="pub-id">urn:uuid:[0-9a-f-]{36}<\/dc:identifier>/.test(opf)&&/href="chapter.xhtml"/.test(opf)&&/<itemref idref="chapter"/.test(opf)&&/properties="nav"/.test(opf));
const xh=new TextDecoder().decode(ep.find(e=>e.name==="OEBPS/chapter.xhtml").data);
ok("chapter is XHTML: namespace, self-closing hr and br, escaped text", /xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/.test(xh)&&/<hr\/>/.test(xh)&&/<br\/>/.test(xh)&&/a&lt;b/.test(xh)&&!/<br>/.test(xh)&&!/<hr>/.test(xh));
ok("the zip starts with the stored mimetype at offset 38", (z=>new TextDecoder().decode(z.subarray(38,58)))(C.zipStore(ep))==="application/epub+zip");
ok("docs converter offers epub", C.findConverter("md","epub")?.engine==="docs");

/* ---------- 22. Block model v2: nested lists, underline, tables ---------- */
section("Block model v2");
const nested=[{type:"li",runs:[{text:"a"}]},{type:"li",level:1,runs:[{text:"b"}]},{type:"li",runs:[{text:"c"}]},{type:"ol",runs:[{text:"one"}]},{type:"ol",level:1,runs:[{text:"two"}]}];
eq("md indents nested items", C.blocksToMd(nested), "- a\n  - b\n- c\n\n1. one\n   1. two\n");
ok("html nests the lists", (h=>h.includes("<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n<li>c</li>\n</ul>"))(C.blocksToHtml(nested,"t")));
ok("txt indents nested items", C.blocksToTxt(nested).includes("- a\n  - b\n- c"));
const tbl=[{type:"table",header:true,rows:[[[{text:"Name"}],[{text:"Age"}]],[[{text:"Ann"}],[{text:"34"}]],[[{text:"B|o"}],[{text:""}]]]}];
eq("md pipe table", C.blocksToMd(tbl), "| Name | Age |\n| --- | --- |\n| Ann | 34 |\n| B\\|o |  |\n");
ok("html table with thead", (h=>h.includes("<table>\n<thead>\n<tr><th>Name</th><th>Age</th></tr>\n</thead>\n<tbody>\n<tr><td>Ann</td><td>34</td></tr>"))(C.blocksToHtml(tbl,"t")));
ok("txt table uses tabs", C.blocksToTxt(tbl).includes("Name\tAge\nAnn\t34"));
ok("underline survives in html and md", C.blocksToHtml([{type:"p",runs:[{text:"u",u:true}]}],"t").includes("<u>u</u>")&&C.blocksToMd([{type:"p",runs:[{text:"u",u:true}]}]).includes("<u>u</u>"));
ok("rtf \\ul and \\ulnone toggle underline", (r=>r[0].runs.map(x=>!!x.u).join(","))(C.rtfToBlocks(String.raw`{\rtf1 \ul on\ulnone  off}`))==="true,false");
ok("xhtml table and nested list are well formed", (x=>x.includes("<table>")&&x.includes("<ul>\n<li>a\n<ul>"))(C.blocksToXhtml([...nested,...tbl],"t")));

/* ---------- 23. HEIC, TIFF, PSD registry ---------- */
section("HEIC, TIFF, PSD registry");
eq("heif and tif normalize", C.norm("heif")+","+C.norm("tif"), "heic,tiff");
ok("heic, tiff, psd route to the imageDecode engine", ["heic","tiff","psd"].every(f=>C.findConverter(f,"png")?.engine==="imageDecode"&&C.findConverter(f,"webp")?.engine==="imageDecode"));
ok("heic is no longer a planned format", !C.CONVERTERS.some(c=>c.status==="planned"&&c.from.includes("heic")));

/* ---------- 24. Mesh formats ---------- */
section("Mesh formats");
const cube={vertices:[0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1],
  triangles:[0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]};
const stlB=C.toStl(cube);
eq("binary STL size is 84 + 50 per triangle", stlB.length, 84+50*12);
eq("binary STL round-trips", C.parseStl(stlB).triangles.length+":"+C.parseStl(stlB).vertices.length, "36:24");
const asciiStl="solid c\n facet normal 0 0 0\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\nendsolid c\n";
eq("ascii STL parses one triangle", JSON.stringify(C.parseStl(new TextEncoder().encode(asciiStl))), '{"vertices":[0,0,0,1,0,0,0,1,0],"triangles":[0,1,2]}');
const objTxt=C.toObj(cube);
ok("OBJ has 8 v lines and 12 f lines (1-based)", (objTxt.match(/^v /gm)||[]).length===8&&(objTxt.match(/^f /gm)||[]).length===12&&/^f 1 3 2$/m.test(objTxt));
eq("OBJ parser triangulates quads and accepts v/vt/vn", JSON.stringify(C.parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1/1 2/2/2 3/3/3 4/4/4\n").triangles), "[0,1,2,0,2,3]");
eq("OBJ negative indices count from the end", JSON.stringify(C.parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n").triangles), "[0,1,2]");
ok("mesh converter is registered both ways", C.findConverter("stl","3mf")?.engine==="mesh"&&C.findConverter("3mf","obj")?.engine==="mesh"&&C.findConverter("obj","stl")?.engine==="mesh");
ok("step and iges stay planned, pdf to xlsx is gone", C.possibleTargets("step").get("stl")==="planned"&&!C.possibleTargets("pdf").has("xlsx"));
(async()=>{
  const m3=await C.parse3mf(C.to3mf(cube));
  eq("3MF round-trips (stored zip)", m3.vertices.length+":"+m3.triangles.length, "24:36");
  const zlib=require("zlib");const enc=new TextEncoder();
  const model=enc.encode(C.modelXml3mf(cube));
  const dz=C.zipWrite([
    {name:"[Content_Types].xml",data:enc.encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')},
    {name:"_rels/.rels",data:enc.encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')},
    {name:"3D/3dmodel.model",data:model,deflate:new Uint8Array(zlib.deflateRawSync(Buffer.from(model)))}]);
  const entries=await C.unzip(dz);
  ok("unzip inflates a deflated entry", entries.find(e=>e.name==="3D/3dmodel.model")?.data.length===model.length);
  const m4=await C.parse3mf(dz);
  eq("reads a deflated 3MF", m4.vertices.length+":"+m4.triangles.length, "24:36");
  const blob=await C.ENGINES.mesh(new File([C.toStl(cube)],"cube.stl"),{},()=>{},"obj");
  ok("mesh engine stl to obj", blob.type==="model/obj"&&(await blob.text()).includes("\nf "));
  const b3=await C.ENGINES.mesh(new File([objTxt],"cube.obj"),{},()=>{},"3mf");
  ok("mesh engine obj to 3mf is a zip", b3.type==="model/3mf"&&new Uint8Array(await b3.arrayBuffer())[0]===0x50);
  let msg="";try{await C.ENGINES.mesh(new File(["nonsense"],"x.stl"),{},()=>{},"obj");}catch(e){msg=e.message;}
  ok("an unreadable mesh fails clearly", /couldn't|no triangles/i.test(msg), msg);
})();

/* ---------- 25. PDF to PowerPoint registry ---------- */
section("PDF to PowerPoint registry");
ok("pdf to pptx routes to pdfPptx with sharpness and pages options", (c=>c&&c.engine==="pdfPptx"&&c.options.some(o=>o.key==="dpi")&&c.options.some(o=>o.key==="pages"))(C.findConverter("pdf","pptx")));
ok("pptx is no longer planned", !C.CONVERTERS.some(c=>c.status==="planned"&&c.to.includes("pptx")));

/* ---------- 26. Cancellation ---------- */
section("Cancellation");
ok("throwIfAborted is quiet without a signal", (()=>{try{C.throwIfAborted(undefined);C.throwIfAborted(new AbortController().signal);return true;}catch(e){return false;}})());
ok("throwIfAborted throws a cancelled error for an aborted signal", (()=>{const ac=new AbortController();ac.abort();try{C.throwIfAborted(ac.signal);return false;}catch(e){return e.cancelled===true&&/Cancelled/.test(e.message);}})());
(async()=>{const ac=new AbortController();ac.abort();let msg="";
  try{await C.ENGINES.data(new File(["a,b"],"t.csv"),{signal:ac.signal},()=>{},"json");}catch(e){msg=e.message;}
  ok("the data engine honors an aborted signal", /Cancelled/.test(msg), msg);
  try{await C.ENGINES.mesh(new File([C.toStl({vertices:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]})],"t.stl"),{signal:ac.signal},()=>{},"obj");msg="";}catch(e){msg=e.message;}
  ok("the mesh engine honors an aborted signal", /Cancelled/.test(msg), msg);})();

/* ---------- 27. Two-column PDFs ---------- */
section("Two-column PDFs");
{const it2=(str,x,y)=>({str,x,y,size:11,width:200});
 const twoCol=[[it2("Left one.",72,700),it2("Right one.",330,700),it2("Left two.",72,684),it2("Right two.",330,684),it2("Left three.",72,668),it2("Right three.",330,668),it2("Left four.",72,652),it2("Right four.",330,652)]];
 const text=C.pdfTextToBlocks(twoCol).map(b=>C.runsText(b.runs)).join(" | ");
 ok("two columns read down the left column, then the right", text.startsWith("Left one. Left two. Left three. Left four.")&&/Right one\. Right two\. Right three\. Right four\./.test(text), text);
 ok("the column break starts a new paragraph", C.pdfTextToBlocks(twoCol).length===2, C.pdfTextToBlocks(twoCol).length+" blocks");
 const oneCol=[[it2("A line that spans.",72,700),it2("Another full line.",72,684),it2("Third.",72,668),it2("Fourth.",72,652)]];
 eq("a single column is unchanged", C.pdfTextToBlocks(oneCol).map(b=>C.runsText(b.runs)).join("|"), "A line that spans. Another full line. Third. Fourth.");
 const indented=[[it2("Body line.",72,700),it2("Body line two.",72,684),it2("Body three.",72,668),it2("x",90,652),it2("Body four.",72,636)]];
 eq("a lone indented item does not count as a column", C.pdfTextToBlocks(indented).length, 1);}

/* ---------- 28. Every format does something ---------- */
section("Every format does something");
{const used=new Set();C.CONVERTERS.filter(c=>c.status==="available").forEach(c=>{c.from.forEach(f=>used.add(C.norm(f)));c.to.forEach(t=>used.add(C.norm(t)));});
 const allowed=new Set(["dwg","step","stp","iges","igs","zip","eps","ai"]);
 const idle=Object.keys(C.FORMATS).filter(f=>!used.has(f)&&!allowed.has(f));
 ok("every described format is used by a real converter"+(idle.length?" (idle: "+idle+")":""), idle.length===0);
 ok("the only planned targets are dwg and step", C.CONVERTERS.filter(c=>c.status==="planned").every(c=>c.to.every(t=>["dwg","step","stl","3mf"].includes(t))));
 eq("version is 1.1.0", require("./package.json").version, "1.1.0");}

/* ---------- summary ---------- */
function finish(){
  console.log("\n────────────────────────────");
  console.log(`  ${pass} passed, ${fail} failed`);
  if(fail){console.log("  FAILED: "+fails.join(" | "));process.exit(1);}
  else console.log("  ✅ all green");
}
setTimeout(finish, 50);

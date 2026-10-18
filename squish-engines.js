/* ============================================================
   SQUISH ENGINES. Library-backed converters. Loads after
   squish-core.js in a browser and replaces the placeholder
   entries on SquishCore.ENGINES. Libraries are imported lazily
   from vendor/ (relative to the page URL), except the ffmpeg
   wasm core, which comes from unpkg because of its size.
   ============================================================ */
(function(){
  "use strict";
  const C=globalThis.SquishCore;
  if(!C)throw new Error("squish-core.js must load before squish-engines.js");
  const {norm,extOf,canvasBlob,mimeFor,parsePageRange,zipStore,runsText,blocksFromText,rtfToBlocks,
    blocksToHtml,blocksToMd,blocksToTxt,epubEntries,pdfTextToBlocks,throwIfAborted,pdfSafeText,ffmpegArgs,trimError,MEDIA_MIME,decodeText}=C;

  /* ---------- lazy library loading ---------- */
  const LIBS={
    pdfjs:{url:"vendor/pdfjs/pdf.min.mjs",label:"the PDF engine"},
    marked:{url:"vendor/marked/marked.esm.js",label:"the Markdown engine"},
    docx:{url:"vendor/docx/index.mjs",label:"the Word engine"},
    pdflib:{url:"vendor/pdf-lib/pdf-lib.esm.min.js",label:"the PDF writer"},
    ffmpeg:{url:"vendor/ffmpeg/index.js",label:"the video engine"},
    ffutil:{url:"vendor/ffmpeg-util/index.js",label:"the video engine"},
    fontkit:{url:"vendor/fontkit/fontkit.umd.min.js",kind:"script",global:"fontkit",label:"the font engine"},
    heif:{url:"vendor/libheif/libheif-bundle.mjs",label:"the HEIC decoder (2 MB, first time only)"},
    utif:{url:"vendor/utif/UTIF.js",kind:"script",global:"UTIF",label:"the TIFF decoder"},
    agpsd:{url:"vendor/ag-psd/bundle.js",kind:"script",global:"agPsd",label:"the Photoshop reader"},
    pptx:{url:"vendor/pptxgenjs/pptxgen.bundle.js",kind:"script",global:"PptxGenJS",label:"the PowerPoint writer"},
    jxldec:{url:"vendor/jsquash-jxl/codec/dec/jxl_dec.js",label:"the JPEG XL decoder (300 KB, first time only)"},
  };
  const loaded={};
  // UMD builds: inject a script tag and hand back the global it defines.
  function loadScript(url,global){
    if(globalThis[global])return Promise.resolve(globalThis[global]);
    return new Promise((res,rej)=>{const sc=document.createElement("script");sc.src=new URL(url,document.baseURI).href;
      sc.onload=()=>globalThis[global]?res(globalThis[global]):rej(new Error("script loaded but "+global+" is missing"));
      sc.onerror=()=>rej(new Error("failed to load "+url));document.head.appendChild(sc);});
  }
  function loadLib(name,onP){
    if(!loaded[name]){
      const lib=LIBS[name];if(!lib)return Promise.reject(new Error("unknown library "+name));
      if(onP)onP(0.02,"loading "+lib.label);
      loaded[name]=(lib.kind==="script"?loadScript(lib.url,lib.global):import(new URL(lib.url,document.baseURI).href)).catch(e=>{
        delete loaded[name];throw new Error("Couldn't load "+lib.label+". "+(e&&e.message||e));});
    }
    return loaded[name];
  }
  const baseOf=file=>(file.name||"squished").replace(/\.[^.]+$/,"")||"squished";

  /* ---------- SVG -> DXF (DOM walk; geometry lives in core) ---------- */
  const SHAPE_TAGS=new Set(["path","line","rect","circle","ellipse","polygon","polyline"]);
  function svgToDxf(svgText,mode,tol){
    const doc=new DOMParser().parseFromString(svgText,"image/svg+xml");
    if(doc.querySelector("parsererror"))throw new Error("Squish couldn't read this SVG. The file isn't valid XML.");
    const shapes=[];
    const walk=(el,ctm)=>{for(const n of el.children){const tag=n.tagName.toLowerCase();
      const m=C.mulMatrix(ctm,C.parseTransform(n.getAttribute("transform")));
      if(SHAPE_TAGS.has(tag)){const attrs={};for(const at of n.attributes)attrs[at.name]=at.value;shapes.push({tag,attrs,ctm:m});}
      else if(tag==="g"||tag==="svg"||tag==="a"||tag==="switch")walk(n,m);}};
    walk(doc.documentElement,C.parseTransform(doc.documentElement.getAttribute("transform")));
    return C.shapesToDxf(shapes,mode,tol);
  }
  C.svgToDxf=svgToDxf;

  /* ---------- HEIC, TIFF, PSD -> canvas ---------- */
  function canvasFromRgba(rgba,w,h){const c=document.createElement("canvas");c.width=w;c.height=h;
    c.getContext("2d").putImageData(new ImageData(rgba instanceof Uint8ClampedArray?rgba:new Uint8ClampedArray(rgba.buffer||rgba),w,h),0,0);return c;}
  /* ---------- JPEG XL (jSquash builds of libjxl; single-thread encoder, no SharedArrayBuffer needed) ---------- */
  let jxlDecReady=null;
  const JXL_BAD="Squish couldn't read this JPEG XL file. It may be damaged or not an image.";
  // The Emscripten glue exports a factory; each codec is instantiated once per page.
  async function jxlDecode(buf,onP){
    const mod=await loadLib("jxldec",onP);if(!jxlDecReady)jxlDecReady=mod.default({noInitialRun:true});
    const m=await jxlDecReady;let img=null;try{img=m.decode(buf);}catch(e){img=null;}
    if(!img||!img.width)throw new Error(JXL_BAD);return img;
  }
  // Browsers that decode JPEG XL natively (Safari 17, Chrome 155, recent Firefox) skip the wasm download.
  async function jxlNativeCanvas(buf){
    if(typeof createImageBitmap!=="function")return null;
    try{const bmp=await createImageBitmap(new Blob([buf],{type:"image/jxl"}));
      const c=document.createElement("canvas");c.width=bmp.width;c.height=bmp.height;c.getContext("2d").drawImage(bmp,0,0);if(bmp.close)bmp.close();return c;}
    catch(e){return null;}
  }
  // The encoder runs in a module worker (squish-jxl-worker.js, deployed next to this file) so the
  // page keeps painting and Cancel can terminate a long encode. One worker per page; it is dropped
  // after an abort or a crash and the next conversion starts a fresh one, like the ffmpeg instance.
  const JXL_WORKER_URL="squish-jxl-worker.js",JXL_ENC_LABEL="the JPEG XL encoder (500 KB, first time only)";
  let jxlWorker=null,jxlJob=0;
  function getJxlWorker(){
    if(!jxlWorker)jxlWorker=new Worker(new URL(JXL_WORKER_URL,document.baseURI),{type:"module"});
    return jxlWorker;
  }
  function dropJxlWorker(w){try{w.terminate();}catch(e){}if(jxlWorker===w)jxlWorker=null;}
  async function canvasToJxl(c,opts,onP){
    const tooBig=C.jxlSizeError(c.width,c.height);if(tooBig)throw new Error(tooBig);
    const signal=opts&&opts.signal;throwIfAborted(signal);
    const data=c.getContext("2d").getImageData(0,0,c.width,c.height);
    const w=getJxlWorker(),id=++jxlJob;
    const out=await new Promise((res,rej)=>{
      const cleanup=()=>{w.removeEventListener("message",onMsg);w.removeEventListener("error",onErr);if(signal)signal.removeEventListener("abort",onAbort);};
      const onMsg=ev=>{const r=ev.data;if(!r||r.id!==id)return;
        if(r.stage==="loading"){if(onP)onP(0.02,"loading "+JXL_ENC_LABEL);return;}
        if(r.stage==="encoding"){if(onP)onP(0.75,"encoding JPEG XL on your device");return;}
        cleanup();
        if(r.ok)res(r.buffer);
        else if(r.stage==="load"){dropJxlWorker(w);rej(new Error("Couldn't load "+JXL_ENC_LABEL+". "+r.message));}
        else rej(new Error("Squish couldn't encode this image as JPEG XL. Try the Resize option if it is very large."));};
      const onErr=ev=>{cleanup();dropJxlWorker(w);if(ev&&ev.preventDefault)ev.preventDefault();
        rej(new Error("Couldn't load "+JXL_ENC_LABEL+". "+(ev&&ev.message||"the worker failed")));};
      const onAbort=()=>{cleanup();dropJxlWorker(w);try{throwIfAborted(signal);}catch(e){rej(e);}};
      w.addEventListener("message",onMsg);w.addEventListener("error",onErr);
      if(signal)signal.addEventListener("abort",onAbort,{once:true});
      const buf=data.data.buffer;
      w.postMessage({id,data:buf,width:c.width,height:c.height,options:C.jxlEncodeOptions(opts)},[buf]);
    });
    return new Blob([out],{type:"image/jxl"});
  }

  let libheifReady=null;
  async function decodeToCanvas(file,from,onP){
    const buf=await file.arrayBuffer();
    if(from==="jxl"){
      if(!C.isJxl(new Uint8Array(buf)))throw new Error(JXL_BAD);
      const native=await jxlNativeCanvas(buf);if(native)return native;
      const img=await jxlDecode(buf,onP);return canvasFromRgba(img.data,img.width,img.height);
    }
    if(from==="heic"){
      const mod=await loadLib("heif",onP);
      if(!libheifReady)libheifReady=mod.default();
      const libheif=await libheifReady;
      let imgs;try{imgs=new libheif.HeifDecoder().decode(new Uint8Array(buf));}catch(e){imgs=[];}
      if(!imgs||!imgs.length)throw new Error("Squish couldn't read this HEIC file. It may be damaged or not an image.");
      const im=imgs[0],w=im.get_width(),h=im.get_height();
      const data=await new Promise(res=>im.display({data:new Uint8ClampedArray(w*h*4),width:w,height:h},res));
      imgs.forEach(i=>{try{i.free();}catch(e){}});
      if(!data)throw new Error("Squish couldn't decode this HEIC image.");
      return canvasFromRgba(data.data,w,h);
    }
    if(from==="tiff"){
      const UTIF=await loadLib("utif",onP);let ifds;
      try{ifds=UTIF.decode(buf);}catch(e){ifds=[];}
      if(!ifds.length)throw new Error("Squish couldn't read this TIFF file.");
      UTIF.decodeImage(buf,ifds[0]);const rgba=UTIF.toRGBA8(ifds[0]);
      return canvasFromRgba(rgba,ifds[0].width,ifds[0].height);
    }
    if(from==="psd"){
      const ag=await loadLib("agpsd",onP);
      if(ag.initializeCanvas)ag.initializeCanvas((w,h)=>{const c=document.createElement("canvas");c.width=w;c.height=h;return c;});
      let psd;try{psd=ag.readPsd(buf,{skipLayerImageData:true,skipThumbnail:true});}catch(e){throw new Error("Squish couldn't read this PSD file. "+(e&&e.message||""));}
      if(psd.canvas)return psd.canvas;
      if(psd.imageData)return canvasFromRgba(psd.imageData.data,psd.width,psd.height);
      throw new Error("This PSD has no flattened image. Save it with 'Maximize compatibility' turned on.");
    }
    throw new Error("Squish can't read ."+from+" files.");
  }
  async function imageDecode(file,opts,onP,toExt){
    throwIfAborted(opts.signal);
    const from=norm(extOf(file.name));const src=await decodeToCanvas(file,from,onP);throwIfAborted(opts.signal);onP(0.7,"encoding");
    const scale=parseFloat(opts.resize||"1"),c=document.createElement("canvas");
    c.width=Math.max(1,Math.round(src.width*scale));c.height=Math.max(1,Math.round(src.height*scale));
    const ctx=c.getContext("2d");if(toExt==="jpg"){ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);}
    ctx.drawImage(src,0,0,c.width,c.height);
    if(toExt==="jxl")return canvasToJxl(c,opts,onP);
    return canvasBlob(c,mimeFor(toExt),(parseInt(opts.quality||85,10))/100);
  }

  /* ---------- pdf.js ---------- */
  async function openPdf(file,onP){
    const pdfjs=await loadLib("pdfjs",onP);
    pdfjs.GlobalWorkerOptions.workerSrc=new URL("vendor/pdfjs/pdf.worker.min.mjs",document.baseURI).href;
    const data=new Uint8Array(await file.arrayBuffer());
    try{return await pdfjs.getDocument({data,isEvalSupported:false}).promise;}
    catch(e){
      if(e&&e.name==="PasswordException")throw new Error("This PDF is password protected. Remove the password and try again.");
      throw new Error("Squish couldn't read this PDF. "+(e&&e.message||e));
    }
  }
  // Renders the requested pages to image blobs. Shared by pdfRaster and pdfPptx.
  async function renderPdfPages(file,opts,onP,toExt,progressSpan){
    throwIfAborted(opts.signal);
    const doc=await C.openPdf(file,onP);
    const out=[];let pages,total;const [p0,p1]=progressSpan||[0.1,0.9];
    try{
      total=doc.numPages;pages=parsePageRange(opts.pages,total);
      if(!pages.length)throw new Error('No pages matched "'+opts.pages+'". This PDF has '+total+(total===1?" page.":" pages."));
      const scale=parseInt(opts.dpi||"150",10)/72,mime=mimeFor(toExt),q=toExt==="jpg"?0.9:undefined;
      for(let k=0;k<pages.length;k++){
        throwIfAborted(opts.signal);
        onP(p0+(p1-p0)*(k/pages.length),"rendering page "+pages[k]+" of "+total);
        const page=await doc.getPage(pages[k]);const vp=page.getViewport({scale}),vp1=page.getViewport({scale:1});
        const c=document.createElement("canvas");c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
        const ctx=c.getContext("2d");
        if(toExt==="jpg"){ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);}
        await page.render({canvasContext:ctx,viewport:vp,intent:"print"}).promise;
        out.push({blob:await canvasBlob(c,mime,q),num:pages[k],wPt:vp1.width,hPt:vp1.height});page.cleanup();
      }
    }finally{await doc.destroy();}
    return {pages:out,total};
  }
  async function pdfRaster(file,opts,onP,toExt){
    const {pages,total}=await renderPdfPages(file,opts,onP,toExt);
    if(pages.length===1)return pages[0].blob;
    onP(0.95,"zipping "+pages.length+" images");
    const pad=String(total).length>2?3:2,base=baseOf(file),entries=[];
    for(const pg of pages)entries.push({name:base+"-p"+String(pg.num).padStart(pad,"0")+"."+toExt,data:new Uint8Array(await pg.blob.arrayBuffer())});
    return {blob:new Blob([zipStore(entries)],{type:"application/zip"}),name:base+".zip"};
  }
  const blobToDataUrl=blob=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob);});
  async function pdfPptx(file,opts,onP){
    throwIfAborted(opts.signal);
    const Pptx=await loadLib("pptx",onP);
    const {pages}=await renderPdfPages(file,opts,onP,"png",[0.1,0.8]);
    onP(0.85,"building the slides");
    const pres=new Pptx();const w=pages[0].wPt/72,h=pages[0].hPt/72;
    pres.defineLayout({name:"squish-page",width:w,height:h});pres.layout="squish-page";
    for(const pg of pages){const slide=pres.addSlide();slide.addImage({data:await blobToDataUrl(pg.blob),x:0,y:0,w:pg.wPt/72,h:pg.hPt/72});}
    const out=await pres.write({outputType:"blob"});
    return new Blob([out],{type:"application/vnd.openxmlformats-officedocument.presentationml.presentation"});
  }

  /* ---------- HTML -> blocks (DOMParser) ---------- */
  function trimRuns(runs){
    if(!runs.length)return runs;
    runs[0].text=runs[0].text.replace(/^\s+/,"");
    runs[runs.length-1].text=runs[runs.length-1].text.replace(/\s+$/,"");
    return runs.filter(r=>r.text);
  }
  const imgText=n=>{const alt=(n.getAttribute("alt")||"").trim();return alt?"[image: "+alt+"]":"[image]";};
  function blocksFromHtml(html){
    const doc=new DOMParser().parseFromString(html,"text/html");const blocks=[];
    const SKIP=new Set(["script","style","head","title","nav","template","noscript","meta","link"]);
    const CONTAINERS=new Set(["div","section","article","main","body","html","header","footer","aside","figure","details","summary","center","font","span"]);
    const inline=(node,st,runs)=>{node.childNodes.forEach(n=>{
      if(n.nodeType===3){const t=n.textContent.replace(/\s+/g," ");if(t)runs.push({text:t,...st});return;}
      if(n.nodeType!==1)return;
      const tag=n.tagName.toLowerCase();
      if(tag==="br"){runs.push({text:"\n",...st});return;}
      if(tag==="img"){runs.push({text:imgText(n),...st});return;}
      if(SKIP.has(tag))return;
      const s={...st};
      if(tag==="b"||tag==="strong")s.b=true;if(tag==="i"||tag==="em")s.i=true;if(tag==="code")s.code=true;if(tag==="u"||tag==="ins")s.u=true;
      if(tag==="a"&&n.getAttribute("href"))s.href=n.getAttribute("href");
      inline(n,s,runs);});};
    const runsOfNode=node=>{const runs=[];inline(node,{},runs);return trimRuns(runs);};
    const push=(type,node,extra)=>{const t=runsOfNode(node);if(t.length)blocks.push({type,...(extra||{}),runs:t});};
    const walk=(node,listType,level)=>{node.childNodes.forEach(n=>{
      if(n.nodeType===3){const t=n.textContent.trim();if(t)blocks.push({type:"p",runs:[{text:t}]});return;}
      if(n.nodeType!==1)return;
      const tag=n.tagName.toLowerCase();
      if(SKIP.has(tag))return;
      if(/^h[1-6]$/.test(tag))push(tag==="h1"?"h1":tag==="h2"?"h2":"h3",n);
      else if(tag==="p")push("p",n);
      else if(tag==="pre")blocks.push({type:"code",runs:[{text:n.textContent.replace(/\n$/,"")}]});
      else if(tag==="blockquote")push("quote",n);
      else if(tag==="hr")blocks.push({type:"hr",runs:[]});
      else if(tag==="img")blocks.push({type:"p",runs:[{text:imgText(n)}]});
      else if(tag==="ul"||tag==="ol")walk(n,tag==="ul"?"li":"ol",listType==null?0:level+1);
      else if(tag==="li"){
        const nested=[...n.children].filter(c=>/^(ul|ol)$/i.test(c.tagName));
        const clone=n.cloneNode(true);[...clone.children].forEach(c=>{if(/^(ul|ol)$/i.test(c.tagName))c.remove();});
        push(listType||"li",clone,{level:level||0});
        nested.forEach(c=>walk(c,c.tagName.toLowerCase()==="ul"?"li":"ol",(level||0)+1));}
      else if(tag==="table"){
        const trs=[...n.querySelectorAll("tr")].filter(tr=>tr.closest("table")===n);
        const rows=trs.map(tr=>[...tr.children].filter(c=>/^(td|th)$/i.test(c.tagName)).map(c=>{const r=runsOfNode(c);return r.length?r:[{text:""}];}));
        if(rows.length){const header=[...trs[0].children].every(c=>c.tagName.toLowerCase()==="th");blocks.push({type:"table",header,rows});}}
      else if(CONTAINERS.has(tag))walk(n,listType,level);
      else push("p",n);});};
    walk(doc.body,null,0);
    return blocks;
  }

  /* ---------- documents ---------- */
  const readText=async file=>decodeText(new Uint8Array(await file.arrayBuffer()));
  async function parseDoc(file,onP){
    const from=norm(extOf(file.name)),text=await readText(file);
    if(from==="md"){const {marked}=await loadLib("marked",onP);return blocksFromHtml(marked.parse(text,{gfm:true,async:false}));}
    if(from==="html")return blocksFromHtml(text);
    if(from==="rtf")return rtfToBlocks(text);
    return blocksFromText(text);
  }
  async function docs(file,opts,onP,toExt){
    throwIfAborted(opts.signal);
    const blocks=await parseDoc(file,onP);throwIfAborted(opts.signal);
    if(!blocks.length)throw new Error("Squish couldn't find any text in that file.");
    onP(0.4,"rebuilding the document");
    const title=baseOf(file);
    if(toExt==="html")return new Blob([blocksToHtml(blocks,title)],{type:"text/html"});
    if(toExt==="md")return new Blob([blocksToMd(blocks)],{type:"text/markdown"});
    if(toExt==="txt")return new Blob([blocksToTxt(blocks)],{type:"text/plain"});
    if(toExt==="epub")return new Blob([zipStore(epubEntries(blocks,title))],{type:"application/epub+zip"});
    if(toExt==="docx")return blocksToDocx(blocks,onP);
    if(toExt==="pdf")return blocksToPdf(blocks,title,onP);
    throw new Error("Squish can't write ."+toExt+" yet.");
  }
  /* ---------- docx writer ---------- */
  const flatText=t=>String(t||"").replace(/\s*\n\s*/g," ");
  async function blocksToDocx(blocks,onP){
    const mod=await loadLib("docx",onP);onP(0.6,"writing the Word file");
    const d=mod.Document?mod:mod.default;
    const {Document,Packer,Paragraph,TextRun,HeadingLevel,ExternalHyperlink,AlignmentType,BorderStyle,Table,TableRow,TableCell,WidthType}=d;
    const runsOf=(runs,bold)=>runs.map(r=>{
      const base={text:flatText(r.text),bold:!!r.b||!!bold,italics:!!r.i};
      if(r.u)base.underline={};if(r.code)base.font="Courier New";
      if(r.href)return new ExternalHyperlink({link:r.href,children:[new TextRun({...base,style:"Hyperlink"})]});
      return new TextRun(base);
    });
    let listInstance=0,inList=false;const children=[];
    blocks.forEach(b=>{
      if(b.type==="ol"){if(!inList){listInstance++;inList=true;}}else if(b.type!=="li")inList=false;
      const lvl=Math.min(b.level||0,2);
      switch(b.type){
        case "h1":children.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:runsOf(b.runs)}));break;
        case "h2":children.push(new Paragraph({heading:HeadingLevel.HEADING_2,children:runsOf(b.runs)}));break;
        case "h3":children.push(new Paragraph({heading:HeadingLevel.HEADING_3,children:runsOf(b.runs)}));break;
        case "li":children.push(new Paragraph({bullet:{level:lvl},children:runsOf(b.runs)}));break;
        case "ol":children.push(new Paragraph({numbering:{reference:"squish-numbers",level:lvl,instance:listInstance},children:runsOf(b.runs)}));break;
        case "code":children.push(new Paragraph({children:runsText(b.runs).split("\n").map((line,i)=>new TextRun(i?{text:line,font:"Courier New",size:20,break:1}:{text:line,font:"Courier New",size:20}))}));break;
        case "quote":children.push(new Paragraph({indent:{left:720},children:runsOf(b.runs)}));break;
        case "hr":children.push(new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:6,color:"999999",space:1}},children:[]}));break;
        case "table":{const rows=b.rows||[];if(!rows.length)break;
          children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:rows.map((r,ri)=>new TableRow({tableHeader:!!(b.header&&ri===0),
            children:r.map(c=>new TableCell({children:[new Paragraph({children:runsOf(c,b.header&&ri===0)})]}))}))}));
          children.push(new Paragraph({children:[]}));break;}
        default:children.push(new Paragraph({children:runsOf(b.runs)}));
      }
    });
    const doc=new Document({
      numbering:{config:[{reference:"squish-numbers",levels:[0,1,2].map(l=>({level:l,format:l===1?"lowerLetter":l===2?"lowerRoman":"decimal",text:"%"+(l+1)+".",alignment:AlignmentType.START,style:{paragraph:{indent:{left:720*(l+1),hanging:360}}}}))}]},
      sections:[{children}],
    });
    const blob=await Packer.toBlob(doc);
    return new Blob([blob],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  }

  /* ---------- pdf writer (pdf-lib, Letter, Helvetica) ---------- */
  const BULLET=String.fromCharCode(0x2022);
  /* ---------- fonts for PDFs: standard Helvetica when the text is WinAnsi, DejaVu otherwise ---------- */
  const FONT_FILES={r:"DejaVuSans.ttf",b:"DejaVuSans-Bold.ttf",i:"DejaVuSans-Oblique.ttf",bi:"DejaVuSans-BoldOblique.ttf",c:"DejaVuSansMono.ttf"};
  let fontBytes=null;
  async function loadFonts(onP){
    if(fontBytes)return fontBytes;
    onP(0.3,"downloading fonts (3 MB, first time only)");
    const out={};
    for(const [k,f] of Object.entries(FONT_FILES)){const r=await fetch(new URL("vendor/dejavu/"+f,document.baseURI));if(!r.ok)throw new Error("Couldn't load the fonts ("+f+").");out[k]=new Uint8Array(await r.arrayBuffer());}
    return fontBytes=out;
  }
  const allRuns=b=>b.type==="table"?(b.rows||[]).flat():(b.runs||[]);
  const needsUnicode=blocks=>blocks.some(b=>allRuns(b).some(r=>[...(r.text||"")].some(ch=>ch!=="\t"&&pdfSafeText(ch)!==ch)));
  // In the standard-font path, emoji inside WinAnsi text would become "?". Route them to the
  // picture path too by forcing the Unicode path whenever the text has any emoji.
  const hasEmoji=blocks=>blocks.some(b=>allRuns(b).some(r=>/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}/u.test(r.text||"")));
  const graphemes=str=>typeof Intl!=="undefined"&&Intl.Segmenter?[...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(str)].map(g=>g.segment):[...str];

  async function blocksToPdf(blocks,title,onP){
    const L=await loadLib("pdflib",onP);onP(0.6,"laying out pages");
    const {PDFDocument,StandardFonts,rgb}=L;
    const pdf=await PDFDocument.create();pdf.setTitle(title||"Document");
    const F={};
    let unicode=false,charSet=null;
    if(needsUnicode(blocks)||hasEmoji(blocks)){
      const fk=await loadLib("fontkit",onP);pdf.registerFontkit(fk);
      const fb=await loadFonts(onP);onP(0.6,"laying out pages");
      for(const k of Object.keys(FONT_FILES))F[k]=await pdf.embedFont(fb[k],{subset:true});
      charSet=new Set(F.r.getCharacterSet());unicode=true;
    }else{
      F.r=await pdf.embedFont(StandardFonts.Helvetica);F.b=await pdf.embedFont(StandardFonts.HelveticaBold);
      F.i=await pdf.embedFont(StandardFonts.HelveticaOblique);F.bi=await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
      F.c=await pdf.embedFont(StandardFonts.Courier);
    }
    const W=612,H=792,M=72,maxW=W-2*M;
    let page=pdf.addPage([W,H]),y=H-M;
    const newPage=()=>{page=pdf.addPage([W,H]);y=H-M;};
    const safe=unicode?(t=>String(t).replace(/\t/g,"    ")):pdfSafeText;
    // Emoji always go through the system font, even when DejaVu has a monochrome glyph for them,
    // so they look the way they do on screen. Everything else uses the font when it has the glyph.
    const EMOJI=/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}/u;
    const canDraw=g=>!unicode?true:!EMOJI.test(g)&&[...g].every(ch=>charSet.has(ch.codePointAt(0)));
    const fontFor=(r,bold)=>r.code?F.c:((r.b||bold)&&r.i)?F.bi:(r.b||bold)?F.b:r.i?F.i:F.r;
    const SIZE={h1:22,h2:17,h3:14,p:11,li:11,ol:11,quote:11,code:9.5,hr:11,table:10};
    const widthOf=w=>w.img?w.w:w.font.widthOfTextAtSize(w.text,w.size);
    // Characters no font covers (emoji, CJK) are drawn by the browser with the system font
    // and embedded as small images, so they look the way they do on screen.
    const glyphCache=new Map();
    async function glyphImage(g,size){
      const key=g+"@"+size;if(glyphCache.has(key))return glyphCache.get(key);
      const px=Math.ceil(size*3),c=document.createElement("canvas");let ctx=c.getContext("2d");ctx.font=px+"px sans-serif";
      const w=Math.max(1,Math.ceil(ctx.measureText(g).width)+2),h=Math.ceil(px*1.3);c.width=w;c.height=h;
      ctx=c.getContext("2d");ctx.font=px+"px sans-serif";ctx.textBaseline="alphabetic";ctx.fillStyle="#000";ctx.fillText(g,1,px);
      const img=await pdf.embedPng(c.toDataURL("image/png"));
      const item={img,w:w/3,h:h/3,below:(h-px)/3,size};glyphCache.set(key,item);return item;
    }
    // runs -> words: text tokens with a font, size, and underline flag; glyph tokens for undrawable graphemes
    const tokenize=async(runs,size,bold)=>{const words=[];
      for(const r of runs){const font=fontFor(r,bold);
        for(const part of safe(r.text).split(/(\n)/)){if(part==="\n"){words.push({nl:true});continue;}
          for(const tok of part.split(/(\s+)/)){if(!tok)continue;
            if(/^\s+$/.test(tok)||canDraw(tok)){words.push({text:tok,font,size,u:!!r.u,space:/^\s+$/.test(tok)});continue;}
            let buf="";
            for(const g of graphemes(tok)){
              if(canDraw(g)){buf+=g;continue;}
              if(buf){words.push({text:buf,font,size,u:!!r.u});buf="";}
              words.push({...await glyphImage(g,size),u:!!r.u});}
            if(buf)words.push({text:buf,font,size,u:!!r.u});}}}
      return words;};
    const layout=(words,avail)=>{const fitted=[];
      words.forEach(w=>{if(w.nl||w.space||w.img||widthOf(w)<=avail){fitted.push(w);return;}
        let chunk="";for(const ch of w.text){if(chunk&&w.font.widthOfTextAtSize(chunk+ch,w.size)>avail){fitted.push({...w,text:chunk});chunk="";}chunk+=ch;}
        if(chunk)fitted.push({...w,text:chunk});});
      const lines=[[]];let lw=0;
      fitted.forEach(w=>{if(w.nl){lines.push([]);lw=0;return;}const ww=widthOf(w);
        if(lw+ww>avail&&lines[lines.length-1].length&&!w.space){lines.push([]);lw=0;}
        if(w.space&&lw===0)return;lines[lines.length-1].push(w);lw+=ww;});
      return lines;};
    const drawWords=(line,x,baseY,color)=>{line.forEach(w=>{const ww=widthOf(w);
      if(w.img)page.drawImage(w.img,{x,y:baseY-w.below,width:w.w,height:w.h});
      else page.drawText(w.text,{x,y:baseY,size:w.size,font:w.font,color});
      if(w.u&&!w.space)page.drawLine({start:{x,y:baseY-1.5},end:{x:x+ww,y:baseY-1.5},thickness:0.6,color});x+=ww;});};
    let counters=[];
    for(const b of blocks){
      const size=SIZE[b.type]||11,lead=size*1.4,lvl=b.level||0;
      if(b.type==="ol"){counters=counters.slice(0,lvl+1);counters[lvl]=(counters[lvl]||0)+1;}else if(b.type!=="li")counters=[];
      if(b.type==="hr"){if(y-lead<M)newPage();page.drawLine({start:{x:M,y:y-6},end:{x:W-M,y:y-6},thickness:0.7,color:rgb(0.6,0.6,0.6)});y-=lead;continue;}
      if(b.type==="table"){
        const rows=b.rows||[];if(!rows.length)continue;
        const cols=Math.max(1,...rows.map(r=>r.length)),colW=maxW/cols,pad=3,tsize=SIZE.table,tlead=tsize*1.3;
        for(let ri=0;ri<rows.length;ri++){const r=rows[ri];
          const cellLines=[];for(const c of r)cellLines.push(layout(await tokenize(c,tsize,b.header&&ri===0),colW-2*pad));
          const rowH=Math.max(1,...cellLines.map(l=>l.length))*tlead+2*pad;
          if(y-rowH<M)newPage();
          cellLines.forEach((lines,ci)=>{const x=M+ci*colW;
            page.drawRectangle({x,y:y-rowH,width:colW,height:rowH,borderWidth:0.5,borderColor:rgb(0.7,0.7,0.7)});
            lines.forEach((line,k)=>drawWords(line,x+pad,y-pad-tsize-k*tlead,rgb(0,0,0)));});
          y-=rowH;}
        y-=lead*0.5;continue;}
      let indent=0,prefix="";
      if(b.type==="li"){indent=18*(lvl+1);prefix=BULLET+"  ";}
      if(b.type==="ol"){indent=18*(lvl+1);prefix=counters[lvl]+".  ";}
      if(b.type==="quote")indent=24;
      const runs=b.type==="code"?[{text:runsText(b.runs),code:true}]:b.runs;
      const words=await tokenize(runs,size,/^h[1-3]$/.test(b.type));
      if(prefix)words.unshift({text:prefix,font:F.r,size});
      const lines=layout(words,maxW-indent);
      if(/^h[1-3]$/.test(b.type))y-=size*0.5;
      const color=b.type==="quote"?rgb(0.35,0.35,0.35):rgb(0,0,0);
      lines.forEach(line=>{if(y-lead<M)newPage();drawWords(line,M+indent,y-size,color);y-=lead;});
      y-=lead*0.5;
    }
    onP(0.9,"saving");
    const bytes=await pdf.save();
    return new Blob([bytes],{type:"application/pdf"});
  }

  /* ---------- pdf -> docx ---------- */
  async function pdfDocx(file,opts,onP){
    throwIfAborted(opts.signal);
    const doc=await C.openPdf(file,onP);const total=doc.numPages,pages=[];
    try{
      for(let i=1;i<=total;i++){
        throwIfAborted(opts.signal);
        onP(0.1+0.5*(i/total),"reading page "+i+" of "+total);
        const page=await doc.getPage(i);const tc=await page.getTextContent();
        pages.push(tc.items.filter(it=>typeof it.str==="string").map(it=>({
          str:it.str,x:it.transform[4],y:it.transform[5],
          size:Math.hypot(it.transform[2],it.transform[3])||it.height||10,width:it.width||0})));
        page.cleanup();
      }
    }finally{await doc.destroy();}
    const blocks=pdfTextToBlocks(pages);
    if(!blocks.length)throw new Error("This PDF has no selectable text, so there's nothing to turn into a Word document. It's probably scanned pages.");
    return blocksToDocx(blocks,onP);
  }

  /* ---------- ffmpeg.wasm (single-thread core from unpkg) ---------- */
  const FF_CORE="https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
  const FF_CORE_MB=31;
  let ffInstance=null,ffLoading=null;
  async function getFFmpeg(onP){
    if(ffInstance)return ffInstance;
    if(ffLoading)return ffLoading;
    ffLoading=(async()=>{
      const [{FFmpeg},{toBlobURL}]=await Promise.all([loadLib("ffmpeg",onP),loadLib("ffutil",onP)]);
      onP(0.02,"downloading the video engine ("+FF_CORE_MB+" MB, first time only)");
      const coreURL=await toBlobURL(FF_CORE+"/ffmpeg-core.js","text/javascript");
      const wasmURL=await toBlobURL(FF_CORE+"/ffmpeg-core.wasm","application/wasm",true,({received,total})=>{
        const f=total?received/total:0;
        onP(0.02+0.08*f,"downloading the video engine ("+Math.round(received/1048576)+" of "+FF_CORE_MB+" MB, first time only)");});
      const ff=new FFmpeg();
      await ff.load({coreURL,wasmURL});
      ffInstance=ff;return ff;
    })().catch(e=>{ffLoading=null;throw new Error("Couldn't download the video engine. Check your connection and try again. "+(e&&e.message||e));});
    return ffLoading;
  }
  const abortPromise=signal=>new Promise((_,rej)=>{if(!signal)return;const fail=()=>{const e=new Error("Cancelled. Nothing was changed.");e.cancelled=true;rej(e);};
    if(signal.aborted)fail();else signal.addEventListener("abort",fail,{once:true});});
  async function ffmpeg(file,opts,onP,toExt){
    const badTrim=trimError(opts.trim);
    if(badTrim)throw new Error(badTrim);
    const signal=opts.signal;throwIfAborted(signal);
    // The shared download keeps going if the user cancels; only this conversion stops.
    const ff=await (signal?Promise.race([getFFmpeg(onP),abortPromise(signal)]):getFFmpeg(onP));
    const from=norm(extOf(file.name)),inName="in."+from,outName="out."+toExt;
    const onProg=({progress})=>onP(0.12+0.83*Math.max(0,Math.min(1,progress||0)),"converting on your device");
    ff.on("progress",onProg);
    const dropInstance=()=>{try{ff.terminate();}catch(e){}if(ffInstance===ff){ffInstance=null;ffLoading=null;}};
    const onAbort=()=>dropInstance();
    if(signal)signal.addEventListener("abort",onAbort,{once:true});
    try{
      onP(0.11,"loading your file");
      throwIfAborted(signal);
      await ff.writeFile(inName,new Uint8Array(await file.arrayBuffer()));
      let rc;
      try{rc=await ff.exec(ffmpegArgs(from,toExt,opts,inName,outName));}
      catch(e){
        // exec only rejects when the wasm runtime died (out of memory, abort, or our cancel).
        dropInstance();
        if(signal&&signal.aborted)throwIfAborted(signal);
        throw e;
      }
      throwIfAborted(signal);
      if(rc!==0)throw new Error("The video engine stopped with code "+rc+". The file may be damaged or use a codec this build can't read.");
      const data=await ff.readFile(outName);
      if(!data||!data.length)throw new Error("The video engine produced an empty file.");
      return new Blob([data],{type:MEDIA_MIME[toExt]||"application/octet-stream"});
    }finally{
      if(signal)signal.removeEventListener("abort",onAbort);
      ff.off("progress",onProg);
      if(ff.loaded)for(const n of [inName,outName]){try{await ff.deleteFile(n);}catch(e){}}
    }
  }

  Object.assign(C.ENGINES,{pdfRaster,docs,pdfDocx,pdfPptx,ffmpeg,imageDecode});
  C.loadLib=loadLib;C.openPdf=openPdf;C.blocksFromHtml=blocksFromHtml;C.blocksToDocx=blocksToDocx;C.blocksToPdf=blocksToPdf;C.getFFmpeg=getFFmpeg;C.canvasToJxl=canvasToJxl;C.jxlDecode=jxlDecode;
})();

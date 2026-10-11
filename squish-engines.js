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
    blocksToHtml,blocksToMd,blocksToTxt,pdfTextToBlocks,pdfSafeText,ffmpegArgs,trimError,MEDIA_MIME}=C;

  /* ---------- lazy library loading ---------- */
  const LIBS={
    pdfjs:{url:"vendor/pdfjs/pdf.min.mjs",label:"the PDF engine"},
    marked:{url:"vendor/marked/marked.esm.js",label:"the Markdown engine"},
    docx:{url:"vendor/docx/index.mjs",label:"the Word engine"},
    pdflib:{url:"vendor/pdf-lib/pdf-lib.esm.min.js",label:"the PDF writer"},
    ffmpeg:{url:"vendor/ffmpeg/index.js",label:"the video engine"},
    ffutil:{url:"vendor/ffmpeg-util/index.js",label:"the video engine"},
  };
  const loaded={};
  function loadLib(name,onP){
    if(!loaded[name]){
      const lib=LIBS[name];if(!lib)return Promise.reject(new Error("unknown library "+name));
      if(onP)onP(0.02,"loading "+lib.label);
      loaded[name]=import(new URL(lib.url,document.baseURI).href).catch(e=>{
        delete loaded[name];throw new Error("Couldn't load "+lib.label+". "+(e&&e.message||e));});
    }
    return loaded[name];
  }
  const baseOf=file=>(file.name||"squished").replace(/\.[^.]+$/,"")||"squished";

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
  async function pdfRaster(file,opts,onP,toExt){
    const doc=await C.openPdf(file,onP);
    const outs=[];let pages,total;
    try{
      total=doc.numPages;pages=parsePageRange(opts.pages,total);
      if(!pages.length)throw new Error('No pages matched "'+opts.pages+'". This PDF has '+total+(total===1?" page.":" pages."));
      const scale=parseInt(opts.dpi||"150",10)/72,mime=mimeFor(toExt),q=toExt==="jpg"?0.9:undefined;
      for(let k=0;k<pages.length;k++){
        onP(0.1+0.8*(k/pages.length),"rendering page "+pages[k]+" of "+total);
        const page=await doc.getPage(pages[k]);const vp=page.getViewport({scale});
        const c=document.createElement("canvas");c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
        const ctx=c.getContext("2d");
        if(toExt==="jpg"){ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);}
        await page.render({canvasContext:ctx,viewport:vp,intent:"print"}).promise;
        outs.push(await canvasBlob(c,mime,q));page.cleanup();
      }
    }finally{await doc.destroy();}
    if(outs.length===1)return outs[0];
    onP(0.95,"zipping "+outs.length+" images");
    const pad=String(total).length>2?3:2,base=baseOf(file),entries=[];
    for(let k=0;k<outs.length;k++)entries.push({name:base+"-p"+String(pages[k]).padStart(pad,"0")+"."+toExt,data:new Uint8Array(await outs[k].arrayBuffer())});
    return {blob:new Blob([zipStore(entries)],{type:"application/zip"}),name:base+".zip"};
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
    const CONTAINERS=new Set(["div","section","article","main","body","html","header","footer","aside","table","tbody","thead","tr","td","th","figure","details","summary","center","font"]);
    const inline=(node,st,runs)=>{node.childNodes.forEach(n=>{
      if(n.nodeType===3){const t=n.textContent.replace(/\s+/g," ");if(t)runs.push({text:t,...st});return;}
      if(n.nodeType!==1)return;
      const tag=n.tagName.toLowerCase();
      if(tag==="br"){runs.push({text:"\n",...st});return;}
      if(tag==="img"){runs.push({text:imgText(n),...st});return;}
      if(SKIP.has(tag))return;
      const s={...st};
      if(tag==="b"||tag==="strong")s.b=true;if(tag==="i"||tag==="em")s.i=true;if(tag==="code")s.code=true;
      if(tag==="a"&&n.getAttribute("href"))s.href=n.getAttribute("href");
      inline(n,s,runs);});};
    const push=(type,node)=>{const runs=[];inline(node,{},runs);const t=trimRuns(runs);if(t.length)blocks.push({type,runs:t});};
    const walk=(node,listType)=>{node.childNodes.forEach(n=>{
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
      else if(tag==="ul"||tag==="ol")walk(n,tag==="ul"?"li":"ol");
      else if(tag==="li"){
        const nested=[...n.children].filter(c=>/^(ul|ol)$/i.test(c.tagName));
        const clone=n.cloneNode(true);[...clone.children].forEach(c=>{if(/^(ul|ol)$/i.test(c.tagName))c.remove();});
        push(listType||"li",clone);
        nested.forEach(c=>walk(c,c.tagName.toLowerCase()==="ul"?"li":"ol"));}
      else if(CONTAINERS.has(tag))walk(n,listType);
      else push("p",n);});};
    walk(doc.body,null);
    return blocks;
  }

  /* ---------- documents ---------- */
  async function parseDoc(file,onP){
    const from=norm(extOf(file.name)),text=await file.text();
    if(from==="md"){const {marked}=await loadLib("marked",onP);return blocksFromHtml(marked.parse(text,{gfm:true,async:false}));}
    if(from==="html")return blocksFromHtml(text);
    if(from==="rtf")return rtfToBlocks(text);
    return blocksFromText(text);
  }
  async function docs(file,opts,onP,toExt){
    const blocks=await parseDoc(file,onP);
    if(!blocks.length)throw new Error("Squish couldn't find any text in that file.");
    onP(0.4,"rebuilding the document");
    const title=baseOf(file);
    if(toExt==="html")return new Blob([blocksToHtml(blocks,title)],{type:"text/html"});
    if(toExt==="md")return new Blob([blocksToMd(blocks)],{type:"text/markdown"});
    if(toExt==="txt")return new Blob([blocksToTxt(blocks)],{type:"text/plain"});
    if(toExt==="docx")return blocksToDocx(blocks,onP);
    if(toExt==="pdf")return blocksToPdf(blocks,title,onP);
    throw new Error("Squish can't write ."+toExt+" yet.");
  }
  /* ---------- docx writer ---------- */
  const flatText=t=>String(t||"").replace(/\s*\n\s*/g," ");
  async function blocksToDocx(blocks,onP){
    const mod=await loadLib("docx",onP);onP(0.6,"writing the Word file");
    const d=mod.Document?mod:mod.default;
    const {Document,Packer,Paragraph,TextRun,HeadingLevel,ExternalHyperlink,AlignmentType,BorderStyle}=d;
    const runsOf=b=>b.runs.map(r=>{
      const base={text:flatText(r.text),bold:!!r.b,italics:!!r.i};
      if(r.code)base.font="Courier New";
      if(r.href)return new ExternalHyperlink({link:r.href,children:[new TextRun({...base,style:"Hyperlink"})]});
      return new TextRun(base);
    });
    let listInstance=0,inList=false;
    const children=blocks.map(b=>{
      if(b.type==="ol"){if(!inList){listInstance++;inList=true;}}else inList=false;
      switch(b.type){
        case "h1":return new Paragraph({heading:HeadingLevel.HEADING_1,children:runsOf(b)});
        case "h2":return new Paragraph({heading:HeadingLevel.HEADING_2,children:runsOf(b)});
        case "h3":return new Paragraph({heading:HeadingLevel.HEADING_3,children:runsOf(b)});
        case "li":return new Paragraph({bullet:{level:0},children:runsOf(b)});
        case "ol":return new Paragraph({numbering:{reference:"squish-numbers",level:0,instance:listInstance},children:runsOf(b)});
        case "code":return new Paragraph({children:runsText(b.runs).split("\n").map((line,i)=>new TextRun(i?{text:line,font:"Courier New",size:20,break:1}:{text:line,font:"Courier New",size:20}))});
        case "quote":return new Paragraph({indent:{left:720},children:runsOf(b)});
        case "hr":return new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:6,color:"999999",space:1}},children:[]});
        default:return new Paragraph({children:runsOf(b)});
      }
    });
    const doc=new Document({
      numbering:{config:[{reference:"squish-numbers",levels:[{level:0,format:"decimal",text:"%1.",alignment:AlignmentType.START,style:{paragraph:{indent:{left:720,hanging:360}}}}]}]},
      sections:[{children}],
    });
    const blob=await Packer.toBlob(doc);
    return new Blob([blob],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  }

  /* ---------- pdf writer (pdf-lib, Letter, Helvetica) ---------- */
  const BULLET=String.fromCharCode(0x2022);
  async function blocksToPdf(blocks,title,onP){
    const L=await loadLib("pdflib",onP);onP(0.6,"laying out pages");
    const {PDFDocument,StandardFonts,rgb}=L;
    const pdf=await PDFDocument.create();pdf.setTitle(title||"Document");
    const F={
      r:await pdf.embedFont(StandardFonts.Helvetica),b:await pdf.embedFont(StandardFonts.HelveticaBold),
      i:await pdf.embedFont(StandardFonts.HelveticaOblique),bi:await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
      c:await pdf.embedFont(StandardFonts.Courier)};
    const W=612,H=792,M=72,maxW=W-2*M;
    let page=pdf.addPage([W,H]),y=H-M;
    const newPage=()=>{page=pdf.addPage([W,H]);y=H-M;};
    const safe=pdfSafeText; // standard fonts only know WinAnsi; see core
    const fontFor=r=>r.code?F.c:(r.b&&r.i)?F.bi:r.b?F.b:r.i?F.i:F.r;
    const SIZE={h1:22,h2:17,h3:14,p:11,li:11,ol:11,quote:11,code:9.5,hr:11};
    let n=0;
    blocks.forEach(b=>{
      const size=SIZE[b.type]||11,lead=size*1.4;
      if(b.type==="ol")n++;else n=0;
      if(b.type==="hr"){if(y-lead<M)newPage();page.drawLine({start:{x:M,y:y-6},end:{x:W-M,y:y-6},thickness:0.7,color:rgb(0.6,0.6,0.6)});y-=lead;return;}
      let indent=0,prefix="";
      if(b.type==="li"){indent=18;prefix=BULLET+"  ";}
      if(b.type==="ol"){indent=18;prefix=n+".  ";}
      if(b.type==="quote")indent=24;
      const words=[];
      if(prefix)words.push({text:prefix,font:F.r,size});
      const runs=b.type==="code"?[{text:runsText(b.runs),code:true}]:b.runs;
      runs.forEach(r=>{const font=/^h[1-3]$/.test(b.type)?(r.i?F.bi:F.b):fontFor(r);
        safe(r.text).split(/(\n)/).forEach(part=>{
          if(part==="\n"){words.push({nl:true});return;}
          part.split(/(\s+)/).forEach(tok=>{if(tok)words.push({text:tok,font,size,space:/^\s+$/.test(tok)});});});});
      const lines=[[]];let lw=0;const x0=M+indent,avail=maxW-indent;
      // split any single token wider than the column so it wraps instead of running off the page
      const fitted=[];
      words.forEach(w=>{
        if(w.nl||w.space||w.font.widthOfTextAtSize(w.text,w.size)<=avail){fitted.push(w);return;}
        let chunk="";
        for(const ch of w.text){if(chunk&&w.font.widthOfTextAtSize(chunk+ch,w.size)>avail){fitted.push({...w,text:chunk});chunk="";}chunk+=ch;}
        if(chunk)fitted.push({...w,text:chunk});
      });
      fitted.forEach(w=>{
        if(w.nl){lines.push([]);lw=0;return;}
        const ww=w.font.widthOfTextAtSize(w.text,w.size);
        if(lw+ww>avail&&lines[lines.length-1].length&&!w.space){lines.push([]);lw=0;}
        if(w.space&&lw===0)return;
        lines[lines.length-1].push(w);lw+=ww;});
      if(/^h[1-3]$/.test(b.type))y-=size*0.5;
      const color=b.type==="quote"?rgb(0.35,0.35,0.35):rgb(0,0,0);
      lines.forEach(line=>{
        if(y-lead<M)newPage();
        let x=x0;
        line.forEach(w=>{page.drawText(w.text,{x,y:y-size,size:w.size,font:w.font,color});x+=w.font.widthOfTextAtSize(w.text,w.size);});
        y-=lead;});
      y-=lead*0.5;
    });
    onP(0.9,"saving");
    const bytes=await pdf.save();
    return new Blob([bytes],{type:"application/pdf"});
  }

  /* ---------- pdf -> docx ---------- */
  async function pdfDocx(file,opts,onP){
    const doc=await C.openPdf(file,onP);const total=doc.numPages,pages=[];
    try{
      for(let i=1;i<=total;i++){
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
  async function ffmpeg(file,opts,onP,toExt){
    const badTrim=trimError(opts.trim);
    if(badTrim)throw new Error(badTrim);
    const ff=await getFFmpeg(onP);
    const from=norm(extOf(file.name)),inName="in."+from,outName="out."+toExt;
    const onProg=({progress})=>onP(0.12+0.83*Math.max(0,Math.min(1,progress||0)),"converting on your device");
    ff.on("progress",onProg);
    try{
        onP(0.11,"loading your file");
        await ff.writeFile(inName,new Uint8Array(await file.arrayBuffer()));
        let rc;
        try{rc=await ff.exec(ffmpegArgs(from,toExt,opts,inName,outName));}
        catch(e){
          // exec only rejects when the wasm runtime died (out of memory, abort). A dead
          // instance can't run anything else, so drop it; the next call loads a fresh one.
          try{ff.terminate();}catch(_){}
          if(ffInstance===ff){ffInstance=null;ffLoading=null;}
          throw e;
        }
        if(rc!==0)throw new Error("The video engine stopped with code "+rc+". The file may be damaged or use a codec this build can't read.");
        const data=await ff.readFile(outName);
        if(!data||!data.length)throw new Error("The video engine produced an empty file.");
        return new Blob([data],{type:MEDIA_MIME[toExt]||"application/octet-stream"});
      }finally{
        ff.off("progress",onProg);
        if(ff.loaded)for(const n of [inName,outName]){try{await ff.deleteFile(n);}catch(e){}}
      }
    }

    Object.assign(C.ENGINES,{pdfRaster,docs,pdfDocx,ffmpeg});
    C.loadLib=loadLib;C.openPdf=openPdf;C.blocksFromHtml=blocksFromHtml;C.blocksToDocx=blocksToDocx;C.blocksToPdf=blocksToPdf;C.getFFmpeg=getFFmpeg;
  })();

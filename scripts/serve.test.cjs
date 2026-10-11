// Checks that the dev server refuses paths outside the repo root,
// including a sibling directory whose name starts with the repo name.
const {spawn}=require("child_process"),http=require("http"),path=require("path");
const port=8797+Math.floor(Math.random()*100);
const srv=spawn(process.execPath,[path.join(__dirname,"serve.cjs"),String(port)],{stdio:"ignore"});
const sibling=path.basename(path.resolve(__dirname,".."))+"-sibling";
const get=p=>new Promise(res=>{const req=http.get({host:"127.0.0.1",port,path:p},r=>{r.resume();res(r.statusCode);});req.on("error",()=>res(0));});
(async()=>{
  let up=0;for(let i=0;i<40&&!up;i++){await new Promise(r=>setTimeout(r,100));up=await get("/squish.html");}
  const cases=[["/squish.html",200],["/..%2F"+encodeURIComponent(sibling)+"%2Fsecret.txt",403],["/..%2Fetc%2Fpasswd",403]];
  let fail=0;
  for(const [p,want] of cases){const got=await get(p);const pass=got===want;if(!pass)fail++;console.log((pass?"  ok ":"  FAIL ")+p+" -> "+got+" (want "+want+")");}
  srv.kill();
  console.log(fail?"  "+fail+" failed":"  serve.cjs: all green");process.exit(fail?1:0);
})();

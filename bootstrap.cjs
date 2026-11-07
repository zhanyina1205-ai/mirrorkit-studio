const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const ROOT=__dirname;
fs.mkdirSync(path.join(ROOT,'data'),{recursive:true});
async function health(){try{const r=await fetch('http://127.0.0.1:47831/api/health',{signal:AbortSignal.timeout(1000)});return (await r.json()).app==='MirrorKit Studio';}catch{return false;}}
(async()=>{
 if(!await health()){
  const fd=fs.openSync(path.join(ROOT,'data/server.log'),'a');
  const child=spawn(process.execPath,[path.join(ROOT,'server.cjs')],{cwd:ROOT,detached:true,stdio:['ignore',fd,fd],env:{...process.env,PORT:'47831'}});child.unref();fs.closeSync(fd);
  for(let i=0;i<40&&!await health();i++)await new Promise(r=>setTimeout(r,250));
 }
 if(!await health())throw Error('MirrorKit 启动失败，请查看 data/server.log');
 const chrome=spawn('/usr/bin/open',['-na','Google Chrome','--args','--app=http://127.0.0.1:47831','--user-data-dir='+path.join(ROOT,'data/app-browser'),'--no-first-run'],{detached:true,stdio:'ignore'});chrome.unref();
})().catch(e=>{fs.appendFileSync(path.join(ROOT,'data/server.log'),e.stack+'\n');process.exitCode=1;});

const {chromium}=require('playwright-core');
const {createRewriter,buildSnapshot}=require('./snapshot.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const dns=require('node:dns/promises');
const net=require('node:net');
function privateIP(ip){
 if(net.isIPv4(ip)){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127;}
 return ip==='::'||ip==='::1'||/^f[cd]/i.test(ip)||/^fe[89ab]/i.test(ip)||/^::ffff:/i.test(ip);
}
async function checkURL(value){
 const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('请输入公开的 HTTP 或 HTTPS 网站地址');
 const host=u.hostname.replace(/^\[|\]$/g,'');
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local'))throw Error('仅支持公开网站，不支持本机或内网地址');
 const addresses=net.isIP(host)?[{address:host}]:await dns.lookup(host,{all:true});
 if(!addresses.length||addresses.some(x=>privateIP(x.address)))throw Error('仅支持公开网站，不支持内网地址');
 u.hash='';return u.href;
}
const extByType={'text/css':'.css','text/html':'.html','application/javascript':'.js','text/javascript':'.js','application/json':'.json','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/svg+xml':'.svg','image/gif':'.gif','font/woff2':'.woff2','font/woff':'.woff','video/mp4':'.mp4'};
async function capture(record,dir,update,signal){
 let browser;let bytes=0;let saved=0;const warnings=new Set();const assets=new Map();const pending=new Set();const pages=[];let limited=false;
 const files=path.join(dir,'assets');await fs.mkdir(files,{recursive:true});
 try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});
 signal.addEventListener('abort',()=>browser.close().catch(()=>{}),{once:true});
 if(signal.aborted)throw Error('已取消');
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:false});
 const checked=new Map();
 await context.route('**/*',async route=>{try{const url=route.request().url();const host=new URL(url).hostname;if(!checked.has(host))checked.set(host,checkURL(url).then(()=>true).catch(()=>false));if(!await checked.get(host)||limited||signal.aborted)return route.abort();await route.continue();}catch{await route.abort().catch(()=>{});}});
 context.on('response',response=>{
  const job=(async()=>{try{
   if(!response.ok())return;const url=response.url();if(assets.has(url))return;
   const type=(response.headers()['content-type']||'').split(';')[0];
   const length=Number(response.headers()['content-length']||0);if(length>20*1024*1024){warnings.add('部分大于 20 MB 的资源未保存');return;}
   if(saved>=400||bytes>=120*1024*1024){limited=true;warnings.add('已达到单次资源上限（400 个文件或 120 MB）');return;}
   const body=await response.body();if(body.length>20*1024*1024||bytes+body.length>120*1024*1024){warnings.add('部分较大资源未保存');return;}
   const ext=extByType[type]||'.bin';const file=crypto.createHash('sha256').update(url).digest('hex').slice(0,24)+ext;
   if(assets.has(url))return;
   assets.set(url,{url,file,type,bytes:body.length});bytes+=body.length;saved++;
   await fs.writeFile(path.join(files,file),body);update({files:saved,bytes});
  }catch{warnings.add('部分网络资源无法保存');}})();pending.add(job);job.finally(()=>pending.delete(job));
 });
 const queue=[record.url];const visited=new Set();const limit=record.pageLimit||1;
 while(queue.length&&pages.length<limit&&!signal.aborted){
  const url=queue.shift();if(visited.has(url))continue;visited.add(url);
  const page=await context.newPage();
  try{
   update({stage:`正在打开第 ${pages.length+1} / ${limit} 页`,progress:Math.min(85,10+pages.length/limit*65)});
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
   if(!response||!response.ok())throw Error(`页面返回 HTTP ${response?.status()||'未知'}`);
   await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
   update({stage:'等待页面加载与开场动画完成'});
   const isLoading = () => [...document.querySelectorAll('[class*=Loader],[class*=loader],[id*=loader]')].some(el=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>innerWidth*.5&&r.height>innerHeight*.5&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>.1;
   });
   let loadingIncomplete=false;
   try{await page.waitForFunction(() => ![...document.querySelectorAll('[class*=Loader],[class*=loader],[id*=loader]')].some(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>innerWidth*.5&&r.height>innerHeight*.5&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>.1;}),null,{timeout:25000});}catch{loadingIncomplete=await page.evaluate(isLoading);}
   if(loadingIncomplete)warnings.add('页面加载动画未完成，保存的画面可能仍为加载状态');
   await page.waitForTimeout(1500);
   // Trigger common lazy loading without scrolling indefinitely.
   for(let i=0;i<5;i++){await page.evaluate(()=>window.scrollBy(0,700));await page.waitForTimeout(250);}
   await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(500);
   const index=pages.length;const title=await page.title();
   const metadata=await page.evaluate(()=>({baseUrl:document.baseURI,canvasHeavy:[...document.querySelectorAll('canvas')].some(el=>{const r=el.getBoundingClientRect();return r.width*r.height>innerWidth*innerHeight*.25;}),description:document.querySelector('meta[name="description"]')?.content||'',links:[...document.querySelectorAll('a[href]')].map(a=>a.href),images:[...document.images].map(i=>i.currentSrc||i.src),fonts:[...new Set([...document.querySelectorAll('h1,h2,p,button')].slice(0,50).map(e=>getComputedStyle(e).fontFamily))]}));
   await page.evaluate(()=>{for(const img of document.images){if(img.currentSrc){img.setAttribute('src',img.currentSrc);img.removeAttribute('srcset');}}});
   const html=await page.content();await fs.writeFile(path.join(dir,`rendered-${index}.html`),html);
   await page.screenshot({path:path.join(dir,`screenshot-${index}.png`),fullPage:false,timeout:15000});
   pages.push({url:page.url(),baseUrl:metadata.baseUrl,previewMode:metadata.canvasHeavy||loadingIncomplete?'screenshot':'html',loadingIncomplete,requestedUrl:url,title,description:metadata.description,fonts:metadata.fonts,file:index===0?'index.html':`page-${index}.html`,screenshot:`screenshot-${index}.png`});
   if(metadata.canvasHeavy)warnings.add('此网站使用 Canvas / WebGL，离线预览改为画面快照，交互需在原站查看');
   if(index===0)update({previewMode:metadata.canvasHeavy||loadingIncomplete?'screenshot':'html',loadingIncomplete,title:title||new URL(url).hostname,description:metadata.description});
   for(const link of metadata.links){try{const u=new URL(link);u.hash='';if(u.origin===new URL(record.url).origin&&!/\.(zip|pdf|mp4|exe|dmg)$/i.test(u.pathname)&&!visited.has(u.href)&&queue.length<50)queue.push(u.href);}catch{}}
  }catch(e){if(!pages.length)throw e;warnings.add(`部分子页面未完成：${e.message}`);}finally{await page.close().catch(()=>{});}
 }
 await Promise.allSettled([...pending]);if(signal.aborted)throw Error('已取消');
 update({stage:'正在生成离线预览与复刻资料',progress:90});
 const {cssRewrite}=createRewriter(pages,assets);
 for(const a of assets.values())if(a.type==='text/css'){const f=path.join(files,a.file);await fs.writeFile(f,cssRewrite(await fs.readFile(f,'utf8'),a.url,''));}
 for(let i=0;i<pages.length;i++){
  const p=pages[i];const html=await fs.readFile(path.join(dir,`rendered-${i}.html`),'utf8');
  await fs.writeFile(path.join(dir,p.file),buildSnapshot(html,p,pages,assets,warnings));
 }
 const manifest={version:1,source:record.url,capturedAt:new Date().toISOString(),pages,assets:[...assets.values()],warnings:[...warnings],mode:'static-offline-snapshot'};
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
 await fs.writeFile(path.join(dir,'复刻资料.md'),`# ${pages[0]?.title||record.title}\n\n来源：${record.url}\n\n这是静态离线快照，脚本与表单已禁用；动态业务功能需要重新实现。\n\n- index.html：离线预览\n- rendered-*.html：浏览器渲染后的原始结构（仅供阅读）\n- screenshot-*.png：原网站截图\n- assets/：实际加载并保存的资源\n- manifest.json：页面、资源来源映射及限制\n\n字体：${pages[0]?.fonts.join('、')}\n\n抓取提示：${[...warnings].join('；')||'无'}\n`);
 return {pages:pages.length,files:saved,bytes,warnings:[...warnings],progress:100,stage:'已保存',status:warnings.size?'partial':'ready'};
 }finally{await browser?.close().catch(()=>{});}
}
module.exports={capture,checkURL,privateIP};

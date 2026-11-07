const cheerio=require('cheerio');
const POLICY="default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' data:; form-action 'none'; base-uri 'none'";
function createRewriter(pages,assets){
 function localize(value,base,prefix='assets/'){
  if(!value||/^(data:|#)/i.test(value))return value;
  try{const url=new URL(value,base),hash=url.hash;url.hash='';const page=pages.find(p=>p.url===url.href||p.requestedUrl===url.href);if(page)return (prefix==='assets/'?page.file:'../'+page.file)+hash;const asset=assets.get(url.href);return asset?prefix+asset.file+hash:'';}catch{return '';}
 }
 function cssRewrite(css,base,prefix){return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_,q,value)=>`url("${localize(value,base,prefix)||'data:,'}")`).replace(/@import\s+(['"])(.*?)\1/gi,(_,q,value)=>`@import "${localize(value,base,prefix)||'data:,'}"`);}
 return {localize,cssRewrite};
}
function buildSnapshot(html,page,pages,assets,warnings=new Set()){
 const $=cheerio.load(html),{localize,cssRewrite}=createRewriter(pages,assets);
 let base=page.baseUrl||page.url;try{base=new URL($('base[href]').first().attr('href')||base,page.url).href;}catch{}
 $('script,noscript,base,iframe,object,embed,meta[http-equiv],link[rel="preload"],link[rel="modulepreload"]').remove();
 $('*').each((_,el)=>{for(const key of Object.keys(el.attribs||{}))if(key.startsWith('on')||['integrity','nonce','crossorigin','srcset','action','formaction','ping'].includes(key))$(el).removeAttr(key);
  for(const key of ['src','poster','href','xlink:href']){const value=$(el).attr(key);if(!value)continue;const local=localize(value,base);if(local)$(el).attr(key,local);else{$(el).removeAttr(key);if(key==='src'||el.tagName==='link'&&$(el).attr('rel')==='stylesheet')warnings.add('预览中有未捕获的图片或样式资源');}}
  const style=$(el).attr('style');if(style)$(el).attr('style',cssRewrite(style,base,'assets/'));
 });
 $('style').each((_,el)=>$(el).text(cssRewrite($(el).text(),base,'assets/')));
 $('head').prepend('<meta charset="UTF-8">');$('<meta>').attr({'http-equiv':'Content-Security-Policy',content:POLICY}).prependTo('head');
 if(page.previewMode==='screenshot'){
  const notice=page.loadingIncomplete?'页面在等待时间内仍显示加载画面；这次仅保存了加载状态，请打开原站确认。':'这个页面依赖 Canvas / WebGL 动态渲染，以下为保存的画面。动画和交互请打开原站；源码与资源仍保留用于复刻。';
  $('head style,head link[rel="stylesheet"]').remove();$('body').empty().removeAttr('style').removeAttr('class');
  $('<style>').text('body{margin:0;background:#18201b;color:#edf3ee;font:14px -apple-system,sans-serif}aside{padding:16px 24px;line-height:1.8;background:#eef3eb;color:#344b39}a{color:#235e42}img{display:block;width:100%;height:auto}').appendTo('head');
  const aside=$('<aside>').append($('<strong>').text('画面快照 · 非交互网页')).append($('<div>').text(notice));
  aside.append($('<a>').attr({href:page.url,target:'_blank',rel:'noopener noreferrer'}).text('打开原始网站 ↗'));$('body').append(aside).append($('<img>').attr({src:page.screenshot,alt:page.title||'保存的网页画面'}));
 }
 return $.html();
}
module.exports={createRewriter,buildSnapshot};

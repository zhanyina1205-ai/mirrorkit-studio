const test=require('node:test'),assert=require('node:assert/strict'),cheerio=require('cheerio');
const {buildSnapshot}=require('../snapshot.cjs');
const page={url:'https://example.com/',file:'index.html',screenshot:'screenshot-0.png'};
test('resolve base-relative styles and inline resources before removing base',()=>{
 const assets=new Map([['https://example.com/experience/style.css?v=1',{file:'style.css'}],['https://example.com/experience/image.svg',{file:'image.svg'}]]);
 const $=cheerio.load(buildSnapshot('<base href="/experience/"><link rel="stylesheet" href="style.css?v=1"><style>div{background:url(image.svg#shape)}</style><noscript>Please enable javascript</noscript><script>alert(1)</script>',page,[page],assets));
 assert.equal($('link').attr('href'),'assets/style.css');assert.match($('style').text(),/assets\/image.svg#shape/);assert.equal($('base,script,noscript').length,0);
});
test('report missing styles instead of silently showing success',()=>{const warnings=new Set();buildSnapshot('<link rel="stylesheet" href="missing.css">',page,[page],new Map(),warnings);assert.equal(warnings.size,1);});
test('canvas snapshot is labeled and references stored screenshot',()=>{const $=cheerio.load(buildSnapshot('<canvas></canvas>',{...page,previewMode:'screenshot'},[page],new Map()));assert.equal($('canvas').length,0);assert.equal($('img').attr('src'),'screenshot-0.png');assert.match($('body').text(),/非交互网页/);assert.equal($('a').attr('href'),page.url);});

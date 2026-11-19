// Генерирует все иконки приложения из одного рисунка «Шкала» (SVG → PNG через Playwright/Chromium).
// Запуск: npm run icons. Исходник для правок — функция glyph() и градиент BG ниже.
const {chromium}=require('playwright');const fs=require('fs');
const R=require('path').join(__dirname,'..')+'/';
const BG=`<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A2633"/><stop offset="1" stop-color="#080B10"/></linearGradient>`;
// glyph drawn around its own centre (0,0); bbox ≈ 686 × 423
const glyph=(mono)=>{const c=k=>mono?'#FFFFFF':k;return `<g fill="none" stroke-width="84" stroke-linecap="round" transform="translate(0 128)">
<path d="M-301 0 A301 301 0 0 1 -200 -225" stroke="${c('#F0A93B')}"/>
<path d="M-100 -284 A301 301 0 0 1 100 -284" stroke="${c('#3ECF7E')}"/>
<path d="M200 -225 A301 301 0 0 1 301 0" stroke="${c('#4FA8E8')}"/></g>
<path d="M0 -132 L44 88 L-44 88 Z" fill="${c('#ECF2F7')}" stroke="${c('#ECF2F7')}" stroke-width="24" stroke-linejoin="round"/>
<circle cx="0" cy="138" r="49" fill="none" stroke="${c('#ECF2F7')}" stroke-width="42"/>`};
// visual centre: glyph spans y -344..+211 relative → centre offset -66
const svg=({bg=true,scale=1,mono=false})=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${BG}</defs>${bg?'<rect width="1024" height="1024" fill="url(#bg)"/>':''}<g transform="translate(512 ${512+3*scale}) scale(${scale})">${glyph(mono)}</g></svg>`;
const out=[
 ['assets/icon.png',1024,{scale:1.1}],
 ['assets/favicon.png',48,{scale:1.12}],
 ['public/favicon.png',48,{scale:1.12}],
 ['assets/splash-icon.png',1024,{bg:false,scale:0.75}],
 ['assets/android-icon-foreground.png',1024,{bg:false,scale:0.75}],
 ['assets/android-icon-monochrome.png',1024,{bg:false,scale:0.75,mono:true}],
 ['public/icon-192.png',192,{scale:1.1}],
 ['public/icon-512.png',512,{scale:1.1}],
 ['public/icon-maskable-512.png',512,{scale:0.95}],
 ['public/apple-touch-icon.png',180,{scale:1.1}],
];
fs.writeFileSync(R+'assets/icon-source.svg',svg({scale:1.1}));
const BGSVG=(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${BG}</defs><rect width="1024" height="1024" fill="url(#bg)"/></svg>`);
out.push(['assets/android-icon-background.png',1024,'BGONLY']);
(async()=>{const b=await chromium.launch();
for(const [f,s,o] of out){const p=await b.newPage({viewport:{width:s,height:s}});
const x=o==='BGONLY'?BGSVG:svg(o);
await p.setContent(`<body style="margin:0;background:transparent"><img width=${s} height=${s} src="data:image/svg+xml;base64,${Buffer.from(x).toString('base64')}">`);
await p.waitForTimeout(50);await p.screenshot({path:R+f,omitBackground:true});await p.close();console.log(f,s);}
await b.close();})();

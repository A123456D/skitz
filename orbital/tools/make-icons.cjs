// Rasterize icon.svg + a splash into PNGs for @capacitor/assets
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const svg = fs.readFileSync('public/icon.svg', 'utf8');
fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync('assets/icon.png', new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng());
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 512 512">${svg.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">', '').replace('</svg>', '')}</svg>`;
fs.writeFileSync('assets/splash.png', new Resvg(splash, { fitTo: { mode: 'width', value: 2732 } }).render().asPng());
console.log('ICONS OK');

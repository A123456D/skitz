// WebGL2 sprite batcher: one shader, ordered layers, per-layer texture+blend.
const SPR = 3;

const VS = `#version 300 es
layout(location=0) in vec2 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCol;
uniform vec2 uRes; uniform float uZoom; uniform vec2 uCam;
out vec2 vUV; out vec4 vCol;
void main(){
  vec2 p = (aPos - uCam) * uZoom;
  p.y = -p.y;
  gl_Position = vec4(p / (uRes*0.5), 0.0, 1.0);
  vUV = aUV; vCol = aCol;
}`;
const FS = `#version 300 es
precision mediump float;
in vec2 vUV; in vec4 vCol; uniform sampler2D uTex; out vec4 o;
void main(){ vec4 t = texture(uTex, vUV); o = t * vCol; if(o.a < 0.004) discard; }`;

export const L = { SKY: 0, GROUND: 1, BG1: 2, BG2: 3, BG3: 4, DECAL: 5, SHADOW: 6, ENT: 7, OVER: 8, GLOW: 9, FX: 10, UI: 11, VIGN: 12, FLASH: 13 };
const CFG = [
  { tex: 'sky', blend: 'a' }, { tex: 'ground', blend: 'a' }, { tex: 'bg1', blend: 'a' }, { tex: 'bg2', blend: 'a' }, { tex: 'bg3', blend: 'a' },
  { tex: 'atlas', blend: 'a' }, { tex: 'atlas', blend: 'a' }, { tex: 'atlas', blend: 'a' }, { tex: 'atlas', blend: 'a' },
  { tex: 'atlas', blend: 'add' }, { tex: 'atlas', blend: 'add' }, { tex: 'atlas', blend: 'add' },
  { tex: 'vign', blend: 'a' }, { tex: 'atlas', blend: 'add' },
];

const colCache = new Map();
function colOf(h) {
  let v = colCache.get(h);
  if (!v) { v = [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; colCache.set(h, v); }
  return v;
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 required');
    this.gl = gl;
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    }
    gl.linkProgram(prog); gl.useProgram(prog);
    this.uRes = gl.getUniformLocation(prog, 'uRes');
    this.uZoom = gl.getUniformLocation(prog, 'uZoom');
    this.uCam = gl.getUniformLocation(prog, 'uCam');
    this.uTex = gl.getUniformLocation(prog, 'uTex');
    gl.uniform1i(this.uTex, 0);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    this.layers = CFG.map(() => ({ arr: new Float32Array(1 << 17), n: 0 }));
    this.textures = {};
    this.frames = null; this.artW = 1024;
    this.cur = L.ENT; this.zoom = 1; this.dpr = 1; this.cx = 0; this.cy = 0;
  }
  texFromCanvas(name, cv, repS = false, repT = false) {
    const gl = this.gl;
    if (this.textures[name]) gl.deleteTexture(this.textures[name]);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repS ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repT ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    this.textures[name] = t;
  }
  setAtlas(atlas) { this.frames = atlas.frames; this.artW = atlas.canvas.width; this.texFromCanvas('atlas', atlas.canvas); }
  setVignette(cv) { this.texFromCanvas('vign', cv); }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.cv.width = Math.round(innerWidth * dpr); this.cv.height = Math.round(innerHeight * dpr);
    this.W = innerWidth; this.H = innerHeight; this.dpr = dpr;
    this.gl.viewport(0, 0, this.cv.width, this.cv.height);
  }

  begin(cam) {
    const gl = this.gl;
    gl.clearColor(0.027, 0.035, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const l of this.layers) l.n = 0;
    this.zoom = cam.zoom * this.dpr;
    gl.uniform2f(this.uRes, this.cv.width, this.cv.height);
    gl.uniform1f(this.uZoom, this.zoom);
    gl.uniform2f(this.uCam, cam.x, cam.y);
    this.cx = cam.x; this.cy = cam.y;
    this.cur = L.ENT;
  }
  viewW() { return this.W / this.zoom * this.dpr; }
  viewH() { return this.H / this.zoom * this.dpr; }

  layer(n) { this.cur = n; }
  _push(lid, x0, y0, u0, v0, x1, y1, u1, v1, x2, y2, u2, v2, x3, y3, u3, v3, r, g, b, a) {
    const l = this.layers[lid];
    if (l.n + 24 > l.arr.length) return;
    const a22 = l.arr; let i = l.n;
    const put = (x, y, u, v) => { a22[i++] = x; a22[i++] = y; a22[i++] = u; a22[i++] = v; a22[i++] = r; a22[i++] = g; a22[i++] = b; a22[i++] = a; };
    put(x0, y0, u0, v0); put(x1, y1, u1, v1); put(x2, y2, u2, v2);
    put(x2, y2, u2, v2); put(x1, y1, u1, v1); put(x3, y3, u3, v3);
    l.n = i;
  }
  _quad(lid, p, uv, tint, alpha) {
    const c = colOf(tint || '#ffffff');
    this._push(lid, p[0], p[1], uv[0], uv[1], p[2], p[3], uv[2], uv[3], p[4], p[5], uv[4], uv[5], p[6], p[7], uv[6], uv[7], c[0], c[1], c[2], alpha);
  }
  // o: {rot, sx, sy, ax, ay, tint, alpha, layer}
  q(name, x, y, o = {}) {
    const f = this.frames[name]; if (!f) return;
    const rot = o.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
    const w = f.w * SPR * (o.sx ?? 1), h = f.h * SPR * (o.sy ?? 1);
    const ax = o.ax ?? f.ax, ay = o.ay ?? f.ay;
    const lx0 = -w * ax, ly0 = -h * ay, lx1 = w * (1 - ax), ly1 = h * (1 - ay);
    const W = this.artW;
    const u0 = f.x / W, v0 = f.y / W, u1 = (f.x + f.w) / W, v1 = (f.y + f.h) / W;
    const px = (lx, ly) => [x + lx * cs - ly * sn, y + lx * sn + ly * cs];
    const p00 = px(lx0, ly0), p10 = px(lx1, ly0), p01 = px(lx0, ly1), p11 = px(lx1, ly1);
    this._quad(o.layer ?? this.cur, [p00[0], p00[1], p10[0], p10[1], p01[0], p01[1], p11[0], p11[1]], [u0, v0, u1, v0, u0, v1, u1, v1], o.tint, o.alpha ?? 1);
  }
  // screen-space-style quad in world coords around camera, uv 0..1 across it
  screenQuad(texless, w, h, tint, alpha, lid) {
    const x0 = this.cx - w / 2, y0 = this.cy - h / 2, x1 = this.cx + w / 2, y1 = this.cy + h / 2;
    this._quad(lid, [x0, y0, x1, y0, x0, y1, x1, y1], [0, 0, 1, 0, 0, 1, 1, 1], tint, alpha);
  }
  text(str, x, y, o = {}) {
    const s = o.s || 2, a = o.alpha ?? 1;
    const chars = [...str]; const adv = 4 * s;
    const total = chars.length * adv - s;
    let px = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    for (const ch of chars) {
      const name = 'f' + (ch === ' ' ? 'sp' : ch);
      if (this.frames[name]) this.q(name, px + 1.5 * s, y, { sx: s, sy: s, tint: o.col || '#ffffff', alpha: a, layer: o.layer ?? L.FX });
      px += adv;
    }
  }
  vignette(a) { if (a <= 0.003) return; this.screenQuad('vign', this.W / this.zoom * this.dpr, this.H / this.zoom * this.dpr, '#000000', a, L.VIGN); }
  flash(a, tint = '#ffffff') { if (a <= 0.003) return; this.screenQuad('f', this.W / this.zoom * this.dpr, this.H / this.zoom * this.dpr, tint, a, L.FLASH); }

  end() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    for (let lid = 0; lid < this.layers.length; lid++) {
      const l = this.layers[lid]; if (!l.n) continue;
      const tex = this.textures[CFG[lid].tex]; if (!tex) continue;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const b = CFG[lid].blend;
      if (b === 'add') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      else if (b === 'mul') gl.blendFuncSeparate(gl.ZERO, gl.SRC_COLOR, gl.ZERO, gl.ONE);
      else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, l.arr.subarray(0, l.n), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, l.n / 8);
    }
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}

export function makeVignetteCanvas() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 288;
  const c = cv.getContext('2d');
  // black with an alpha shape: 0 at center -> strong at edges (drawn with normal alpha blend)
  c.fillStyle = '#000';
  c.fillRect(0, 0, 512, 288);
  const gr = c.createRadialGradient(256, 144, 120, 256, 144, 320);
  gr.addColorStop(0, 'rgba(0,0,0,1)');   // transparent center (erases the black fill)
  gr.addColorStop(0.7, 'rgba(0,0,0,1)');
  gr.addColorStop(1, 'rgba(0,0,0,0.12)');
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = gr; c.fillRect(0, 0, 512, 288);
  c.globalCompositeOperation = 'source-over';
  return cv;
}

// render3d — ORBITAL's literal-3D presentation. Implements the shared
// OrbitalRenderer contract (src/render/api.ts) against the SAME deterministic
// sim: the sim plane (x, y) maps to the ground plane (x, 0, -y), y is up, and
// every body is a true sphere so terminators, drop shadows and atmosphere are
// lit geometry instead of painted sprites.
//
//   - one honest key light per level, placed by themeSunPos (same as 2D)
//   - materials/colors driven by the same 24 teal-family themes (themes.ts)
//   - camera: tilted perspective, bounds-fit at rest/aim (NEVER zooms on
//     aim — owner verdict), flight follow + 1.22x punch, exponential shake
//   - screenToWorld ray-planes through the UNSHAKEN camera (pin placement
//     must not jitter during shake — same contract as the 2D renderer)
//
// Reused verbatim from the 2D side: themes.ts, core.ts math, sim constants.

import * as THREE from 'three';
import type { MiloMood, OrbitalRenderer, PinGhost } from '../render/api';
import type { PredPoint, SimEvent, World } from '../sim';
import { BALL_R, HOLE_CAPTURE_R } from '../sim';
import { themeSunPos, worldThemeFor } from '../render/themes';
import { bgVariantFor, clamp, col, decayShake, expDamp, mixRGB, RAMP_FAST, RAMP_SLOW } from '../render/core';

// ------------------------------------------------------------------ palette
// Local copies of the icon-language colors (2D's textures.ts is Pixi-coupled).
const GRAVITY = 0x6fd6e8;      // gravity language (style.css --gravity)
const CUP_RING = 0x9df0c8;     // glowing cup rim
const CUP_GREEN = 0x49d98a;    // the lit pad — brightest landmark on every level
const RELIC = 0x86e8b8;        // player-collected family (pins, fragments)
const DANGER = 0xff5a3c;
const AMBER = 0xffb347;        // interactive machinery only
const INK_DARK = 0x02100e;     // world-shadow near-black teal

/** Body surface recipes — 3D stands in for the 2D baked texture set. */
const MATERIAL_LOOK: Record<string, { c: number; rough: number; metal: number }> = {
  rock: { c: 0x8a7a6a, rough: 0.92, metal: 0.02 },
  ice: { c: 0xd6e8f0, rough: 0.32, metal: 0.0 },
  metal: { c: 0x9aa8b6, rough: 0.38, metal: 0.75 },
  machine: { c: 0x6a7888, rough: 0.5, metal: 0.55 },
  molten: { c: 0xb0583a, rough: 0.7, metal: 0.05 },
  organic: { c: 0x6a9a5c, rough: 0.85, metal: 0.0 },
  gas: { c: 0xc8b89a, rough: 1.0, metal: 0.0 },
  crystal: { c: 0xa8d8e8, rough: 0.2, metal: 0.1 },
};

const FOV = 50;
const TILT = (56 * Math.PI) / 180; // camera elevation from the ground plane
const FIT_MARGIN = 1.16;
const FLIGHT_ZOOM = 1.22; // matches the 2D camera's flight punch

/** sim (x, y) -> world (x, h, -y) */
const px = (x: number, y: number, h = 0): THREE.Vector3 => new THREE.Vector3(x, h, -y);

// ------------------------------------------------------------ canvas assets
function radialTexture(inner: string, outer: string, size = 128): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blobTexture(color: string): THREE.Texture {
  return radialTexture(color, 'rgba(0,0,0,0)');
}

// ==================================================================== class
interface BodyView {
  mesh: THREE.Mesh;
  atmo: THREE.Mesh | null;
  spinRing: THREE.Object3D | null; // repulsor identity ring
  baseR: number;
  kind: string;
  pulsePeriod: number;
  pulsePhase: number;
  pulseMin: number;
  muBase: number;
}

interface Ripple {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  life: number;
  from: number;
  to: number;
}

export class Renderer3D implements OrbitalRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(FOV, 1, 5, 200000);
  private pickCam = new THREE.PerspectiveCamera(FOV, 1, 5, 200000);
  private host: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private quality: 'full' | 'lite' = 'full';

  private worldGroup = new THREE.Group();
  private fxGroup = new THREE.Group();
  private lastWorld: World | null = null;

  // dynamic views
  private bodyViews: BodyView[] = [];
  private milo = new THREE.Group();
  private miloMesh: THREE.Mesh | null = null;
  private contactBlob: THREE.Mesh | null = null;
  private holeGroup = new THREE.Group();
  private beacon: THREE.Sprite | null = null;
  private beamViews: { pivot: THREE.Object3D; spin: number }[] = [];
  private fragmentViews: { mesh: THREE.Mesh; x: number; y: number; taken: boolean; phase: number }[] = [];
  private switchViews: { ring: THREE.Mesh; x: number; y: number }[] = [];
  private wormViews: { a: THREE.Object3D; b: THREE.Object3D }[] = [];
  private debrisViews: THREE.Mesh[] = [];
  private pinViews: THREE.Group[] = [];

  // aim/preview/ghost/last-shot primitives
  private preview: THREE.InstancedMesh;
  private aimGroup = new THREE.Group();
  private aimLine: THREE.Line;
  private aimMat: THREE.LineBasicMaterial;
  private aimHead: THREE.Mesh;
  private ghost: THREE.Group;
  private ghostRing: THREE.Mesh;
  private ghostMat: THREE.MeshBasicMaterial;
  private lastShot: THREE.Points;
  private lastShotGeom: THREE.BufferGeometry;

  // camera state
  private basePos = new THREE.Vector3();
  private baseLook = new THREE.Vector3();
  private distScale = 1;
  private shake = 0;
  private t = 0;

  // event ripples (pooled)
  private ripples: Ripple[] = [];

  constructor() {
    // --- preview arc: instanced dots along the predicted trajectory
    const dotGeom = new THREE.SphereGeometry(9, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 });
    this.preview = new THREE.InstancedMesh(dotGeom, dotMat, 160);
    this.preview.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.preview.count = 0;
    this.preview.frustumCulled = false;
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < 160; i++) this.preview.setColorAt(i, white);

    // --- aim arrow: a slim line + head, tinted by power
    this.aimMat = new THREE.LineBasicMaterial({ color: GRAVITY, transparent: true, opacity: 0.9 });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.aimLine = new THREE.Line(lg, this.aimMat);
    this.aimHead = new THREE.Mesh(
      new THREE.ConeGeometry(7, 20, 10),
      new THREE.MeshBasicMaterial({ color: GRAVITY, transparent: true, opacity: 0.95 }),
    );
    this.aimHead.rotation.x = Math.PI / 2; // lie along +z until aimed
    this.aimGroup.add(this.aimLine, this.aimHead);
    this.aimGroup.visible = false;

    // --- pin placement ghost
    this.ghostMat = new THREE.MeshBasicMaterial({ color: RELIC, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    this.ghostRing = new THREE.Mesh(new THREE.RingGeometry(14, 20, 40), this.ghostMat);
    this.ghostRing.rotation.x = -Math.PI / 2;
    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(7, 30, 4),
      new THREE.MeshBasicMaterial({ color: RELIC, transparent: true, opacity: 0.8 }),
    );
    shard.position.y = 16;
    this.ghost = new THREE.Group();
    this.ghost.add(this.ghostRing, shard);
    this.ghost.visible = false;

    // --- last-shot review trail (dots, faint, shown while aiming)
    this.lastShotGeom = new THREE.BufferGeometry();
    this.lastShotGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3));
    this.lastShot = new THREE.Points(
      this.lastShotGeom,
      new THREE.PointsMaterial({
        color: GRAVITY, size: 8, sizeAttenuation: true, transparent: true,
        opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.lastShot.visible = false;
    this.lastShot.frustumCulled = false;

    this.scene.add(this.worldGroup, this.fxGroup, this.milo, this.holeGroup,
      this.preview, this.aimGroup, this.ghost, this.lastShot);
  }

  // ------------------------------------------------------------- contract

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x04100f, 1);
    const cv = r.domElement;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    host.appendChild(cv);
    this.renderer = r;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    // QA handle (mirrors the ?level/?seed param family): console-level access
    // to the live 3D view for browser debugging.
    (window as unknown as Record<string, unknown>).__ob3d = this;
  }

  syncWorld(w: World, frameDt: number): void {
    if (!this.renderer) return;
    const dt = Math.min(frameDt, 0.1);
    this.t += dt;
    if (w !== this.lastWorld) this.rebuild(w);

    this.updateDynamic(w, dt);
    this.updateCamera(w, dt);
    this.renderer.render(this.scene, this.cam);
  }

  onEvents(events: SimEvent[]): void {
    for (const e of events) this.onEvent(e);
  }

  setPreview(points: PredPoint[] | null, _end: string | null): void {
    const n = points ? Math.min(points.length, 160) : 0;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = points![i];
      m.makeTranslation(p.x, 4, -p.y);
      this.preview.setMatrixAt(i, m);
      const t01 = n > 1 ? i / (n - 1) : 0;
      c.setHex(mixRGB(mixRGB(RAMP_SLOW, 0x9df0c8, t01), 0xffffff, 0.12));
      this.preview.setColorAt(i, c);
    }
    this.preview.count = n;
    this.preview.instanceMatrix.needsUpdate = true;
    if (this.preview.instanceColor) this.preview.instanceColor.needsUpdate = true;
  }

  setLastShot(points: { x: number; y: number }[] | null): void {
    const n = points ? Math.min(points.length, 240) : 0;
    const arr = this.lastShotGeom.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) arr.setXYZ(i, points![i].x, 3, -points![i].y);
    arr.needsUpdate = true;
    this.lastShotGeom.setDrawRange(0, n);
  }

  setAim(active: boolean, dirX: number, dirY: number, power01: number): void {
    this.aimGroup.visible = active;
    this.lastShot.visible = active;
    if (!active) return;
    const w = this.lastWorld;
    if (!w) return;
    const len = 60 + power01 * 220;
    const bx = w.ball.x, by = w.ball.y;
    const ex = bx + dirX * len, ey = by + dirY * len;
    const arr = this.aimLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    arr.setXYZ(0, bx, 4, -by);
    arr.setXYZ(1, ex, 4, -ey);
    arr.needsUpdate = true;
    this.aimHead.position.set(ex, 4, -ey);
    this.aimHead.rotation.z = 0;
    this.aimHead.rotation.y = Math.atan2(-dirX, -dirY);
    const tint = mixRGB(RAMP_SLOW, RAMP_FAST, power01);
    this.aimMat.color.setHex(tint);
    (this.aimHead.material as THREE.MeshBasicMaterial).color.setHex(tint);
  }

  setPinGhost(pin: PinGhost | null): void {
    this.ghost.visible = !!pin;
    if (!pin) return;
    this.ghost.position.set(pin.x, 1, -pin.y);
    const c = pin.valid ? RELIC : 0x8a2a22;
    this.ghostMat.color.setHex(c);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const cv = this.renderer?.domElement;
    if (!cv) return { x: 0, y: 0 };
    const rect = cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      (sx / rect.width) * 2 - 1,
      -(sy / rect.height) * 2 + 1,
    );
    this.pickCam.copy(this.cam); // contract: pick through the UNSHAKEN view
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.pickCam);
    const o = rc.ray.origin, d = rc.ray.direction;
    if (Math.abs(d.y) < 1e-5) return { x: 0, y: 0 };
    const t = -o.y / d.y;
    const hit = o.clone().addScaledVector(d, t);
    return { x: hit.x, y: -hit.z };
  }

  setMiloMood(_mood: MiloMood | null): void {
    // 3D Milo is a glossy sphere; moods arrive with the M2 identity pass.
  }

  screenShake(mag: number): void {
    this.shake = Math.max(this.shake, mag);
  }

  setQuality(tier: 'full' | 'lite'): void {
    if (tier === this.quality) return;
    this.quality = tier;
    if (this.renderer) {
      this.renderer.shadowMap.enabled = tier === 'full';
      this.resize();
    }
    if (this.lastWorld) this.rebuild(this.lastWorld); // re-pick geometry detail
  }

  resize(): void {
    if (!this.host || !this.renderer) return;
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'lite' ? 1.5 : 2));
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  destroy(): void {
    this.ro?.disconnect();
    this.ro = null;
    this.clearWorld();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.lastWorld = null;
  }

  // -------------------------------------------------------------- rebuild

  private clearWorld(): void {
    this.worldGroup.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.worldGroup.clear();
    this.fxGroup.clear();
    this.bodyViews = [];
    this.beamViews = [];
    this.fragmentViews = [];
    this.switchViews = [];
    this.wormViews = [];
    this.debrisViews = [];
    this.pinViews = [];
    this.beacon = null;
  }

  private rebuild(w: World): void {
    this.lastWorld = w;
    this.clearWorld();
    const b = w.def.bounds;
    // one honest key light: same theme, same sun placement as the 2D view
    const theme = worldThemeFor(w.def.id);
    const sun = themeSunPos(theme.sunSide, b);
    const accent = col(theme.accentTint);
    const sunDir = px(sun.x - b.cx, sun.y - b.cy).normalize();

    // --- lights
    const hemi = new THREE.HemisphereLight(col(theme.skyTop), col(theme.skyBottom), 0.85);
    this.worldGroup.add(hemi);
    const sunLight = new THREE.DirectionalLight(col(theme.sunColor), 2.2);
    sunLight.position.copy(px(b.cx, b.cy).addScaledVector(new THREE.Vector3(sunDir.x, 0.75, sunDir.z).normalize(), 4200));
    sunLight.target.position.set(b.cx, 0, -b.cy);
    sunLight.castShadow = this.quality === 'full';
    const R = Math.max(b.rx, b.ry) * 1.35;
    sunLight.shadow.camera.left = -R;
    sunLight.shadow.camera.right = R;
    sunLight.shadow.camera.top = R;
    sunLight.shadow.camera.bottom = -R;
    sunLight.shadow.camera.near = 200;
    sunLight.shadow.camera.far = 9500;
    sunLight.shadow.mapSize.set(this.quality === 'full' ? 2048 : 1024, this.quality === 'full' ? 2048 : 1024);
    this.worldGroup.add(sunLight, sunLight.target);

    // --- sky dome + stars + nebula + sun glow
    this.buildSky(w, theme, sunDir);

    // --- the plane: the icon's teal space as a floor — lighter mid, dark rim.
    // Self-lit (emissive) because the theme palette is deliberately deep-dark;
    // the 2D view lifts its midtones with additive glows and we do it here.
    const gR = Math.hypot(b.rx, b.ry) * 1.6;
    const lift = (hex: string, f: number): string => {
      const c = col(hex);
      const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
      const g2 = Math.min(255, Math.round(((c >> 8) & 255) * f));
      const b2 = Math.min(255, Math.round((c & 255) * f));
      return `rgba(${r},${g2},${b2},1)`;
    };
    const groundTex = radialTexture(lift(theme.skyTop, 1.55), lift(theme.skyBottom, 1.15), 512);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(gR, 72),
      new THREE.MeshStandardMaterial({
        map: groundTex, roughness: 1,
        emissive: 0xffffff, emissiveMap: groundTex, emissiveIntensity: 0.45,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(b.cx, -0.5, -b.cy);
    ground.receiveShadow = true;
    this.worldGroup.add(ground);

    // --- bounds ellipse (dashed gravity line)
    const pts: THREE.Vector3[] = [];
    const N = 128;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push(px(b.cx + Math.cos(a) * b.rx, b.cy + Math.sin(a) * b.ry, 1));
    }
    const bGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const bLine = new THREE.LineLoop(bGeom, new THREE.LineDashedMaterial({
      color: GRAVITY, transparent: true, opacity: 0.3, dashSize: 30, gapSize: 22,
    }));
    bLine.computeLineDistances();
    this.worldGroup.add(bLine);

    // --- gravity bodies
    for (const bd of w.bodies) this.addBody(bd, accent);

    // --- THE HOLE (moving green handled in updateDynamic)
    this.buildHole(w);
    this.holeGroup.position.set(w.holeX, 0, -w.holeY);

    // --- tee pad
    const tee = new THREE.Mesh(
      new THREE.CircleGeometry(26, 32),
      new THREE.MeshStandardMaterial({ color: 0x39424c, roughness: 0.9 }),
    );
    tee.rotation.x = -Math.PI / 2;
    tee.position.set(w.def.tee.x, 0.2, -w.def.tee.y);
    tee.receiveShadow = true;
    this.worldGroup.add(tee);

    // --- zones / hazards / machinery / pickups
    for (const z of w.zones) this.addZone(z);
    for (const h of w.hazards) this.addHazard(h);
    for (const sw of w.switches) this.addSwitch(sw);
    for (const wh of w.wormholes) this.addWormhole(wh);
    for (const f of w.fragments) this.addFragment(f);
    for (const d of w.debris) this.addDebris(d);

    // --- Milo
    this.miloMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, this.quality === 'full' ? 32 : 16, this.quality === 'full' ? 24 : 12),
      new THREE.MeshStandardMaterial({ color: 0xf2f6f8, roughness: 0.25, metalness: 0.05 }),
    );
    this.miloMesh.castShadow = true;
    const blobTex = radialTexture('rgba(2,16,14,0.55)', 'rgba(2,16,14,0)');
    this.contactBlob = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_R * 1.7, 24),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
    );
    this.contactBlob.rotation.x = -Math.PI / 2;
    this.contactBlob.position.y = 0.3;
    this.milo.add(this.miloMesh, this.contactBlob);

    this.fitCamera(w.def.bounds);
  }

  // -------------------------------------------------------------- builders

  private buildSky(w: World, theme: ReturnType<typeof worldThemeFor>, sunDir: THREE.Vector3): void {
    const b = w.def.bounds;
    const center = px(b.cx, b.cy);

    // gradient dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(col(theme.skyTop)) },
        bottom: { value: new THREE.Color(col(theme.skyBottom)) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.08, 0.65, h)), 1.0); }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60000, 32, 18), skyMat);
    dome.position.copy(center);
    this.worldGroup.add(dome);

    // sparse icon sky: stars in the upper hemisphere
    const n = Math.round(750 * theme.starDensity);
    const pos = new Float32Array(n * 3);
    const colArr = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.asin(0.08 + Math.random() * 0.9);
      const r = 52000;
      pos[i * 3] = center.x + Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = center.z + Math.sin(a) * Math.cos(e) * r;
      c.setHex(0xdfeef2).multiplyScalar(0.35 + Math.random() * 0.65);
      colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 140, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.worldGroup.add(stars);

    // nebula blobs — additive, theme hues, kept under the pad's brightness
    theme.nebulaColors.forEach((nc, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: blobTexture(nc), transparent: true, opacity: theme.nebulaAlpha * 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const a = (i / theme.nebulaColors.length) * Math.PI * 2 + b.cx;
      sp.position.set(center.x + Math.cos(a) * 26000, 9000 + i * 2600, center.z + Math.sin(a) * 26000);
      sp.scale.setScalar(22000 + i * 5200);
      this.worldGroup.add(sp);
    });

    // the sun itself — a far billboard along the key-light direction
    const sunSp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: blobTexture(theme.sunColor), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sunSp.position.copy(center).addScaledVector(new THREE.Vector3(sunDir.x, 0.55, sunDir.z).normalize(), 38000);
    sunSp.scale.setScalar(9000);
    this.worldGroup.add(sunSp);

    // silhouette motifs — the world's dark far-shore furniture, archetype
    // derived from the level id exactly like the 2D background variants
    const silhouette = new THREE.MeshBasicMaterial({ color: 0x030b0a });
    const variant = bgVariantFor(w.def.id);
    const ringR = 1.28;
    const put = (i: number, n: number, obj: THREE.Object3D, hScale: number) => {
      const a = (i / n) * Math.PI * 2 + variant;
      obj.position.set(
        b.cx + Math.cos(a) * b.rx * ringR,
        0,
        -(b.cy + Math.sin(a) * b.ry * ringR),
      );
      obj.scale.setScalar(hScale * (0.7 + ((i * 37) % 10) / 18));
      obj.rotation.y = a;
      this.worldGroup.add(obj);
    };
    const S = Math.max(b.rx, b.ry) / 100; // silhouette unit
    for (let i = 0; i < 9; i++) {
      let obj: THREE.Object3D;
      if (variant === 2) { // crystals
        obj = new THREE.Mesh(new THREE.ConeGeometry(2.2 * S, 14 * S, 5), silhouette);
        obj.position.y = 7 * S;
      } else if (variant === 0) { // arches
        obj = new THREE.Mesh(new THREE.TorusGeometry(5 * S, 0.9 * S, 6, 20, Math.PI), silhouette);
        obj.position.y = 0;
      } else if (variant === 1) { // wreck: tilted slab clusters
        obj = new THREE.Mesh(new THREE.BoxGeometry(9 * S, 4.5 * S, 1.6 * S), silhouette);
        obj.position.y = 2 * S;
        obj.rotation.z = 0.22;
      } else if (variant === 4) { // aurora: tall thin planes
        obj = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * S, 22 * S),
          new THREE.MeshBasicMaterial({ color: 0x030b0a, side: THREE.DoubleSide }));
        obj.position.y = 11 * S;
      } else if (variant === 5) { // grid: regular low blocks
        obj = new THREE.Mesh(new THREE.BoxGeometry(5 * S, 3.4 * S, 5 * S), silhouette);
        obj.position.y = 1.7 * S;
      } else { // horizon: long low wall
        obj = new THREE.Mesh(new THREE.BoxGeometry(16 * S, 2.6 * S, 2 * S), silhouette);
        obj.position.y = 1.3 * S;
      }
      put(i, 9, obj, 1);
    }
  }

  private addBody(bd: World['bodies'][number], accent: number): void {
    const look = MATERIAL_LOOK[bd.material] ?? MATERIAL_LOOK.rock;
    const seg = this.quality === 'full' ? 40 : 20;
    const isGas = bd.material === 'gas';
    const mat = new THREE.MeshStandardMaterial({
      color: look.c, roughness: look.rough, metalness: look.metal,
      flatShading: false,
    });
    if (bd.kind === 'unstable') {
      mat.emissive = new THREE.Color(0xffd9a0);
      mat.emissiveIntensity = 0.35;
    }
    if (isGas) {
      // faint banded look via slight emissive lift so gas giants read creamy
      mat.emissive = new THREE.Color(look.c);
      mat.emissiveIntensity = 0.12;
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(bd.radius, seg, Math.round(seg * 0.66)), mat);
    mesh.position.set(bd.x, bd.radius, -bd.y);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);

    // atmosphere shell — view-dependent fresnel rim hugging the limb
    let atmo: THREE.Mesh | null = null;
    if (bd.radius > 0) {
      atmo = new THREE.Mesh(
        new THREE.SphereGeometry(bd.radius * 1.06, seg, Math.round(seg * 0.66)),
        new THREE.ShaderMaterial({
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.BackSide,
          uniforms: { uColor: { value: new THREE.Color(accent) } },
          vertexShader: `varying vec3 vN; varying vec3 vV;
            void main(){
              vN = normalize(normalMatrix * normal);
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vV = normalize(-mv.xyz);
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
            void main(){
              float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
              gl_FragColor = vec4(uColor, rim * 0.55);
            }`,
        }),
      );
      mesh.add(atmo);
    }

    // repulsor identity: tilted spinning ring
    let spinRing: THREE.Object3D | null = null;
    if (bd.kind === 'repulsor') {
      spinRing = new THREE.Mesh(
        new THREE.TorusGeometry(bd.radius * 1.35, bd.radius * 0.05, 8, 48),
        new THREE.MeshBasicMaterial({ color: GRAVITY, transparent: true, opacity: 0.35 }),
      );
      spinRing.rotation.x = Math.PI / 2.4;
      mesh.add(spinRing);
    }

    // deadly warning ring on the ground
    if (bd.deadly) {
      const danger = new THREE.Mesh(
        new THREE.RingGeometry(bd.radius * 1.12, bd.radius * 1.2, 48),
        new THREE.MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
      );
      danger.rotation.x = -Math.PI / 2;
      danger.position.set(bd.x, 0.8, -bd.y);
      this.worldGroup.add(danger);
    }

    // anchor marker (radius 0): flat dashed-look ring
    if (bd.radius === 0) {
      const mark = new THREE.Mesh(
        new THREE.RingGeometry(bd.influenceR * 0.14, bd.influenceR * 0.16, 40),
        new THREE.MeshBasicMaterial({ color: GRAVITY, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
      );
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(bd.x, 0.8, -bd.y);
      this.worldGroup.add(mark);
    }

    this.bodyViews.push({
      mesh, atmo, spinRing,
      baseR: bd.radius, kind: bd.kind,
      pulsePeriod: bd.pulsePeriod ?? 3,
      pulsePhase: bd.pulsePhase ?? 0,
      pulseMin: bd.pulseMin ?? 0.35,
      muBase: bd.mu || 1,
    });
  }

  private buildHole(w: World): void {
    const cap = w.def.hole.captureR ?? HOLE_CAPTURE_R;
    const g = this.holeGroup;

    // the lit putting green — THE landmark (brightest thing on every level)
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(cap * 3.4, 48),
      new THREE.MeshStandardMaterial({
        color: 0x0e3a24, roughness: 0.85,
        emissive: new THREE.Color(CUP_GREEN), emissiveIntensity: 0.5,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.4;
    pad.receiveShadow = true;
    g.add(pad);

    // mown bands
    for (const [ri, ro, op] of [[2.0, 2.3, 0.25], [2.7, 2.95, 0.18]] as const) {
      const band = new THREE.Mesh(
        new THREE.RingGeometry(cap * ri, cap * ro, 48),
        new THREE.MeshBasicMaterial({ color: CUP_GREEN, transparent: true, opacity: op, side: THREE.DoubleSide }),
      );
      band.rotation.x = -Math.PI / 2;
      band.position.y = 0.5;
      g.add(band);
    }

    // dark cup shaft
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(cap * 0.85, cap * 0.85, 8, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: INK_DARK, side: THREE.DoubleSide }),
    );
    cup.position.y = 0.4;
    g.add(cup);
    const cupFloor = new THREE.Mesh(
      new THREE.CircleGeometry(cap * 0.85, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    cupFloor.rotation.x = -Math.PI / 2;
    cupFloor.position.y = 0.2;
    g.add(cupFloor);

    // glowing rim — the icon's cup ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(cap * 0.95, cap * 1.3, 48),
      new THREE.MeshBasicMaterial({
        color: CUP_RING, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.7;
    g.add(ring);

    // beacon bloom (pulses in updateDynamic)
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: blobTexture('rgba(157,240,200,0.9)'), transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.beacon.position.y = 12;
    this.beacon.scale.setScalar(cap * 5);
    g.add(this.beacon);

    // moving-hole path dots
    if (w.def.hole.path) {
      const p = w.def.hole.path.points;
      const arr = new Float32Array(p.length * 3);
      p.forEach((pt, i) => { arr[i * 3] = pt.x; arr[i * 3 + 1] = 1.5; arr[i * 3 + 2] = -pt.y; });
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      g.add(new THREE.Points(pg, new THREE.PointsMaterial({
        color: CUP_GREEN, size: 9, sizeAttenuation: true, transparent: true,
        opacity: 0.4, depthWrite: false,
      })));
    }
  }

  private addZone(z: World['zones'][number]): void {
    const kind = z.kind;
    const color = kind === 'void' ? 0x140a1e
      : kind === 'flipper' ? GRAVITY
      : kind === 'amp' ? CUP_GREEN
      : kind === 'damp' ? 0x8a6fd6
      : GRAVITY;
    const opacity = kind === 'void' ? 0.6 : 0.22;
    if (z.x !== undefined && z.y !== undefined && z.radius !== undefined) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(z.radius, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(z.x, 0.6, -z.y);
      this.worldGroup.add(disc);
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(z.radius * 0.96, z.radius * 1.03, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity + 0.25, side: THREE.DoubleSide }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(z.x, 0.7, -z.y);
      this.worldGroup.add(rim);
    } else if (z.a && z.b && z.corridorR) {
      // corridor: flat capsule slab along a->b
      const ax = z.a.x, ay = z.a.y, bx2 = z.b.x, by2 = z.b.y;
      const len = Math.hypot(bx2 - ax, by2 - ay);
      const slab = new THREE.Mesh(
        new THREE.CylinderGeometry(z.corridorR, z.corridorR, len, 24, 1, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false }),
      );
      slab.rotation.z = Math.PI / 2;
      const mid = px((ax + bx2) / 2, (ay + by2) / 2, 0.6);
      slab.position.copy(mid);
      slab.rotation.y = Math.atan2(-(bx2 - ax), -(by2 - ay)) + Math.PI / 2;
      this.worldGroup.add(slab);
    }
  }

  private addHazard(h: World['hazards'][number]): void {
    const d = h.def;
    if (d.kind === 'barrier') {
      const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(len, 22, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a545e, roughness: 0.6, metalness: 0.3 }),
      );
      wall.position.set((d.a.x + d.b.x) / 2, 11, -(d.a.y + d.b.y) / 2);
      wall.rotation.y = Math.atan2(-(d.b.x - d.a.x), -(d.b.y - d.a.y));
      wall.castShadow = true;
      this.worldGroup.add(wall);
    } else if (d.kind === 'bumper') {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(d.r, d.r * 1.12, 26, 24),
        new THREE.MeshStandardMaterial({
          color: 0x5a6470, roughness: 0.5, metalness: 0.4,
          emissive: new THREE.Color(AMBER), emissiveIntensity: 0.25,
        }),
      );
      tower.position.set(d.x, 13, -d.y);
      tower.castShadow = true;
      this.worldGroup.add(tower);
    } else if (d.kind === 'beam') {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, 8, -d.y);
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(d.len * 2, 10, 6),
        new THREE.MeshStandardMaterial({
          color: 0x6a5a3a, roughness: 0.6,
          emissive: new THREE.Color(DANGER), emissiveIntensity: 0.4,
        }),
      );
      arm.castShadow = true;
      pivot.add(arm);
      this.worldGroup.add(pivot);
      this.beamViews.push({ pivot, spin: d.spin });
    }
  }

  private addSwitch(sw: World['switches'][number]): void {
    const d = sw.def;
    const puck = new THREE.Mesh(
      new THREE.CylinderGeometry(d.r, d.r * 1.15, 10, 24),
      new THREE.MeshStandardMaterial({
        color: 0x4a545e, roughness: 0.55, metalness: 0.4,
        emissive: new THREE.Color(AMBER), emissiveIntensity: 0.3,
      }),
    );
    puck.position.set(d.x, 5, -d.y);
    puck.castShadow = true;
    this.worldGroup.add(puck);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(d.r * 1.25, d.r * 1.45, 32),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(d.x, 0.9, -d.y);
    this.worldGroup.add(ring);
    this.switchViews.push({ ring, x: d.x, y: d.y });

    // conduit wires to target bodies/zones (targets are sim ids)
    const nodes = new Map<string, { x: number; y: number }>();
    for (const bd of this.lastWorld?.bodies ?? []) nodes.set(bd.id, { x: bd.x, y: bd.y });
    for (const z of this.lastWorld?.zones ?? []) {
      if (z.x !== undefined && z.y !== undefined) nodes.set(z.id, { x: z.x, y: z.y });
    }
    for (const tid of d.targets) {
      const t = nodes.get(tid);
      if (!t) continue;
      const g = new THREE.BufferGeometry().setFromPoints([
        px(d.x, d.y, 2), px(t.x, t.y, 2),
      ]);
      this.worldGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({
        color: AMBER, transparent: true, opacity: 0.25,
      })));
    }
  }

  private addWormhole(wh: World['wormholes'][number]): void {
    const d = wh.def;
    // each def is one mouth of the pair (exitId links them) — one ring each
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(d.r, 3.5, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xc9a0ff, transparent: true, opacity: 0.75 }),
    );
    ring.rotation.x = -Math.PI / 2;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(d.r * 0.92, 32),
      new THREE.MeshBasicMaterial({ color: 0x140a1e }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.5;
    grp.add(ring, disc);
    grp.position.set(d.x, 1.5, -d.y);
    this.worldGroup.add(grp);
    this.wormViews.push({ a: grp, b: grp });
  }

  private addFragment(f: World['fragments'][number]): void {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(11),
      new THREE.MeshStandardMaterial({
        color: RELIC, roughness: 0.25, metalness: 0.1,
        emissive: new THREE.Color(RELIC), emissiveIntensity: 0.8,
      }),
    );
    mesh.position.set(f.x, 16, -f.y);
    mesh.castShadow = true;
    this.worldGroup.add(mesh);
    this.fragmentViews.push({ mesh, x: f.x, y: f.y, taken: false, phase: Math.random() * Math.PI * 2 });  }

  private addDebris(d: World['debris'][number]): void {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(d.r, 0),
      new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95, flatShading: true }),
    );
    mesh.position.set(d.x, d.r, -d.y);
    mesh.castShadow = true;
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.worldGroup.add(mesh);
    this.debrisViews.push(mesh);
  }

  // --------------------------------------------------------------- dynamic

  private updateDynamic(w: World, dt: number): void {
    // Milo
    this.milo.position.set(w.ball.x, w.ball.flying ? BALL_R * 1.1 : BALL_R, -w.ball.y);
    const sunkNow = w.ball.sunk || w.ball.dead;
    if (this.miloMesh) {
      const s = sunkNow ? Math.max(0.001, this.miloMesh.scale.x - dt * 4) : 1;
      this.miloMesh.scale.setScalar(s);
      this.milo.visible = s > 0.01;
    }
    if (this.contactBlob) this.contactBlob.position.set(0, -this.milo.position.y + 0.35, 0);

    // hole (moving greens)
    this.holeGroup.position.set(w.holeX, 0, -w.holeY);
    if (this.beacon) {
      // 30%-duty beacon, same read as the 2D hole hint
      const duty = (this.t % 3.6) / 3.6 < 0.5 ? 1 : 0.35;
      (this.beacon.material as THREE.SpriteMaterial).opacity = 0.28 * duty;
      this.beacon.scale.setScalar((w.def.hole.captureR ?? HOLE_CAPTURE_R) * (4.4 + 0.8 * duty));
    }

    // bodies
    for (let i = 0; i < w.bodies.length; i++) {
      const bd = w.bodies[i];
      const v = this.bodyViews[i];
      if (!v) continue;
      v.mesh.position.set(bd.cx, bd.radius, -bd.cy);
      if (v.kind === 'pulse' && bd.active) {
        const f = clamp((bd.muCurrent / v.muBase - v.pulseMin) / (1 - v.pulseMin), 0, 1);
        const s = 0.9 + 0.1 * f;
        v.mesh.scale.setScalar(s);
      } else if (v.kind === 'unstable' && bd.active) {
        const ratio = clamp(bd.muCurrent / v.muBase, 0, 2);
        v.mesh.scale.setScalar(0.92 + 0.12 * ratio + (Math.random() - 0.5) * 0.02);
        const mat = v.mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.2 + 0.35 * Math.random() * clamp(ratio, 0.2, 1.2);
      }
      if (!bd.active) {
        v.mesh.scale.setScalar(0.001 + v.mesh.scale.x * 0.9); // dormant: sink away
        const mat = v.mesh.material as THREE.MeshStandardMaterial;
        mat.color.multiplyScalar(1 - dt * 0.4);
      }
      if (v.spinRing) v.spinRing.rotation.z -= dt * 0.45;
    }

    // beams / fragments / switches / wormholes
    for (const bv of this.beamViews) bv.pivot.rotation.y -= dt * bv.spin;
    for (const fv of this.fragmentViews) {
      fv.mesh.rotation.y += dt * 0.8;
      fv.mesh.position.y = 16 + Math.sin(this.t * 1.7 + fv.phase) * 3;
    }
    for (const sv of this.switchViews) sv.ring.rotation.z += dt * 0.5;
    for (const wv of this.wormViews) {
      wv.a.rotation.y += dt * 0.6;
      wv.b.rotation.y -= dt * 0.6;
    }

    // update placed gravity pins (player-collected family)
    for (let i = 0; i < Math.max(w.pins.length, this.pinViews.length); i++) {
      if (i >= this.pinViews.length) this.pinViews.push(this.makePinMesh());
      const pv = this.pinViews[i];
      const live = i < w.pins.length;
      pv.visible = live;
      if (live) {
        pv.position.set(w.pins[i].x, 0, -w.pins[i].y);
        pv.rotation.y += dt * 0.4;
      }
    }

    this.updateRipples(dt);
  }

  /** One placed gravity pin: tee + emerald shard + flat reach ring. */
  private makePinMesh(): THREE.Group {
    const g = new THREE.Group();
    const tee = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 7, 8, 10),
      new THREE.MeshStandardMaterial({ color: 0x39424c, roughness: 0.7, metalness: 0.3 }),
    );
    tee.position.y = 4;
    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(6, 26, 4),
      new THREE.MeshStandardMaterial({
        color: RELIC, roughness: 0.3, metalness: 0.1,
        emissive: new THREE.Color(RELIC), emissiveIntensity: 0.7,
      }),
    );
    shard.position.y = 21;
    shard.castShadow = true;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(20, 23, 40),
      new THREE.MeshBasicMaterial({
        color: RELIC, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.9;
    g.add(tee, shard, ring);
    this.worldGroup.add(g);
    return g;
  }

  // pooled expanding rings for bounce/sink/etc.
  private spawnRipple(x: number, y: number, color: number, from: number, to: number, life: number): void {
    let r = this.ripples.find((q) => q.t >= q.life);
    if (!r) {
      if (this.ripples.length >= 10) return;
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), mat);
      mesh.rotation.x = -Math.PI / 2;
      this.fxGroup.add(mesh);
      r = { mesh, mat, t: 0, life, from, to };
      this.ripples.push(r);
    }
    r.t = 0;
    r.life = life;
    r.from = from;
    r.to = to;
    r.mat.color.setHex(color);
    r.mesh.position.set(x, 1.2, -y);
    r.mesh.visible = true;
  }

  private updateRipples(dt: number): void {
    for (const r of this.ripples) {
      if (r.t >= r.life) {
        r.mesh.visible = false;
        continue;
      }
      r.t += dt;
      const f = clamp(r.t / r.life, 0, 1);
      const s = r.from + (r.to - r.from) * f;
      r.mesh.scale.setScalar(s);
      r.mat.opacity = 0.7 * (1 - f);
    }
  }

  private onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'bounce':
        this.spawnRipple(e.x, e.y, GRAVITY, 8, 46, 0.45);
        break;
      case 'sink':
        this.spawnRipple(e.x, e.y, CUP_RING, 10, 130, 0.9);
        break;
      case 'hazard':
        this.spawnRipple(e.x, e.y, DANGER, 10, 90, 0.6);
        break;
      case 'voided':
        this.spawnRipple(e.x, e.y, 0xc9a0ff, 10, 110, 0.7);
        break;
      case 'launch':
        this.spawnRipple(e.x, e.y, GRAVITY, 6, 34, 0.35);
        break;
      case 'pinPlace':
        this.spawnRipple(e.x, e.y, RELIC, 8, 60, 0.5);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- camera

  private fitCamera(b: World['def']['bounds']): void {
    const center = px(b.cx, b.cy);
    // distance so the bounds ellipse fits under the tilted perspective view
    const tanV = Math.tan((FOV * Math.PI) / 360);
    const aspect = Math.max(this.cam.aspect, 0.6);
    const dH = b.rx / (tanV * aspect);
    const dV = (b.ry * Math.sin(TILT)) / tanV;
    const d = Math.max(dH, dV) * FIT_MARGIN;
    this.baseLook.copy(center);
    this.basePos.copy(center).add(new THREE.Vector3(0, Math.sin(TILT) * d, Math.cos(TILT) * d));
    this.distScale = 1;
  }

  private updateCamera(w: World, dt: number): void {
    const b = w.def.bounds;
    // gentle follow while flying (never during aim — owner verdict), capped
    // so the course edge stays framed
    let lookX = b.cx, lookY = b.cy;
    if (w.ball.flying) {
      const capX = b.rx * 0.3, capY = b.ry * 0.42;
      lookX = b.cx + clamp(w.ball.x - b.cx, -capX, capX);
      lookY = b.cy + clamp(w.ball.y - b.cy, -capY, capY);
    }
    const look = px(lookX, lookY);
    this.baseLook.x = expDamp(this.baseLook.x, look.x, w.ball.flying ? 2.9 : 2.2, dt);
    this.baseLook.z = expDamp(this.baseLook.z, look.z, w.ball.flying ? 2.9 : 2.2, dt);

    // flight zoom energy: quick 1.22x punch-in, relaxed return home
    const tgt = w.ball.flying ? 1 / FLIGHT_ZOOM : 1;
    this.distScale = expDamp(this.distScale, tgt, w.ball.flying ? 7.5 : 3.2, dt);

    const dir = this.basePos.clone().sub(this.baseLook);
    const d0 = dir.length() / (this.distScale || 1);
    dir.setLength(d0);
    const pos = this.baseLook.clone().add(dir);

    // shake on the VISUAL camera only
    this.shake = decayShake(this.shake, dt);
    if (this.shake > 0.001) {
      pos.x += (Math.random() - 0.5) * this.shake;
      pos.y += (Math.random() - 0.5) * this.shake;
      pos.z += (Math.random() - 0.5) * this.shake;
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(this.baseLook);
  }
}

/** Contract factory for the 3D client (main3d.ts). */
export function createRenderer(): OrbitalRenderer {
  return new Renderer3D();
}

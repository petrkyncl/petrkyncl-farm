// iPhone 17 Pro Max in Deep Blue, body to Apple's published dimensions (163.4 × 78.0 × 8.75 mm).
// Back layout measured off Petr's reference photo (461 × 963 px body = 78 × 163.4 mm, 5.91 px/mm):
// camera plateau almost full width (4 mm in from each edge, 43 mm tall, 2.5 mm proud, lenses +1.7 mm),
// 17 mm lenses in a triangle, flash top-right with the mic and LiDAR below it, a glass panel with the same
// side margins 7.6 mm under the plateau, and an 18 mm Apple logo at two thirds of the height.
// Plus the Recents card: credit-card sized (54 × 85.6 mm), 2.9 mm thick, matte black, like Ruune.
// Scene unit = 10 cm, so 1 mm = .01.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { slab, flat, faceBack } from './shapes.js';

// Cap a material's output before it reaches the bloom pass: a polished edge under a point-like light produces a
// near-infinite specular peak, and bloom smears one such pixel into a white haze over the whole frame.
export function clampHDR(m, max = 2.5){
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { prev && prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
    gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(${max.toFixed(2)}));`); };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => key + 'clamp' + max;
  m.needsUpdate = true;
  return m;
}
// Product-shot trick for flat polished metal: a flat face mirrors a directional light as one uniform flash, so the
// scene lights' direct specular is scaled down and the material is lit by its environment (the strip softboxes).
export function envLit(m, k = 0){
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { prev && prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    reflectedLight.directSpecular *= ${k.toFixed(3)};
    #ifdef USE_CLEARCOAT
    clearcoatSpecularDirect *= ${k.toFixed(3)};
    #endif`); };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => key + 'envLit' + k;
  m.needsUpdate = true;
  return m;
}
export const PW = .780, PH = 1.634, PD = .0875;
export const PLATEAU = { w: .697, h: .432, rt: .09, rb: .055, rise: .0248, lens: .0169 };
export const CARD = { w: .54, h: .856, d: .029, r: .07 };
export const DISPLAY = { w: PW - .036, h: PH - .036, r: .095 };

// simple-icons "apple" (CC0), 24×24 viewBox
const APPLE_PATH = 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';

function rr4Shape(w, h, rt, rb){
  const s = new THREE.Shape(), x = w/2, y = h/2;
  s.moveTo(-x+rb, -y); s.lineTo(x-rb, -y); s.absarc(x-rb, -y+rb, rb, -Math.PI/2, 0, false);
  s.lineTo(x, y-rt); s.absarc(x-rt, y-rt, rt, 0, Math.PI/2, false);
  s.lineTo(-x+rt, y); s.absarc(-x+rt, y-rt, rt, Math.PI/2, Math.PI, false);
  s.lineTo(-x, -y+rb); s.absarc(-x+rb, -y+rb, rb, Math.PI, Math.PI*1.5, false);
  return s;
}

function tex(w, h, draw, srgb = true){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// a camera lens seen through its sapphire cover: stacked elements, coating tint, a glint
const lensTexture = () => tex(512, 512, (g, w) => {
  const c = w/2;
  const bg = g.createRadialGradient(c, c, 0, c, c, c); bg.addColorStop(0, '#0d1222'); bg.addColorStop(.55, '#05070d'); bg.addColorStop(1, '#010102');
  g.fillStyle = bg; g.fillRect(0, 0, w, w);
  [.93, .8, .66, .52, .4, .27].forEach((r, i) => { g.strokeStyle = `rgba(110,130,190,${.1 + i*.03})`; g.lineWidth = 3; g.beginPath(); g.arc(c, c, r*c, 0, Math.PI*2); g.stroke(); });
  const coat = g.createLinearGradient(0, 0, w, w); coat.addColorStop(0, 'rgba(120,80,210,.35)'); coat.addColorStop(.5, 'rgba(60,170,140,.25)'); coat.addColorStop(1, 'rgba(120,80,210,.0)');
  g.strokeStyle = coat; g.lineWidth = 26; g.beginPath(); g.arc(c, c, .72*c, Math.PI*1.05, Math.PI*1.75); g.stroke();
  g.fillStyle = '#000'; g.beginPath(); g.arc(c, c, .2*c, 0, Math.PI*2); g.fill();
  const gl = g.createRadialGradient(c*.68, c*.62, 0, c*.68, c*.62, c*.14); gl.addColorStop(0, 'rgba(255,255,255,.75)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(0, 0, w, w);
});
const flashTexture = () => tex(256, 256, (g, w) => {
  g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, w);
  g.fillStyle = 'rgba(160,140,100,.45)';
  for (let y=8;y<w;y+=14) for (let x=8+(y/14%2)*7;x<w;x+=14){ g.beginPath(); g.arc(x, y, 4, 0, Math.PI*2); g.fill(); }
});
const brushedTexture = () => {
  const t = tex(1024, 1024, (g, w) => {
    g.fillStyle = 'rgb(120,120,120)'; g.fillRect(0, 0, w, w);
    let s = 3; const r = () => (s = (s*16807) % 2147483647) / 2147483647;
    for (let i=0;i<5000;i++){ const y = r()*w, v = 80 + r()*110; g.fillStyle = `rgb(${v},${v},${v})`; g.globalAlpha = .25 + r()*.35; g.fillRect(0, y, w, .6 + r()*1.4); }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

function appleLogoGeometry(height){
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${APPLE_PATH}"/></svg>`);
  const shapes = data.paths.flatMap(p => SVGLoader.createShapes(p));
  const g = new THREE.ShapeGeometry(shapes, 24);
  g.computeBoundingBox(); const bb = g.boundingBox, s = height/(bb.max.y - bb.min.y);
  g.translate(-(bb.min.x+bb.max.x)/2, -(bb.min.y+bb.max.y)/2, 0);
  g.scale(s, -s, 1); // SVG is y-down
  return g;
}

export function createPhone(envTex){
  const phone = new THREE.Group();
  const alu = new THREE.MeshPhysicalMaterial({color:0x5a6178, metalness:.7, roughness:.5, envMap:envTex, envMapIntensity:.8});
  const rail = new THREE.MeshPhysicalMaterial({color:0x6b7290, metalness:.95, roughness:.26, envMap:envTex, envMapIntensity:1});
  const shield = new THREE.MeshPhysicalMaterial({color:0x4a5065, metalness:.1, roughness:.56, clearcoat:.4, clearcoatRoughness:.4, envMap:envTex, envMapIntensity:.7});
  const logoM = new THREE.MeshPhysicalMaterial({color:0x3a4155, metalness:.9, roughness:.22, envMap:envTex, envMapIntensity:.7, side:THREE.DoubleSide});
  const glass = new THREE.MeshPhysicalMaterial({color:0x020203, roughness:.08, clearcoat:1, envMap:envTex});

  phone.add(new THREE.Mesh(slab(PW, PH, PD, .124, .03), [alu, rail]));

  // front: black glass edge to edge, the display (texture set by the caller), a glass sheen on top
  const front = new THREE.Mesh(flat(PW-.004, PH-.004, .122), glass); front.position.z = PD/2 + .0006; phone.add(front);
  const display = new THREE.Mesh(flat(DISPLAY.w, DISPLAY.h, DISPLAY.r), new THREE.MeshBasicMaterial({color:0xc2c2c2}));
  display.position.z = PD/2 + .0012; phone.add(display);
  const sheen = new THREE.Mesh(flat(PW-.004, PH-.004, .122), new THREE.MeshStandardMaterial({color:0x000000, roughness:.05, metalness:0, envMap:envTex, envMapIntensity:1.4, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
  sheen.position.z = PD/2 + .0018; phone.add(sheen);

  // back. Positions are in local front-facing coordinates; seen from behind, +x is on the viewer's left.
  const backZ = -PD/2, platZ = backZ - PLATEAU.rise;
  const yP = .565;
  const plat = new THREE.Mesh(new THREE.ExtrudeGeometry(rr4Shape(PLATEAU.w, PLATEAU.h, PLATEAU.rt, PLATEAU.rb), {depth:PLATEAU.rise-.01, bevelEnabled:true, bevelThickness:.005, bevelSize:.006, bevelSegments:5, curveSegments:32}), [alu, rail]);
  plat.rotation.y = Math.PI; plat.position.set(-.0025, yP, backZ + .005); phone.add(plat);

  const lensM = new THREE.MeshPhysicalMaterial({map:lensTexture(), roughness:.08, clearcoat:.3, clearcoatRoughness:.1, envMap:envTex, envMapIntensity:.32});
  const ringM = new THREE.MeshPhysicalMaterial({color:0x2a3346, metalness:1, roughness:.2, envMap:envTex, envMapIntensity:1});
  const blackM = new THREE.MeshStandardMaterial({color:0x050506, roughness:.6});
  const LR = .0846;
  const lens = (x, y) => {
    const g = new THREE.Group(); g.position.set(x, y, platZ); phone.add(g);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(LR*.97, LR, PLATEAU.lens, 72), ringM); ring.rotation.x = -Math.PI/2; ring.position.z = -PLATEAU.lens/2; g.add(ring);
    const lip = faceBack(new THREE.Mesh(new THREE.RingGeometry(.072, LR*.965, 72), blackM)); lip.position.z = -PLATEAU.lens - .0004; g.add(lip);
    const cover = faceBack(new THREE.Mesh(new THREE.CircleGeometry(.0735, 72), lensM)); cover.position.z = -PLATEAU.lens - .0006; g.add(cover);
  };
  lens(.235, .672); lens(.235, .448); lens(.039, .560);
  const dot = (x, y, r, m) => { const d = faceBack(new THREE.Mesh(new THREE.CircleGeometry(r, 48), m)); d.position.set(x, y, platZ - .0006); phone.add(d); };
  dot(-.261, .676, .036, new THREE.MeshStandardMaterial({map:flashTexture(), roughness:.35}));
  dot(-.245, .556, .0055, blackM);
  dot(-.241, .449, .036, glass);

  // glass panel with the same side margins as the plateau, Apple logo over the MagSafe magnets
  const panel = faceBack(new THREE.Mesh(flat(.694, 1.037, .076), shield)); panel.position.set(-.001, -.2455, backZ - .0006); phone.add(panel);
  const logo = faceBack(new THREE.Mesh(appleLogoGeometry(.178), logoM)); logo.position.set(0, -.234, backZ - .0011); phone.add(logo);

  // buttons: Action, volume up/down on the left; side button and Camera Control on the right
  const btn = (x, y, len, m) => { const b = new THREE.Mesh(slab(.03, len, .009, .012, .003), [m, m]); b.rotation.y = Math.PI/2; b.position.set(x, y, 0); phone.add(b); };
  btn(-PW/2 - .002, .40, .07, rail); btn(-PW/2 - .002, .255, .115, rail); btn(-PW/2 - .002, .11, .115, rail);
  btn(PW/2 + .002, .23, .19, rail);
  btn(PW/2 + .001, -.25, .12, new THREE.MeshPhysicalMaterial({color:0x10131a, roughness:.1, clearcoat:1, envMap:envTex}));

  return { phone, display, yP, backZ, platZ, lensTop: platZ - PLATEAU.lens, lensEdge: [.235 + LR, .448], magsafe: [0, -.234] };
}

// Recents card: brushed stainless steel. Fine straight grain along the long axis (thousands of hairline scratches of
// varying depth), so the highlight stretches across the grain the way real brushed steel does; the perimeter is a
// polished chamfer. The wordmark is a polished inlay (same finish as the Apple logo on the phone), low on the face.
// One button on the long edge, a pinhole status light.
function brushedMaps(){
  const W = 2048, H = 64; // the grain runs along v, so a short, wide strip repeated along v is enough
  let sd = 13; const rnd = () => (sd = (sd*16807) % 2147483647) / 2147483647;
  // height of the brushed surface per column: layered hairlines of random width and depth
  const hgt = new Float32Array(W);
  for (let k=0; k<9000; k++){ const x = rnd()*W, w = .35 + rnd()*rnd()*1.6, d = (rnd() - .5)*(.25 + rnd()*.35); for (let i=Math.floor(x - w*2); i<=x + w*2; i++){ const j = (i + W) % W; hgt[j] += d*Math.exp(-(((i - x)/w)**2)); } }
  for (let k=0; k<10; k++){ const x = rnd()*W, w = 30 + rnd()*120, d = (rnd() - .5)*.35; for (let i=Math.floor(x - w*2); i<=x + w*2; i++){ const j = (i + W) % W; hgt[j] += d*Math.exp(-(((i - x)/w)**2)); } } // slow tonal bands
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H; const ng = nc.getContext('2d'), nd = ng.createImageData(W, H);
  const rc = document.createElement('canvas'); rc.width = W; rc.height = H; const rg = rc.getContext('2d'), rd = rg.createImageData(W, H);
  for (let x=0; x<W; x++){
    const slope = (hgt[(x + 1) % W] - hgt[(x - 1 + W) % W])*.9, h = hgt[x];
    for (let y=0; y<H; y++){
      const i = (y*W + x)*4, wob = 0; // perfectly straight grain: no wobble along a line
      nd.data[i] = 128 + Math.max(-1, Math.min(1, slope + wob))*110; nd.data[i+1] = 128; nd.data[i+2] = 240; nd.data[i+3] = 255;
      const rv = 128 + 26*Math.max(-1, Math.min(1, -h*.7)) + 8*(rnd() - .5); // roughness ~.45–.6: satin, not mirror rd.data[i] = rd.data[i+1] = rd.data[i+2] = rv; rd.data[i+3] = 255;
    }
  }
  ng.putImageData(nd, 0, 0); rg.putImageData(rd, 0, 0);
  const n = new THREE.CanvasTexture(nc), r = new THREE.CanvasTexture(rc);
  // the slab's UVs are local x/y in scene units (±0.27 × ±0.43): one strip spans the card's width, grain along y
  [n, r].forEach(t => { t.anisotropy = 16; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1/CARD.w, 4); t.offset.set(.5, 0); });
  return { normalMap: n, roughnessMap: r };
}
// fine isotropic grain (bead blast): random per-pixel normal noise, tiled
function grainMap(){
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), d = g.createImageData(N, N);
  let sd = 21; const rnd = () => (sd = (sd*16807) % 2147483647) / 2147483647;
  for (let i=0; i<N*N; i++){ d.data[i*4] = 128 + (rnd() - .5)*90; d.data[i*4+1] = 128 + (rnd() - .5)*90; d.data[i*4+2] = 255; d.data[i*4+3] = 255; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9); t.anisotropy = 8;
  return t;
}
export const CARD_FINISH = 'gloss'; // Petr's pick for now (2026-10-05); ?finish=steel|matte to compare
export function createCard(envTex){
  const card = new THREE.Group();
  // Three finishes under consideration; ?finish=steel|matte|gloss picks one (default below).
  //  steel: brushed stainless, lit by the strip softboxes; hairline normals smear each strip across the grain
  //  matte: bead-blasted black anodised aluminium, a soft sheen, polished dark-chrome chamfer and logo
  //  gloss: piano-black ceramic, mirror clearcoat showing crisp strip reflections, polished steel chamfer
  const finish = new URLSearchParams(location.search).get('finish') || CARD_FINISH;
  let face, chamfer, inlayColor = 0xe2e3e5, inlayFrosted = false;
  if (finish === 'matte'){
    face = clampHDR(envLit(new THREE.MeshPhysicalMaterial({ color:0x2a2c30, metalness:.75, roughness:.42, normalMap:grainMap(), normalScale:new THREE.Vector2(.2, .2), envMap:envTex, envMapIntensity:1.6 }), .12), .7);
    chamfer = clampHDR(envLit(new THREE.MeshPhysicalMaterial({ color:0xa3a6ac, metalness:1, roughness:.08, envMap:envTex, envMapIntensity:1.4 }), .3), 1.4);
    inlayColor = 0xa3a6ac;
  } else if (finish === 'gloss'){
    // a mirror clearcoat turns a directional light into a near-infinite peak, so it only reflects the environment
    face = clampHDR(envLit(new THREE.MeshPhysicalMaterial({ color:0x060607, metalness:0, roughness:.3, clearcoat:1, clearcoatRoughness:.02, envMap:envTex, envMapIntensity:1.6 }), 0), .85);
    chamfer = clampHDR(envLit(new THREE.MeshPhysicalMaterial({ color:0xc9ccd0, metalness:1, roughness:.08, envMap:envTex, envMapIntensity:1.2 }), .25), 1.4);
    inlayColor = 0x9fa2a7; inlayFrosted = true; // a frosted etch reads on gloss black from any angle; a polished one vanishes
  } else {
    const br = brushedMaps();
    face = clampHDR(envLit(new THREE.MeshPhysicalMaterial({ color:0xc9ccd0, metalness:1, roughness:.2, normalMap:br.normalMap, normalScale:new THREE.Vector2(.22, .22), envMap:envTex, envMapIntensity:1 }), .04), .8);
    chamfer = clampHDR(envLit(new THREE.MeshPhysicalMaterial({ color:0xdcdee1, metalness:1, roughness:.12, envMap:envTex, envMapIntensity:1.2 }), .25), 1.6);
  }
  card.add(new THREE.Mesh(smoothSlab(CARD.w, CARD.h, CARD.d, CARD.r, .0045), [face, chamfer]));
  const outZ = -CARD.d/2;
  // polished inlay wordmark, uppercase in a wide face, low on the card (seen from behind, so it reads normally)
  const mark = tex(1024, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '400 64px Michroma, "Martian Mono", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '26px'; g.fillText('RECENTS', w/2 + 13, h/2 + 2); }, false);
  const inlay = clampHDR(envLit(new THREE.MeshPhysicalMaterial({ color:inlayColor, metalness:inlayFrosted ? .2 : 1, roughness:inlayFrosted ? .55 : .1, envMap:envTex, envMapIntensity:1.6, alphaMap:mark, transparent:true, alphaTest:.4, depthWrite:false }), .1), 1.6);
  const wm = faceBack(new THREE.Mesh(new THREE.PlaneGeometry(.34, .0425), inlay)); wm.position.set(0, -CARD.h/2 + .115, outZ - .0004); card.add(wm);
  // side button on the long edge: a polished pill standing 0.8 mm proud of the edge
  // shape: 1.6 mm across the card's thickness × 11 mm along the edge; extruded 0.8 mm outwards (rotated so the
  // extrusion points along +x, out of the edge)
  const btn = new THREE.Mesh(smoothSlab(.016, .11, .008, .007, .002), chamfer);
  btn.rotation.y = Math.PI/2; btn.position.set(CARD.w/2 + .002, .16, 0); card.add(btn);
  // pinhole status light, top corner (left as seen from behind)
  const ledM = new THREE.MeshBasicMaterial({color:0x000000});
  const led = faceBack(new THREE.Mesh(new THREE.CircleGeometry(.0055, 20), ledM)); led.position.set(CARD.w/2 - .06, CARD.h/2 - .06, outZ - .0005); card.add(led);
  const ledRim = faceBack(new THREE.Mesh(new THREE.RingGeometry(.0055, .0075, 24), chamfer)); ledRim.position.copy(led.position); ledRim.position.z += .0001; card.add(ledRim);
  return { card, ledM };
}

// A rounded slab with a continuous, smoothly shaded edge: many bevel and corner segments, vertices welded and
// normals recomputed so the rounding reads as one surface (ExtrudeGeometry alone shades each facet flat).
// UVs are planar local x/y, which is what the face maps expect.
function smoothSlab(w, h, d, r, b){
  const shape = new THREE.Shape(), x = w/2 - b, y = h/2 - b, rr = Math.max(.001, r - b);
  shape.moveTo(-x+rr, -y); shape.lineTo(x-rr, -y); shape.absarc(x-rr, -y+rr, rr, -Math.PI/2, 0, false);
  shape.lineTo(x, y-rr); shape.absarc(x-rr, y-rr, rr, 0, Math.PI/2, false);
  shape.lineTo(-x+rr, y); shape.absarc(-x+rr, y-rr, rr, Math.PI/2, Math.PI, false);
  shape.lineTo(-x, -y+rr); shape.absarc(-x+rr, -y+rr, rr, Math.PI, Math.PI*1.5, false);
  let g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(.0005, d - 2*b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 16, curveSegments: 96 });
  g.translate(0, 0, -(d - 2*b)/2);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-6);
  g.computeVertexNormals();
  const p = g.attributes.position, uv = new Float32Array(p.count*2);
  for (let i=0; i<p.count; i++){ uv[i*2] = p.getX(i); uv[i*2+1] = p.getY(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// thin rounded-square outline, used for the "recording" ripples around the card
export function outlineGeometry(w, h, r, t){
  const s = new THREE.Shape(), x = w/2, y = h/2;
  const hole = new THREE.Path(), xi = x - t, yi = y - t, ri = Math.max(.001, r - t);
  s.moveTo(-x+r, -y); s.lineTo(x-r, -y); s.absarc(x-r, -y+r, r, -Math.PI/2, 0, false); s.lineTo(x, y-r); s.absarc(x-r, y-r, r, 0, Math.PI/2, false); s.lineTo(-x+r, y); s.absarc(-x+r, y-r, r, Math.PI/2, Math.PI, false); s.lineTo(-x, -y+r); s.absarc(-x+r, -y+r, r, Math.PI, Math.PI*1.5, false);
  hole.moveTo(-xi+ri, -yi); hole.lineTo(xi-ri, -yi); hole.absarc(xi-ri, -yi+ri, ri, -Math.PI/2, 0, false); hole.lineTo(xi, yi-ri); hole.absarc(xi-ri, yi-ri, ri, 0, Math.PI/2, false); hole.lineTo(-xi+ri, yi); hole.absarc(-xi+ri, yi-ri, ri, Math.PI/2, Math.PI, false); hole.lineTo(-xi, -yi+ri); hole.absarc(-xi+ri, -yi+ri, ri, Math.PI, Math.PI*1.5, false);
  s.holes.push(hole);
  return new THREE.ShapeGeometry(s, 20);
}

// The real thing: a 3D-scanned-quality iPhone 17 Pro Max (glTF, metres, back facing +z).
// Returns it scaled to scene units with the screen facing +z, plus its materials by name.
export function loadIphone(url, envTex){
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((ok, fail) => loader.load(url, gltf => {
    const model = gltf.scene;
    model.scale.setScalar(10); model.rotation.y = Math.PI;
    const mats = {};
    model.traverse(o => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        mats[m.name] = m;
        if ('envMap' in m){ m.envMap = envTex; m.needsUpdate = true; }
      });
    });
    ok({ model, mats });
  }, undefined, fail));
}

// The model ships in Cosmic Orange; Deep Blue values matched against Apple's product photo.
export const DEEP_BLUE = {
  'Anodized aluminum': 0x4b5162, 'Plastic antena': 0x3b4050, 'Metal tint': 0x4c5266,
  'Metal Screw': 0x535a6e, 'Frosted glass': 0x464b5c, 'Tinted glass': 0x3a3f50, 'LED': 0xdcd9d2
};
// a shade darker for the night room, where the stage light and the wall's glow already lift it
export const DEEP_BLUE_NIGHT = {
  'Anodized aluminum': 0x353a4a, 'Plastic antena': 0x2b2f3b, 'Metal tint': 0x373c4d,
  'Metal Screw': 0x3d4352, 'Frosted glass': 0x323745, 'Tinted glass': 0x272b37, 'LED': 0xdcd9d2
};
export function paint(mats, scheme){ for (const [name, hex] of Object.entries(scheme)) if (mats[name]) mats[name].color.setHex(hex); }

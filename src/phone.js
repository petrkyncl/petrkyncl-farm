// iPhone 17 Pro Max in Deep Blue, body to Apple's published dimensions (163.4 × 78.0 × 8.75 mm).
// Back layout measured off Petr's reference photo (461 × 963 px body = 78 × 163.4 mm, 5.91 px/mm):
// camera plateau almost full width (4 mm in from each edge, 43 mm tall, 2.5 mm proud, lenses +1.7 mm),
// 17 mm lenses in a triangle, flash top-right with the mic and LiDAR below it, a glass panel with the same
// side margins 7.6 mm under the plateau, and an 18 mm Apple logo at two thirds of the height.
// Plus the Recents card: credit-card sized (54 × 85.6 mm), 2.9 mm thick, matte black, like Ruune.
// Scene unit = 10 cm, so 1 mm = .01.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { slab, flat, faceBack } from './shapes.js';

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
  const alu = new THREE.MeshPhysicalMaterial({color:0x2f3b52, metalness:.82, roughness:.44, envMap:envTex, envMapIntensity:.65});
  const rail = new THREE.MeshPhysicalMaterial({color:0x37455f, metalness:.9, roughness:.28, envMap:envTex, envMapIntensity:1.05});
  const shield = new THREE.MeshPhysicalMaterial({color:0x29344a, metalness:.05, roughness:.48, clearcoat:.55, clearcoatRoughness:.3, envMap:envTex, envMapIntensity:.8});
  const logoM = new THREE.MeshPhysicalMaterial({color:0x56657f, metalness:1, roughness:.06, envMap:envTex, envMapIntensity:1.5, side:THREE.DoubleSide});
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

export function createCard(envTex){
  const card = new THREE.Group();
  const face = new THREE.MeshPhysicalMaterial({color:0x111214, roughness:.78, metalness:.05, sheen:.4, sheenRoughness:.6, sheenColor:0x3a3d44, envMap:envTex, envMapIntensity:.4});
  const edge = new THREE.MeshPhysicalMaterial({color:0x17181b, roughness:.45, metalness:.2, envMap:envTex, envMapIntensity:.6});
  card.add(new THREE.Mesh(slab(CARD.w, CARD.h, CARD.d, CARD.r, .006), [face, edge]));
  const outZ = -CARD.d/2;
  // debossed mark in the middle, one round metal button in the corner, a pinhole status light next to it
  const mark = tex(512, 160, (g, w, h) => { g.clearRect(0,0,w,h); g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '600 64px -apple-system, "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '4px'; g.fillText('recents', w/2, h/2); });
  const wm = faceBack(new THREE.Mesh(new THREE.PlaneGeometry(.2, .0625), new THREE.MeshPhysicalMaterial({color:0x1d1f23, roughness:.32, metalness:.1, alphaMap:mark, transparent:true, depthWrite:false, envMap:envTex, envMapIntensity:.8})));
  wm.position.set(0, 0, outZ - .0004); card.add(wm);
  const bx = -CARD.w/2 + .075, by = CARD.h/2 - .075; // top-right corner seen from behind
  const btnRing = faceBack(new THREE.Mesh(new THREE.RingGeometry(.03, .04, 64), new THREE.MeshPhysicalMaterial({color:0x8a8e95, metalness:1, roughness:.32, envMap:envTex, envMapIntensity:.45})));
  btnRing.position.set(bx, by, outZ - .0006); card.add(btnRing);
  const btnFace = faceBack(new THREE.Mesh(new THREE.CircleGeometry(.03, 64), new THREE.MeshPhysicalMaterial({color:0x2a2c31, metalness:.8, roughness:.3, envMap:envTex, envMapIntensity:.7})));
  btnFace.position.set(bx, by, outZ - .0005); card.add(btnFace);
  const ledM = new THREE.MeshBasicMaterial({color:0x000000});
  const led = faceBack(new THREE.Mesh(new THREE.CircleGeometry(.0065, 20), ledM)); led.position.set(bx + .085, by, outZ - .0005); card.add(led);
  return { card, ledM };
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

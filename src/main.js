import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { rrShape, slab, flat, faceBack } from './shapes.js';
import { createDesk } from './desk.js';
import { reel } from './reels.js';
import { makeStrap, STRAP } from './bracelet.js';
import { createHead } from './head.js';
import { createPhone, createCard, outlineGeometry, loadIphone, paint, clampHDR, envLit, DEEP_BLUE_NIGHT, PD, CARD, DISPLAY, PLATEAU } from './phone.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import './style.css';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const clamp01 = v => v<0 ? 0 : v>1 ? 1 : v;
const smooth = (a,b,t) => { t = clamp01((t-a)/(b-a)); return t*t*(3-2*t); };
const lerp = (a,b,t) => a + (b-a)*t;
const easeIO = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const outBack = t => 1 + 2.70158*Math.pow(t-1,3) + 1.70158*Math.pow(t-1,2);
const isStacked = () => innerWidth < 1024 || innerWidth/innerHeight < 23/20;

// ---------- Prague clock ----------
const fmt = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Prague', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
function pragueHours(){ const p = {}; for (const x of fmt.formatToParts(new Date())) p[x.type] = x.value; return (+p.hour % 24) + (+p.minute)/60 + (+p.second)/3600; }
const hhmm = h => { const m = Math.floor(((h%24)+24)%24*60); return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); };
const shiftName = h => h<5 ? 'Night shift' : h<11 ? 'Morning' : h<17 ? 'Day shift' : h<22 ? 'Evening' : 'Night shift';

// ---------- renderer / scene ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(2, devicePixelRatio||1));
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
const room = new THREE.Color('#06070a');
scene.background = room.clone();
scene.fog = new THREE.Fog(room.clone(), 24, 70);
const camera = new THREE.PerspectiveCamera(40, 1, .1, 200);
scene.add(camera);
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
// The metal card's environment, built like a product-photo set for steel: a black room and a few long strip
// softboxes. Metal shows what it reflects, so this is what makes it read as steel: bright bands on deep grey,
// which the brushed (anisotropic) surface smears into streaks.
const studioEnv = (() => {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(.012, .012, .014), side: THREE.BackSide })));
  const box = (w, h, x, y, z, v, tint = [1, 1, 1]) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v*tint[0], v*tint[1], v*tint[2]), side: THREE.DoubleSide })); b.position.set(x, y, z); b.lookAt(0, 0, 0); s.add(b); };
  box(.7, 9, -4.5, 1.5, 5, 2.2);          // tall strip, front left: the main streak
  box(.4, 9, 5.5, .5, 3, 1.5);          // thinner strip, front right
  box(6, .9, 0, 6.5, 2, 1.1);          // horizontal strip overhead
  box(5, 3, 0, 2, -7, .5, [.9, .95, 1.05]); // soft fill from behind
  box(10, 4, 0, -7, 1, .06);            // a hint of floor
  return new THREE.PMREMGenerator(renderer).fromScene(s, .01).texture;
})();

const amb = new THREE.AmbientLight(0x3a4050, 1.7); scene.add(amb);
const key = new THREE.DirectionalLight(0x9fb0ff, 1.7); key.position.set(-8,12,18); scene.add(key);
const rim = new THREE.DirectionalLight(0xffc27a, 1.1); rim.position.set(14,-4,8); scene.add(rim);

const wall = new THREE.Group(); scene.add(wall);

// ---------- wall layout ----------
const land = innerWidth >= innerHeight;
const C = land ? 26 : 12, R = land ? 10 : 14, COUNT = C*R;
const SX = 1.06, SY = 2.06, ARC = land ? 26 : 30;
const BW = .94, BH = 1.94, BD = .085, SW = .885, SH = 1.885;

let seed = 11;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const base = [];
for (let r=0;r<R;r++) for (let c=0;c<C;c++){
  const u = (c-(C-1)/2)*SX, th = u/ARC;
  base.push({x:ARC*Math.sin(th), y:(r-(R-1)/2)*SY, z:ARC*(1-Math.cos(th)), ry:-th, c, r});
}

// ---------- textures for video-wall mode ----------
const WALL_ASPECT = (C*SX)/(R*SY);
function wallCanvas(){ const c=document.createElement('canvas'); c.height=1024; c.width=Math.round(1024*WALL_ASPECT); const g=c.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,c.width,c.height); return [c,g]; }
const [nameC, nameG] = wallCanvas();
const [faceC, faceG] = wallCanvas();
const [faceC2, faceG2] = wallCanvas(); // the next reel item, for the flip from one photo to the next
const nameTex = new THREE.CanvasTexture(nameC), faceTex = new THREE.CanvasTexture(faceC), faceTex2 = new THREE.CanvasTexture(faceC2);
// "So far": the wall becomes a board that rewrites itself milestone by milestone (A = previous, B = next)
const [boardAC, boardAG] = wallCanvas(), [boardBC, boardBG] = wallCanvas();
const boardATex = new THREE.CanvasTexture(boardAC), boardBTex = new THREE.CanvasTexture(boardBC);
function paintBoard(g, tex, lines){
  const c = g.canvas, w = c.width, h = c.height;
  g.fillStyle = '#000'; g.fillRect(0,0,w,h);
  if (lines && lines.length){
    // the milestone huge (rows split on '\n'), its number under it, the date smallest; all of it right of the copy column
    const [big, note, date] = lines, cx = land ? w*.56 : w/2, maxW = w*(land ? .46 : .86);
    const font = (s, wt) => `${wt} ${s}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`;
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const rows = land ? big.split('\n') : [big.replace(/\n/g, ' ')]; // a tall screen has only a strip of wall above the copy: one row there
    // one size for every row: the largest that lets the widest row fit and the stack fit the wall's height
    let bs = h*(land ? (rows.length > 1 ? (note ? .29 : .4) : (note ? .42 : .5)) : .085); g.font = font(bs, 900);
    const widest = Math.max(...rows.map(r => g.measureText(r).width)); if (widest > maxW){ bs *= maxW/widest; g.font = font(bs, 900); }
    // centre the whole block (name, number, date) on the wall; on a tall screen it sits at the top, the copy covers the rest
    const below = (note ? h*(land ? .1 : .032)*1.28 : 0) + (date ? h*(land ? .036 : .016)*2.2 : 0);
    const lh = bs*.86, top = land ? h*.5 - ((rows.length - 1)*lh + below)/2 + bs*.34 : h*.065 - (rows.length - 1)*lh/2 + bs*.34;
    rows.forEach((r, i) => g.fillText(r, cx, top + i*lh));
    // the number that matters (28 VIDEOS, OF 80) clearly under it, then the date, smaller and dimmer
    let y = top + (rows.length - 1)*lh;
    // gap: the number sits tight under the name (it belongs to it), the date a little further off
    const line = (txt, size, track, col, gap) => {
      let ss = size; g.font = font(ss, 700); if ('letterSpacing' in g) g.letterSpacing = `${(ss*track).toFixed(1)}px`;
      const sw = g.measureText(txt).width; if (sw > maxW){ ss *= maxW/sw; g.font = font(ss, 700); }
      g.fillStyle = col; y += ss*gap; g.fillText(txt, cx, y);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    };
    if (note) line(note, h*(land ? .1 : .032), .08, '#fff', 1.28);
    if (date) line(date, h*(land ? .036 : .016), .32, '#8f8f8f', 2.2);
  }
  tex.needsUpdate = true;
}

function paintName(){
  const w=nameC.width, h=nameC.height;
  nameG.fillStyle='#000'; nameG.fillRect(0,0,w,h);
  nameG.fillStyle='#fff'; nameG.textAlign='center'; nameG.textBaseline='middle';
  const size = Math.min(h*.5, w*(land?.24:.36));
  nameG.font = `900 ${size}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`;
  if (land){ nameG.fillText('PETR', w/2, h*.29); nameG.fillText('KYNČL', w/2, h*.71); }
  else { nameG.font = `900 ${size*.9}px "Big Shoulders Display", Impact, sans-serif`; nameG.fillText('PETR', w/2, h*.17); nameG.fillText('KYNČL', w/2, h*.39); }
  nameTex.needsUpdate = true;
}
// Finale reel on the wall, in colour: the pitch (video), the prize, the group photo. Painted into the face canvas.
// On a wide wall it sits right of the copy column; on a tall wall in the top part (the copy covers the bottom).
const REEL = { video: null, crowd: null, pitch: null, ivo: null, kate: null, prize: null, group: null, school: null, director: null };
const ME_IN_GROUP = { x: .828, y: .14 }; // my head in group.jpg (far right, light hoodie)
let meUV = null;
// (the camera sees roughly u .25–.8 of the wall right of the copy, so the reel stays inside that)
function reelRegion(){ const w = faceC.width, h = faceC.height; return land ? { x: w*.3, y: h*.06, w: w*.47, h: h*.88 } : { x: 0, y: h*.03, w, h: h*.44 }; }
// cover-fit src into the region around a focus point; returns the drawn rect
function coverInto(src, sw, sh, r, fx, fy, ax = .5, zoom = 1, g = faceG){
  const s = Math.max(r.w/sw, r.h/sh)*zoom, dw = sw*s, dh = sh*s;
  const x = Math.min(r.x, Math.max(r.x + r.w - dw, r.x + r.w*ax - fx*dw)), y = Math.min(r.y, Math.max(r.y + r.h - dh, r.y + r.h/2 - fy*dh));
  g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip(); g.drawImage(src, x, y, dw, dh); g.restore();
  return { x, y, w: dw, h: dh };
}
function containInto(src, sw, sh, r, zoom = 1, dx = 0, g = faceG){
  const s = Math.min(r.w/sw, r.h/sh)*zoom, dw = sw*s, dh = sh*s, x = r.x + (r.w - dw)/2 + dx*r.w, y = land ? r.y + r.h - dh : r.y;
  g.drawImage(src, x, y, dw, dh); return { x, y, w: dw, h: dh };
}
// Two reels share the face canvas: the school (section 7) and the hackathon (section 8). Story time `st` holds
// section i over 2i..2i+1, so each reel's beats are offsets from its section's hold.
const SCHOOL_ST = 14, HACK_ST = 16;
// the school beats after the photos happen on the phones themselves (see the letters mode in the screen shader):
// the wall fills with motivation letters, then goes dark until one phone is left
// the phones start going out well before the camera moves in (HOLD_EASE[7]), then it pushes in on the one left
const LETTERS_AT = SCHOOL_ST + .5, IRIS_AT = SCHOOL_ST + .6, ONE_AT = SCHOOL_ST + .88;
// each reel: its items in order (how to place each one), when each one takes over, and the stretch of story time
// it owns the face canvas for (starting a beat early so the first frame is there before the wall wipes to it)
const REELS = [
  // both reels run edge to edge on a wide wall (the building is 4:3 like the wall itself); the school photos are
  // graded down towards grey so they sit back like the wall's own pictures
  { from: SCHOOL_ST - 1.4, to: LETTERS_AT + .12, at: [0, .25].map(x => SCHOOL_ST + x), items: [
    { src:'school',   full:true, fx:.5, fy:.5 },
    { src:'director', full:true, fx:.3, fy:.3 }
  ] },
  // the pitch video holds about half as long again as a photo: worth a pause, not so long it feels like the end
  { from: LETTERS_AT + .12, to: HACK_ST + 1.2, at: [0, .12, .32, .45, .58, .71, .84].map(x => HACK_ST + x), items: [
    { src:'crowd', full:true, fx:.5,  fy:.5 }, // the room first: how many people were there
    { src:'video', full:true, fx:.3,  fy:.45, zoom:1.4 }, // I stand at the left of the frame: zoom so I can sit right of the copy
    { src:'pitch', full:true, fx:.62, fy:.35 },
    { src:'ivo',   full:true, fx:.19, ax:.155, fy:.5 }, // Petr's crop, edge to edge: Ivo starts just right of the copy, the lectern, my hand on it
    { src:'kate',  full:true, fx:.47, fy:.4 },
    { src:'prize', full:true, fx:.55, fy:.4 },
    { src:'group', full:true, contain:true, me:true }
  ] }
];
// the captions that ride under the reel's bottom-left corner, by story time (the school's last two describe the wall)
const CAPTIONS = [
  { from: SCHOOL_ST - .05, to: SCHOOL_ST + 1.02, at: [0, .25, .5, .88].map(x => SCHOOL_ST + x),
    caps: ['Smíchovská · Prague 5', 'Radko Šablík · director', '400 motivation letters', 'One free place'] },
  { from: HACK_ST - .05, to: HACK_ST + 1.02, at: REELS[1].at,
    caps: ['The room', 'The pitch', 'On stage', 'Ivo Klimsa · organiser', 'Kate · juror', 'Second place', 'End of the night'] }
];
const itemRegion = it => it.full && land ? { x: 0, y: 0, w: faceC.width, h: faceC.height } : reelRegion();
function drawReelItem(it, g = faceG){
  g.fillStyle = '#000'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const r = itemRegion(it), s = REEL[it.src];
  if (!s) return;
  // edge to edge on a wide wall, the subject lands right of the copy (which covers about the wall's left sixth)
  const ax = it.ax !== undefined && land ? it.ax : it.full && land ? .6 : .5;
  if (it.src === 'video'){ if (s.readyState >= 2) coverInto(s, s.videoWidth, s.videoHeight, r, it.fx, it.fy, ax, it.zoom, g); return; }
  if (it.contain){
    const d = containInto(s, s.width, s.height, r, it.zoom, land ? it.dx || 0 : 0, g);
    if (it.me) meUV = { u: (d.x + ME_IN_GROUP.x*d.w)/faceC.width, v: 1 - (d.y + ME_IN_GROUP.y*d.h)/faceC.height };
  } else coverInto(s, s.width, s.height, r, it.fx, it.fy, ax, it.zoom, g);
}
// From one photo to the next the phones turn over like cards in a stadium: a wave runs diagonally across the wall,
// each phone spins round its upright and shows the next photo once it has passed edge-on. The current item is in
// faceC, the next one in faceC2; uReelF (0 → 1) drives the wave, each phone's place in it is aFlip.
const REEL_SWEEP = .085, FLIP_DUR = .34; // the sweep in story time; one phone's turn as a share of it
const beatAt = (at, st) => { let k = 0; while (k < at.length - 1 && st >= at[k+1]) k++; return k; };
const reelShown = { reel: null, a: -1, b: -1 };
function paintReel(reel, st){
  const at = reel.at, k = beatAt(at, st);
  const next = Math.min(k + 1, at.length - 1), f = next > k ? clamp01((st - (at[next] - REEL_SWEEP))/REEL_SWEEP) : 0;
  const isVideo = i => reel.items[i].src === 'video';
  // repaint only what changed (the video every frame it's on)
  if (reelShown.reel !== reel || reelShown.a !== k || isVideo(k)){ drawReelItem(reel.items[k], faceG); faceTex.needsUpdate = true; }
  // the next item is only remembered as painted when it really was (at a reel's last item there is no next, and the
  // canvas still holds whatever the other reel left in it: scrolling back must not flip to that)
  if (next !== k && (reelShown.reel !== reel || reelShown.b !== next || isVideo(next))){ drawReelItem(reel.items[next], faceG2); faceTex2.needsUpdate = true; reelShown.b = next; }
  else if (next === k) reelShown.b = -1;
  reelShown.reel = reel; reelShown.a = k;
  uniforms.uReelF.value = f;
  return (f > .5 ? next : k);
}
// one phone's turn: 0 → 1 over its slice of the wave
const flipOf = (i, f) => clamp01((f - aFlip[i]*(1 - FLIP_DUR))/FLIP_DUR);
// the one phone left at the end of the school beat: picked where the reel sits, it ends up showing me on stage
const PICK = (() => {
  const u = land ? .55 : .5, v = land ? .48 : .74;
  const c = Math.round(u*C - .5), r = Math.round(v*R - .5);
  return { c, r, i: r*C + c };
})();
const [pickC, pickG] = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256*SH/SW); return [c, c.getContext('2d')]; })();
const pickTex = new THREE.CanvasTexture(pickC);
function paintPick(im){
  // cover-fit the stage photo around me (head and mic, the laptop just out of frame)
  const w = pickC.width, h = pickC.height, s = Math.max(w/im.width, h/im.height), dw = im.width*s, dh = im.height*s;
  pickG.drawImage(im, Math.min(0, Math.max(w - dw, w/2 - .635*dw)), Math.min(0, Math.max(h - dh, h*.42 - .4*dh)), dw, dh);
  pickTex.needsUpdate = true;
}
const N = new THREE.Vector3();
function wallPoint(u, v, out){
  const th = ((u*C - .5) - (C-1)/2)*SX/ARC;
  out.set(ARC*Math.sin(th), (v*R - .5 - (R-1)/2)*SY, ARC*(1-Math.cos(th)));
  return out.addScaledVector(N.set(-Math.sin(th),0,Math.cos(th)), BD/2+.02);
}

// ---------- wall geometry ----------
// each slot is an Android phone: rounded glass slab, metal rail, punch-hole screen, USB-C cable running back into the rack
// glossy, but not so glossy that the key light's specular blooms into a blob across a cluster of phones
const wallGlass = new THREE.MeshPhysicalMaterial({color:0x040507, roughness:.32, metalness:0, clearcoat:.6, clearcoatRoughness:.38, envMap:envTex, envMapIntensity:.32});
const wallRail = new THREE.MeshStandardMaterial({color:0x3b3f47, metalness:.9, roughness:.38, envMap:envTex, envMapIntensity:.3});
const bodies = new THREE.InstancedMesh(slab(BW,BH,BD,.135,.022), [wallGlass, wallRail], COUNT);
const screenGeo = new THREE.PlaneGeometry(SW,SH);
const aCell = new Float32Array(COUNT*2), aId = new Float32Array(COUNT), aType = new Float32Array(COUNT), aSeed = new Float32Array(COUNT), aDelay = new Float32Array(COUNT), aApp = new Float32Array(COUNT);
for (let i=0;i<COUNT;i++){
  const b=base[i]; aCell[i*2]=b.c; aCell[i*2+1]=b.r; aId[i]=i;
  aType[i]=Math.floor(rnd()*5); aSeed[i]=rnd();
  aDelay[i]= (b.c/(C-1))*.75 + rnd()*.25; // left-to-right wave with jitter
  // which app this phone runs in the automation mix (picked here so the hover label always matches the screen)
  const pk = rnd(); aApp[i] = pk < .38 ? 0 : pk < .55 ? 1 : pk < .8 ? 2 : 3;
}
screenGeo.setAttribute('aApp', new THREE.InstancedBufferAttribute(aApp,1));
screenGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell,2));
screenGeo.setAttribute('aId', new THREE.InstancedBufferAttribute(aId,1));
screenGeo.setAttribute('aType', new THREE.InstancedBufferAttribute(aType,1));
screenGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed,1));
screenGeo.setAttribute('aDelay', new THREE.InstancedBufferAttribute(aDelay,1));
// the photo flip runs top left → bottom right, with each phone a little early or late
const aFlip = new Float32Array(COUNT);
for (let i=0;i<COUNT;i++){ const b=base[i]; aFlip[i] = Math.min(1, Math.max(0, ((b.c/(C-1))*.62 + (1 - b.r/(R-1))*.38)*.82 + rnd()*.18)); }
screenGeo.setAttribute('aFlip', new THREE.InstancedBufferAttribute(aFlip,1));

const uniforms = {
  uTime:{value:0}, uWall:{value:1}, uFrom:{value:9}, uTo:{value:9}, uSweep:{value:0},
  uHover:{value:-1}, uBoot:{value:reduced?1.1:0}, uGrid:{value:new THREE.Vector2(C,R)},
  uName:{value:nameTex}, uFace:{value:faceTex}, uFaceColor:{value:1}, uRoom:{value:room.clone()}, uGain:{value:1}, uDim:{value:0},
  uBoardA:{value:boardATex}, uBoardB:{value:boardBTex}, uBoardWipe:{value:0}, uImgFrom:{value:0}, uImgTo:{value:0}, uImgWipe:{value:0},
  uNewId:{value:-1}, uNewOn:{value:1}, uFaceSat:{value:.28}, uFaceB:{value:faceTex2}, uReelF:{value:0},
  uOne:{value:0}, uPickOn:{value:0}, uPickId:{value:PICK.i}, uPickCell:{value:new THREE.Vector2(PICK.c, PICK.r)}, uPick:{value:pickTex}
};

const screenMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader:`
    attribute vec2 aCell; attribute float aId, aType, aSeed, aDelay, aApp, aFlip;
    varying vec2 vUv, vCell; varying float vId, vType, vSeed, vDelay, vDepth, vApp, vFlip;
    void main(){
      vUv=uv; vCell=aCell; vId=aId; vType=aType; vSeed=aSeed; vDelay=aDelay; vApp=aApp; vFlip=aFlip;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader:`
    uniform float uTime, uWall, uFrom, uTo, uSweep, uHover, uBoot, uGain, uDim, uBoardWipe, uImgFrom, uImgTo, uImgWipe, uFaceColor;
    uniform float uOne, uPickOn, uPickId, uNewId, uNewOn, uFaceSat, uReelF; uniform vec2 uPickCell; uniform sampler2D uFaceB;
    uniform vec2 uGrid; uniform sampler2D uName, uFace, uBoardA, uBoardB, uPick; uniform vec3 uRoom;
    varying vec2 vUv, vCell; varying float vId, vType, vSeed, vDelay, vDepth, vApp, vFlip;
    const float ASP = ${(SH/SW).toFixed(4)};
    float hash(float n){ return fract(sin(n*12.9898+4.1414)*43758.5453); }
    float sdBox(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r; }
    float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
    float fillD(float d, float aa){ return 1.0-smoothstep(0.0,aa,d); }
    float curveX(float y, vec2 a, vec2 b){ return mix(b.x, a.x, smoothstep(b.y, a.y, y)); }
    float dot2(vec2 v){ return dot(v,v); }
    float heart(vec2 p, float sz){
      p = p/sz + vec2(0.0,.5); p.x = abs(p.x);
      float d = (p.y+p.x > 1.0) ? sqrt(dot2(p-vec2(.25,.75))) - .35355
                                : sqrt(min(dot2(p-vec2(0.0,1.0)), dot2(p-.5*max(p.x+p.y,0.0)))) * sign(p.x-p.y);
      return fillD(d*sz, .01);
    }

    float app(float type, vec2 q, float t, float s){
      float c = 0.0;
      c += fillD(sdBox(q-vec2(.84,ASP-.07),vec2(.07,.018),.008),.01)*.45;
      c += fillD(sdBox(q-vec2(.16,ASP-.07),vec2(.05,.012),.006),.01)*.35;
      if (type < .5){
        float rows = 9.0;
        float y = (ASP-.17-q.y)/(ASP-.24)*rows + t*.9 + s*7.0;
        float r = floor(y), fy = fract(y);
        float w = .3+.6*hash(r+s*31.0);
        float bar = step(.2,fy)*step(fy,.6)*step(.24,q.x)*step(q.x,.24+.64*w);
        float dot = fillD(length(vec2(q.x-.13,(fy-.4)*(ASP-.24)/rows))-.045,.012);
        c += (bar*mix(.4,.9,hash(r*1.7+s)) + dot*.7)*step(q.y,ASP-.17)*step(.05,q.y);
      } else if (type < 1.5){
        vec2 n1=vec2(.38,1.58), n2=vec2(.62,1.05), n3=vec2(.38,.52);
        float d = min(sdBox(q-n1,vec2(.26,.085),.03), min(sdBox(q-n2,vec2(.26,.085),.03), sdBox(q-n3,vec2(.26,.085),.03)));
        c += fillD(d,.012)*.85;
        float y1 = step(n2.y+.085,q.y)*step(q.y,n1.y-.085);
        float y2 = step(n3.y+.085,q.y)*step(q.y,n2.y-.085);
        c += fillD(abs(q.x-curveX(q.y,n1-vec2(0.,.085),n2+vec2(0.,.085)))-.006,.01)*y1*.55;
        c += fillD(abs(q.x-curveX(q.y,n2-vec2(0.,.085),n3+vec2(0.,.085)))-.006,.01)*y2*.55;
        float k = fract(t*.32+s);
        float py = k<.5 ? mix(n1.y-.085,n2.y+.085,k*2.0) : mix(n2.y-.085,n3.y+.085,(k-.5)*2.0);
        float px = k<.5 ? curveX(py,n1-vec2(0.,.085),n2+vec2(0.,.085)) : curveX(py,n2-vec2(0.,.085),n3+vec2(0.,.085));
        c += fillD(length(q-vec2(px,py))-.03,.015);
        float rt = fract(t*.45+s*.7);
        c += fillD(abs(length(q-vec2(.78,1.82))-rt*.22)-.006,.01)*(1.0-rt)*.9;
      } else if (type < 2.5){
        vec2 ctr = vec2(.5,1.32);
        float cyc = fract(t*.28+s);
        float on = smoothstep(.12,.22,cyc)*(1.0-smoothstep(.82,.92,cyc));
        c += fillD(abs(length(q-ctr)-.3)-.012,.01)*mix(.35,.95,on);
        float ck = min(sdSeg(q,ctr+vec2(-.13,0.),ctr+vec2(-.03,-.1)), sdSeg(q,ctr+vec2(-.03,-.1),ctr+vec2(.15,.12)));
        c += fillD(ck-.028,.012)*on;
        c += fillD(sdBox(q-vec2(.5,.78),vec2(.3,.05),.02),.01)*(.35+.6*on);
        for (int i=0;i<3;i++){ float fi=float(i); c += fillD(sdBox(q-vec2(.18+.25*hash(fi+s*9.),.5-fi*.13),vec2(.25*hash(fi*3.+s)+.08,.022),.01),.01)*.4; }
      } else if (type < 3.5){
        float off = fract(t*.18+s)*.42;
        for (int i=0;i<6;i++){
          float fi=float(i);
          float y = .25 + fi*.42 - off;
          float side = mod(fi+floor(s*2.0),2.0);
          float w = .28+.22*hash(fi+s*13.0);
          vec2 cpos = vec2(side>.5 ? .9-w : .1+w, y);
          float b = sdBox(q-cpos, vec2(w,.12), .06);
          float vis = step(.1,y)*step(y,ASP-.18);
          c += fillD(b,.012)*mix(.38,.92,side)*vis;
        }
      } else if (type < 4.5){
        float x = q.x;
        float f = .55 + x*.85 + .14*sin(x*11.0+s*20.0) + .06*sin(x*27.0+s*7.0);
        float df = abs(q.y-f)/sqrt(1.0+pow(.85+1.54*cos(x*11.0+s*20.0),2.0));
        float inside = step(.08,x)*step(x,.94);
        c += fillD(df-.012,.012)*inside;
        c += (1.0-smoothstep(f-.01,f,q.y))*step(.45,q.y)*inside*.16;
        float dash = step(.5,fract(x*14.0));
        c += fillD(abs(q.y-1.62)-.004,.006)*dash*.5;
        float mx = .08+fract(t*.16+s)*.86;
        float my = .55 + mx*.85 + .14*sin(mx*11.0+s*20.0) + .06*sin(mx*27.0+s*7.0);
        c += fillD(length(q-vec2(mx,my))-.035,.015);
        c += fillD(sdBox(q-vec2(.5,.26),vec2(.4,.012),.004),.01)*.45;
      } else if (type < 5.5){
        // Recents: live call waveform, transcript lines typing in underneath
        vec2 pc = vec2(.5,1.74);
        c += fillD(abs(sdBox(q-pc,vec2(.38,.13),.13))-.007,.01)*.5;
        c += fillD(length(q-vec2(.22,1.74))-.034,.012)*(.45+.55*step(.5,fract(t*1.1)));
        float bx = (q.x-.33)/.5;
        if (bx > 0.0 && bx < 1.0){
          float i = floor(bx*13.0), fx = fract(bx*13.0);
          float hgt = .015 + .085*abs(sin(i*1.7 + t*4.0 + s*9.0))*(.35 + .65*hash(i + floor(t*7.0) + s));
          c += step(.28,fx)*step(fx,.72)*step(abs(q.y-1.74),hgt)*.9;
        }
        float cyc = fract(t*.11 + s);
        for (int i=0;i<7;i++){
          float fi = float(i);
          float y = 1.43 - fi*.165;
          float w = .34 + .38*hash(fi + s*17.0);
          float k = clamp(cyc*9.0 - fi, 0.0, 1.0);
          float ln = fillD(sdBox(q-vec2(.21+w*k*.5, y), vec2(w*k*.5, .021), .01), .01)*step(.02,k);
          float who = step(.5, hash(fi*2.3 + floor(s*5.0)));
          c += ln*mix(.42,.8,who);
          c += fillD(length(q-vec2(.11,y))-.028,.01)*step(.02,k)*mix(.3,.9,who);
        }
      } else {
        // Wear Close: two strap bracelets, a heart travels from one to the other, then the notification lands
        vec2 A = vec2(.5,.5), B = vec2(.5,1.36);
        float k = fract(t*.22 + s);
        for (int j=0;j<2;j++){
          vec2 P = j==0 ? A : B;
          // a flat strap seen from the front: one band, the keeper loop at the back, the node in front
          float e = abs(length((q-P)*vec2(1.0,1.7))-.24)-.024;
          float front = step(q.y, P.y);
          c += fillD(e,.01)*mix(.34,.8,front);
          c += fillD(sdBox(q-P-vec2(-.07,.136),vec2(.016,.036),.006),.01)*.55;
          float nd = sdBox(q-P+vec2(0.0,.141),vec2(.062,.056),.022);
          c = mix(c, j==0 ? .95 : .18, fillD(nd,.01));
          c += fillD(abs(nd)-.008,.008)*.9;
        }
        float seg = step(abs(q.x-.5),.006)*step(A.y+.2,q.y)*step(q.y,B.y-.22);
        c += seg*step(.5,fract(q.y*16.0 - t*1.5))*.45;
        float hy = mix(A.y+.04, B.y-.04, smoothstep(0.0,.55,k));
        c += heart(q-vec2(.5,hy), .085)*(1.0-step(.58,k));
        float pr = clamp((k-.56)/.44, 0.0, 1.0);
        c += fillD(abs(length((q-B)*vec2(1.0,1.7))-(.24+pr*.36))-.008,.01)*(1.0-pr)*step(.56,k);
        float ap = smoothstep(.56,.62,k)*(1.0-smoothstep(.95,1.0,k));
        c += fillD(sdBox(q-vec2(.5,1.84),vec2(.4,.085),.07),.01)*.88*ap;
        c -= heart(q-vec2(.2,1.84),.05)*ap*.75;
        c -= fillD(sdBox(q-vec2(.53,1.865),vec2(.2,.014),.007),.008)*ap*.6;
        c -= fillD(sdBox(q-vec2(.47,1.815),vec2(.14,.012),.006),.008)*ap*.4;
      }
      return c;
    }

    // ===== real apps for the automation chapter: few, but each one actually doing something =====
    float bar(vec2 q, float x0, float y, float w, float h){ return fillD(sdBox(q - vec2(x0 + w*.5, y), vec2(w*.5, h), h), .006); }
    float ring(vec2 q, vec2 c, float r, float th){ return fillD(abs(length(q - c) - r) - th, .006); }
    float dot1(vec2 q, vec2 c, float r){ return fillD(length(q - c) - r, .006); }
    vec3 statusBar(vec2 q, vec3 col, vec3 fg){
      col = mix(col, fg, bar(q, .08, ASP-.07, .1, .014));
      col = mix(col, fg, bar(q, .78, ASP-.07, .14, .014));
      return col;
    }

    // Gboard, dark: four rows of keys; while typing the key under the "finger" lights up
    vec3 keyboard(vec2 q, float top, float keyId, float press){
      vec3 col = vec3(.12,.125,.135);
      float y0 = .075, rowH = (top - y0)/4.0;
      if (q.y < y0 || q.y > top) return col;
      float r = floor((q.y - y0)/rowH), fy = (q.y - y0)/rowH - r;
      float x0 = .015, x1 = .985, n = 10.0, base = 0.0;
      if (r > 2.5){ n = 10.0; base = 0.0; }
      else if (r > 1.5){ n = 9.0; x0 = .065; x1 = .935; base = 10.0; }
      else if (r > .5){ n = 9.0; base = 19.0; }
      float kw = (x1 - x0)/n, ci = floor((q.x - x0)/kw), fx = (q.x - x0)/kw - ci;
      vec3 key = vec3(.235,.25,.27);
      if (r < .5){
        // bottom row: ?123  ,  space  .  enter
        float xs = q.x;
        float k0 = step(.015, xs)*step(xs, .16), k1 = step(.17, xs)*step(xs, .27), k2 = step(.28, xs)*step(xs, .72), k3 = step(.73, xs)*step(xs, .83), k4 = step(.84, xs)*step(xs, .985);
        float inside = (k0 + k1 + k2 + k3 + k4)*step(.14, fy)*step(fy, .86);
        vec3 kc = k4 > .5 ? vec3(.54,.7,.98)*.75 : (k0 + k1 + k3 > .5 ? vec3(.18,.19,.2) : key);
        col = mix(col, kc, inside);
        return col;
      }
      if (ci < 0.0 || ci > n - 1.0) return col;
      float inside = step(.07, fx)*step(fx, .93)*step(.14, fy)*step(fy, .86);
      bool special = r > .5 && r < 1.5 && (ci < .5 || ci > n - 1.5);
      vec3 kc = special ? vec3(.18,.19,.2) : key;
      if (!special && abs(base + ci - keyId) < .5) kc = mix(kc, vec3(.62,.66,.72), press);
      col = mix(col, kc, inside);
      // a hint of the legend on each key
      col = mix(col, vec3(.8,.82,.85), inside*fillD(length(vec2((fx - .5)*kw, (fy - .5)*rowH)) - .007, .004)*.7);
      return col;
    }

    // WhatsApp (tg = 0) / Telegram (tg = 1): type a message, send it, the other side types back, a reply lands
    vec3 chatApp(vec2 q, float t, float s, float tg){
      vec3 BG = mix(vec3(.043,.078,.102), vec3(.055,.09,.13), tg), HEAD = mix(vec3(.122,.173,.204), vec3(.09,.13,.17), tg);
      vec3 OUT = mix(vec3(0.0,.361,.294), vec3(.17,.32,.48), tg), IN = mix(vec3(.125,.173,.2), vec3(.1,.15,.2), tg);
      vec3 ACC = mix(vec3(0.0,.659,.518), vec3(.33,.62,.93), tg), TXT = vec3(.86,.89,.9);
      float L = 7.5, tt = t + s*L*3.0 + L*6.0, cyc = floor(tt/L), k = tt - cyc*L; // +6 loops: every chat already has a history
      float typed = clamp((k - .4)/3.0, 0.0, 1.0)*(1.0 - step(3.45, k));
      float sent = smoothstep(3.45, 3.8, k), reply = smoothstep(5.6, 5.95, k);
      float F = cyc*2.0 + sent + reply;
      float inTop = .735, kbTop = .63, headY = ASP - .30;
      vec3 col = BG;
      if (tg < .5){
        vec2 dg = fract(q*9.0) - .5; float dn = hash(floor(q.x*9.0) + floor(q.y*9.0)*17.0 + s*3.0);
        col += vec3(.018,.026,.03)*fillD(abs(length(dg)-.22)-.018, .03)*step(.55, dn);
      } else col += vec3(.0,.02,.04)*q.y;
      // messages: absolute index m, even = mine; they rise from the input bar and push the older ones up
      for (int j=0; j<7; j++){
        float m = ceil(F) - 1.0 - float(j);
        if (m < 0.0) break;
        float row = F - 1.0 - m;
        float mine = 1.0 - mod(m, 2.0);
        float two = step(.55, hash(m*3.7 + s*11.0));
        float h = mix(.036, .058, two), w = .17 + .2*hash(m*1.3 + s*7.0);
        vec2 cp = vec2(mine > .5 ? .95 - w : .05 + w, inTop + .045 + row*.14 + h);
        float vis = step(inTop + .012, q.y)*step(q.y, headY);
        vec3 bc = mine > .5 ? OUT : IN;
        col = mix(col, bc, fillD(sdBox(q - cp, vec2(w, h), .03), .006)*vis);
        float tl = bar(q, cp.x - w + .035, cp.y + h - .024, w*1.5, .009) + two*bar(q, cp.x - w + .035, cp.y + h - .054, w*1.1, .009);
        col = mix(col, TXT*.9, clamp(tl, 0.0, 1.0)*vis);
        float readNow = step(m + 1.5, F) + step(abs(m - cyc*2.0), .1)*step(4.2, k);
        vec3 tick = mix(vec3(.55,.6,.62), mix(vec3(.33,.72,.93), vec3(.45,.85,.6), tg), clamp(readNow, 0.0, 1.0));
        col = mix(col, tick, bar(q, cp.x + w - .07, cp.y - h + .016, .04, .006)*vis*mine);
      }
      // header with the contact; "typing…" while the other side writes back
      col = mix(col, HEAD, step(headY, q.y));
      col = mix(col, vec3(.42,.47,.5), dot1(q, vec2(.15, headY + .12), .05));
      col = mix(col, TXT, bar(q, .23, headY + .14, .26, .016));
      float typingBack = step(4.4, k)*step(k, 5.6);
      col = mix(col, mix(vec3(.45,.52,.55), ACC, typingBack), bar(q, .23, headY + .09, typingBack > .5 ? .1 : .14, .01));
      for (int d=0; d<3; d++){ float fd = float(d); col = mix(col, ACC, dot1(q, vec2(.37 + fd*.025, headY + .09), .007)*typingBack*step(.5, fract(t*2.5 - fd*.2))); }
      col = mix(col, vec3(.75,.8,.82), bar(q, .74, headY + .12, .04, .016) + bar(q, .84, headY + .12, .04, .016));
      // input bar: the message grows character by character, caret blinking; mic turns into send, send flashes
      col = mix(col, BG, step(kbTop, q.y)*step(q.y, inTop + .012));
      col = mix(col, mix(vec3(.165,.224,.259), vec3(.12,.17,.22), tg), fillD(sdBox(q - vec2(.41, .683), vec2(.37, .042), .042), .006));
      float tw = typed*(.38 + .16*hash(cyc + s*5.0));
      col = mix(col, TXT, bar(q, .1, .683, tw, .011)*step(.001, typed));
      col = mix(col, ACC, step(.5, fract(t*1.6))*bar(q, .1 + tw + .006, .683, .004, .02)*step(k, 3.45));
      float flash = smoothstep(3.3, 3.45, k)*(1.0 - smoothstep(3.45, 3.75, k));
      col = mix(col, ACC*(1.0 + flash*.6), dot1(q, vec2(.9, .683), .045 + flash*.008));
      float sendIcon = step(.001, typed)*step(k, 3.5);
      col = mix(col, vec3(.95), mix(bar(q, .892, .683, .016, .016), fillD(sdBox(q - vec2(.902, .683), vec2(.016, .009), .004), .004), sendIcon));
      // keyboard with the pressed key
      float pr = step(.001, typed)*step(fract(k*7.0), .55);
      float kid = floor(hash(floor(k*7.0) + cyc*13.0 + s*31.0)*27.99);
      if (q.y < kbTop) col = keyboard(q, kbTop, kid, pr);
      col = statusBar(q, col, vec3(.92));
      return col;
    }

    // a "photo": two-tone sky, a sun, a hill line; seeded so every post and video looks different
    vec3 photo(vec2 uv, float sd){
      vec3 c1 = vec3(.98,.62,.36), c2 = vec3(.42,.24,.52);
      float pick = hash(sd*7.1);
      if (pick > .75){ c1 = vec3(.4,.78,.85); c2 = vec3(.1,.25,.5); }
      else if (pick > .5){ c1 = vec3(.62,.82,.5); c2 = vec3(.12,.3,.22); }
      else if (pick > .25){ c1 = vec3(.95,.5,.62); c2 = vec3(.12,.12,.32); }
      vec3 col = mix(c2, c1, smoothstep(0.0, 1.0, uv.y));
      vec2 sun = vec2(.25 + .5*hash(sd*3.3), .62 + .2*hash(sd*5.9));
      col = mix(col, vec3(1.0,.95,.82), fillD(length(uv - sun) - .09, .02)*.85);
      float hill = .3 + .08*sin(uv.x*6.0 + sd*20.0) + .04*sin(uv.x*13.0 + sd*7.0);
      col = mix(col, c2*.55, step(uv.y, hill));
      return col*.82;
    }

    // Instagram, dark: scroll the feed post by post, double-tap the photo, the heart pops and the like turns red
    vec3 instaApp(vec2 q, float t, float s){
      float L = 4.6, P = 1.42, tt = t + s*L*4.0, n = floor(tt/L), k = tt - n*L;
      float topY = ASP - .2, navY = .12;
      float cy = topY - q.y + (n + smoothstep(3.5, 4.4, k))*P;
      float pi = floor(cy/P), ly = cy - pi*P;
      vec3 col = vec3(0.0);
      // post header: avatar with the gradient story ring, username
      vec2 hp = vec2(q.x, -ly);
      col = mix(col, mix(vec3(.98,.75,.25), vec3(.85,.2,.55), q.x*6.0), ring(hp, vec2(.08, -.06), .042, .006));
      col = mix(col, vec3(.45), dot1(hp, vec2(.08, -.06), .033));
      col = mix(col, vec3(.92), bar(hp, .15, -.06, .2 + .1*hash(pi + s), .011));
      // the photo
      if (ly > .12 && ly < 1.12) col = photo(vec2(q.x, 1.0 - (ly - .12)), pi + s*13.0);
      // actions: heart, comment, share, bookmark
      vec2 ap = vec2(q.x, -(ly - 1.17));
      float liked = (abs(pi - n) < .5) ? step(1.15, k) : step(.35, hash(pi*2.3 + s));
      float hOut = clamp(heart(ap - vec2(.07, 0.0), .042) - heart(ap - vec2(.07, .004), .03), 0.0, 1.0);
      col = mix(col, vec3(.92), hOut*(1.0 - liked));
      col = mix(col, vec3(1.0,.19,.3), heart(ap - vec2(.07, 0.0), .042)*liked);
      col = mix(col, vec3(.92), ring(ap, vec2(.17, 0.0), .026, .005));
      col = mix(col, vec3(.92), fillD(sdSeg(ap, vec2(.25, -.02), vec2(.3, .02)) - .005, .005) + fillD(sdSeg(ap, vec2(.25, -.02), vec2(.285, .015)) - .004, .005)*0.0);
      col = mix(col, vec3(.92), fillD(abs(sdBox(ap - vec2(.93, 0.0), vec2(.018, .028), .003)) - .004, .005));
      // likes count and caption
      col = mix(col, vec3(.92), bar(vec2(q.x, -ly), .045, -1.25, .22, .01));
      col = mix(col, vec3(.7), bar(vec2(q.x, -ly), .045, -1.3, .6*hash(pi*1.7 + s) + .25, .009));
      // the double-tap heart over the current photo
      float pop = smoothstep(1.0, 1.25, k)*(1.0 - smoothstep(1.55, 1.85, k));
      if (abs(pi - n) < .5 && ly > .12 && ly < 1.12){ float sc = .14*(.6 + .4*smoothstep(1.0, 1.2, k)); col = mix(col, vec3(1.0), heart(vec2(q.x, -ly) - vec2(.5, -.62), sc)*pop); }
      // top bar and bottom nav
      col = mix(col, vec3(0.0), step(topY, q.y));
      col = mix(col, vec3(.95), bar(q, .06, topY + .07, .24, .02));
      col = mix(col, vec3(.95), clamp(heart(q - vec2(.8, topY + .07), .03) - heart(q - vec2(.8, topY + .073), .02), 0.0, 1.0));
      col = mix(col, vec3(0.0), step(q.y, navY));
      for (int i=0; i<5; i++){ float fi = float(i); col = mix(col, vec3(.9), fillD(abs(sdBox(q - vec2(.1 + fi*.2, .06), vec2(.025, .025), .008)) - .004, .005)); }
      return statusBar(q, col, vec3(.92));
    }

    // TikTok: a video plays, the like goes red with a burst, then a swipe up to the next one
    vec3 tiktokApp(vec2 q, float t, float s){
      float L = 4.2, tt = t + s*L*5.0, n = floor(tt/L), k = tt - n*L;
      float sw = smoothstep(3.55, 4.2, k);
      float vy = q.y - sw*ASP, vi = n - floor(vy/ASP), y = mod(vy, ASP);
      vec2 uv = vec2(q.x, y/ASP);
      // the video: a slow push-in on a seeded photo, a person swaying in front of it
      vec2 zuv = (uv - .5)*(1.0 - .06*fract(t*.2)) + .5;
      vec3 col = photo(zuv, vi*1.9 + s*17.0);
      float sway = .03*sin(t*2.4 + vi);
      vec2 pc = vec2(.5 + sway, .5);
      float person = fillD(length((uv - pc - vec2(0.0, .08))*vec2(1.0, 2.13)) - .1, .01) + fillD(sdBox((uv - pc + vec2(0.0, .12))*vec2(1.0, 2.13), vec2(.17, .3), .12), .01);
      col = mix(col, col*.25 + vec3(.05), clamp(person, 0.0, 1.0)*.85);
      col *= mix(.45, 1.0, smoothstep(.0, .35, uv.y));
      // overlay (doesn't move with the swipe)
      col = mix(col, vec3(.95), bar(q, .3, ASP - .14, .14, .011) + bar(q, .52, ASP - .14, .18, .013));
      col = mix(col, vec3(.95), bar(q, .52, ASP - .165, .18, .004));
      float liked = step(1.6, k);
      col = mix(col, vec3(.6), dot1(q, vec2(.9, 1.0), .05)); col = mix(col, vec3(1.0,.17,.33), dot1(q, vec2(.9, .95), .014));
      col = mix(col, mix(vec3(.95), vec3(1.0,.17,.33), liked), heart(q - vec2(.9, .82), .05));
      float burst = smoothstep(1.6, 1.75, k)*(1.0 - smoothstep(1.75, 2.1, k));
      col = mix(col, vec3(1.0,.4,.5), ring(q, vec2(.9, .82), .04 + burst*.05, .004)*burst);
      col = mix(col, vec3(.95), dot1(q, vec2(.9, .67), .03)); col = mix(col, vec3(.95), dot1(q, vec2(.9, .53), .03)); col = mix(col, vec3(.95), dot1(q, vec2(.9, .39), .03));
      float spin = t*1.5; vec2 dq = q - vec2(.9, .22);
      col = mix(col, vec3(.15), dot1(q, vec2(.9, .22), .045)); col = mix(col, vec3(.6), dot1(q, vec2(.9, .22), .016)*(.6 + .4*sin(atan(dq.y, dq.x)*4.0 + spin)));
      col = mix(col, vec3(.97), bar(q, .05, .33, .22, .013));
      col = mix(col, vec3(.85), bar(q, .05, .28, .55, .009) + bar(q, .05, .245, .38, .009));
      col = mix(col, vec3(.85), bar(q, .1, .19, .35, .008));
      col = mix(col, vec3(1.0,.17,.33), bar(q, 0.0, .105, ASP*0.0 + .95*fract(k/L), .003));
      col = mix(col, vec3(0.0), step(q.y, .1));
      for (int i=0; i<5; i++){ float fi = float(i); if (i == 2) continue; col = mix(col, vec3(.85), dot1(q, vec2(.1 + fi*.2, .05), .018)); }
      col = mix(col, vec3(.25,.95,.95), fillD(sdBox(q - vec2(.49, .05), vec2(.05, .028), .012), .004));
      col = mix(col, vec3(1.0,.17,.33), fillD(sdBox(q - vec2(.51, .05), vec2(.05, .028), .012), .004));
      col = mix(col, vec3(.97), fillD(sdBox(q - vec2(.5, .05), vec2(.045, .028), .012), .004));
      return statusBar(q, col, vec3(.95));
    }

    // a motivation letter filling the screen (the school beat): a sender block, a date, "Dear …", paragraphs, a signature.
    // Every phone gets its own: typed or handwritten, white or cream, some with a passport photo clipped on.
    vec3 letterPage(vec2 q, float id){
      float h1 = hash(id*3.17), h2 = hash(id*7.31 + 1.0), h3 = hash(id*1.93 + 5.0);
      bool hand = h1 < .26;
      vec3 paper = mix(vec3(.84,.85,.86), vec3(.86,.82,.74), step(.55, h2)) * (.93 + .07*h3);
      vec3 inkc = hand ? vec3(.17,.24,.5) : vec3(.2,.21,.25);
      float y = ASP - q.y; // from the top of the page
      float aa = max(.006, fwidth(y)*1.5);
      float L = 0.0;
      // sender block, top left, and the date on the right
      for (int i = 0; i < 3; i++){ float fi = float(i); L = max(L, fillD(abs(y - .18 - fi*.055) - .009, aa)*step(.12, q.x)*step(q.x, .12 + .2 + .16*hash(id + fi*4.1))); }
      L = max(L, fillD(abs(y - .42) - .009, aa)*step(.6, q.x)*step(q.x, .88)*(1.0 - step(.7, h3)));
      // some applications come with a photo clipped on
      float photo = step(.7, h3)*fillD(sdBox(q - vec2(.75, ASP - .26), vec2(.11, .14), .0), aa);
      // salutation, then paragraphs: ragged last lines, a gap between paragraphs
      L = max(L, fillD(abs(y - .56) - .01, aa)*step(.12, q.x)*step(q.x, .48));
      float sp = hand ? .075 : .058;
      float ly = (y - .68)/sp, li = floor(ly), lf = fract(ly);
      float wob = hand ? sin(q.x*19.0 + li*2.3 + id)*.07 : 0.0;
      float paraEnd = step(.72, hash(li*1.7 + id*.31));
      float lineW = paraEnd > .5 ? .25 + .4*hash(li + id) : .74 + .02*hash(li*2.0 + id);
      float gap = step(.72, hash((li - 1.0)*1.7 + id*.31)); // the line after a paragraph's end stays empty
      float body = fillD(abs(lf - .5 - wob) - (hand ? .1 : .14), aa/sp)*step(.12, q.x)*step(q.x, .12 + lineW)*(1.0 - gap);
      body *= step(0.0, ly)*step(y, 1.78);
      L = max(L, body*(hand ? .85 : .7));
      // signature
      float sx = (q.x - .14)/.34, sig = sin(sx*21.0 + id)*.022 + sin(sx*7.0)*.015;
      L = max(L, fillD(abs(y - 1.9 - sig) - .006, aa*1.2)*step(0.0, sx)*step(sx, 1.0));
      vec3 col = mix(paper, inkc, L*.85);
      return mix(col, vec3(.42,.4,.38)*(.7 + .3*fillD(sdBox(q - vec2(.75, ASP - .23), vec2(.05, .06), .03), aa)), photo);
    }

    // what a phone on the farm is doing right now: mostly chats, some feeds
    vec3 automation(vec2 q, float t, float s){
      if (vApp < .5) return chatApp(q, t, s, 0.0);
      if (vApp < 1.5) return chatApp(q, t, s, 1.0);
      if (vApp < 2.5) return instaApp(q, t, s);
      return tiktokApp(q, t, s);
    }

    void main(){
      // rounded display corners: outside them the black glass of the body shows through
      vec2 pp = (vUv - .5)*vec2(${SW.toFixed(3)}, ${SH.toFixed(3)});
      float dEdge = sdBox(pp, vec2(${(SW/2).toFixed(4)}, ${(SH/2).toFixed(4)}), .108);
      if (dEdge > 0.0) discard;
      // apps live above a black strip at the bottom that holds the gesture handle, like Android draws it
      const float NAV = .1;
      vec2 q0 = vec2(vUv.x, vUv.y*ASP);
      vec2 q = vec2(q0.x, (q0.y - NAV)*ASP/(ASP - NAV));
      float isHover = step(abs(vId - uHover), .5);
      // the replacement phone shows what it's running while it's in the air, like a phone lifted by hover does
      float reveal = max(isHover, step(abs(vId - uNewId), .5)*(1.0 - uNewOn));
      float t = uTime + vSeed*30.0;
      float typ = vDelay < uSweep ? uTo : uFrom;
      if (typ > 8.5) typ = 7.0; // "mixed" means the automation mix
      bool real = typ > 6.5 || (typ > 2.5 && typ < 3.5);
      float a = real ? 0.0 : clamp(app(typ, q, t, vSeed), 0.0, 1.2);

      vec2 wuv = (vCell + vUv) / uGrid;
      // the photo reel: this phone shows the next photo once its turn has passed edge-on (see paintReel)
      float lp = clamp((uReelF - vFlip*(1.0 - ${FLIP_DUR.toFixed(2)}))/${FLIP_DUR.toFixed(2)}, 0.0, 1.0);
      vec3 fc = mix(texture2D(uFace, wuv).rgb, texture2D(uFaceB, wuv).rgb, step(.5, lp));
      float turn = abs(cos(lp*3.14159265)); // 1 face on, 0 edge-on
      float fl = smoothstep(.05, 1.0, dot(fc, vec3(.299,.587,.114)))*.9;
      float nm = texture2D(uName, wuv).r;
      // sample everything up front (no texture reads in divergent branches), then pick per cell
      float bd = mix(texture2D(uBoardA, wuv).r, texture2D(uBoardB, wuv).r, step(vDelay, uBoardWipe));
      vec3 me = texture2D(uPick, vUv).rgb;
      // image modes: 0 name, 1 board, 2 photo reel (colour), 3 letters
      float mode = step(vDelay, uImgWipe) > .5 ? uImgTo : uImgFrom;
      float img = mode < .5 ? nm : (mode < 1.5 ? bd : fl);
      vec2 pg = fract(vUv*vec2(54.0,112.0));
      float grid = .74 + .26*step(.18,pg.x)*step(.18,pg.y);
      img *= grid;
      // the photo reels show in colour; name and board stay as ink
      float useFc = step(1.5, mode)*uFaceColor;
      float isPick = step(abs(vId - uPickId), .5);
      float glitch = step(.985, hash(vId*.37 + floor(uTime*3.0)));
      // hovering a phone in an image (name, board, photo) lifts it out of the picture to show what it's running
      float wm = smoothstep(vDelay, vDelay+.2, uWall*1.25) * (1.0 - glitch*.85*step(.99,uWall)*(1.0 - uFaceColor*step(1.5, uImgTo))) * (1.0 - reveal); // no glitching through the photo reel

      vec3 bg = vec3(.028,.036,.058);
      vec3 ink = vec3(.82,.88,1.0) * (.88 + .16*hash(vId*1.3));
      vec3 ac = typ > 6.5 ? automation(q, t, vSeed) : ((typ > 2.5 && typ < 3.5) ? chatApp(q, t, vSeed, 0.0) : bg + (ink-bg)*a);
      // every photo and the video on the wall share one grade: mostly grey, a cool cast like the wall's ink, a little
      // more contrast (only the one lit phone at school keeps its colour, see below)
      float fl2 = (dot(fc, vec3(.299,.587,.114)) - .5)*1.12 + .47;
      vec3 fcg = mix(fl2*vec3(.9,.96,1.06), fc, uFaceSat);
      vec3 imgCol = mix(bg + (ink-bg)*img*1.05, mix(bg, fcg*.92, grid), useFc);
      if (mode > 2.5){
        // letters, then the wall goes dark from the outside in until one phone is left: each one squeezes to a
        // bright line and out, like an old screen switching off. The last one turns into me.
        vec3 page = letterPage(q0, vId);
        // each phone goes out at its own random moment, the ones nearest the last phone leaning a little later,
        // so it reads as a room emptying rather than a ring closing in
        float dn = clamp(length((vCell - uPickCell)*vec2(${SX.toFixed(2)}, ${SY.toFixed(2)}))/${(Math.hypot(C*SX, R*SY)*.6).toFixed(2)}, 0.0, 1.0);
        float th = hash(vId*7.13 + 3.1)*.84 + (1.0 - dn)*.14;
        float off = (1.0 - isPick)*clamp((uOne - th)/.06, 0.0, 1.0);
        float half_ = .5*(1.0 - off)*(1.0 - off);
        float band = fillD(abs(vUv.y - .5) - half_, .012)*(1.0 - step(.98, off));
        page = mix(page, vec3(1.0), smoothstep(.45, .9, off)*.7);
        page = mix(page, me, isPick*uPickOn);
        imgCol = mix(bg*.6, mix(bg, page, grid), band);
      }
      vec3 col = mix(ac*mix(1.0, .3, uWall*(1.0 - reveal)), imgCol, wm);
      col = mix(col, vec3(0.0), step(q0.y, NAV)*(1.0 - wm));
      col *= .92 + .08*sin(vUv.y*620.0 + uTime*6.0);
      col *= mix(.78, 1.0, smoothstep(0.0, .06, -dEdge));
      // selection: a thin amber line that follows the screen's rounded edge, a faint inner glow, and a lift in brightness
      col *= 1.0 + .06*isHover;
      float edgeOn = max(isHover, isPick*uPickOn*step(2.5, mode)*wm); // the one phone left gets the same amber edge
      col = mix(col, vec3(1.0,.71,.28), edgeOn*(1.0 - smoothstep(.004, .011, -dEdge)));
      col += vec3(1.0,.71,.28)*edgeOn*.05*(1.0 - smoothstep(.0, .07, -dEdge));
      // Android: punch-hole camera at the top, gesture bar at the bottom
      col *= smoothstep(0.0, .006, length(pp - vec2(0.0, ${(SH/2-.062).toFixed(4)})) - .027);
      col = mix(col, vec3(.78,.8,.84), fillD(sdBox(pp - vec2(0.0, ${(-SH/2 + .05*SW).toFixed(4)}), vec2(.12,.008), .008), .005)*.75*(1.0 - wm));
      float on = step(vSeed, uBoot);
      float flash = on*(1.0-smoothstep(0.0,.06,uBoot-vSeed));
      col = mix(bg*.35, col, on) + vec3(.6,.65,.75)*flash;
      col *= mix(1.0, .42, uDim);
      col *= .35 + .65*turn; // turning edge-on in the photo flip
      // the screens are authored in display space; the composer works in linear light
      col = pow(max(col, vec3(0.0)), vec3(2.2)) * uGain;
      col = mix(col, uRoom, smoothstep(34.0, 72.0, vDepth));
      gl_FragColor = vec4(col, 1.0);
    }`
});
const screens = new THREE.InstancedMesh(screenGeo, screenMat, COUNT);
const shelves = new THREE.InstancedMesh(new THREE.BoxGeometry(SX*.98, .05, .42), new THREE.MeshStandardMaterial({color:0x14161c, metalness:.7, roughness:.45}), COUNT);
const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(.06,.035,.02), new THREE.MeshBasicMaterial(), COUNT);
const cablePath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0,-BH/2+.02,-.012), new THREE.Vector3(0,-BH/2-.022,-.014), new THREE.Vector3(.012,-BH/2-.03,-.08),
  new THREE.Vector3(.03,-BH/2-.03,-.22), new THREE.Vector3(.055,-BH/2-.03,-.38)]);
const plug = new THREE.BoxGeometry(.07,.046,.034); plug.translate(0,-BH/2-.008,-.012);
const cables = new THREE.InstancedMesh(mergeGeometries([new THREE.TubeGeometry(cablePath, 20, .013, 6, false), plug]), new THREE.MeshStandardMaterial({color:0xd6d6d1, roughness:.48, metalness:0, envMap:envTex, envMapIntensity:.25}), COUNT);
const AMBER = new THREE.Color('#ffb547').multiplyScalar(2.2);
const LEDOFF = new THREE.Color(0x2a2418), LEDGREEN = new THREE.Color(0x58ff9a).multiplyScalar(1.3);
wall.add(bodies, screens, shelves, leds, cables);

const lift = new Float32Array(COUNT);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
// The slot the iPhone came out of stays empty while it's away; once it has gone for good, a fresh Android flies in
// on its own, slides into the slot, gets its cable and boots. refill: 0 empty … 1 docked.
let hiddenSlot = -1, refill = 0;
const flipT = new Float32Array(COUNT); // each phone's turn in the photo flip, 0 → 1 (see flipOf)
const flipRot = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const flyQ = new THREE.Quaternion(), flyE = new THREE.Euler(), flyV = new THREE.Vector3(), flyN = new THREE.Vector3();
function place(i){
  const b=base[i], l=lift[i];
  tmpE.set(0,b.ry,0); tmpQ.setFromEuler(tmpE);
  N.set(Math.sin(b.ry),0,Math.cos(b.ry));
  let k = 1 + l*.08, plugged = 1;
  tmpP.set(b.x,b.y,b.z).addScaledVector(N, l*.9);
  const ft = flipT[i];
  if (ft > 0 && ft < 1){
    // turn to edge-on, swap, come back round from the other side: 0 → 90°, then −90° → 0, popping out as it turns
    const ang = ft < .5 ? easeIO(ft*2)*Math.PI/2 : -easeIO((1 - ft)*2)*Math.PI/2;
    tmpQ.multiply(flipRot.setFromAxisAngle(UP, ang));
    tmpP.addScaledVector(N, Math.sin(ft*Math.PI)*.45);
  }
  if (i === hiddenSlot){
    // it comes up from below right on a curve (quadratic Bézier in the slot's frame: along the wall, up, out of the
    // wall), tumbling less and less; it squares up in front of the slot, then pushes in
    const fly = easeOut(smooth(0, .62, refill)), push = easeIO(smooth(.56, .84, refill)), away = 1 - fly;
    const bz = (a, c, e) => away*away*a + 2*away*fly*c + fly*fly*e;
    const along = bz(3.2, 2.6, 0), up = bz(-3.4, .9, 0), out = bz(3.2, 2.4, 1.6)*(1 - push);
    tmpP.addScaledVector(N, out).add(flyV.set(Math.cos(b.ry)*along, up, -Math.sin(b.ry)*along));
    flyQ.setFromEuler(flyE.set(.35*away, -.45*away*away, .3*away)); tmpQ.multiply(flyQ); // a light tumble, screen mostly to the camera
    k = refill > 0 ? 1 : 0; plugged = refill > .86 ? 1 : 0;
  }
  tmpS.set(k,k,k);
  tmpM.compose(tmpP,tmpQ,tmpS); bodies.setMatrixAt(i,tmpM);
  tmpS.setScalar(k*plugged); tmpM.compose(tmpP,tmpQ,tmpS); cables.setMatrixAt(i,tmpM); tmpS.set(k,k,k);
  // the body grows by k when lifted, so its front moves out too: keep the screen in front of it (along the phone's
  // own facing, which only differs from the slot's while the replacement is in the air)
  tmpP.addScaledVector(flyN.set(0,0,1).applyQuaternion(tmpQ), BD*Math.max(k, 1)/2+.002); tmpM.compose(tmpP,tmpQ,tmpS); screens.setMatrixAt(i,tmpM);
}
for (let i=0;i<COUNT;i++){
  place(i);
  const b=base[i]; tmpE.set(0,b.ry,0); tmpQ.setFromEuler(tmpE); N.set(Math.sin(b.ry),0,Math.cos(b.ry));
  tmpP.set(b.x,b.y-BH/2-.07,b.z).addScaledVector(N,.08); tmpS.set(1,1,1); tmpM.compose(tmpP,tmpQ,tmpS); shelves.setMatrixAt(i,tmpM);
  tmpP.addScaledVector(N,.215); tmpP.x += Math.cos(b.ry)*.36; tmpP.z -= Math.sin(b.ry)*.36; tmpM.compose(tmpP,tmpQ,tmpS); leds.setMatrixAt(i,tmpM);
  leds.setColorAt(i, rnd()>.12 ? LEDGREEN : AMBER);
}
[bodies,screens,shelves,leds,cables].forEach(m=>{ m.instanceMatrix.needsUpdate=true; });
leds.instanceColor.needsUpdate = true;

// =====================================================================
// Product stage: rides with the camera, so objects stay framed while the wall moves behind them.
// Units: 1 = 10 cm.
// =====================================================================
const stage = new THREE.Group(); camera.add(stage);
const pKey = new THREE.DirectionalLight(0xffffff, .6); pKey.position.set(-3,1.2,2.5); camera.add(pKey); pKey.target = stage;


// ---------- iPhone 17 Pro Max + the Recents card (see phone.js) ----------
const ph = createPhone(envTex), phone = ph.phone; stage.add(phone);
// the model's display is 0.8924 × 1.9378 (its own units): the UI canvas keeps that aspect so nothing stretches
const UW = 600, UH = Math.round(UW*1.9378/0.8924);
// the model's Dynamic Island, measured off its geometry, as fractions of the display (seen from the front)
const ISLAND = { cx:.5096, cy:.0345, w:.2689, h:.0379 };
const UI = document.createElement('canvas'); UI.width = UW; UI.height = UH;
let ui = UI.getContext('2d');
const UI_CTX = ui;
const uiTex = new THREE.CanvasTexture(UI); uiTex.colorSpace = THREE.SRGBColorSpace; uiTex.anisotropy = 8;
ph.display.material.map = uiTex; ph.display.material.needsUpdate = true;
const rc = createCard(studioEnv), card = rc.card; phone.add(card);
// swap the hand-built phone for the real model as soon as it loads; the procedural one stays as a fallback
loadIphone('/models/iphone-17-pro-max.glb', envTex).then(({ model, mats }) => {
  paint(mats, DEEP_BLUE_NIGHT);
  Object.values(mats).forEach(mt => { if (mt.name !== 'OLED') clampHDR(mt, 2.2); }); // no fireflies off the rails and lenses
  const keep = new Set([card]);
  phone.children.forEach(c => { if (!keep.has(c) && !soundRings.includes(c)) c.visible = false; });
  const oled = mats['OLED'];
  if (oled){
    // the model's screen UVs run right to left and use glTF's flipY = false
    uiTex.flipY = false; uiTex.repeat.x = -1; uiTex.offset.x = 1; uiTex.needsUpdate = true;
    oled.map = uiTex; oled.emissiveMap = uiTex; oled.emissive.setHex(0xffffff); oled.emissiveIntensity = .82; oled.color.setHex(0x000000); oled.needsUpdate = true;
  }
  // The screen must read as a lit OLED under clear glass, not a frosted panel: the cover glass keeps the model's
  // mirror finish (a rougher one smears the softboxes across the whole display like a flashlight on nano-texture),
  // reflects only the environment (no flash from the product light), and faintly; the OLED itself reflects nothing
  // and shines at close to full brightness, so the colours stay saturated.
  if (mats['Glass']){ mats['Glass'].roughness = .03; mats['Glass'].envMapIntensity = .22; envLit(mats['Glass'], 0); }
  if (oled){ oled.roughness = .6; oled.envMapIntensity = 0; envLit(oled, 0); }
  // the island is one black pill: its cut-out walls and the front sensors behind it must not catch light
  // the island is pure black like the real one: its sensor housing and the frame round the cut-outs take no light at
  // all (a black but glossy material still picks up the key light as a grey sheen)
  const unlitBlack = new THREE.MeshBasicMaterial({ color: 0x000000 });
  model.traverse(o => { if (o.isMesh && (o.material?.name === 'OLED off' || o.material?.name === 'Display Frame')) o.material = unlitBlack; });

  if (mats['Camera filter']){ mats['Camera filter'].color.setHex(0x030305); mats['Camera filter'].envMapIntensity = .15; }
  // the display frame lines both island cut-outs and the bezel; glossy it outlines them in grey, so it goes matte black
  if (mats['Display Frame']){ mats['Display Frame'].color.setHex(0x000000); mats['Display Frame'].roughness = .9; mats['Display Frame'].envMapIntensity = 0; }
  phone.add(model);
  phone.updateMatrixWorld(true);
  // the model's screen has a hole where the island is and nothing behind it, so you could see through to the inside of
  // the back: a black panel right behind the OLED closes it, the way the real display stack does
  let oledMesh = null; model.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => m?.name === 'OLED')) oledMesh = o; });
  if (oledMesh){
    oledMesh.geometry.computeBoundingBox();
    const toPhone = new THREE.Matrix4().copy(phone.matrixWorld).invert().multiply(oledMesh.matrixWorld);
    const bb = new THREE.Box3(), gb = oledMesh.geometry.boundingBox, v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) bb.expandByPoint(v.set(i & 1 ? gb.max.x : gb.min.x, i & 2 ? gb.max.y : gb.min.y, i & 4 ? gb.max.z : gb.min.z).applyMatrix4(toPhone));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(bb.max.x - bb.min.x, bb.max.y - bb.min.y), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    back.position.set((bb.min.x + bb.max.x)/2, (bb.min.y + bb.max.y)/2, bb.min.z - .0015); phone.add(back);
  }
  // debug: ?dbgmat=<material name> paints that material red, to find what is what on the model
  const dbg = new URLSearchParams(location.search).get('dbgmat');
  const dbgHide = new URLSearchParams(location.search).get('dbghide');
  if (dbgHide) model.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => m?.name === dbgHide)) o.visible = false; });
  if (dbg && mats[dbg]){ mats[dbg].color?.setRGB(1, 0, 0); if (mats[dbg].emissive) mats[dbg].emissive.setRGB(1, 0, 0); mats[dbg].needsUpdate = true; }
}).catch(e => console.warn('iPhone model failed, keeping the procedural one', e));
const ATTACH = new THREE.Vector3(ph.magsafe[0], ph.magsafe[1], ph.backZ - CARD.d/2 - .0006);
const soundRings = []; // (replaced by the edge light below)
// While the card records, a thread of light runs round it just outside its edge: two glints chase each other the
// way Siri's edge glow does, and the whole thing breathes with the voice it's hearing. Built in the card's frame.
const VOICE = t => {
  // speech-like: phrases with pauses between them, syllables inside each phrase
  const phrase = Math.max(0, Math.sin(t*1.7)*.6 + Math.sin(t*2.9 + 1)*.45), syl = .45 + .55*Math.abs(Math.sin(t*11.3)*Math.cos(t*7.1));
  return Math.min(1, phrase*syl*1.25);
};
const edgeLight = (() => {
  const pts = rrShape(CARD.w + .028, CARD.h + .028, CARD.r + .014).getPoints(160).map(p => new THREE.Vector3(p.x, p.y, 0));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uOn: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uLevel, uOn; varying vec2 vUv;
      float w(float x){ return fract(x + .5) - .5; }
      void main(){
        float u = vUv.x;
        float g1 = exp(-pow(w(u - uTime*.23), 2.0)*70.0), g2 = exp(-pow(w(u + uTime*.17 + .5), 2.0)*45.0);
        float k = (.07 + 1.7*(g1 + g2)*(.3 + .7*uLevel))*(.4 + .6*uLevel)*uOn;
        float edge = 1.0 - abs(vUv.y - .5)*2.0; // softer at the tube's sides
        gl_FragColor = vec4(vec3(1.0, .62, .26)*k*(.6 + .4*edge)*1.8, 1.0);
      }`
  });
  const m = faceBack(new THREE.Mesh(new THREE.TubeGeometry(curve, 320, .0022, 8, true), mat));
  m.position.set(0, 0, -CARD.d/2 + .004); m.renderOrder = 5; m.visible = false; card.add(m);
  return m;
})();

// ---------- Wear Close bracelets (C3: a leather strap with a pin-and-hole fastening, see bracelet.js) ----------
const BS = 1.3; // bracelets read better a touch larger than life next to the phone
// two pieces of leather, not two copies: different wrists, bends, tilts, done up on different holes. Both face you with
// their node; Stone fastens on its right side, Charcoal on its left, so each shows its keeper, stud and holes.
const STONE_SHAPE = { RX: .29, RZ: .226, seed: 3, OV: 1.12, holes: 3, studAt: .34, keeperAt: .12, startA: -.25 };
const CHAR_SHAPE = { RX: .312, RZ: .246, seed: 8, OV: 1.2, holes: 4, studAt: .38, keeperAt: .14, startA: 2.2 };
const STONE_RY = -.3, CHAR_RY = .26;
function makeBracelet(isStone){ const b = makeStrap(isStone, envTex, isStone ? STONE_SHAPE : CHAR_SHAPE); b.g.rotation.set(isStone ? .42 : .5, isStone ? STONE_RY : CHAR_RY, isStone ? .04 : -.07); b.g.scale.setScalar(BS); return b; }
const stone = makeBracelet(true), charcoal = makeBracelet(false);
stage.add(stone.g, charcoal.g);
const STONE_AT = new THREE.Vector3(-.02,-.46,.12), CHAR_AT = new THREE.Vector3(.95,.16,-.4);

// node positions at rest, in stage space (for ripples, the pulse arc and the phone tap)
const nodeAt = (b, at) => b.node.position.clone().add(new THREE.Vector3(0, 0, STRAP.NODE_D/2)).multiplyScalar(BS).applyEuler(b.g.rotation).add(at);
const STONE_NODE = nodeAt(stone, STONE_AT), CHAR_NODE = nodeAt(charcoal, CHAR_AT);

const ripples = [0,1,2].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(.94,1,72), new THREE.MeshBasicMaterial({color:new THREE.Color(1.8,1.4,1.1), transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false})); m.position.copy(STONE_NODE); stage.add(m); return m; });
const arc = new THREE.QuadraticBezierCurve3(STONE_NODE.clone(), STONE_NODE.clone().lerp(CHAR_NODE,.5).add(new THREE.Vector3(-.05,.62,.35)), CHAR_NODE.clone());
const ARC_SEG = 140;
const pulseTube = new THREE.Mesh(new THREE.TubeGeometry(arc, ARC_SEG, .008, 8, false), new THREE.MeshBasicMaterial({color:new THREE.Color(2.6,1.2,.75), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
const pulseHead = new THREE.Mesh(new THREE.SphereGeometry(.03, 20, 14), new THREE.MeshBasicMaterial({color:new THREE.Color(5,2.6,1.6)}));
stage.add(pulseTube, pulseHead);

const NC = document.createElement('canvas'); NC.width = 720; NC.height = 196; const nc = NC.getContext('2d');
const notifTex = new THREE.CanvasTexture(NC); notifTex.colorSpace = THREE.SRGBColorSpace;
const notif = new THREE.Mesh(new THREE.PlaneGeometry(.95, .95*196/720), new THREE.MeshBasicMaterial({map:notifTex, transparent:true, depthWrite:false, color:0xb4b4b4}));
notif.position.copy(CHAR_AT).add(new THREE.Vector3(.02,.62,.22)); stage.add(notif);

// ---------- phone UI (2D canvas → texture) ----------
const SF = '-apple-system, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
const SERIF = '"Cormorant Garamond", Georgia, serif';
function rr(x,y,w,h,r){ ui.beginPath(); ui.roundRect(x,y,w,h,r); }
function wrap(text, maxW){ const words = text.split(' '), lines = []; let cur = ''; for (const w of words){ const t = cur ? cur+' '+w : w; if (ui.measureText(t).width > maxW && cur){ lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
// the Wear Close mark (brand/wearclose-mark.svg, 58 × 40): two halves of a pair, Stone and Charcoal, almost touching
const WC_D = new Path2D('M34.5 0H38a20 20 0 0 1 0 40h-3.5A2.5 2.5 0 0 1 32 37.5v-35A2.5 2.5 0 0 1 34.5 0Z');
function wcMark(g, cx, cy, h){ const k = h/40; g.save(); g.translate(cx - 29*k, cy - 20*k); g.scale(k, k); g.fillStyle = '#c8b19e'; g.beginPath(); g.roundRect(0, 0, 26, 40, 12); g.fill(); g.fillStyle = '#4b4644'; g.fill(WC_D); g.restore(); }
function heart2d(g,cx,cy,s){ g.beginPath(); g.moveTo(cx,cy+s*.42); g.bezierCurveTo(cx-s*1.15,cy-s*.35,cx-s*.5,cy-s*1.05,cx,cy-s*.42); g.bezierCurveTo(cx+s*.5,cy-s*1.05,cx+s*1.15,cy-s*.35,cx,cy+s*.42); g.fill(); }

let NO_STATUS = false;
function statusBar(dark, rec){
  if (NO_STATUS) return;
  // the clock and icons sit in the "ears" either side of the Dynamic Island, centred on its axis
  const iw = ISLAND.w*UW, ih = ISLAND.h*UH, icx = ISLAND.cx*UW, cy = ISLAND.cy*UH, iy = cy - ih/2;
  const fg = dark ? '#ffffff' : '#1b1a18';
  ui.fillStyle = fg; ui.font = `600 25px ${SF}`; ui.textBaseline = 'middle'; ui.textAlign = 'center';
  ui.fillText(hhmm(clock.shown), (icx - iw/2)/2 + 8, cy + 1);
  ui.fillStyle = '#000'; rr(icx - iw/2, iy, iw, ih, ih/2); ui.fill();
  // iOS shows the recording dot in the right ear, next to the island
  if (rec > 0){ ui.fillStyle = `rgba(255,181,71,${rec})`; ui.beginPath(); ui.arc(icx + iw/2 + 14, cy, 6, 0, Math.PI*2); ui.fill(); }
  const rx = icx + iw/2 + (UW - icx - iw/2)/2 + 4;
  ui.fillStyle = fg; ui.textAlign = 'left';
  for (let i=0;i<4;i++){ rr(rx - 52 + i*8, cy + 8 - (i+1)*4.4, 5.5, (i+1)*4.4, 1.5); ui.fill(); }
  ui.strokeStyle = fg; ui.lineWidth = 2.6; ui.lineCap = 'round';
  for (let i=0;i<3;i++){ ui.beginPath(); ui.arc(rx - 6, cy + 9, 4 + i*4.6, Math.PI*1.25, Math.PI*1.75); ui.stroke(); }
  ui.lineWidth = 1.8; rr(rx + 12, cy - 7, 30, 15, 4.5); ui.stroke(); rr(rx + 14.5, cy - 4.5, 21, 10, 2.5); ui.fill(); rr(rx + 43.5, cy - 3, 2.5, 6, 1); ui.fill();
}

const CALL = {name:'Dentist', sub:'Dr. Novák'};
const LINES = [
  ['Dr. Novák','The filling is holding up really well.'],
  ['You','Great. Anything I should do differently?'],
  ['Dr. Novák','Floss every night, especially on the left side.'],
  ['You','And when do you want to see me again?'],
  ['Dr. Novák','March 3rd at 9:30, for the cleaning.']
];
const QUERY = 'What did the dentist tell me?';
const ANSWER = 'Floss every night, especially on the left side. Your next visit is March 3 at 9:30.';

// iOS 26 in-call screen (Liquid Glass): teal-to-blue wash, glass buttons, a glass banner while Recents records
function glass(x, y, w, h, r, fill = .14){
  ui.save();
  ui.fillStyle = `rgba(255,255,255,${fill})`; rr(x, y, w, h, r); ui.fill();
  const hl = ui.createLinearGradient(0, y, 0, y + h); hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(.5, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(255,255,255,.06)');
  ui.fillStyle = hl; rr(x, y, w, h, r); ui.fill();
  ui.strokeStyle = 'rgba(255,255,255,.34)'; ui.lineWidth = 1.6; rr(x + .8, y + .8, w - 1.6, h - 1.6, r); ui.stroke();
  ui.restore();
}
// Material Symbols paths (Apache 2.0), 24×24 viewBox; close to Apple's SF Symbols at this size
const ICON = {
  speaker: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  facetime: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  mute: 'M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z',
  more: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  end: 'M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z'
};
const iconPaths = Object.fromEntries(Object.entries(ICON).map(([k, d]) => [k, new Path2D(d)]));
const callIcons = Object.fromEntries(Object.keys(ICON).map(k => [k, (x, y, s = 40) => {
  ui.save(); ui.translate(x - s/2, y - s/2); ui.scale(s/24, s/24);
  if (k === 'facetime') ui.globalAlpha *= .45;
  ui.fill(iconPaths[k]); ui.restore();
}]));
callIcons.keypad = (x, y) => { for (let i=0;i<3;i++) for (let j=0;j<3;j++){ ui.beginPath(); ui.arc(x + (i-1)*13, y + (j-1)*13, 5, 0, Math.PI*2); ui.fill(); } };
function drawCall(rec, secs, t){
  const W = UW, H = UH, ky = H/1316;
  const base = ui.createLinearGradient(0, 0, W*.4, H); base.addColorStop(0, '#3b7389'); base.addColorStop(.55, '#2c6c82'); base.addColorStop(1, '#0a5784');
  ui.fillStyle = base; ui.fillRect(0, 0, W, H);
  const blue = ui.createRadialGradient(W*1.05, -H*.05, 10, W*1.05, -H*.05, W*1.25); blue.addColorStop(0, 'rgba(24,46,150,.95)'); blue.addColorStop(1, 'rgba(24,46,150,0)');
  ui.fillStyle = blue; ui.fillRect(0, 0, W, H);
  const teal = ui.createRadialGradient(-W*.1, H*.62, 10, -W*.1, H*.62, W*.9); teal.addColorStop(0, 'rgba(60,150,150,.45)'); teal.addColorStop(1, 'rgba(60,150,150,0)');
  ui.fillStyle = teal; ui.fillRect(0, 0, W, H);
  statusBar(true, 1);
  ui.textAlign = 'center'; ui.textBaseline = 'middle';
  ui.fillStyle = 'rgba(230,236,242,.62)'; ui.font = `600 27px ${SF}`;
  ui.fillText(`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`, W/2, 186*ky);
  ui.fillStyle = '#fff'; ui.font = `700 52px ${SF}`; ui.fillText(CALL.name, W/2, 240*ky);
  // while the card records: a glass banner where iOS would offer to hold the call
  if (rec > 0){
    ui.globalAlpha = rec;
    const bx = 44, by = 720*ky, bw = W - 88, bh = 118*ky;
    glass(bx, by, bw, bh, 30);
    ui.textAlign = 'left'; ui.fillStyle = '#fff'; ui.font = `600 26px ${SF}`; ui.fillText('Recording to Recents', bx + 30, by + bh*.38);
    ui.fillStyle = 'rgba(255,255,255,.62)'; ui.font = `400 22px ${SF}`; ui.fillText('Transcript ready when you hang up.', bx + 30, by + bh*.68);
    ui.fillStyle = '#ffb547';
    for (let i=0;i<7;i++){ const h = 8 + 22*Math.abs(Math.sin(i*1.7 + t*7))*(.4 + .6*Math.abs(Math.sin(i*3.1 + t*3))); rr(bx + bw - 118 + i*13, by + bh/2 - h/2, 6, h, 3); ui.fill(); }
    ui.globalAlpha = 1; ui.textAlign = 'center';
  }
  const buttons = [['speaker','Speaker'],['facetime','FaceTime'],['mute','Mute'],['more','More'],['end','End'],['keypad','Keypad']];
  buttons.forEach(([icon, label], i) => {
    const x = [118, 300, 482][i%3], y = (i < 3 ? 943 : 1135)*ky, r = 59;
    if (icon === 'end'){ ui.fillStyle = '#e0322c'; ui.beginPath(); ui.arc(x, y, r, 0, Math.PI*2); ui.fill(); }
    else { glass(x - r, y - r, r*2, r*2, r); }
    ui.fillStyle = '#fff'; ui.strokeStyle = '#fff'; ui.globalAlpha = 1;
    callIcons[icon](x, y, icon === 'end' ? 46 : 40); ui.globalAlpha = 1;
    ui.fillStyle = '#fff'; ui.font = `500 22px ${SF}`; ui.fillText(label, x, y + r + 26);
  });
}
// An incoming call while the phone is unlocked: the Dynamic Island grows into the call banner (caller, decline,
// accept), the green button takes the tap, and the banner opens out into the full-screen call. p: 0 → 1 over the ring.
const SNAP_C = document.createElement('canvas'); SNAP_C.width = UW; SNAP_C.height = UH;
const HANDSET = new Path2D('M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z');
function drawIncoming(p){
  HOME.pressed = ''; drawHome(0);
  const iw = ISLAND.w*UW, ih = ISLAND.h*UH, icx = ISLAND.cx*UW, iy = ISLAND.cy*UH - ih/2;
  const grow = 1 - Math.pow(1 - smooth(0, .14, p), 3), open = easeIO(smooth(.74, 1, p));
  const BX = 11*PT, BW = UW - 22*PT, BH = 86*PT, BR = 43*PT;
  let x = lerp(icx - iw/2, BX, grow), y = iy, w = lerp(iw, BW, grow), h = lerp(ih, BH, grow), r = lerp(ih/2, BR, grow);
  x = lerp(x, 0, open); y = lerp(y, 0, open); w = lerp(w, UW, open); h = lerp(h, UH, open); r = lerp(r, 55*PT, open);
  if (open > 0){ ui.fillStyle = `rgba(0,0,0,${.4*open})`; ui.fillRect(0, 0, UW, UH); }
  ui.save(); rr(x, y, w, h, r); ui.clip();
  ui.fillStyle = '#000'; ui.fillRect(x, y, w, h);
  if (open > 0){ ui.globalAlpha = smooth(.76, .93, p); ui.drawImage(SNAP_C, 0, 0); ui.globalAlpha = 1; }
  const ca = smooth(.08, .16, p)*(1 - smooth(.74, .79, p));
  if (ca > 0){
    ui.globalAlpha = ca;
    const cy = y + h/2, ax = x + 14*PT + 26*PT;
    // monogram, the way iOS shows a contact without a photo
    const mg = ui.createLinearGradient(0, cy - 26*PT, 0, cy + 26*PT); mg.addColorStop(0, '#a5a5aa'); mg.addColorStop(1, '#6e6e73');
    ui.fillStyle = mg; ui.beginPath(); ui.arc(ax, cy, 26*PT, 0, Math.PI*2); ui.fill();
    ui.fillStyle = '#fff'; ui.font = `600 ${24*PT}px ${SF}`; ui.textAlign = 'center'; ui.textBaseline = 'middle'; ui.fillText(CALL.name[0], ax, cy + 1);
    ui.textAlign = 'left'; ui.fillStyle = 'rgba(235,235,245,.6)'; ui.font = `400 ${14*PT}px ${SF}`; ui.fillText('mobile', ax + 38*PT, cy - 11*PT);
    ui.fillStyle = '#fff'; ui.font = `600 ${18*PT}px ${SF}`; ui.fillText(CALL.name, ax + 38*PT, cy + 11*PT);
    const R = 23*PT, okX = x + w - 14*PT - R, noX = okX - 2*R - 14*PT;
    const press = smooth(.63, .67, p)*(1 - smooth(.71, .75, p));
    const btn = (bx, col, path, sz, k) => {
      ui.save(); ui.translate(bx, cy); ui.scale(k, k);
      ui.fillStyle = col; ui.beginPath(); ui.arc(0, 0, R, 0, Math.PI*2); ui.fill();
      ui.fillStyle = '#fff'; ui.translate(-sz/2, -sz/2); ui.scale(sz/24, sz/24); ui.fill(path); ui.restore();
    };
    btn(noX, '#ff3b30', iconPaths.end, 30*PT, 1);
    btn(okX, press > 0 ? '#5fd97d' : '#34c759', HANDSET, 24*PT, 1 - .12*press);
    ui.globalAlpha = 1;
  }
  ui.restore();
}
// ---------- Recents app (dark, iOS-native) ----------
const PT = UW/440; // px per point on a 440 × 956 pt display
const AMB = '#ffb547';
function recentsNav(title){
  ui.fillStyle = '#000'; ui.fillRect(0, 0, UW, UH);
  statusBar(true, 1);
  ui.textBaseline = 'middle';
  // ‹ Calls
  ui.strokeStyle = AMB; ui.lineWidth = 4; ui.lineCap = 'round'; ui.lineJoin = 'round';
  ui.beginPath(); ui.moveTo(44, 120); ui.lineTo(32, 132); ui.lineTo(44, 144); ui.stroke();
  ui.fillStyle = AMB; ui.font = `400 29px ${SF}`; ui.textAlign = 'left'; ui.fillText('Calls', 54, 133);
  if (title){ ui.fillStyle = '#fff'; ui.font = `600 29px ${SF}`; ui.textAlign = 'center'; ui.fillText(title, UW/2, 133); }
  ui.textAlign = 'left';
}
function avatar(x, y, r, letter){
  const g = ui.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, '#ffcf7a'); g.addColorStop(1, '#e8892b');
  ui.fillStyle = g; ui.beginPath(); ui.arc(x, y, r, 0, Math.PI*2); ui.fill();
  ui.fillStyle = '#1a1205'; ui.font = `600 ${r*.95}px ${SF}`; ui.textAlign = 'center'; ui.textBaseline = 'middle'; ui.fillText(letter, x, y + 2); ui.textAlign = 'left';
}
function waveformBar(x0, x1, y, h, played, seed){
  const n = 64, step = (x1 - x0)/n;
  for (let i=0; i<n; i++){
    const v = .18 + .82*Math.abs(Math.sin(i*1.37 + seed))*(.45 + .55*Math.abs(Math.sin(i*.31 + seed*2)));
    ui.fillStyle = i/n < played ? AMB : 'rgba(255,255,255,.22)';
    rr(x0 + i*step, y - v*h/2, step*.55, v*h, step*.27); ui.fill();
  }
}
const LINE_T = ['0:12','0:19','0:31','0:44','0:52'];
function drawTranscript(p){
  recentsNav('');
  // share
  ui.strokeStyle = AMB; ui.lineWidth = 3.2; ui.lineCap = 'round';
  rr(UW - 66, 124, 32, 30, 5); ui.stroke(); ui.fillStyle = '#000'; ui.fillRect(UW - 56, 118, 12, 10);
  ui.beginPath(); ui.moveTo(UW - 50, 138); ui.lineTo(UW - 50, 108); ui.moveTo(UW - 60, 117); ui.lineTo(UW - 50, 107); ui.lineTo(UW - 40, 117); ui.stroke();
  avatar(82, 236, 44, 'D');
  ui.fillStyle = '#fff'; ui.font = `700 40px ${SF}`; ui.fillText(CALL.name, 146, 222);
  ui.fillStyle = 'rgba(235,235,245,.6)'; ui.font = `400 24px ${SF}`; ui.fillText('Dr. Novák · Today 14:02 · 4:12', 146, 258);
  waveformBar(40, UW - 40, 336, 52, .15 + .7*p, 1.3);
  ui.fillStyle = 'rgba(235,235,245,.6)'; ui.font = `500 20px ${SF}`; ui.fillText(`${Math.floor((.15 + .7*p)*4.2)}:${String(Math.floor(((.15 + .7*p)*252)%60)).padStart(2,'0')}`, 40, 382);
  ui.textAlign = 'right'; ui.fillText('4:12', UW - 40, 382); ui.textAlign = 'left';
  // segmented control
  ui.fillStyle = '#1c1c1e'; rr(40, 414, UW - 80, 54, 14); ui.fill();
  ui.fillStyle = '#3a3a3c'; rr(UW/2 + 2, 418, UW/2 - 46, 46, 11); ui.fill();
  ui.font = `600 22px ${SF}`; ui.textAlign = 'center'; ui.fillStyle = 'rgba(235,235,245,.6)'; ui.fillText('Summary', UW/4 + 20, 442); ui.fillStyle = '#fff'; ui.fillText('Transcript', UW*3/4 - 20, 442); ui.textAlign = 'left';
  // lines, typed in as the call is transcribed; the line being written gets an amber rule
  const total = LINES.reduce((s, l) => s + l[1].length, 0);
  let budget = Math.floor(p*total*1.05), y = 520;
  LINES.forEach(([who, text], i) => {
    if (budget <= 0) return;
    const shown = text.slice(0, Math.min(text.length, budget)), active = budget < text.length; budget -= text.length;
    ui.font = `400 30px ${SF}`; const lines = wrap(text, UW - 150), shownLines = wrap(shown, UW - 150);
    if (active){ ui.fillStyle = AMB; rr(40, y - 16, 4, 52 + lines.length*40, 2); ui.fill(); }
    ui.fillStyle = 'rgba(235,235,245,.35)'; ui.font = `500 19px ${SF}`; ui.fillText(LINE_T[i], 58, y);
    ui.fillStyle = who === 'You' ? '#8fb4ff' : AMB; ui.font = `600 21px ${SF}`; ui.fillText(who, 118, y);
    ui.fillStyle = '#fff'; ui.font = `400 30px ${SF}`; shownLines.forEach((l, j) => ui.fillText(l, 118, y + 42 + j*40));
    y += 42 + lines.length*40 + 30;
  });
}
// Ask Recents: one question, answered from everything it has seen: the call, the clinic's SMS, the confirmation email
const ANSWER_TEXT = 'Floss every night, especially on the left side. Your next cleaning is on March 3 at 9:30.';
const SOURCES = [
  ['call', 'Call · Dentist', '“…especially on the left side.”  2:31'],
  ['sms',  'Notification · Messages', 'Clinic Novák: Reminder, cleaning Mar 3 9:30'],
  ['mail', 'Gmail · Appointment confirmed', 'recepce@zubninovak.cz · Feb 12']
];
function srcIcon(kind, x, y){
  ui.fillStyle = 'rgba(255,181,71,.16)'; ui.beginPath(); ui.arc(x, y, 28, 0, Math.PI*2); ui.fill();
  ui.strokeStyle = AMB; ui.fillStyle = AMB; ui.lineWidth = 3; ui.lineJoin = 'round'; ui.lineCap = 'round';
  if (kind === 'call'){ ui.save(); ui.translate(x - 13, y - 13); ui.scale(26/24, 26/24); ui.fill(new Path2D('M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z')); ui.restore(); }
  else if (kind === 'sms'){ ui.beginPath(); ui.ellipse(x, y - 2, 14, 11, 0, 0, Math.PI*2); ui.fill(); ui.beginPath(); ui.moveTo(x - 8, y + 5); ui.lineTo(x - 12, y + 13); ui.lineTo(x - 2, y + 8); ui.fill(); }
  else { rr(x - 14, y - 10, 28, 20, 3); ui.stroke(); ui.beginPath(); ui.moveTo(x - 13, y - 8); ui.lineTo(x, y + 2); ui.lineTo(x + 13, y - 8); ui.stroke(); }
}
function drawAsk(p, t){
  recentsNav('Ask Recents');
  const M = 40, maxW = UW - 2*M;
  const typedK = clamp01(p/.34), sendK = smooth(.34, .44, p), ansK = clamp01((p - .44)/.3);
  ui.font = `400 30px ${SF}`;
  // the question: typed in the field, then lifted into a bubble at the top right
  const n = Math.floor(typedK*QUERY.length), typed = QUERY.slice(0, n), qw = ui.measureText(QUERY).width + 52;
  if (sendK > 0){
    const by = lerp(UH - 150, 196, outBack(sendK)), bx = UW - M - qw;
    ui.globalAlpha = Math.min(1, sendK*2);
    ui.fillStyle = AMB; rr(bx, by, qw, 66, 33); ui.fill();
    ui.fillStyle = '#1a1205'; ui.fillText(QUERY, bx + 26, by + 34);
    ui.globalAlpha = 1;
  }
  // the answer, typed out, wrapped inside both margins
  let y = 318;
  if (ansK > 0){
    ui.fillStyle = AMB; ui.font = `600 21px ${SF}`; ui.fillText('✦  RECENTS', M, y);
    ui.font = `500 33px ${SF}`; ui.fillStyle = '#fff';
    const lines = wrap(ANSWER_TEXT, maxW); let left = Math.floor(ansK*ANSWER_TEXT.length);
    lines.forEach((l, i) => { const s = l.slice(0, Math.max(0, left)); left -= l.length + 1; ui.fillText(s, M, y + 52 + i*46); });
    y += 52 + lines.length*46 + 30;
  }
  // where it came from: a call, a notification, an email
  SOURCES.forEach(([kind, title, sub], i) => {
    const k = smooth(.74 + i*.06, .8 + i*.06, p); if (k <= 0) return;
    const ry = y + 34 + i*104 + (1 - k)*20;
    ui.globalAlpha = k;
    if (i === 0){ ui.fillStyle = 'rgba(235,235,245,.45)'; ui.font = `600 19px ${SF}`; ui.letterSpacing = '2px'; ui.fillText('FROM', M, y + 4); ui.letterSpacing = '0px'; }
    ui.fillStyle = '#1c1c1e'; rr(M, ry, maxW, 90, 22); ui.fill();
    srcIcon(kind, M + 46, ry + 45);
    ui.fillStyle = '#fff'; ui.font = `600 24px ${SF}`; ui.fillText(title, M + 92, ry + 32);
    ui.fillStyle = 'rgba(235,235,245,.6)'; ui.font = `400 21px ${SF}`;
    let s = sub; while (ui.measureText(s).width > maxW - 112 && s.length > 4) s = s.slice(0, -2); if (s !== sub) s = s.trimEnd() + '…';
    ui.fillText(s, M + 92, ry + 62);
    ui.globalAlpha = 1;
  });
  // input field
  ui.fillStyle = '#1c1c1e'; rr(36, UH - 150, UW - 72, 70, 35); ui.fill();
  ui.font = `400 30px ${SF}`;
  const field = sendK > .05 ? '' : typed;
  ui.fillStyle = field ? '#fff' : 'rgba(235,235,245,.35)'; ui.fillText(field || 'Ask your calls, messages, mail…', 68, UH - 114);
  if (sendK < .05 && n < QUERY.length && Math.floor(t*2)%2 === 0){ const w = ui.measureText(typed).width; ui.fillStyle = AMB; ui.fillRect(70 + w, UH - 132, 3, 36); }
  ui.fillStyle = field ? AMB : '#2c2c2e'; ui.beginPath(); ui.arc(UW - 74, UH - 115, 24, 0, Math.PI*2); ui.fill();
  ui.strokeStyle = field ? '#1a1205' : 'rgba(235,235,245,.6)'; ui.lineWidth = 3.4; ui.beginPath(); ui.moveTo(UW - 74, UH - 104); ui.lineTo(UW - 74, UH - 126); ui.moveTo(UW - 84, UH - 116); ui.lineTo(UW - 74, UH - 126); ui.lineTo(UW - 64, UH - 116); ui.stroke();
}
// ---------- Internát, the student app: going out without the paper book ----------
// Story: Petr is in (the door chip saw him at 16:42). He's due back by 18:00 tonight. He asks to stay out until
// 22:00, picks Mom, sends it. Mom approves on her phone, the notification lands, tonight's card updates.
// Look: the brand's own colours from its icon (deep navy and mint), native iOS type and controls, one strong card
// for tonight instead of a stack of boxes.
const NAVY = '#0e2748', NAVY2 = '#15406c', MINT = '#4fe0a0', MINT_D = '#13a067', TXT = '#0b1726', SUB = '#6b7686', SEP = 'rgba(15,35,60,.08)';
const IN_ICON = new Image(); IN_ICON.onload = () => { uiKey = ''; }; IN_ICON.src = '/media/internat-icon.png';
// SF-style line glyphs, drawn at (x, y) centre in a box of size s
function inGlyph(kind, x, y, s, col){
  const g = ui; g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = s*.1; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  if (kind === 'door'){ g.roundRect(x - s*.26, y - s*.4, s*.52, s*.8, s*.06); g.stroke(); g.beginPath(); g.arc(x + s*.12, y + s*.02, s*.05, 0, Math.PI*2); g.fill(); }
  else if (kind === 'out'){ g.moveTo(x - s*.32, y); g.lineTo(x + s*.3, y); g.moveTo(x + s*.1, y - s*.2); g.lineTo(x + s*.3, y); g.lineTo(x + s*.1, y + s*.2); g.stroke(); g.beginPath(); g.moveTo(x - s*.05, y - s*.4); g.lineTo(x - s*.38, y - s*.4); g.lineTo(x - s*.38, y + s*.4); g.lineTo(x - s*.05, y + s*.4); g.stroke(); }
  else if (kind === 'moon'){ g.arc(x, y, s*.36, Math.PI*.35, Math.PI*1.65); g.arc(x + s*.16, y - s*.06, s*.3, Math.PI*1.45, Math.PI*.55, true); g.closePath(); g.fill(); }
  else if (kind === 'bag'){ g.roundRect(x - s*.34, y - s*.16, s*.68, s*.52, s*.08); g.stroke(); g.beginPath(); g.moveTo(x - s*.14, y - s*.16); g.lineTo(x - s*.14, y - s*.32); g.lineTo(x + s*.14, y - s*.32); g.lineTo(x + s*.14, y - s*.16); g.stroke(); }
  else if (kind === 'check'){ g.moveTo(x - s*.3, y + s*.02); g.lineTo(x - s*.08, y + s*.24); g.lineTo(x + s*.32, y - s*.2); g.stroke(); }
  else if (kind === 'home'){ g.moveTo(x - s*.38, y - s*.02); g.lineTo(x, y - s*.38); g.lineTo(x + s*.38, y - s*.02); g.moveTo(x - s*.26, y - s*.12); g.lineTo(x - s*.26, y + s*.34); g.lineTo(x + s*.26, y + s*.34); g.lineTo(x + s*.26, y - s*.12); g.stroke(); }
  else if (kind === 'clock'){ g.arc(x, y, s*.38, 0, Math.PI*2); g.stroke(); g.beginPath(); g.moveTo(x, y - s*.2); g.lineTo(x, y); g.lineTo(x + s*.15, y + s*.1); g.stroke(); }
  else if (kind === 'person'){ g.arc(x, y - s*.16, s*.16, 0, Math.PI*2); g.stroke(); g.beginPath(); g.arc(x, y + s*.42, s*.32, Math.PI*1.15, Math.PI*1.85); g.stroke(); }
  else if (kind === 'chev'){ g.moveTo(x - s*.1, y - s*.2); g.lineTo(x + s*.1, y); g.lineTo(x - s*.1, y + s*.2); g.stroke(); }
  g.restore();
}
function inRow(x, y, w, glyph, tint, title, sub, right, chev){
  ui.fillStyle = tint[0]; rr(x + 18, y + 16, 44, 44, 12); ui.fill(); inGlyph(glyph, x + 40, y + 38, 24, tint[1]);
  ui.textAlign = 'left'; ui.textBaseline = 'middle';
  ui.fillStyle = TXT; ui.font = `600 20px ${SF}`; ui.fillText(title, x + 78, y + 27);
  ui.fillStyle = SUB; ui.font = `400 17px ${SF}`; ui.fillText(sub, x + 78, y + 51);
  if (right){ ui.fillStyle = SUB; ui.font = `500 18px ${SF}`; ui.textAlign = 'right'; ui.fillText(right, x + w - (chev ? 44 : 20), y + 38); ui.textAlign = 'left'; }
  if (chev) inGlyph('chev', x + w - 24, y + 38, 22, '#b9c0ca');
}
function inHome(s){
  const M = 26, W = UW - 2*M;
  ui.fillStyle = '#f2f4f7'; ui.fillRect(0, 0, UW, UH);
  statusBar(false, 0);
  ui.textBaseline = 'middle'; ui.textAlign = 'left';
  // large title, the date over it, the avatar
  ui.fillStyle = SUB; ui.font = `600 17px ${SF}`; ui.fillText('MONDAY 5 OCTOBER', M + 2, 116);
  ui.fillStyle = TXT; ui.font = `700 46px ${SF}`; ui.fillText('Tonight', M, 160);
  ui.fillStyle = NAVY; ui.beginPath(); ui.arc(UW - M - 26, 146, 26, 0, Math.PI*2); ui.fill();
  ui.fillStyle = '#fff'; ui.font = `600 18px ${SF}`; ui.textAlign = 'center'; ui.fillText('PK', UW - M - 26, 147); ui.textAlign = 'left';

  // tonight: one navy card with where I am, when I'm due back and the one action that matters
  let y = 206; const H = 340;
  ui.save(); rr(M, y, W, H, 34); ui.clip();
  const g = ui.createLinearGradient(M, y, M + W, y + H); g.addColorStop(0, NAVY); g.addColorStop(1, NAVY2); ui.fillStyle = g; ui.fillRect(M, y, W, H);
  const glow = ui.createRadialGradient(M + W - 40, y + 20, 0, M + W - 40, y + 20, 300); glow.addColorStop(0, 'rgba(79,224,160,.28)'); glow.addColorStop(1, 'rgba(79,224,160,0)'); ui.fillStyle = glow; ui.fillRect(M, y, W, H);
  // the icon's circuit traces, faint, as the card's texture
  ui.strokeStyle = 'rgba(79,224,160,.13)'; ui.lineWidth = 2.4; ui.lineCap = 'round';
  ui.beginPath(); ui.moveTo(M + W*.55, y + H + 10); ui.bezierCurveTo(M + W*.62, y + H*.55, M + W*.98, y + H*.7, M + W*.9, y + 30); ui.stroke();
  ui.beginPath(); ui.moveTo(M + W*.72, y + H + 10); ui.bezierCurveTo(M + W*.76, y + H*.7, M + W*1.05, y + H*.8, M + W + 10, y + H*.42); ui.stroke();
  ui.fillStyle = 'rgba(79,224,160,.3)'; [[.9, 30/H], [.62, .62]].forEach(([u, v]) => { ui.beginPath(); ui.arc(M + W*u, y + H*v, 5, 0, Math.PI*2); ui.fill(); });
  ui.restore();
  // where I am
  const pulse = .5 + .5*Math.sin(s.t*3);
  ui.fillStyle = `rgba(79,224,160,${.28*pulse})`; ui.beginPath(); ui.arc(M + 36, y + 42, 10 + 5*pulse, 0, Math.PI*2); ui.fill();
  ui.fillStyle = MINT; ui.beginPath(); ui.arc(M + 36, y + 42, 7, 0, Math.PI*2); ui.fill();
  ui.fillStyle = '#fff'; ui.font = `600 19px ${SF}`; ui.fillText('In the building', M + 54, y + 43);
  ui.fillStyle = 'rgba(255,255,255,.55)'; ui.font = `500 17px ${SF}`; ui.textAlign = 'right'; ui.fillText('Room 214', M + W - 26, y + 43); ui.textAlign = 'left';
  // due back
  ui.fillStyle = 'rgba(255,255,255,.55)'; ui.font = `600 15px ${SF}`; ui.letterSpacing = '1.6px'; ui.fillText('BACK BY', M + 28, y + 100); ui.letterSpacing = '0px';
  if (s.approved){
    ui.fillStyle = 'rgba(79,224,160,.16)'; rr(M + 112, y + 86, 210, 30, 15); ui.fill();
    inGlyph('check', M + 132, y + 101, 16, MINT);
    ui.fillStyle = MINT; ui.font = `600 15px ${SF}`; ui.fillText('Approved by Mom', M + 148, y + 102);
  }
  ui.fillStyle = '#fff'; ui.font = `300 104px ${SF}`; ui.fillText(s.limit, M + 22, y + 170);
  // time left: a ring
  const left = s.approved ? 5 + 18/60 : 1 + 18/60, frac = s.approved ? .24 : .62, rcx = M + W - 84, rcy = y + 166;
  ui.lineWidth = 9; ui.lineCap = 'round';
  ui.strokeStyle = 'rgba(255,255,255,.12)'; ui.beginPath(); ui.arc(rcx, rcy, 50, 0, Math.PI*2); ui.stroke();
  ui.strokeStyle = s.approved ? MINT : '#ffc36b'; ui.beginPath(); ui.arc(rcx, rcy, 50, -Math.PI/2, -Math.PI/2 + Math.PI*2*(1 - frac)); ui.stroke();
  ui.fillStyle = '#fff'; ui.font = `600 22px ${SF}`; ui.textAlign = 'center'; ui.fillText(`${Math.floor(left)}:${String(Math.round((left % 1)*60)).padStart(2, '0')}`, rcx, rcy - 8);
  ui.fillStyle = 'rgba(255,255,255,.55)'; ui.font = `500 14px ${SF}`; ui.fillText('left', rcx, rcy + 16); ui.textAlign = 'left';
  // the action, or the request in flight
  const by = y + H - 96, bw = W - 44;
  if (s.pending > 0 && !s.approved){
    ui.globalAlpha = s.pending;
    ui.fillStyle = 'rgba(255,255,255,.1)'; rr(M + 22, by, bw, 72, 36); ui.fill();
    ui.fillStyle = '#fff'; ui.font = `600 20px ${SF}`; ui.fillText('Waiting for Mom', M + 52, by + 28);
    for (let d = 0; d < 3; d++){ ui.fillStyle = `rgba(79,224,160,${.3 + .7*Math.max(0, Math.sin(s.t*5 - d*.7))})`; ui.beginPath(); ui.arc(M + 222 + d*13, by + 29, 4, 0, Math.PI*2); ui.fill(); }
    ui.fillStyle = 'rgba(255,255,255,.55)'; ui.font = `400 16px ${SF}`; ui.fillText('Asked to stay out until 22:00', M + 52, by + 52);
    ui.globalAlpha = 1;
  } else {
    const pk = 1 - .05*s.press;
    ui.save(); ui.translate(M + 22 + bw/2, by + 36); ui.scale(pk, pk);
    ui.fillStyle = s.press > 0 ? '#3fcf90' : MINT; rr(-bw/2, -36, bw, 72, 36); ui.fill();
    inGlyph('moon', -96, 0, 26, NAVY);
    ui.fillStyle = NAVY; ui.font = `600 21px ${SF}`; ui.textAlign = 'center'; ui.fillText('Stay out later', 12, 1); ui.textAlign = 'left';
    ui.restore();
  }

  // today, as a native inset list
  y += H + 40;
  ui.fillStyle = TXT; ui.font = `700 24px ${SF}`; ui.fillText('Today', M + 4, y); y += 24;
  const rows = s.approved
    ? [['moon', [ 'rgba(79,224,160,.18)', MINT_D ], 'Out until 22:00', 'Approved by Mom', '17:44'], ['door', ['rgba(14,39,72,.07)', NAVY], 'Checked in', 'Main door · chip', '16:42']]
    : [['door', ['rgba(14,39,72,.07)', NAVY], 'Checked in', 'Main door · chip', '16:42'], ['out', ['rgba(14,39,72,.07)', NAVY], 'Left for school', 'Main door · chip', '07:31']];
  ui.fillStyle = '#fff'; rr(M, y, W, 152, 22); ui.fill();
  rows.forEach(([gl, tint, t1, t2, tm], i) => { inRow(M, y + i*76, W, gl, tint, t1, t2, tm, false); if (!i){ ui.fillStyle = SEP; ui.fillRect(M + 78, y + 76, W - 78, 1.4); } });
  y += 152 + 40;
  ui.fillStyle = TXT; ui.font = `700 24px ${SF}`; ui.fillText('This week', M + 4, y); y += 24;
  ui.fillStyle = '#fff'; rr(M, y, W, 152, 22); ui.fill();
  inRow(M, y, W, 'bag', ['rgba(14,39,72,.07)', NAVY], 'Going home', 'Friday, after school', 'Fri', true);
  ui.fillStyle = SEP; ui.fillRect(M + 78, y + 76, W - 78, 1.4);
  inRow(M, y + 76, W, 'home', ['rgba(14,39,72,.07)', NAVY], 'Weekend stay', 'Staying in Prague?', '', true);

  // the floating glass tab bar
  const tb = UH - 132, tw = 330, tx = UW/2 - tw/2;
  ui.save(); ui.shadowColor = 'rgba(14,39,72,.14)'; ui.shadowBlur = 30; ui.shadowOffsetY = 8;
  ui.fillStyle = 'rgba(255,255,255,.92)'; rr(tx, tb, tw, 76, 38); ui.fill(); ui.restore();
  ui.strokeStyle = 'rgba(14,39,72,.06)'; ui.lineWidth = 1.2; rr(tx, tb, tw, 76, 38); ui.stroke();
  ui.fillStyle = 'rgba(14,39,72,.07)'; rr(tx + 6, tb + 6, 106, 64, 32); ui.fill();
  [['moon', 'Tonight'], ['clock', 'History'], ['person', 'Profile']].forEach(([gl, lb], i) => {
    const cx = tx + 59 + i*106, on = i === 0, col = on ? NAVY : '#8a93a0';
    inGlyph(gl, cx, tb + 30, 24, col);
    ui.fillStyle = col; ui.font = `${on ? 600 : 500} 13px ${SF}`; ui.textAlign = 'center'; ui.fillText(lb, cx, tb + 58); ui.textAlign = 'left';
  });
}
// an iOS wheel picker: the selection band, the hours turning, ":00" fixed
function inWheel(cx, cy, hourF){
  const A = ui.globalAlpha;
  ui.fillStyle = '#eef1f5'; rr(cx - 200, cy - 32, 400, 64, 16); ui.fill();
  ui.save(); ui.beginPath(); ui.rect(cx - 210, cy - 150, 420, 300); ui.clip();
  for (let k = -3; k <= 3; k++){
    const hv = Math.round(hourF) + k, off = (hv - hourF)*58, a = Math.max(0, 1 - Math.abs(off)/170);
    if (a <= 0) continue;
    const near = Math.abs(off) < 29, sc = 1 - Math.min(.3, Math.abs(off)/400);
    ui.globalAlpha = a*A; ui.fillStyle = near ? TXT : '#a7aeb8'; ui.font = `${near ? 500 : 400} ${Math.round(40*sc)}px ${SF}`; ui.textAlign = 'center';
    ui.fillText(String(((hv % 24) + 24) % 24).padStart(2, '0'), cx - 56, cy + off + 2);
  }
  ui.globalAlpha = A; ui.fillStyle = TXT; ui.font = `500 40px ${SF}`; ui.textAlign = 'center'; ui.fillText(':', cx, cy); ui.fillText('00', cx + 56, cy + 2);
  ui.restore(); ui.textAlign = 'left';
}
function drawInternat(p, t){
  const s = { t, press: smooth(.08, .1, p)*(1 - smooth(.12, .14, p)), approved: p > .74, pending: p > .54 && p <= .74 ? smooth(.54, .58, p) : 0 };
  s.limit = s.approved ? '22:00' : '18:00';
  inHome(s);
  // the sheet: pick a time, pick who approves, send; it turns into a confirmation, then slides away
  const up = smooth(.13, .19, p), down = smooth(.5, .54, p), sheet = up*(1 - down);
  if (sheet > 0){
    ui.fillStyle = `rgba(8,18,34,${.36*sheet})`; ui.fillRect(0, 0, UW, UH);
    const H = 760, y0 = UH - H*outBack(Math.min(1, sheet*1.02)) + 20;
    ui.save(); ui.shadowColor = 'rgba(0,0,0,.18)'; ui.shadowBlur = 40; ui.fillStyle = '#fff'; rr(0, y0, UW, H + 60, 44); ui.fill(); ui.restore();
    ui.fillStyle = '#d3d8df'; rr(UW/2 - 26, y0 + 12, 52, 6, 3); ui.fill();
    const sent = smooth(.44, .47, p);
    ui.globalAlpha = 1 - sent;
    ui.textBaseline = 'middle';
    ui.fillStyle = NAVY; ui.font = `400 20px ${SF}`; ui.fillText('Cancel', 30, y0 + 58);
    ui.fillStyle = TXT; ui.font = `600 22px ${SF}`; ui.textAlign = 'center'; ui.fillText('Stay out later', UW/2, y0 + 58);
    ui.fillStyle = SUB; ui.font = `400 18px ${SF}`; ui.fillText('Mom or Dad approves it on their phone.', UW/2, y0 + 112); ui.textAlign = 'left';
    inWheel(UW/2, y0 + 262, 18 + 4*easeIO(clamp01((p - .2)/.13)));
    // segmented control
    const sx = 30, sw = UW - 60, sy = y0 + 420;
    ui.fillStyle = SUB; ui.font = `600 15px ${SF}`; ui.letterSpacing = '1.2px'; ui.fillText('WHO APPROVES', sx + 4, sy - 22); ui.letterSpacing = '0px';
    ui.fillStyle = '#eef1f5'; rr(sx, sy, sw, 58, 14); ui.fill();
    ui.save(); ui.shadowColor = 'rgba(14,39,72,.14)'; ui.shadowBlur = 10; ui.shadowOffsetY = 2; ui.fillStyle = '#fff'; rr(sx + 4, sy + 4, sw/2 - 4, 50, 11); ui.fill(); ui.restore();
    ui.font = `600 19px ${SF}`; ui.textAlign = 'center'; ui.fillStyle = TXT; ui.fillText('Mom', sx + sw/4 + 2, sy + 30); ui.fillStyle = SUB; ui.font = `500 19px ${SF}`; ui.fillText('Dad', sx + sw*.75, sy + 30);
    ui.fillStyle = SUB; ui.font = `400 16px ${SF}`; ui.fillText('No arrivals between 1:00 and 5:00.', UW/2, sy + 96); ui.textAlign = 'left';
    const sp = smooth(.4, .42, p)*(1 - smooth(.43, .45, p));
    ui.save(); ui.translate(UW/2, y0 + 610); ui.scale(1 - .04*sp, 1 - .04*sp);
    ui.fillStyle = sp > 0 ? NAVY2 : NAVY; rr(-(UW - 60)/2, -36, UW - 60, 72, 36); ui.fill(); ui.fillStyle = '#fff'; ui.font = `600 21px ${SF}`; ui.textAlign = 'center'; ui.fillText('Send to Mom', 0, 1); ui.restore(); ui.textAlign = 'left';
    ui.globalAlpha = sent;
    if (sent > 0){
      const cy = y0 + 250, k = outBack(sent);
      ui.fillStyle = MINT; ui.beginPath(); ui.arc(UW/2, cy, 58*k, 0, Math.PI*2); ui.fill();
      inGlyph('check', UW/2, cy, 54*k, NAVY);
      ui.fillStyle = TXT; ui.font = `700 32px ${SF}`; ui.textAlign = 'center'; ui.fillText('Sent to Mom', UW/2, cy + 116);
      ui.fillStyle = SUB; ui.font = `400 19px ${SF}`; ui.fillText('You’ll get a notification when she answers.', UW/2, cy + 156); ui.textAlign = 'left';
    }
    ui.globalAlpha = 1;
  }
  // Mom approves: an iOS notification drops in under the Dynamic Island, with the app's real icon
  const nK = smooth(.68, .73, p)*(1 - smooth(.88, .93, p));
  if (nK > 0){
    const y = lerp(-170, 88, outBack(nK));
    ui.save(); ui.shadowColor = 'rgba(14,39,72,.2)'; ui.shadowBlur = 36; ui.shadowOffsetY = 10;
    ui.fillStyle = 'rgba(250,251,253,.96)'; rr(18, y, UW - 36, 128, 34); ui.fill(); ui.restore();
    ui.fillStyle = '#fff'; rr(40, y + 30, 66, 66, 16); ui.fill();
    if (IN_ICON.complete && IN_ICON.naturalWidth){ ui.save(); rr(40, y + 30, 66, 66, 16); ui.clip(); ui.drawImage(IN_ICON, 33, y + 23, 80, 80); ui.restore(); }
    ui.strokeStyle = 'rgba(14,39,72,.08)'; ui.lineWidth = 1; rr(40, y + 30, 66, 66, 16); ui.stroke();
    ui.textBaseline = 'middle';
    ui.fillStyle = TXT; ui.font = `600 20px ${SF}`; ui.fillText('Mom approved', 124, y + 46);
    ui.fillStyle = SUB; ui.font = `400 16px ${SF}`; ui.textAlign = 'right'; ui.fillText('now', UW - 44, y + 46); ui.textAlign = 'left';
    ui.fillStyle = '#2b3646'; ui.font = `400 19px ${SF}`; ui.fillText('You can stay out until 22:00.', 124, y + 80);
  }
}
// ---------- Wear Close, the real flow ----------
// You're on the home screen, you bring the phone to your bracelet, iOS reads its NFC tag in the background and offers
// "Open in Wear Close". Tap it, and the app opens on Zuzka: send a pulse, with a photo and a note if you like. It
// lands on her bracelet's phone, and the moment is kept in Memories (with her pulses, a capsule she left, milestones).
const WC = { cream:'#f4eee4', ink:'#1b1714', stone:'#6e645b', mute:'#a39889', line:'#e3d9cb', pulse:'#c4473c', shell:'#ebe2d4' };
// the photo that goes with the pulse: a sunset over water (no faces; it's somebody's evening, not a stock person)
const WC_PHOTO = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 320; const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 205); sky.addColorStop(0, '#f6cba8'); sky.addColorStop(.6, '#e8907b'); sky.addColorStop(1, '#a0718f'); g.fillStyle = sky; g.fillRect(0, 0, 320, 205);
  g.fillStyle = '#ffe3b9'; g.beginPath(); g.arc(205, 176, 32, 0, Math.PI*2); g.fill();
  const sea = g.createLinearGradient(0, 205, 0, 320); sea.addColorStop(0, '#7d5f80'); sea.addColorStop(1, '#3c3450'); g.fillStyle = sea; g.fillRect(0, 205, 320, 115);
  g.fillStyle = 'rgba(255,216,172,.5)'; for (let i = 0; i < 9; i++) g.fillRect(205 - 28 - (9 - i)*2 + Math.sin(i*1.7)*8, 212 + i*11, 56 + (9 - i)*4, 3);
  g.fillStyle = '#4b3b4d'; g.beginPath(); g.moveTo(0, 205); g.quadraticCurveTo(70, 158, 150, 205); g.closePath(); g.fill();
  return c;
})();
const WC_NOTE = 'Miss you already';
function wcIcon(kind, x, y, s, col){
  const g = ui; g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = s*.09; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  if (kind === 'mood'){ g.arc(x, y, s*.38, 0, Math.PI*2); g.stroke(); g.beginPath(); g.arc(x, y + s*.04, s*.2, Math.PI*.15, Math.PI*.85); g.stroke(); g.beginPath(); g.arc(x - s*.13, y - s*.1, s*.04, 0, Math.PI*2); g.arc(x + s*.13, y - s*.1, s*.04, 0, Math.PI*2); g.fill(); }
  else if (kind === 'photo'){ g.roundRect(x - s*.4, y - s*.3, s*.8, s*.6, s*.08); g.stroke(); g.beginPath(); g.moveTo(x - s*.32, y + s*.2); g.lineTo(x - s*.06, y - s*.06); g.lineTo(x + s*.1, y + s*.1); g.lineTo(x + s*.2, y); g.lineTo(x + s*.32, y + s*.2); g.stroke(); g.beginPath(); g.arc(x + s*.18, y - s*.14, s*.06, 0, Math.PI*2); g.fill(); }
  else if (kind === 'note'){ for (let i = 0; i < 3; i++){ g.moveTo(x - s*.32, y - s*.2 + i*s*.2); g.lineTo(x + s*(i === 2 ? .1 : .32), y - s*.2 + i*s*.2); } g.stroke(); }
  else if (kind === 'voice'){ g.roundRect(x - s*.12, y - s*.38, s*.24, s*.46, s*.12); g.stroke(); g.beginPath(); g.arc(x, y - s*.06, s*.26, Math.PI*.1, Math.PI*.9); g.stroke(); g.beginPath(); g.moveTo(x, y + s*.2); g.lineTo(x, y + s*.36); g.stroke(); }
  else if (kind === 'lock'){ g.roundRect(x - s*.28, y - s*.04, s*.56, s*.42, s*.06); g.fill(); g.beginPath(); g.arc(x, y - s*.08, s*.18, Math.PI, 0); g.stroke(); }
  else if (kind === 'star'){ for (let i = 0; i < 10; i++){ const a = -Math.PI/2 + i*Math.PI/5, r = i % 2 ? s*.16 : s*.38; g.lineTo(x + Math.cos(a)*r, y + Math.sin(a)*r); } g.closePath(); g.fill(); }
  g.restore();
}
function wcThumb(x, y, w, r){ ui.save(); rr(x, y, w, w, r); ui.clip(); ui.drawImage(WC_PHOTO, x, y, w, w); ui.restore(); }
// the send screen. p: 0 opened → attach a photo → write a note → send → it travels → delivered
function drawWear(p, t){
  const g = ui, M = 30, W = UW - 2*M;
  g.fillStyle = WC.cream; g.fillRect(0, 0, UW, UH);
  statusBar(false, 0);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  wcMark(g, UW/2, 116, 18);
  g.fillStyle = WC.ink; g.font = `300 84px ${SERIF}`; g.fillText('Zuzka', UW/2, 206);
  g.fillStyle = WC.stone; g.font = `400 21px ${SF}`; g.fillText('286 km away · 412 days together', UW/2, 262);
  // the pulse
  const cx = UW/2, cy = 500, sendK = smooth(.6, .64, p), sending = p > .64 && p < .86, done = smooth(.84, .9, p);
  if (sending){ const k = (t*1.3) % 1; for (let i = 0; i < 3; i++){ const kk = (k + i/3) % 1; g.strokeStyle = `rgba(196,71,60,${(1 - kk)*.5})`; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 140 + kk*120, 0, Math.PI*2); g.stroke(); } }
  g.strokeStyle = WC.ink; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 150, 0, Math.PI*2); g.stroke();
  const beat = sending ? 1 + .06*Math.max(0, Math.sin(t*8)) : 1;
  g.fillStyle = done > 0 ? WC.pulse : WC.shell; g.beginPath(); g.arc(cx, cy, 116*beat, 0, Math.PI*2); g.fill();
  g.fillStyle = done > 0 ? '#fff' : WC.pulse; heart2d(g, cx, cy + 8, 50*beat);
  g.fillStyle = WC.ink; g.font = `400 24px ${SF}`;
  g.fillText(done > 0 ? 'Zuzka felt it.' : sending ? 'Sending your pulse…' : 'Send Zuzka a pulse', cx, 700);
  // what can go with it
  const chips = [['mood', 'Mood'], ['photo', 'Photo'], ['note', 'Note'], ['voice', 'Voice']], cw = (W - 3*12)/4;
  const pressPhoto = smooth(.1, .13, p)*(1 - smooth(.16, .19, p)), pressNote = smooth(.32, .35, p)*(1 - smooth(.38, .41, p));
  chips.forEach(([k, lb], i) => {
    const x = M + i*(cw + 12), y = 760, on = (k === 'photo' && p > .14) || (k === 'note' && p > .36), pr = k === 'photo' ? pressPhoto : k === 'note' ? pressNote : 0;
    g.save(); g.translate(x + cw/2, y + 52); g.scale(1 - .06*pr, 1 - .06*pr); g.translate(-(x + cw/2), -(y + 52));
    g.fillStyle = on ? WC.ink : '#fff'; rr(x, y, cw, 104, 26); g.fill();
    if (!on){ g.strokeStyle = WC.line; g.lineWidth = 1.5; rr(x, y, cw, 104, 26); g.stroke(); }
    wcIcon(k, x + cw/2, y + 40, 34, on ? '#fff' : WC.ink);
    g.fillStyle = on ? '#fff' : WC.stone; g.font = `500 18px ${SF}`; g.fillText(lb, x + cw/2, y + 80);
    g.restore();
  });
  // attached: the photo, then the note being written
  const ph = smooth(.16, .26, p), noteN = Math.floor(clamp01((p - .4)/.14)*WC_NOTE.length);
  if (ph > 0){
    g.globalAlpha = ph; const y = 900 + (1 - ph)*20;
    wcThumb(M, y, 108, 20);
    if (p > .36){
      g.fillStyle = '#fff'; rr(M + 124, y, W - 124, 108, 20); g.fill(); g.strokeStyle = WC.line; g.lineWidth = 1.5; rr(M + 124, y, W - 124, 108, 20); g.stroke();
      g.textAlign = 'left'; g.fillStyle = noteN ? WC.ink : WC.mute; g.font = `400 23px ${SF}`;
      const txt = noteN ? WC_NOTE.slice(0, noteN) : 'Add a note'; g.fillText(txt, M + 148, y + 54);
      if (p < .6 && Math.floor(t*2) % 2 === 0){ g.fillStyle = WC.pulse; g.fillRect(M + 148 + g.measureText(noteN ? txt : '').width + 3, y + 38, 2.5, 32); }
      g.textAlign = 'center';
    }
    g.globalAlpha = 1;
  }
  // send
  const by = 1100, bw = W;
  if (p < .64){
    g.save(); g.translate(UW/2, by + 42); g.scale(1 - .04*sendK*(1 - smooth(.62, .64, p)), 1 - .04*sendK*(1 - smooth(.62, .64, p)));
    g.fillStyle = WC.ink; rr(-bw/2, -42, bw, 84, 42); g.fill();
    g.fillStyle = '#fff'; heart2d(g, -78, 4, 15); g.font = `600 23px ${SF}`; g.fillText('Send pulse', 14, 1);
    g.restore();
  } else {
    // quiet confirmation in the app's ink; the brand's red is only for the heartbeat itself
    g.fillStyle = WC.stone; g.font = `500 20px ${SF}`;
    g.fillText(done > 0 ? 'Delivered with a photo and a note' : 'On its way to Zuzka', UW/2, by + 42);
  }
  g.textAlign = 'left';
}
// Memories: the relationship as it builds up from the bracelets. q: 0 pushed in from the send screen → today's entry lands
function drawMemories(q, t){
  const g = ui, M = 30, W = UW - 2*M;
  g.fillStyle = WC.cream; g.fillRect(0, 0, UW, UH);
  statusBar(false, 0);
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = WC.stone; g.font = `400 21px ${SF}`; g.fillText('‹ Zuzka', M, 118);
  g.fillStyle = WC.ink; g.font = `300 64px ${SERIF}`; g.fillText('Memories', M, 192);
  g.fillStyle = WC.stone; g.font = `400 19px ${SF}`; g.fillText('412 days · 1,284 pulses · 37 photos', M + 2, 242);
  // first the list opens a gap at the top, then today's entry drops into it
  const drop = 132*smooth(.1, .3, q), land = outBack(smooth(.3, .5, q));
  const label = (txt, y) => { g.fillStyle = WC.mute; g.font = `600 15px ${SF}`; g.letterSpacing = '2px'; g.fillText(txt, M + 2, y); g.letterSpacing = '0px'; };
  const card = (y, lead, title, sub, time) => {
    g.fillStyle = '#fff'; rr(M, y, W, 112, 26); g.fill(); g.strokeStyle = WC.line; g.lineWidth = 1.5; rr(M, y, W, 112, 26); g.stroke();
    lead(M + 18, y + 18);
    g.fillStyle = WC.ink; g.font = `600 21px ${SF}`; g.fillText(title, M + 128, y + 42);
    g.fillStyle = WC.stone; g.font = `400 18px ${SF}`; g.fillText(sub, M + 128, y + 74);
    g.fillStyle = WC.mute; g.font = `500 17px ${SF}`; g.textAlign = 'right'; g.fillText(time, M + W - 22, y + 42); g.textAlign = 'left';
  };
  const tile = (bg, icon, col) => (x, y) => { g.fillStyle = bg; rr(x, y, 76, 76, 18); g.fill(); if (icon === 'heart'){ g.fillStyle = col; heart2d(g, x + 38, y + 42, 18); } else wcIcon(icon, x + 38, y + 38, 34, col); };
  let y = 300;
  label('TODAY', y);
  if (land > 0){ g.save(); g.globalAlpha = Math.min(1, land); g.translate(0, (1 - land)*-28); card(y + 24, (x, yy) => wcThumb(x, yy, 76, 18), 'You sent a pulse', `“${WC_NOTE}” · with a photo`, '18:42'); g.restore(); }
  y += drop + 40;
  label('YESTERDAY', y); card(y + 24, tile('#f6dcd7', 'heart', WC.pulse), 'Zuzka sent a pulse', 'You were at work', '21:07');
  y += 176;
  label('THIS WEEK', y); card(y + 24, tile(WC.shell, 'lock', WC.ink), 'Zuzka left you a capsule', 'It opens on Friday', 'Tue');
  card(y + 152, tile(WC.shell, 'star', '#b8893a'), 'Your 100th pulse', 'Since 20 August', 'Sun');
  // tab bar
  const tb = UH - 132, tw = 330, tx = UW/2 - tw/2;
  g.save(); g.shadowColor = 'rgba(27,23,20,.12)'; g.shadowBlur = 30; g.shadowOffsetY = 8; g.fillStyle = 'rgba(255,255,255,.94)'; rr(tx, tb, tw, 76, 38); g.fill(); g.restore();
  g.fillStyle = WC.shell; rr(tx + 112, tb + 6, 106, 64, 32); g.fill();
  ['Us', 'Memories', 'Capsules'].forEach((lb, i) => { g.fillStyle = i === 1 ? WC.ink : WC.mute; g.font = `${i === 1 ? 600 : 500} 16px ${SF}`; g.textAlign = 'center'; g.fillText(lb, tx + 59 + i*106, tb + 39); });
  g.textAlign = 'left';
}
// the system's NFC notification on the home screen; tapped, it opens into the app (p: in, held, tapped, opened)
const SNAP_D = document.createElement('canvas'); SNAP_D.width = UW; SNAP_D.height = UH;
function drawNfc(p){
  HOME.pressed = ''; drawHome(0);
  const inK = smooth(0, .18, p), press = smooth(.42, .47, p)*(1 - smooth(.53, .58, p)), open = easeIO(smooth(.58, 1, p));
  const by = lerp(-170, 88, outBack(inK));
  let x = 18, y = by, w = UW - 36, h = 128, r = 34;
  x = lerp(x, 0, open); y = lerp(y, 0, open); w = lerp(w, UW, open); h = lerp(h, UH, open); r = lerp(r, 55*PT, open);
  ui.save();
  if (press > 0){ ui.translate(UW/2, by + 64); ui.scale(1 - .03*press, 1 - .03*press); ui.translate(-UW/2, -(by + 64)); }
  ui.shadowColor = 'rgba(0,0,0,.25)'; ui.shadowBlur = 36; ui.shadowOffsetY = 10;
  ui.fillStyle = `rgba(${Math.round(250 - 18*press)},${Math.round(250 - 18*press)},${Math.round(252 - 18*press)},.96)`; rr(x, y, w, h, r); ui.fill();
  ui.restore();
  if (open > 0){ ui.save(); rr(x, y, w, h, r); ui.clip(); ui.globalAlpha = smooth(.6, .82, p); ui.drawImage(SNAP_D, 0, 0); ui.restore(); ui.globalAlpha = 1; }
  const ca = 1 - smooth(.58, .66, p);
  if (ca > 0){
    ui.globalAlpha = ca; ui.textBaseline = 'middle'; ui.textAlign = 'left';
    ui.fillStyle = WC.cream; rr(40, by + 31, 66, 66, 16); ui.fill(); wcMark(ui, 73, by + 64, 26);
    ui.fillStyle = '#1c1c1e'; ui.font = `600 20px ${SF}`; ui.fillText('NFC Tag', 124, by + 46);
    ui.fillStyle = '#8e8e93'; ui.font = `400 16px ${SF}`; ui.textAlign = 'right'; ui.fillText('now', UW - 44, by + 46); ui.textAlign = 'left';
    ui.fillStyle = '#2c2c2e'; ui.font = `400 19px ${SF}`; ui.fillText('Open in Wear Close', 124, by + 80);
    ui.globalAlpha = 1;
  }
}
function drawPulse(stateP, t){
  ui.fillStyle = '#f3efe8'; ui.fillRect(0,0,600,UH);
  statusBar(false, 0);
  ui.textAlign = 'center'; ui.fillStyle = '#7d776c'; ui.font = `500 21px ${SF}`;
  ui.letterSpacing = '6px'; ui.fillText('WEAR CLOSE', 303, 170); ui.letterSpacing = '0px';
  ui.fillStyle = '#1b1a18'; ui.font = `300 92px ${SERIF}`; ui.fillText('Zuzka', 300, 310);
  ui.fillStyle = '#8a8478'; ui.font = `400 24px ${SF}`; ui.fillText('286 km away', 300, 366);
  const cx = 300, cy = 660;
  if (stateP >= 1){
    const k = stateP >= 2 ? 0 : (t*1.4)%1;
    for (let i=0;i<3;i++){ const kk = (k + i/3)%1; ui.strokeStyle = `rgba(201,116,98,${(1-kk)*.6})`; ui.lineWidth = 3; ui.beginPath(); ui.arc(cx,cy,150+kk*130,0,Math.PI*2); ui.stroke(); }
  }
  ui.strokeStyle = '#1b1a18'; ui.lineWidth = 2; ui.beginPath(); ui.arc(cx,cy,170,0,Math.PI*2); ui.stroke();
  ui.fillStyle = stateP >= 2 ? '#c97462' : '#e6dfd2'; ui.beginPath(); ui.arc(cx,cy,132,0,Math.PI*2); ui.fill();
  ui.fillStyle = stateP >= 2 ? '#fff' : '#1b1a18'; heart2d(ui, cx, cy+8, 58);
  ui.fillStyle = '#1b1a18'; ui.font = `400 27px ${SF}`;
  ui.fillText(stateP >= 2 ? 'Zuzka felt it.' : stateP >= 1 ? 'Sending your pulse…' : 'Bring your phone to your bracelet', 300, 960);
  ui.fillStyle = '#8a8478'; ui.font = `400 22px ${SF}`; ui.fillText('412 days together', 300, 1150);
  ui.textAlign = 'left';
}
// ---------- iOS home screen, and the go-home → open-app transition ----------
const SNAP_A = document.createElement('canvas'), SNAP_B = document.createElement('canvas');
SNAP_A.width = SNAP_B.width = UW; SNAP_A.height = SNAP_B.height = UH;
function snapshot(canvas, draw){ const keep = ui; ui = canvas.getContext('2d'); ui.save(); draw(); ui.restore(); ui = keep; }
const HOME = { cols:[96, 233, 368, 504], top:250, rowH:168, icon:96, pressed:'wear' };
const APPS = [
  ['Recents','recents'], ['Wear Close','wear'], ['Internát','internat'], ['Photos','photos'],
  ['Clock','clock'], ['Weather','weather'], ['Maps','maps'], ['Notes','notes'],
  ['Camera','camera'], ['Settings','settings'], ['Wallet','wallet'], ['Health','health']
];
const DOCK = ['phone','safari','messages','music'];
function appIcon(kind, x, y, s){
  const g = ui, r = s*.225;
  const fill = (c) => { g.fillStyle = c; rr(x - s/2, y - s/2, s, s, r); g.fill(); };
  const grad = (a, b) => { const gr = g.createLinearGradient(0, y - s/2, 0, y + s/2); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
  g.save();
  switch (kind){
    case 'recents': fill('#121316'); g.fillStyle = '#ffb547'; for (let i=0;i<7;i++){ const h = s*(.12 + .3*Math.abs(Math.sin(i*1.9 + 1))); rr(x - s*.3 + i*s*.1, y - h/2, s*.055, h, s*.03); g.fill(); } break;
    case 'internat': fill('#ffffff'); if (IN_ICON.complete && IN_ICON.naturalWidth){ g.save(); rr(x - s/2, y - s/2, s, s, r); g.clip(); g.drawImage(IN_ICON, x - s*.62, y - s*.62, s*1.24, s*1.24); g.restore(); } break; // the real icon (~/Downloads/internat.png)
    case 'wear': fill('#f3ece2'); wcMark(g, x, y, s*.42); break; // the app icon: the mark on a cream tile, 42% tall
    case 'cal': fill('#ffffff'); g.fillStyle = '#ff3b30'; g.font = `600 ${s*.15}px ${SF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SUN', x, y - s*.26); g.fillStyle = '#111'; g.font = `300 ${s*.48}px ${SF}`; g.fillText('5', x, y + s*.1); break;
    case 'photos': fill('#ffffff'); ['#f9b233','#f26b3a','#e5426f','#a54bd2','#4a7cf0','#34b2e4','#4ac57b','#b3d334'].forEach((c,i) => { g.save(); g.translate(x, y); g.rotate(i*Math.PI/4); g.fillStyle = c; g.globalAlpha = .85; g.beginPath(); g.ellipse(0, -s*.17, s*.09, s*.17, 0, 0, Math.PI*2); g.fill(); g.restore(); }); break;
    case 'clock': fill('#111'); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, s*.38, 0, Math.PI*2); g.fill(); g.strokeStyle = '#111'; g.lineWidth = s*.035; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s*.25); g.moveTo(x, y); g.lineTo(x + s*.17, y + s*.06); g.stroke(); g.strokeStyle = '#ff9500'; g.lineWidth = s*.015; g.beginPath(); g.moveTo(x, y + s*.08); g.lineTo(x - s*.05, y - s*.3); g.stroke(); break;
    case 'weather': g.fillStyle = grad('#4aa8ff', '#1f6fe0'); rr(x - s/2, y - s/2, s, s, r); g.fill(); g.fillStyle = '#ffd60a'; g.beginPath(); g.arc(x - s*.1, y - s*.08, s*.17, 0, Math.PI*2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + s*.05, y + s*.12, s*.24, s*.11, 0, 0, Math.PI*2); g.fill(); break;
    case 'maps': fill('#e9f2df'); g.fillStyle = '#8dc96b'; g.fillRect(x - s/2, y - s*.05, s, s*.22); g.fillStyle = '#fff'; g.save(); g.translate(x, y); g.rotate(-.5); g.fillRect(-s*.6, -s*.05, s*1.2, s*.1); g.restore(); g.fillStyle = '#2f80ed'; g.beginPath(); g.moveTo(x + s*.15, y - s*.28); g.lineTo(x + s*.28, y - s*.02); g.lineTo(x + s*.15, y - s*.08); g.lineTo(x + s*.02, y - s*.02); g.closePath(); g.fill(); break;
    case 'notes': fill('#ffffff'); g.fillStyle = '#ffd60a'; g.fillRect(x - s/2, y - s/2, s, s*.24); g.fillStyle = '#d0d0d0'; for (let i=0;i<3;i++) g.fillRect(x - s*.36, y - s*.04 + i*s*.13, s*.72, s*.025); break;
    case 'camera': fill('#d9d9de'); g.fillStyle = '#2b2b2e'; rr(x - s*.34, y - s*.2, s*.68, s*.44, s*.08); g.fill(); g.fillStyle = '#c8c8cd'; g.beginPath(); g.arc(x, y + s*.02, s*.14, 0, Math.PI*2); g.fill(); g.fillStyle = '#2b2b2e'; g.beginPath(); g.arc(x, y + s*.02, s*.09, 0, Math.PI*2); g.fill(); break;
    case 'settings': g.fillStyle = grad('#8e8e93', '#5c5c62'); rr(x - s/2, y - s/2, s, s, r); g.fill(); g.fillStyle = '#2c2c2e'; g.beginPath(); for (let i=0;i<16;i++){ const a = i/16*Math.PI*2, rr2 = i%2 ? s*.3 : s*.36; g.lineTo(x + Math.cos(a)*rr2, y + Math.sin(a)*rr2); } g.closePath(); g.fill(); g.fillStyle = '#9b9ba0'; g.beginPath(); g.arc(x, y, s*.13, 0, Math.PI*2); g.fill(); break;
    case 'wallet': fill('#111'); ['#4a90d9','#f5a623','#7ed321','#d0021b'].forEach((c,i) => { g.fillStyle = c; rr(x - s*.34, y - s*.3 + i*s*.09, s*.68, s*.2, s*.04); g.fill(); }); g.fillStyle = '#2c2c2e'; rr(x - s*.36, y + s*.02, s*.72, s*.3, s*.05); g.fill(); break;
    case 'health': fill('#ffffff'); g.fillStyle = '#ff2d55'; heart2d(g, x, y + s*.04, s*.32); break;
    case 'phone': g.fillStyle = grad('#5cf07d', '#29c74b'); rr(x - s/2, y - s/2, s, s, r); g.fill(); g.save(); g.translate(x - s*.3, y - s*.3); g.scale(s*.6/24, s*.6/24); g.fillStyle = '#fff'; g.fill(new Path2D('M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z')); g.restore(); break;
    case 'safari': fill('#ffffff'); g.fillStyle = '#1a8cff'; g.beginPath(); g.arc(x, y, s*.38, 0, Math.PI*2); g.fill(); g.save(); g.translate(x, y); g.rotate(Math.PI/4); g.fillStyle = '#ff3b30'; g.beginPath(); g.moveTo(0, -s*.3); g.lineTo(s*.06, 0); g.lineTo(-s*.06, 0); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, s*.3); g.lineTo(s*.06, 0); g.lineTo(-s*.06, 0); g.fill(); g.restore(); break;
    case 'messages': g.fillStyle = grad('#5cf07d', '#29c74b'); rr(x - s/2, y - s/2, s, s, r); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y - s*.02, s*.32, s*.25, 0, 0, Math.PI*2); g.fill(); g.beginPath(); g.moveTo(x - s*.2, y + s*.12); g.lineTo(x - s*.26, y + s*.28); g.lineTo(x - s*.05, y + s*.18); g.fill(); break;
    case 'music': g.fillStyle = grad('#ff5f6d', '#f72a48'); rr(x - s/2, y - s/2, s, s, r); g.fill(); g.fillStyle = '#fff'; g.fillRect(x + s*.08, y - s*.26, s*.05, s*.4); g.fillRect(x - s*.14, y - s*.2, s*.05, s*.4); g.fillRect(x - s*.14, y - s*.26, s*.27, s*.07); g.beginPath(); g.ellipse(x - s*.19, y + s*.2, s*.09, s*.07, 0, 0, Math.PI*2); g.fill(); g.beginPath(); g.ellipse(x + s*.03, y + s*.14, s*.09, s*.07, 0, 0, Math.PI*2); g.fill(); break;
  }
  // Liquid Glass rim
  const sh = g.createLinearGradient(0, y - s/2, 0, y + s/2); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(.4, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,.12)');
  g.strokeStyle = sh; g.lineWidth = 2; rr(x - s/2 + 1, y - s/2 + 1, s - 2, s - 2, r); g.stroke();
  g.restore();
}
function iconPos(name){ const i = APPS.findIndex(a => a[1] === name); return [HOME.cols[i%4], HOME.top + Math.floor(i/4)*HOME.rowH]; }
function drawHome(press){
  const g = ui;
  const bg = g.createLinearGradient(0, 0, UW*.6, UH); bg.addColorStop(0, '#1b2b5e'); bg.addColorStop(.5, '#3a2a6b'); bg.addColorStop(1, '#0d1430'); g.fillStyle = bg; g.fillRect(0, 0, UW, UH);
  const glow = g.createRadialGradient(UW*.8, UH*.25, 10, UW*.8, UH*.25, UW*.9); glow.addColorStop(0, 'rgba(120,170,255,.55)'); glow.addColorStop(1, 'rgba(120,170,255,0)'); g.fillStyle = glow; g.fillRect(0, 0, UW, UH);
  const glow2 = g.createRadialGradient(UW*.1, UH*.8, 10, UW*.1, UH*.8, UW*.8); glow2.addColorStop(0, 'rgba(255,120,180,.35)'); glow2.addColorStop(1, 'rgba(255,120,180,0)'); g.fillStyle = glow2; g.fillRect(0, 0, UW, UH);
  statusBar(true, 0);
  APPS.forEach(([label, kind], i) => {
    const [x, y] = iconPos(kind), pr = kind === HOME.pressed ? press : 0;
    g.save(); g.translate(x, y); g.scale(1 - .08*pr, 1 - .08*pr); g.translate(-x, -y);
    appIcon(kind, x, y, HOME.icon);
    if (pr > 0){ g.fillStyle = `rgba(0,0,0,${.3*pr})`; rr(x - HOME.icon/2, y - HOME.icon/2, HOME.icon, HOME.icon, HOME.icon*.225); g.fill(); }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.92)'; g.font = `500 19px ${SF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, y + HOME.icon/2 + 22);
  });
  // search pill and the glass dock
  g.fillStyle = 'rgba(255,255,255,.16)'; rr(UW/2 - 70, UH - 262, 140, 44, 22); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `500 20px ${SF}`; g.fillText('Search', UW/2 + 8, UH - 240);
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.4; g.beginPath(); g.arc(UW/2 - 34, UH - 242, 7, 0, Math.PI*2); g.stroke(); g.beginPath(); g.moveTo(UW/2 - 29, UH - 237); g.lineTo(UW/2 - 24, UH - 232); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.17)'; rr(22, UH - 190, UW - 44, 140, 52); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.5; rr(23, UH - 189, UW - 46, 138, 51); g.stroke();
  DOCK.forEach((k, i) => appIcon(k, HOME.cols[i], UH - 120, HOME.icon));
}
// app → home → app, the way iOS animates it: the window follows the swipe up a little, then shrinks into its icon.
// Its content scales uniformly (cropped, never stretched) while the window's own shape morphs from the screen's
// proportions to the icon's square, and the icon cross-fades in at the end. The home screen settles from a slight
// zoom. Opening the next app is the same move backwards, after the icon's tap highlight.
const TRANS = { from:'recents', to:'wear' };
function appWindow(snap, icon, k){
  const g = ui, [ix, iy] = iconPos(icon), S = HOME.icon;
  const e = 1 - Math.pow(1 - k, 3), eh = 1 - Math.pow(1 - Math.min(1, k*1.25), 3);
  const lift = Math.sin(Math.min(1, k*2.2)*Math.PI)*70*(1 - k);
  const w = lerp(UW, S, e), h = lerp(UH, S, eh), cx = lerp(UW/2, ix, e), cy = lerp(UH/2, iy, e) - lift, r = lerp(55*PT, S*.225, e);
  const cs = w/UW;
  g.save(); rr(cx - w/2, cy - h/2, w, h, r); g.clip();
  g.drawImage(snap, cx - UW*cs/2, cy - UH*cs/2, UW*cs, UH*cs);
  const iconA = smooth(.6, .95, k);
  if (iconA > 0){ g.globalAlpha = iconA; g.save(); g.translate(cx, cy); g.scale(w/S, h/S); g.translate(-ix, -iy); appIcon(icon, ix, iy, S); g.restore(); g.globalAlpha = 1; }
  g.restore();
  return [cx, cy + h/2, w];
}
function drawGoHome(p, t){
  const g = ui;
  // with nowhere to go (TRANS.to empty) it just closes the app and settles on the home screen
  const closeK = TRANS.to ? clamp01(p/.4) : clamp01(p/.7), openK = TRANS.to ? clamp01((p - .56)/.44) : 0;
  const tap = TRANS.to ? smooth(.42, .48, p)*(1 - smooth(.52, .58, p)) : 0;
  // home screen settles in from a slight zoom, and zooms again behind the opening app
  const zoom = 1 + .08*(1 - (1 - Math.pow(1 - closeK, 3))) + .08*(1 - Math.pow(1 - openK, 3));
  g.save(); g.translate(UW/2, UH/2); g.scale(zoom, zoom); g.translate(-UW/2, -UH/2);
  HOME.pressed = TRANS.to || ''; NO_STATUS = true; drawHome(tap); NO_STATUS = false;
  g.restore();
  const dim = (1 - closeK)*.35 + openK*.35; if (dim > 0){ g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, UW, UH); }
  if (closeK < 1){
    const [bx, by, w] = appWindow(SNAP_A, TRANS.from, closeK);
    // the home indicator rides along with the window, then fades
    g.fillStyle = `rgba(255,255,255,${1 - smooth(.3, .6, closeK)})`; rr(bx - 67*PT*(w/UW), by - 13*PT*(w/UW), 134*PT*(w/UW), 5*PT*(w/UW), 2.5*PT); g.fill();
  }
  if (openK > 0) appWindow(SNAP_B, TRANS.to, 1 - openK);
  statusBar(openK < .6 || TRANS.toDark, 0);
  if (openK <= 0 || openK >= 1) homeIndicator(openK < 1 || TRANS.toDark);
}
// 134 × 5 pt, 8 pt above the bottom edge; white on dark content, black on light
function homeIndicator(dark){ ui.fillStyle = dark ? '#ffffff' : '#000000'; rr(UW/2 - 67*PT, UH - 13*PT, 134*PT, 5*PT, 2.5*PT); ui.fill(); }

let uiKey = '', lastKind = '', kindSeen = '', callT0 = 0;
function renderUI(kind, p, now){
  // the call clock starts at 00:00 when the call is picked up
  if (kind === 'call' && kindSeen !== 'call') callT0 = now;
  kindSeen = kind;
  const t = now/1000, secs = Math.floor((now - callT0)/1000);
  const k = kind==='off' ? 'off' : kind==='idle' ? `idle${hhmm(clock.shown)}` : kind==='ring' ? `r${Math.round(p*240)}` : kind==='homeIdle' ? `hi` : kind==='nfc' ? `n${Math.round(p*200)}` : kind==='wear' ? `w${Math.round(p*300)}${Math.floor(t*12)}` : kind==='memories' ? `m${Math.round(p*200)}` : kind==='call' ? `c${Math.round(p*20)}${secs}${Math.floor(t*24)}` : kind==='ask' ? `a${Math.round(p*120)}${Math.floor(t*2)}` : kind==='pulse' ? `p${p}${p===1?Math.floor(t*30):0}` : kind.startsWith('home') ? `${kind}${Math.round(p*160)}` : kind==='internat' ? `i${Math.round(p*300)}` : `t${Math.round(p*200)}`;
  const kk = k + hhmm(clock.shown);
  if (kk === uiKey) return;
  uiKey = kk;
  ui.save();
  // entering a transition (from either side): capture the two app screens it moves between, without the status bar
  if (kind.startsWith('home') && lastKind !== kind){
    NO_STATUS = true;
    if (kind === 'home'){ Object.assign(TRANS, {from:'recents', to:null, toDark:false}); snapshot(SNAP_A, () => drawAsk(1, 0)); }
    else { Object.assign(TRANS, {from:'wear', to:'internat', toDark:false}); snapshot(SNAP_A, () => drawMemories(1, t)); snapshot(SNAP_B, () => drawInternat(0, t)); }
    NO_STATUS = false;
  }
  if (kind === 'ring' && lastKind !== 'ring') snapshot(SNAP_C, () => drawCall(0, 0, t));
  if (kind === 'nfc' && lastKind !== 'nfc') snapshot(SNAP_D, () => drawWear(0, t));
  lastKind = kind;
  if (kind==='off'){ ui.fillStyle = '#000'; ui.fillRect(0, 0, UW, UH); }
  else if (kind==='idle'){ HOME.pressed = ''; drawHome(0); }
  else if (kind==='ring') drawIncoming(p);
  else if (kind==='homeIdle'){ HOME.pressed = ''; drawHome(0); }
  else if (kind==='nfc') drawNfc(p);
  else if (kind==='wear') drawWear(p, t);
  else if (kind==='memories'){
    // pushed in from the right over the send screen, the iOS way
    const k = easeIO(smooth(0, .14, p));
    if (k < 1){ ui.save(); ui.translate(-UW*.3*k, 0); drawWear(1, t); ui.restore(); ui.fillStyle = `rgba(0,0,0,${.12*k})`; ui.fillRect(0, 0, UW, UH); }
    ui.save(); ui.translate(UW*(1 - k), 0); drawMemories(p, t); ui.restore();
  }
  else if (kind==='call') drawCall(p, secs, t);
  else if (kind==='transcript') drawTranscript(p);
  else if (kind==='ask') drawAsk(p, t);
  else if (kind.startsWith('home')) drawGoHome(p, t);
  else if (kind==='internat') drawInternat(p, t);
  else drawPulse(p, t);
  if (!kind.startsWith('home') && kind !== 'off') homeIndicator(!['pulse', 'internat', 'wear', 'memories'].includes(kind));
  ui.restore();
  uiTex.needsUpdate = true;
}
function drawNotif(){
  nc.clearRect(0,0,720,196);
  nc.fillStyle = 'rgba(247,244,239,.96)'; nc.beginPath(); nc.roundRect(4,4,712,188,46); nc.fill();
  nc.fillStyle = '#f3ece2'; nc.beginPath(); nc.roundRect(30,42,112,112,28); nc.fill();
  wcMark(nc, 86, 98, 47);
  nc.fillStyle = '#7d776c'; nc.font = `600 22px ${SF}`; nc.letterSpacing = '4px'; nc.textBaseline = 'middle';
  nc.fillText('WEAR CLOSE', 170, 70); nc.letterSpacing = '0px';
  nc.textAlign = 'right'; nc.font = `400 22px ${SF}`; nc.fillText('now', 572, 70); nc.textAlign = 'left';
  nc.fillStyle = '#1b1a18'; nc.font = `600 32px ${SF}`; nc.fillText('Petr is thinking about you.', 170, 126);
  nc.save(); nc.beginPath(); nc.roundRect(596, 50, 96, 96, 18); nc.clip(); nc.drawImage(WC_PHOTO, 596, 50, 96, 96); nc.restore(); // it came with a photo
  notifTex.needsUpdate = true;
}

// ---------- keyframed poses (story time st: chapter i holds on [2i,2i+1], moves to i+1 on [2i+1,2i+2]) ----------
const TAU = Math.PI*2;
const TAP_ROT = [-1.02, .12, .22];
const TAP_POS = STONE_NODE.clone().add(new THREE.Vector3(-.06, .5, .2)).toArray();
// using Wear Close: the phone comes forward and up, beside the pair, big enough to read
const WC_USE_POS = [-.78, .34, .55], WC_USE_ROT = [-.1, .26, .05], WC_USE_S = .78;
// lying back-up, long edge to the camera, close in: the card next to the camera plateau, like Ruune shows it
// close enough that the 1.3 mm difference reads: frame the stretch from the lenses to the card's top edge
const PROFILE_S = 4.4, PROFILE_ROT = [Math.PI/2, 0, Math.PI/2], PROFILE_POS = [.91, .04 - PD/2*PROFILE_S, .3];
const PHONE_KEYS = [
  // it leaves the wall of phones far behind and flies to the viewer, turning once on the way
  [3.02, [0,0,0], [-.06,-.34,.05], 1], // 3.02 → 3.95 is driven by emergeFromWall, out of a wall slot
  [3.95, [0,0,0], [-.06,-.34,.05], 1],
  [4.0,  [0,0,0], [-.06,-.34,.05], 1],
  [4.15, [0,.02,0], [-.05,Math.PI-.45,-.04], 1],
  [4.43, [0,.02,0], [-.05,Math.PI-.38,-.03], 1],
  [4.56, [.9,-.06,.3], [Math.PI/2 + .3, .12, Math.PI/2], 2.6, 'via'], // passed through, not stopped at
  [4.6, PROFILE_POS, PROFILE_ROT, PROFILE_S],
  [4.68, PROFILE_POS, PROFILE_ROT, PROFILE_S],
  [4.79, [0,0,0], [-.05,-.3,.03], 1],
  [5.3, [0,0,0], [-.05,-.27,.03], 1], // holds while it goes home
  [5.6,  [-.55,.6,.3], [-.18,.3,.5], .6],
  [6.02, [-.55,.6,.3], [-.18,.3,.5], .6],
  [6.24, TAP_POS, TAP_ROT, .6],
  [6.38, TAP_POS, TAP_ROT, .6],
  [6.52, WC_USE_POS, WC_USE_ROT, WC_USE_S], // forward, to use the app
  [7.24, WC_USE_POS, WC_USE_ROT, WC_USE_S],
  [7.42, [0,0,0], [-.05,-.28,.03], 1],
  [9.02, [0,0,0], [-.05,-.22,.03], 1],
  [9.55, [-1.3,-3.0,-.4], [.6,.9,.9], 1]
];
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), ea = new THREE.Euler(), eb = new THREE.Euler();
const qv = new THREE.Quaternion(), ev = new THREE.Euler(), q01 = new THREE.Quaternion(), q12 = new THREE.Quaternion();
// Keys ease in and out of each other. A key marked 'via' is a waypoint: the move from the key before it to the key
// after it is eased once as a whole and bends through the via point (quadratic Bezier / quaternion de Casteljau),
// so the object never stops there.
function pose(keys, st, obj){
  let i = 0; while (i < keys.length-2 && st >= keys[i+1][0]) i++;
  let a = keys[i], b = keys[i+1], v = null;
  if (b[4] === 'via' && keys[i+2]){ v = b; b = keys[i+2]; }
  else if (a[4] === 'via' && i > 0){ v = a; a = keys[i-1]; }
  const f = easeIO(clamp01((st-a[0])/(b[0]-a[0])));
  qa.setFromEuler(ea.set(...a[2])); qb.setFromEuler(eb.set(...b[2]));
  if (!v){
    obj.position.set(lerp(a[1][0],b[1][0],f), lerp(a[1][1],b[1][1],f), lerp(a[1][2],b[1][2],f));
    obj.quaternion.slerpQuaternions(qa, qb, f);
    obj.scale.setScalar(lerp(a[3],b[3],f));
    return;
  }
  // control point chosen so the curve passes through the via point halfway
  const bz = (p0, p1, p2) => { const c = 2*p1 - (p0 + p2)/2; return (1-f)*(1-f)*p0 + 2*(1-f)*f*c + f*f*p2; };
  obj.position.set(bz(a[1][0],v[1][0],b[1][0]), bz(a[1][1],v[1][1],b[1][1]), bz(a[1][2],v[1][2],b[1][2]));
  qv.setFromEuler(ev.set(...v[2]));
  q01.slerpQuaternions(qa, qv, f); q12.slerpQuaternions(qv, qb, f);
  obj.quaternion.slerpQuaternions(q01, q12, f);
  obj.scale.setScalar(bz(a[3], v[3], b[3]));
}
const SNAP = 4.33;
// Wear Close: the tap is read (NFC_AT), the notification opens the app (OPENED), the pulse goes out with its photo and
// note (SEND_AT, the send screen's p .64), lands on her side (ARRIVE, p .86), then Memories (SENT_DONE → 7.36)
const NFC_AT = 6.26, OPENED = 6.46, SENT_DONE = 7.0;
const SEND_AT = OPENED + (SENT_DONE - OPENED)*.64, ARRIVE = OPENED + (SENT_DONE - OPENED)*.86;
const fx = {snapT:-1e9, arriveT:-1e9, shake:0, prevSt:0};
// the card glides in from beyond the frame edge, hovers over the back showing its face, then the magnet takes it
const CARD_FROM = new THREE.Vector3(-3.4, 1.4, -2.6), CARD_AWAY = new THREE.Vector3(2.6, -1.4, -2.2), CARD_IN = 4.03, CARD_HOVER = 4.2;
const dimsEl = document.getElementById('dims'), dimCard = document.getElementById('dimCard'), dimCam = document.getElementById('dimCam');
const recTag = document.getElementById('recTag'), recTime = document.getElementById('recTime'), recBars = [...recTag.querySelectorAll('i')];
const dA = new THREE.Vector3(), dB = new THREE.Vector3();
function toScreen(local, out){ out.copy(local); phone.localToWorld(out); out.project(camera); return [(out.x*.5+.5)*innerWidth, (-out.y*.5+.5)*innerHeight]; }
// a dimension line drawn like a technical drawing: two ticks, a bar offset to the side, a label
function dimension(el, pa, pb, label, sub, side = 1){
  const [x1,y1] = toScreen(pa, dA), [x2,y2] = toScreen(pb, dB);
  // side: 1 draws the bar and label to the right, -1 to the left (when the right edge is too close)
  const off = 26, bx = side > 0 ? Math.max(x1,x2) + off : Math.min(x1,x2) - off, t = side > 0 ? bx + 14 : bx - 14, anchor = side > 0 ? 'start' : 'end';
  el.innerHTML = `<line x1="${x1+6*side}" y1="${y1}" x2="${bx+6*side}" y2="${y1}"/><line x1="${x2+6*side}" y1="${y2}" x2="${bx+6*side}" y2="${y2}"/><line class="bar" x1="${bx}" y1="${y1}" x2="${bx}" y2="${y2}"/><text x="${t}" y="${(y1+y2)/2+4}" text-anchor="${anchor}">${label}</text><text class="sub" x="${t}" y="${(y1+y2)/2+20}" text-anchor="${anchor}">${sub}</text>`;
}

// The iPhone is part of the wall from the start: the one iPhone among the Androids, in a slot picked so that
// (a) it's on screen and close to where the iPhone lands when it leaves, and (b) it sits in a dark part of the
// name picture, so it doesn't punch a hole in the letters. At the MationX → Recents transition it slides out.
const slotM = new THREE.Matrix4(), slotP = new THREE.Vector3(), slotQ = new THREE.Quaternion(), slotS = new THREE.Vector3(), stageInv = new THREE.Matrix4(), tmpV = new THREE.Vector3();
const landP = new THREE.Vector3(), landQ = new THREE.Quaternion(), landS = new THREE.Vector3();
const IN_WALL_FROM = -1.0, LEAVE = 3.02, LANDED = 3.95; // stage time (real story time − 2)
const RING_AT = 2.78, ANSWERED = 3.9; // the call rings from just before it leaves the wall and is answered as it lands
let slotIdx = -1;
function setHiddenSlot(i){ if (i === hiddenSlot) return; const old = hiddenSlot; hiddenSlot = i; if (old >= 0) place(old); if (i >= 0) place(i); bodies.instanceMatrix.needsUpdate = screens.instanceMatrix.needsUpdate = cables.instanceMatrix.needsUpdate = true; }
function pickSlot(){
  // where the camera will be when the iPhone leaves (real story time LEAVE + 2)
  const cam = camera.clone(), tt = camParam(Math.min(wallCam(LEAVE + 2), S - 1));
  posCurve.getPoint(tt, cam.position); cam.lookAt(tgtCurve.getPoint(tt, new THREE.Vector3())); cam.updateMatrixWorld(true);
  const target = stage.position.clone().applyMatrix4(cam.matrixWorld).project(cam);
  wall.updateMatrixWorld(true);
  const nameData = nameG.getImageData(0, 0, nameC.width, nameC.height).data;
  let best = 1e9;
  for (let i=0; i<COUNT; i++){
    const b = base[i]; tmpV.set(b.x, b.y, b.z).applyMatrix4(wall.matrixWorld).project(cam);
    if (tmpV.z > 1 || Math.abs(tmpV.x) > .85 || Math.abs(tmpV.y) > .8) continue;
    // how much of this slot is lit in the name picture
    let lit = 0;
    for (let sy=0; sy<5; sy++) for (let sx=0; sx<3; sx++){
      const u = (b.c + .2 + sx*.3)/C, v = (b.r + .1 + sy*.2)/R;
      const px = Math.floor(u*nameC.width), py = Math.floor((1 - v)*nameC.height);
      lit += nameData[(py*nameC.width + px)*4] > 60 ? 1 : 0;
    }
    const d = (tmpV.x - target.x)**2 + (tmpV.y - target.y)**2 + (lit ? 4 : 0);
    if (d < best){ best = d; slotIdx = i; }
  }
}
// runs every frame, stage or not: the slot is empty from the moment the iPhone is in it until the replacement docks
const REFILL_FROM = 3.42, REFILL_TO = 3.98; // stage time: the farm replaces the iPhone right away, while it's still flying to you
function updateSlot(st){
  if (st < IN_WALL_FROM){ setHiddenSlot(-1); uniforms.uNewOn.value = 1; return; }
  if (slotIdx < 0) pickSlot();
  if (slotIdx < 0) return;
  setHiddenSlot(slotIdx);
  const r = clamp01((st - REFILL_FROM)/(REFILL_TO - REFILL_FROM));
  if (r !== refill){ refill = r; place(slotIdx); bodies.instanceMatrix.needsUpdate = screens.instanceMatrix.needsUpdate = cables.instanceMatrix.needsUpdate = true; }
  // in the air it shows its app (see the screen shader); plugged in, it joins whatever the wall is showing
  uniforms.uNewId.value = slotIdx; uniforms.uNewOn.value = smooth(.87, .97, r);
}
function emergeFromWall(st){
  if (st < IN_WALL_FROM || st > LANDED || slotIdx < 0) return;
  // slot pose, in the stage's frame (the wall and the stage move with the camera differently)
  camera.updateMatrixWorld(true); wall.updateMatrixWorld(true);
  const b = base[slotIdx];
  tmpE.set(0, b.ry, 0); tmpQ.setFromEuler(tmpE);
  slotM.compose(tmpV.set(b.x, b.y, b.z), tmpQ, tmpS.set(1, 1, 1)).premultiply(wall.matrixWorld);
  stage.updateMatrixWorld(true); stageInv.copy(stage.matrixWorld).invert();
  slotM.premultiply(stageInv).decompose(slotP, slotQ, slotS);
  // the iPhone (163 mm) scaled up to fill the wall phone's 194 mm slot, sitting where that phone's body sat
  const fill = slotS.x*1.94/1.634;
  const k = clamp01((st - LEAVE)/(LANDED - LEAVE));
  const out = smooth(0, .35, k)*1.6, fly = easeIO(smooth(.22, 1, k));
  const n = tmpV.set(0, 0, 1).applyQuaternion(slotQ);
  landP.copy(phone.position); landQ.copy(phone.quaternion); landS.copy(phone.scale); // the key pose
  phone.position.copy(slotP).addScaledVector(n, out).lerp(landP, fly);
  phone.quaternion.copy(slotQ).slerp(landQ, fly);
  phone.scale.setScalar(lerp(fill, landS.x, fly));
}

function updateStage(st, now){
  const t = now/1000;
  const vis = smooth(3.02, 3.5, st) * (1 - smooth(9.05, 9.6, st));
  const inWall = st >= IN_WALL_FROM && st < LEAVE;
  // the stage stays up for as long as the phone is anywhere (in the wall, sliding out, flying), not only once the
  // dim has started: right after LEAVE the dim is still ~0 and the phone used to vanish for a few frames
  stage.visible = vis > .002 || (st >= IN_WALL_FROM && st < 9.58);
  uniforms.uDim.value = vis;
  if (!stage.visible) return;

  // crossing events are time-based so the snap and the arrival feel physical at any scroll speed
  if (fx.prevSt < SNAP && st >= SNAP){ fx.snapT = now; fx.shake = 1; }
  if (fx.prevSt < ARRIVE && st >= ARRIVE){ fx.arriveT = now; }
  fx.prevSt = st;

  // phone
  phone.visible = st >= IN_WALL_FROM && st < 9.58;
  pose(PHONE_KEYS, st, phone);
  emergeFromWall(st);
  // ringing: it buzzes in bursts, in the wall and on its way out, until it's answered
  if (!reduced && st > RING_AT + .04 && st < RING_AT + (ANSWERED - RING_AT)*.64 && (t*1.15) % 1 < .55){
    const a = .005*phone.scale.x; phone.position.x += Math.sin(t*190)*a; phone.position.y += Math.cos(t*157)*a*.6;
  }
  // idle float, except during the dead-on profile where it has to hold perfectly still
  const still = smooth(4.57, 4.6, st)*(1 - smooth(4.68, 4.71, st));
  if (!reduced && !inWall){ phone.position.y += Math.sin(t*1.1)*.018*(1-still); phone.rotation.z += Math.sin(t*.8)*.012*(1-still); }
  // on phones the stage is centred, so slide the lens-to-card stretch of the profile to the middle of the screen
  if (isStacked()){
    // on a phone: frame the profile wider (both callouts have to fit the narrow screen) and centre the lens-to-card stretch
    phone.scale.multiplyScalar(1 - .42*still); phone.position.x += -.08*still;
    // and when its screen is the point (the transcript, Ask, Internát), the phone comes up bigger so it can be read
    const read = smooth(4.72, 4.8, st)*(1 - smooth(5.03, 5.1, st)) + smooth(7.42, 7.56, st)*(1 - smooth(8.96, 9.06, st));
    phone.scale.multiplyScalar(1 + .45*read); phone.position.y += .1*read;
  }

  // card: glide in, hover, magnet pull (accelerating), snap, recording, then off it goes
  const glideK = smooth(CARD_IN, CARD_HOVER, st), pullK = clamp01((st - CARD_HOVER)/(SNAP - CARD_HOVER)), awayK = smooth(5.0, 5.32, st);
  card.visible = st > CARD_IN && awayK < 1;
  if (card.visible){
    // hover beside the phone (local -x is screen right while the back faces us), a little proud of the back
    const hover = ATTACH.clone(); hover.x -= .78; hover.y += .08; hover.z -= .32;
    // glide: a soft arc from off-frame into the hover spot, turning to face the camera and slowly settling
    card.position.lerpVectors(CARD_FROM, hover, easeIO(glideK));
    card.position.y += Math.sin(glideK*Math.PI)*.25;
    const bob = reduced ? 0 : Math.sin(t*2.2)*.012*(1 - pullK);
    card.position.y += bob;
    card.rotation.set((1-glideK)*.9 + Math.sin(t*1.4)*.04*(1-pullK), (1-glideK)*-1.6, (1-glideK)*1.2);
    // pull: accelerates the last few centimetres like a real magnet
    if (pullK > 0){ const e = pullK*pullK*pullK; card.position.lerp(ATTACH, e); card.rotation.set(card.rotation.x*(1 - e), card.rotation.y*(1 - e), card.rotation.z*(1 - e)); }
    const since = (now - fx.snapT)/1000;
    if (st >= SNAP && since < .5) card.position.z -= Math.sin(Math.min(1,since/.5)*Math.PI*3)*Math.exp(-since*7)*.02;
    if (awayK > 0){ card.position.lerp(CARD_AWAY, easeIO(awayK)); card.rotation.z += awayK*4; }
  }
  const sinceSnap = (now - fx.snapT)/1000;
  const on = st >= SNAP && awayK < 1 ? Math.min(1, Math.max(0, sinceSnap/.35)) * (sinceSnap < .35 ? (Math.random()>.35?1:.25) : 1) : 0;
  const voice = reduced ? .5 : VOICE(t);
  rc.ledM.color.setRGB(3.2, 1.8, .55).multiplyScalar(on*(.3 + .9*voice));
  // while it records with its face to you: the edge light and a REC tag on a leader from the status light
  const recK = on*(1 - smooth(4.46, 4.52, st));
  edgeLight.visible = recK > .01;
  edgeLight.material.uniforms.uTime.value = t; edgeLight.material.uniforms.uLevel.value = voice; edgeLight.material.uniforms.uOn.value = recK;
  recTag.style.opacity = recK.toFixed(3);
  if (recK > .01){
    card.updateMatrix();
    const [lx, ly] = toScreen(new THREE.Vector3(CARD.w/2 - .06, CARD.h/2 - .06, -CARD.d/2).applyMatrix4(card.matrix), dA);
    recTag.style.transform = `translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px)`;
    recTag.classList.toggle('up', lx < 300); // not enough room on the left (a phone): the tag sits above the light
    const secs = Math.max(0, Math.floor(sinceSnap));
    recTime.textContent = `${Math.floor(secs/60)}:${String(secs % 60).padStart(2, '0')}`;
    recBars.forEach((b, i) => { b.style.transform = `scaleY(${(.15 + .85*(reduced ? .5 : VOICE(t - i*.07))).toFixed(3)})`; });
  }
  // side profile: 2.9 mm card next to the 4.2 mm camera bump
  const dimK = smooth(4.59, 4.61, st)*(1 - smooth(4.68, 4.7, st));
  dimsEl.style.opacity = dimK.toFixed(3);
  if (dimK > 0){
    const ex = CARD.w/2 + .002, cy = ATTACH.y;
    const cyEnd = cy + CARD.h/2 - .05; // the card's end nearest the camera, so both stay in the close-up
    dimension(dimCard, new THREE.Vector3(ex, cyEnd, ph.backZ), new THREE.Vector3(ex, cyEnd, ph.backZ - CARD.d), '2.9 mm', 'Recents');
    dimension(dimCam, new THREE.Vector3(ph.lensEdge[0], ph.lensEdge[1], ph.backZ), new THREE.Vector3(ph.lensEdge[0], ph.lensEdge[1], ph.lensTop), '4.2 mm', 'camera bump', isStacked() ? -1 : 1); // on a phone the two callouts point away from each other
  }

  // screen content
  // in the wall: screen off behind the name, home screen among the working Androids, then a call comes in (it's
  // why the phone leaves the wall); it's answered on the way out
  if (st < 1.0) renderUI('off', 0, now);
  else if (st < RING_AT) renderUI('idle', 0, now);
  else if (st < ANSWERED) renderUI('ring', clamp01((st - RING_AT)/(ANSWERED - RING_AT)), now);
  else if (st < 4.7) renderUI('call', st >= SNAP ? on : 0, now);
  else if (st < 4.86) renderUI('transcript', smooth(4.72, 4.86, st), now);
  else if (st < 5.04) renderUI('ask', clamp01((st-4.86)/.17), now);
  else if (st < 5.3) renderUI('home', clamp01((st-5.04)/.26), now);
  else if (st < NFC_AT) renderUI('homeIdle', 0, now);
  else if (st < OPENED) renderUI('nfc', clamp01((st - NFC_AT)/(OPENED - NFC_AT)), now);
  else if (st < SENT_DONE) renderUI('wear', clamp01((st - OPENED)/(SENT_DONE - OPENED)), now);
  else if (st < 7.36) renderUI('memories', clamp01((st - SENT_DONE)/(7.36 - SENT_DONE)), now);
  else if (st < 7.64) renderUI('home2', clamp01((st-7.36)/.28), now);
  else renderUI('internat', clamp01((st-7.64)/1.3), now);

  // bracelets
  const bIn = smooth(5.35, 5.95, st), bOut = smooth(7.24, 7.6, st), bVis = bIn*(1-bOut);
  stone.g.visible = charcoal.g.visible = bVis > .002;
  if (stone.g.visible){
    stone.g.position.copy(STONE_AT).add(new THREE.Vector3(0, (1-bIn)*-2.4 - bOut*2.6 + (reduced?0:Math.sin(t*.9)*.02), 0));
    stone.g.rotation.y = STONE_RY + (1-bIn)*-2.2 + (reduced?0:Math.sin(t*.5)*.06);
    const cIn = smooth(5.45, 6.05, st);
    charcoal.g.position.copy(CHAR_AT).add(new THREE.Vector3(0, (1-cIn)*-2.6 - bOut*2.6 + (reduced?0:Math.sin(t*.9+1.7)*.02), 0));
    charcoal.g.rotation.y = CHAR_RY + (1-cIn)*2.4 + (reduced?0:Math.sin(t*.5+1)*.06);
    const sinceArr = (now - fx.arriveT)/1000;
    if (st >= ARRIVE && sinceArr < .6 && !reduced){ const j = (1-sinceArr/.6)*.012; charcoal.g.position.x += (Math.random()-.5)*j; charcoal.g.position.y += (Math.random()-.5)*j; }
    // the pulse lands: Charcoal's face glows warm for a moment, then it's black again
    const glow = st >= ARRIVE && st < ARRIVE + .3 ? Math.exp(-Math.max(0, sinceArr)*1.6) : 0;
    charcoal.capM.emissive.setRGB(1.0, .5, .3).multiplyScalar(glow*.9);
    stone.bezM.emissive.setRGB(1.0,.55,.3).multiplyScalar(st > 6.2 && st < 6.5 ? smooth(6.2,6.26,st)*(1-smooth(6.4,6.48,st)) : 0);
  }
  // NFC ripples at the moment of the tap
  ripples.forEach((m,i)=>{
    const k = clamp01((st - 6.2 - i*.045)/.2);
    m.visible = k > 0 && k < 1 && bVis > .5;
    m.scale.setScalar(.06 + k*.36); m.material.opacity = (1-k)*.85;
  });
  // the pulse: a comet along the arc
  const head = clamp01((st - SEND_AT)/(ARRIVE - SEND_AT)), tail = clamp01((st - SEND_AT - .04)/(ARRIVE - SEND_AT + .04));
  const travelling = head > 0 && tail < 1 && bVis > .5;
  pulseTube.visible = pulseHead.visible = travelling;
  if (travelling){
    const h = Math.floor(head*ARC_SEG), tl = Math.floor(tail*ARC_SEG);
    pulseTube.geometry.setDrawRange(tl*48, Math.max(0,h-tl)*48);
    arc.getPoint(head, pulseHead.position);
  }
  // notification on her side
  const sinceArr = (now - fx.arriveT)/1000;
  const pop = st >= ARRIVE ? (sinceArr < .6 && sinceArr >= 0 ? outBack(clamp01(sinceArr/.5)) : 1) : 0;
  notif.visible = pop > .001 && bVis > .01;
  notif.scale.setScalar(Math.max(.001, pop*(1-bOut)));
  notif.position.y = CHAR_AT.y + .62 + (reduced?0:Math.sin(t*1.2)*.012);
}

function placeStage(){
  const d = 4.4, halfH = d*Math.tan(THREE.MathUtils.degToRad(20)), halfW = halfH*camera.aspect;
  if (isStacked()){ stage.position.set(0, halfH*.4, -d*1.06); stage.scale.setScalar(.56); }
  else { stage.position.set(halfW*.34, -.04, -d); stage.scale.setScalar(1); }
}

// ---------- intro desk (rides with the camera, like the stage) ----------
// the MacBook's screen is always landscape (its own 26 × 10 miniature wall), so it gets the wide name layout even on a phone
const macNameC = document.createElement('canvas'); macNameC.width = Math.round(1024*(26*SX)/(10*SY)); macNameC.height = 1024;
const macNameTex = new THREE.CanvasTexture(macNameC);
function paintMacName(){
  const g = macNameC.getContext('2d'), w = macNameC.width, h = macNameC.height;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.min(h*.5, w*.24)}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`;
  g.fillText('PETR', w/2, h*.29); g.fillText('KYNČL', w/2, h*.71); macNameTex.needsUpdate = true;
}
const desk = createDesk({envTex, nameTex: macNameTex, stacked:isStacked});
camera.add(desk.root);
const flashEl = document.getElementById('flash');

// ---------- post ----------
// the composer renders into a multisampled target: without it the post chain drops the canvas's antialiasing
// and long edges (the desk, phone rims) step visibly
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .5, .42, .9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- "Still human": Petr's head, in dots (see head.js) ----------
// The wall dims and his head assembles beside the closing copy, turning a little with the cursor.
// it assembles during the move into the last chapter (st 17 → 18 is one even screen of scroll) and is whole by the
// time the chapter pins; the chapter's own hold is short, so nothing may be left to happen there
const HEAD_ST = 17.12, HEAD_DUR = .82;
const headRig = new THREE.Group(); camera.add(headRig);
let head = null;
createHead().then(h => { head = h; h.uniforms.uColor.value.multiplyScalar(1.12); // just under the bloom threshold: only the brightest bits glow
  headRig.add(h.group); h.group.visible = false; placeHead(); }).catch(e => console.warn('head', e));
function placeHead(){
  const d = 3, halfH = d*Math.tan(THREE.MathUtils.degToRad(20)), halfW = halfH*camera.aspect;
  if (isStacked()){ headRig.position.set(0, halfH*.66, -d); headRig.scale.setScalar(.6); } // above the copy, clear of the title
  else { headRig.position.set(halfW*.38, .02, -d); headRig.scale.setScalar(1.3); }
}
function updateHead(st, t){
  if (!head) return 0;
  const k = reduced ? (st > HEAD_ST ? 1 : 0) : clamp01((st - HEAD_ST)/HEAD_DUR);
  head.group.visible = k > 0;
  if (!k) return 0;
  const u = head.uniforms;
  u.uIn.value = k; u.uTime.value = t; u.uSize.value = headRig.scale.x; // dot sizes are in the head's units, so they scale with it
  u.uPx.value = renderer.domElement.height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  u.uScan.value = .55 - ((t*.16) % 2.4);
  // three-quarters, looking towards the copy; it turns that way as it assembles, then follows the cursor a little
  head.group.rotation.set(-pmy*.12, -.6 - (1 - k)*.9 + pmx*.4 + Math.sin(t*.3)*.05, 0);
  return k;
}
function size(){
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth*.5, innerHeight*.5);
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  placeStage(); placeHead();
}
size();
// The name lockup, set by measurement rather than by the font's metrics:
// - every letter is drawn to a canvas and its ink profile read row by row
// - each pair is spaced so the average gap between the two ink profiles (capped, so open counters don't count as
//   space) is the same everywhere: optical kerning, so E–T and T–R read as equal
// - PETR is scaled so its R ends exactly on the stem of KYNČL's L (not on L's foot), and both lines start on the
//   same ink edge
const LOCK_CAP = .09, LOCK_MIN = .02; // em: gaps wider than CAP count as CAP; ink never closer than MIN
const inkCache = new Map();
function ink(ch, font){
  const key = font + ch; if (inkCache.has(key)) return inkCache.get(key);
  const S = 200, cv = document.createElement('canvas'); cv.width = S*1.4; cv.height = S*1.6;
  const g = cv.getContext('2d', {willReadFrequently:true}); g.font = `${font.weight} ${S}px ${font.family}`; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
  const ox = S*.2, base = S*1.25; g.fillText(ch, ox, base);
  const d = g.getImageData(0, 0, cv.width, cv.height).data, rows = [];
  let top = 1e9;
  for (let y=0; y<cv.height; y++){
    let l = -1, r = -1;
    for (let x=0; x<cv.width; x++) if (d[(y*cv.width + x)*4] > 110){ if (l < 0) l = x; r = x; }
    if (l >= 0) top = Math.min(top, y);
    rows.push(l < 0 ? null : [(l - ox)/S, (r + 1 - ox)/S]);
  }
  const res = { rows, adv: g.measureText(ch).width/S, base, S, top: (base - top)/S };
  inkCache.set(key, res); return res;
}
// rows are indexed relative to the baseline; compare two glyphs over the cap-height band
function gaps(a, b, sh){
  const lo = Math.round(a.base - .02*a.S), hi = Math.round(a.base - .74*a.S);
  let s = 0, n = 0, mn = 1e9;
  for (let y=hi; y<=lo; y++){
    const ra = a.rows[y], rb = b.rows[y];
    const g = (ra && rb) ? (rb[0] + sh) - ra[1] : LOCK_CAP;
    if (ra && rb) mn = Math.min(mn, g);
    s += Math.max(0, Math.min(LOCK_CAP, g)); n++;
  }
  return { mean: s/n, min: mn };
}
// the target is the space between two straight stems at the font's own spacing (H H): every pair gets that much
let LOCK_TARGET = null;
function pairShift(a, b, font){
  if (LOCK_TARGET === null){ const h = ink('H', font); LOCK_TARGET = gaps(h, h, h.adv).mean; }
  let x0 = -.12, x1 = .12;
  for (let i=0; i<40; i++){ const mid = (x0 + x1)/2; if (gaps(a, b, a.adv + mid).mean < LOCK_TARGET) x0 = mid; else x1 = mid; }
  let sh = (x0 + x1)/2;
  while (gaps(a, b, a.adv + sh).min < LOCK_MIN && sh < .2) sh += .002; // never let ink touch
  return sh;
}
function setLine(span, font){
  const text = span.dataset.text || span.textContent; span.dataset.text = text;
  const chars = [...text.toUpperCase()], glyphs = chars.map(c => ink(c, font));
  span.innerHTML = '';
  let x = 0, inkL = 1e9, inkR = -1e9, stemR = null;
  chars.forEach((c, i) => {
    const el = document.createElement('i'); el.textContent = c; el.style.fontStyle = 'normal';
    if (i > 0){ const sh = pairShift(glyphs[i-1], glyphs[i], font); el.style.marginLeft = sh.toFixed(4) + 'em'; x += glyphs[i-1].adv + sh; }
    span.appendChild(el);
    const gl = glyphs[i];
    gl.rows.forEach((r, y) => { if (!r) return; inkL = Math.min(inkL, x + r[0]); inkR = Math.max(inkR, x + r[1]); });
    if (c === 'L'){ // the stem: rightmost ink in the upper two thirds of the cap height
      let sr = -1e9; for (let y = Math.round(gl.base - .74*gl.S); y < Math.round(gl.base - .3*gl.S); y++){ const r = gl.rows[y]; if (r) sr = Math.max(sr, x + r[1]); }
      stemR = sr;
    }
  });
  return { inkL, inkR, stemR };
}
function fitLockup(){
  document.querySelectorAll('h1.lockup').forEach(h => {
    const cs = getComputedStyle(h), font = { weight: cs.fontWeight, family: cs.fontFamily }, base = parseFloat(cs.fontSize);
    const [l1, l2] = [...h.children];
    l1.style.fontSize = l2.style.fontSize = '';
    const a = setLine(l1, font), b = setLine(l2, font);
    // line 2 at the base size; line 1 scaled so its ink spans line 2's ink-left → L stem
    const target = ((b.stemR ?? b.inkR) - b.inkL), s1 = target/(a.inkR - a.inkL);
    l2.style.fontSize = base + 'px'; l1.style.fontSize = (base*s1).toFixed(2) + 'px';
    // start both lines on the same ink edge
    l1.style.marginLeft = (-a.inkL*base*s1).toFixed(2) + 'px'; l2.style.marginLeft = (-b.inkL*base).toFixed(2) + 'px';
  });
}
addEventListener('resize', () => { size(); fitLockup(); measure(); });

// ---------- time of day ----------
const clock = {live: pragueHours(), shown: pragueHours(), preview: null, idx: 0};
const PRESETS = [null, 7.5, 13, 19.75, 2.5];
const ROOM_N = new THREE.Color('#05060b'), ROOM_D = new THREE.Color('#0f0e0d'), ROOM_G = new THREE.Color('#150c07');
const AMB_N = new THREE.Color(0x2b3452), AMB_D = new THREE.Color(0x5d5850);
const KEY_N = new THREE.Color(0x9aa6cc), KEY_D = new THREE.Color(0xfff2de), KEY_G = new THREE.Color(0xffa45c);
let roomCss = '';
function applyLight(h){
  const e = Math.sin((h-6)/12*Math.PI);
  const day = smooth(-.08,.45,e), gold = smooth(-.22,.04,e)*(1-smooth(.12,.5,e));
  room.copy(ROOM_N).lerp(ROOM_D, day).lerp(ROOM_G, gold*.7);
  scene.background.copy(room); scene.fog.color.copy(room); uniforms.uRoom.value.copy(room);
  amb.color.copy(AMB_N).lerp(AMB_D, day); amb.intensity = lerp(1.3, 2.7, day);
  key.color.copy(KEY_N).lerp(KEY_D, day).lerp(KEY_G, gold*.8); key.intensity = lerp(1.1, 3.0, day) + gold*1.4;
  const ang = (h-6)/12*Math.PI; key.position.set(-Math.cos(ang)*22, 3 + Math.max(0,e)*16, 14);
  rim.intensity = lerp(1.3, .8, day);
  pKey.color.copy(KEY_N).lerp(KEY_D, Math.max(day,.8)).lerp(KEY_G, gold*.6); // product light stays near-neutral
  uniforms.uGain.value = lerp(1.06, .9, day);
  desk.setDaylight(day, gold);
  bloom.strength = lerp(.52, .34, day) + Math.max(0, 1 - (performance.now()-fx.snapT)/600)*.5;
  const hex = '#' + room.getHexString();
  if (hex !== roomCss){ roomCss = hex; document.documentElement.style.setProperty('--room', hex); }
}
const hTime = document.getElementById('hTime'), hShift = document.getElementById('hShift');
// the room is always lit for night (one tuned look); only the HUD clock follows real Prague time
const NIGHT = 1.5;

// ---------- pacing ----------
// The stage's beats are authored in stage time, but what the visitor feels is scroll distance. Each scroll region
// the stage plays across lists its beats as [authored from, authored to, vh]: how much scrolling the beat deserves
// for what there is to watch or read in it, so actions move at one even speed down the page. A hold's section is
// exactly as long as its beats add up to (plus the screen it pins on); a transition is always one screen, so its
// beats add up to 100. Regions are linear stage time (real story time − 2) and must join up end to end.
const PACE = [
  { region: 4, sec: 'c3', beats: [ // Recents
    [4.0, 4.03, 25],    // the call, just answered, face on
    [4.03, 4.15, 40],   // the card glides in while the phone turns its back
    [4.15, 4.33, 55],   // hover over the back, the magnet takes it
    [4.33, 4.43, 55],   // snap, then it records: the edge light breathes with the voice, the REC tag
    [4.43, 4.56, 25],   // swing towards the side
    [4.56, 4.6, 15],    // settle dead on the profile
    [4.6, 4.68, 100],   // 2.9 mm against the 4.2 mm camera bump
    [4.68, 4.79, 45],   // back to the front, the call ends
    [4.79, 4.86, 75],   // the transcript fills in
    [4.86, 4.918, 40],  // typing the question
    [4.918, 4.935, 15], // sent
    [4.935, 4.986, 80], // the answer writes itself out
    [4.986, 5.04, 60]   // its sources, time to read
  ] },
  { region: 5, beats: [[5.04, 5.3, 50], [5.3, 6.0, 50]] }, // home, open Wear Close; the bracelets arrive
  { region: 6, sec: 'c4', beats: [ // Wear Close
    [6.0, 6.24, 40],    // on the home screen, the phone goes to the bracelet
    [6.24, 6.34, 45],   // the tag is read: "Open in Wear Close"
    [6.34, 6.46, 40],   // tapped, the app opens on Zuzka
    [6.46, 6.62, 60],   // a photo goes with it
    [6.62, 6.76, 60],   // and a note
    [6.76, 6.92, 55],   // send: the pulse travels to her
    [6.92, 7.0, 45],    // she felt it
    [7.0, 7.36, 90]     // Memories: today's moment lands on top of the rest
  ] },
  { region: 7, beats: [[7.36, 7.64, 70], [7.64, 7.75, 30]] }, // home, open Internát
  { region: 8, sec: 'c5', beats: [ // Internát (its demo runs 7.64 → 8.94; p = (t − 7.64)/1.3)
    [7.75, 7.822, 30],  // tap Extend
    [7.822, 7.887, 25], // the sheet comes up
    [7.887, 8.212, 120],// pick 22:00, pick Mom, send
    [8.212, 8.342, 50], // sent, the sheet goes
    [8.342, 8.602, 70], // waiting for Mom, her approval comes in
    [8.602, 8.94, 60],  // approved until 22:00
    [8.94, 9.0, 15]
  ] }
];
const PACE_AT = {};
for (const r of PACE){
  r.total = r.beats.reduce((s, b) => s + b[2], 0);
  PACE_AT[r.region] = r;
  if (r.sec) document.getElementById(r.sec).style.setProperty('--len', r.total + 100);
}
// linear stage time (from the scroll) → authored stage time
function paced(lin){
  const r = PACE_AT[Math.floor(lin)];
  if (!r) return lin;
  const f = (lin - Math.floor(lin))*r.total; let acc = 0;
  for (const [a, b, vh] of r.beats){ if (f <= acc + vh) return a + (b - a)*(f - acc)/vh; acc += vh; }
  return r.beats[r.beats.length - 1][1];
}

// ---------- scroll → story ----------
const secs = [...document.querySelectorAll('.ch')];
let tops = [], heights = [];
function measure(){ tops = secs.map(s => s.offsetTop); heights = secs.map(s => s.offsetHeight); }
measure();
function storyAt(y){
  const V = innerHeight; let i = 0;
  while (i < secs.length-1 && y >= tops[i+1]) i++;
  const hold = Math.max(0, heights[i]-V), into = y - tops[i];
  if (i === secs.length-1) return {prog:i, st:2*i + clamp01(into/Math.max(1, hold))}; // the last section holds too
  if (into < hold) return {prog:i, st:2*i + into/hold};
  const f = clamp01((into-hold)/V);
  return {prog:i+f, st:2*i+1+f};
}

// ---------- the copy types itself as you scroll ----------
// Each chapter's lead and body paragraphs are typed out letter by letter, scrubbed by the scroll at one speed
// everywhere (WRITE_VH per letter, a beat's pause between paragraphs), so a long story keeps typing while the wall
// changes behind it. An amber block cursor rides the write head: solid while letters are coming, blinking when you
// stop; the last few letters glow amber as they land. Scrolling back deletes. Letters are hidden, not removed, so the
// lines never reflow; the full text stays in the DOM for screen readers; reduced motion shows it all.
const WRITE_VH = .42, PARA_PAUSE = 10; // scroll per letter (% of the viewport height); a paragraph break counts as this many letters
const writing = secs.map(sec => {
  const chars = [], stops = []; // stops[k]: the char index at which paragraph k starts, in "typed" units
  let t = 0;
  if (sec.id === 'c0') return { sec, chars: [], total: 0, cur: null, shown: -1, lastMove: 0 }; // the opening line is simply there
  sec.querySelectorAll('.copy > p:not(.foot):not(.big)').forEach((p, pi) => {
    if (pi) t += PARA_PAUSE;
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3){
        const frag = document.createDocumentFragment();
        for (const ch of n.textContent){ const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; frag.append(c); chars.push({ el: c, at: t++ }); }
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(p);
  });
  const cur = document.createElement('span'); cur.className = 'cur';
  return { sec, chars, total: t, cur, shown: -1, lastMove: 0 };
});
function updateWriting(y, now){
  const V = innerHeight;
  writing.forEach((wr, i) => {
    const N = wr.chars.length; if (!N) return;
    // on a tall screen the copy sits at the bottom and only shows once the chapter has nearly pinned
    const start = tops[i] - V*(land ? .55 : .12);
    const n = reduced ? wr.total + 1 : Math.max(0, (y - start)/(V*WRITE_VH/100));
    const head = Math.min(wr.total, Math.floor(n));
    // the cursor belongs to the chapter on screen: from when it starts typing until the chapter has moved on
    const here = y > start && y < tops[i] + heights[i] - V*.35 && !reduced;
    if (head !== wr.shown){
      const from = Math.max(0, Math.min(head, wr.shown) - 4), to = Math.max(head, wr.shown) + 1;
      for (const c of wr.chars){
        if (c.at < from - 1 || c.at > to + 1) continue;
        c.el.classList.toggle('on', c.at < head);
        c.el.classList.toggle('hot', c.at < head && c.at >= head - 3);
      }
      if (wr.shown >= 0) for (const c of wr.chars) if (c.el.classList.contains('hot') && c.at < head - 3) c.el.classList.remove('hot');
      // park the cursor after the last typed letter (or before the first)
      let last = null; for (const c of wr.chars){ if (c.at < head) last = c; else break; }
      if (last) last.el.after(wr.cur); else wr.chars[0].el.before(wr.cur);
      wr.shown = head; wr.lastMove = now;
    }
    wr.cur.classList.toggle('show', here);
    wr.cur.classList.toggle('typing', now - wr.lastMove < 450 && head < wr.total);
  });
}

// ---------- camera path ----------
const fitDist = (R*SY/2)/Math.tan(THREE.MathUtils.degToRad(20)) * (land ? 1.12 : 1.02);
// [wp, eye xyz, target xyz]: wp is the wall chapter position (0 name, 1 MationX, 2 Recents …). The MationX stretch
// (0.5 → 2) is one long crane move: it starts high on the left and arcs down and across to the lower right,
// pushing in at the middle, so the camera is travelling the whole time the MationX copy is on screen.
// The school hold pushes in on the one phone that stays lit (it sits right of the copy on a wide screen, above it on a tall one).
const PB = base[PICK.i];
const PUSH_LAND = [PB.x - 1.05, PB.y + .05, 6.3, PB.x - 1.2, PB.y - .05, PB.z]; // close: the phone fills most of the height
const PUSH_PORT = [PB.x, PB.y - 1.9, 10.5, PB.x, PB.y - 1.55, PB.z];
const KP = land ? [
  [0,   -4.8,.4,fitDist,    -4.8,0,0],
  [.55, -8.4,4.6,11.6,      -7.4,3.8,1.2],
  [1,   -4.6,3.1,8.9,       -3.7,2.4,1.0],
  [1.5,  .9,1.1,8.2,         1.6,.5,1.0],
  [2,    6.4,-2.2,10.6,      7.6,-2.4,1.4],
  [3,   -1.6,-3.6,12.4,      -.8,-4.2,.3],
  [4,    4.4,4.2,9.2,        5.4,4.2,.9],
  [5,   -4.8,.35,fitDist*.98, -4.8,0,0],
  [6,   -4.8,.15,fitDist*1.02, -4.8,0,0],
  [6.45, ...PUSH_LAND],
  [7,   -4.8,.2,fitDist*1.04, -4.8,0,0],
  [8,   -4.8,.45,fitDist*1.1, -4.8,.1,0]
] : [
  [0,    0,.6,fitDist,      0,0,0],
  [.55, -3.4,9.4,15,       -3.0,8.8,1.5],
  [1,   -2.0,5.6,12.6,     -1.8,5.2,1.5],
  [1.5,   .9,1.6,12.2,       1.1,1.2,1.5],
  [2,    2.4,-1.8,13.4,     2.8,-2,1.5],
  [3,   -1.4,-8.4,14,     -1.2,-8.6,1],
  [4,    2,10.4,13,         2.4,10.2,1.2],
  [5,    0,.5,fitDist,      0,0,0],
  [6,    0,.4,fitDist*1.02, 0,0,0],
  [6.45, ...PUSH_PORT],
  [7,    0,.4,fitDist*1.04, 0,0,0],
  [8,    0,.6,fitDist*1.1,  0,.1,0]
];
const posCurve = new THREE.CatmullRomCurve3(KP.map(k=>new THREE.Vector3(k[1],k[2],k[3])), false, 'centripetal');
const tgtCurve = new THREE.CatmullRomCurve3(KP.map(k=>new THREE.Vector3(k[4],k[5],k[6])), false, 'centripetal');
const S = 9; // wall chapters
// wp → curve parameter (the curve is parametrised by point index)
// story time → camera position on the wall path. Sections hold (copy pinned) then transition; during a hold the
// camera keeps drifting a little (MationX the most), during a transition it travels to the next chapter.
// The school drifts all the way to its push-in, but only once the letters are up.
const HOLD_DRIFT = { 2: .4, 5: .12, 7: .45 };
// the push-in starts slowly as the first letter phones go out (IRIS_AT is .6 into the hold) and lands on the last one
const HOLD_EASE = { 7: h => smooth(.58, .97, h) };
function wallCam(st){
  const sec = Math.floor(st/2), within = st - 2*sec;
  if (sec < 1) return 0;
  const start = sec - 1, drift = HOLD_DRIFT[sec] || 0, hold = Math.min(within, 1), trans = Math.max(within - 1, 0);
  return trans > 0 ? lerp(start + drift, start + 1, trans) : start + drift*(HOLD_EASE[sec] ? HOLD_EASE[sec](hold) : hold);
}
function camParam(wp){
  let j = 0; while (j < KP.length - 2 && wp >= KP[j+1][0]) j++;
  const f = clamp01((wp - KP[j][0])/(KP[j+1][0] - KP[j][0]));
  return (j + f)/(KP.length - 1);
}

// ---------- input ----------
const ndc = new THREE.Vector2(9,9), ray = new THREE.Raycaster();
let mx=0, my=0, pmx=0, pmy=0, hover=-1, overLink=false, tapUntil=0;
const cross = document.getElementById('cross'), sel = document.getElementById('sel'), tag = document.getElementById('tag');
let mouseSeen = false;
addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') mouseSeen = true;
  ndc.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1);
  mx = ndc.x; my = ndc.y;
  overLink = !!e.target.closest('a,button');
  cross.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
}, {passive:true});
document.addEventListener('mouseleave', () => ndc.set(9,9));
addEventListener('pointerdown', e => { if (e.pointerType!=='mouse'){ ndc.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1); tapUntil = performance.now()+2200; } }, {passive:true});

document.getElementById('copy')?.addEventListener('click', () => {
  const t = document.getElementById('mailtxt').textContent, b = document.getElementById('copy');
  const done = () => { b.textContent = 'copied'; setTimeout(() => b.textContent = 'copy', 1600); };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(done).catch(()=>getSelection().selectAllChildren(document.getElementById('mailtxt')));
  else getSelection().selectAllChildren(document.getElementById('mailtxt'));
});

const JOBS = ['instagram · scroll + like','mationx · flow 3/3 running','internát · gate.open ✓','whatsapp · typing a reply','scanner · margin +18%','recents · transcribing 04:12','wear close · pulse to zuzka ♥'];
// the automation mix, chosen per phone exactly like the shader does (hash of its seed)
const mixJob = i => ['whatsapp · typing a reply','telegram · sending 3/12','instagram · liking the feed','tiktok · watching, liking'][aApp[i]];
const veilEl = document.querySelector('.veil'), copies = secs.map(s => s.querySelector('.copy')), progEl = document.querySelector('#progress i'), scrollCue = document.getElementById('scroll'), meEl = document.getElementById('me'), nav = document.querySelector('.nav'), reelCap = document.getElementById('reelCap');
const navLinks = [...document.querySelectorAll('.nav a')];
const sPhones = document.getElementById('sPhones'), sTaps = document.getElementById('sTaps');
const rPhones = reel(sPhones), rTaps = reel(sTaps), rHands = reel(document.getElementById('sHands')), rJobs = reel(document.getElementById('hJobs'));
const tapsNow = () => Math.floor(clock.live*3600*31.7).toLocaleString('en-US');
// the counters spin up like a slot machine every time the MationX chapter comes into view
new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ rPhones.reveal(String(phones)); rTaps.reveal(tapsNow()); rHands.reveal('0'); } }), {threshold:.6})
  .observe(document.querySelector('.stats'));
let tapT = 0;
document.getElementById('hDev').textContent = COUNT;

// ---------- "So far" ----------
const WALL_MODES = [{img:0}, {t:7}, {t:5}, {t:6}, {t:2}, {img:1}, {img:2}, {img:2}, {t:7}]; // … board, school reel (then letters), hackathon reel; at the close the phones just keep working behind him
// The timeline is data: add a milestone here and the chapter grows (its scroll length scales with the count).
// The wall spells out the milestone itself big (wall: '\\n' breaks the rows), the number that matters (note) under it,
// and the date smallest and dimmer at the bottom.
const MILESTONES = [
  { date:'Summer 2024', title:'Fiverr', text:'My first paid automation work, over the summer holidays. 31 orders.', wall:'FIVERR', note:'31 ORDERS' },
  { date:'Jan 2025', title:'TaskerProjects.com', text:'My first website, selling automations to anyone who would pay.', wall:'TASKER\nPROJECTS' },
  { date:'Aug 2025', title:'MationX', text:'TaskerProjects grew up and got a new name.', wall:'MATIONX' },
  { date:'Sep 2025', title:'Smíchovská', text:'Moved schools, straight into the second year.', wall:'SMÍCHOVSKÁ' },
  { date:'Nov 2025', title:'YouTube', text:'Started a channel. 28 videos so far, Tasker tutorials that send viewers to MationX, and every one of them earns.', wall:'YOUTUBE', note:'28 VIDEOS' },
  { date:'May 2026', title:'MationX Studio', text:'Launched the SaaS where every flow on this wall gets built.', wall:'MATIONX\nSTUDIO' },
  { date:'Sep 2026', title:'Second place', text:'Cursor Hackathon, Prague. Eighty projects, five hours each.', wall:'2ND\nPLACE', note:'OF 80' },
  { date:'Now', title:'Hundreds of phones', text:'A fleet that runs around the clock, from an office on Arbesovo náměstí.', wall:'500+\nPHONES' }
];
const ROAD_ST = 12; // story time where the "So far" chapter (section 6) starts holding
const tlList = document.querySelector('.tl-list'), tlEl = document.querySelector('.tl');
tlList.innerHTML = MILESTONES.map(m => `<li><span class="tl-date">${m.date}</span><span class="tl-title">${m.title}</span><span class="tl-text">${m.text}</span></li>`).join('');
document.getElementById('c6').style.setProperty('--len', 160 + MILESTONES.length*45);
const ROAD = [...tlList.children].map((li, i) => { const m = MILESTONES[i]; return { li, wall: [m.wall, m.note || '', m.date.toUpperCase()] }; });
let roadK = -1, roadT0 = -1e9;
function updateRoad(st, now){
  const k = Math.max(0, Math.min(ROAD.length-1, Math.floor((st - ROAD_ST)*ROAD.length)));
  if (k !== roadK){
    paintBoard(boardAG, boardATex, roadK >= 0 ? ROAD[roadK].wall : null);
    paintBoard(boardBG, boardBTex, ROAD[k].wall);
    roadK = k; roadT0 = now;
    ROAD.forEach((r, i) => { r.li.classList.toggle('on', i === k); r.li.classList.toggle('done', i < k); });
    // keep the current milestone at ~38% of the window
    requestAnimationFrame(() => { const li = ROAD[k].li; tlList.style.transform = `translateY(${(tlEl.clientHeight*.38 - li.offsetTop).toFixed(1)}px)`; });
  }
  uniforms.uBoardWipe.value = reduced ? 1.1 : clamp01((now - roadT0)/900)*1.1;
  tlEl.style.setProperty('--p', ((k + clamp01((st - ROAD_ST)*ROAD.length - k))/ROAD.length).toFixed(3));
}

// ---------- loop ----------
let storyNow = 0;
let sy = scrollY, last = performance.now(), boot = reduced ? 1.1 : 0, hudT = 0, ledT = 0, jobs = COUNT-3, phones = 512;
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), corner = new THREE.Vector3();
const CORNERS = [[-BW/2,-BH/2],[BW/2,-BH/2],[BW/2,BH/2],[-BW/2,BH/2]];

function frame(now){
  const dt = Math.min(.05,(now-last)/1000); last = now;
  if (!reduced) uniforms.uTime.value += dt;
  // the wall powers up right after the dive out of the MacBook
  boot = storyNow < .97 && !reduced ? 0 : Math.min(1.1, boot + dt*.8); uniforms.uBoot.value = boot;

  // clock + light
  clock.live = pragueHours();
  storyNow = storyAt(sy).st;
  const want = clock.preview ?? clock.live;
  const dh = ((want - clock.shown + 36) % 24) - 12;
  clock.shown = (clock.shown + (Math.abs(dh) < .01 ? dh : dh*(reduced?1:.05)) + 24) % 24;
  applyLight(NIGHT);

  sy += (scrollY - sy)*(reduced ? 1 : .085);
  const {prog, st} = storyAt(sy);
  updateWriting(sy, now);
  if (!land){
    const cur = Math.floor(st/2), within = st - 2*cur;
    // the darkened bottom reaches a little above wherever the current copy starts (long copy, taller shade)
    const top = copies[cur]?.getBoundingClientRect().top ?? innerHeight*.4;
    veilEl.style.height = `${Math.round(Math.min(innerHeight, Math.max(innerHeight*.5, innerHeight - top + 90)))}px`;
    copies.forEach((c, i) => { const o = i === cur ? 1 - smooth(1.0, 1.32, within) : i === cur + 1 ? smooth(1.55, 1.95, within) : i === cur - 1 ? 0 : 1; c.style.opacity = o.toFixed(3); });
  }
  // chapter 0 is the desk; the wall's own chapters start at 1
  const wp = Math.max(0, prog-1);
  let a = Math.floor(wp), f = wp-a; if (a>=S-1){ a=S-2; f=1; }
  const loc = smooth(.18,.86,f);

  // camera
  // the camera follows the scroll continuously (the smoothed scroll already eases it); no dwell between chapters
  const tt = camParam(Math.min(wallCam(st), S-1));
  posCurve.getPoint(tt, camPos); tgtCurve.getPoint(tt, camTgt);
  pmx += (mx-pmx)*.05; pmy += (my-pmy)*.05;
  const pm = (reduced || !fine) ? 0 : 1;
  fx.shake *= .9;
  const sk = fx.shake*.05;
  camera.position.set(camPos.x + pmx*.9*pm + Math.sin(now*.00021)*.25*pm + (Math.random()-.5)*sk, camPos.y + pmy*.6*pm + Math.cos(now*.00017)*.18*pm + (Math.random()-.5)*sk, camPos.z);
  camera.lookAt(camTgt);
  wall.rotation.y = pmx*.025*pm; wall.rotation.x = -pmy*.015*pm;

  // wall story. Each wall chapter either shows app screens (t = screen type) or a full-wall image
  // (img: 0 name, 1 milestone board, 2 hackathon photo); transitions sweep across the phones
  const U = uniforms, A = WALL_MODES[a], B = WALL_MODES[a+1];
  const isImg = m => m.img !== undefined ? 1 : 0;
  U.uWall.value = lerp(isImg(A), isImg(B), loc);
  U.uFrom.value = a === 0 ? 9 : (A.t ?? B.t ?? 9); U.uTo.value = B.t ?? A.t ?? 9;
  U.uSweep.value = (a === 0 ? smooth(.5, 1, loc) : loc)*1.05;
  U.uImgFrom.value = A.img ?? B.img ?? 0; U.uImgTo.value = B.img ?? A.img ?? 0; U.uImgWipe.value = loc*1.05;
  // the school beat runs inside its hold: photos → letters (a sweep) → dark from the outside in → one phone, me
  if (st >= LETTERS_AT && st < HACK_ST){
    if (st < SCHOOL_ST + 1){ U.uImgFrom.value = 2; U.uImgTo.value = 3; U.uImgWipe.value = clamp01((st - LETTERS_AT)/.1)*1.05; }
    else U.uImgFrom.value = 3; // leaving for the hackathon reel: the wipe (loc) carries the wall from the dark letters
  }
  U.uOne.value = smooth(IRIS_AT, ONE_AT - .02, st);
  U.uPickOn.value = smooth(ONE_AT - .04, ONE_AT + .02, st);
  updateRoad(st, now);

  const deskP = 1 - smooth(.97, 1.03, st);
  wall.visible = deskP < .999;
  // the desk brings its own lights; the wall's blue-tinted rig stays out of the room
  amb.intensity *= 1 - .95*deskP; key.intensity *= 1 - deskP; rim.intensity *= 1 - deskP;
  desk.update(st, now, {x:pmx*pm, y:pmy*pm}, reduced);
  flashEl.style.opacity = (smooth(.9, 1.0, st)*(1 - smooth(1.0, 1.14, st))*.9).toFixed(3);
  const stageT = paced(st - 2);
  updateSlot(stageT);
  updateStage(stageT, now);
  const headK = updateHead(st, now/1000);
  if (headK > 0){ uniforms.uDim.value = Math.max(uniforms.uDim.value, headK); uniforms.uGain.value *= 1 - .75*headK; } // the wall steps back behind him

  // hover via raycast (off while the stage owns the frame)
  let h = -1;
  // no hover while the desk owns the frame (a hidden wall still raycasts) or while the stage does
  if (ndc.x < 2 && (fine || mouseSeen || now < tapUntil) && U.uDim.value < .3 && wall.visible){
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(screens, false)[0];
    if (hit && hit.instanceId !== undefined) h = hit.instanceId;
  }
  if (overLink) h = -1;
  hover = h; U.uHover.value = h;
  const pickUp = st > ONE_AT && st < SCHOOL_ST + 1.15; // the one phone left comes out of the wall
  for (let i=0;i<COUNT;i++){
    const tg = ((i===hover || (i===PICK.i && pickUp)) && !reduced) ? 1 : 0;
    if (Math.abs(lift[i]-tg) > .002){ lift[i] += (tg-lift[i])*.18; place(i); bodies.instanceMatrix.needsUpdate = true; screens.instanceMatrix.needsUpdate = true; cables.instanceMatrix.needsUpdate = true; }
  }

  composer.render();

  if (hover >= 0){
    screens.getMatrixAt(hover, tmpM);
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for (const [cx,cy] of CORNERS){
      corner.set(cx,cy,0).applyMatrix4(tmpM).applyMatrix4(wall.matrixWorld).project(camera);
      const sx=(corner.x*.5+.5)*innerWidth, sy2=(-corner.y*.5+.5)*innerHeight;
      x0=Math.min(x0,sx); y0=Math.min(y0,sy2); x1=Math.max(x1,sx); y1=Math.max(y1,sy2);
    }
    const pad=6;
    sel.style.left=(x0-pad)+'px'; sel.style.top=(y0-pad)+'px'; sel.style.width=(x1-x0+pad*2)+'px'; sel.style.height=(y1-y0+pad*2)+'px';
    const inWall = U.uWall.value > .5;
    const typ = (U.uSweep.value > aDelay[hover]) ? U.uTo.value : U.uFrom.value;
    const job = (inWall || typ > 6.5) ? mixJob(hover) : JOBS[typ];
    tag.innerHTML = `<b>#${String(hover+1).padStart(3,'0')}</b>${job}`;
    sel.style.opacity = 1; cross.style.opacity = 0;
  } else { sel.style.opacity = 0; cross.style.opacity = (fine && !reduced && ndc.x<2) ? (overLink ? .35 : .9) : 0; }

  scrollCue.style.opacity = prog < .15 ? 1 : 0;
  progEl.style.transform = `scaleY(${clamp01(scrollY/Math.max(1, document.documentElement.scrollHeight - innerHeight)).toFixed(4)})`;
  const reel = REELS.find(r => st > r.from && st < r.to);
  const reelK = reel ? paintReel(reel, st) : -1;
  if (!reel) uniforms.uReelF.value = 0;
  {
    const f = reduced ? 0 : uniforms.uReelF.value; let moved = false;
    for (let i = 0; i < COUNT; i++){ const ft = f > 0 && f < 1 ? flipOf(i, f) : 0; if (ft !== flipT[i]){ flipT[i] = ft; place(i); moved = true; } }
    if (moved){ bodies.instanceMatrix.needsUpdate = screens.instanceMatrix.needsUpdate = cables.instanceMatrix.needsUpdate = true; }
  }
  if (REEL.video){
    const v = REEL.video, want = st > REELS[1].at[1] - REEL_SWEEP - .02 && st < HACK_ST + 1.2;
    // the pitch is the whole raw take, uncut (it only loops after a minute and a half); it starts loading as the
    // school chapter comes up and plays from the top every time its beat comes up
    if (st > SCHOOL_ST - 2 && v.preload !== 'auto'){ v.preload = 'auto'; v.load(); }
    if (want && v.paused){ if (!videoOn) v.currentTime = 0; v.play().catch(()=>{}); }
    else if (!want && !v.paused) v.pause();
    videoOn = want;
  }
  // "Me": over the group photo at the end of the hackathon reel, or over the one phone left at school
  let meAt = null;
  if (st >= ONE_AT + .02 && st < SCHOOL_ST + 1.02){ screens.getMatrixAt(PICK.i, tmpM); meAt = corner.set(0, SH/2 + .08, 0).applyMatrix4(tmpM).applyMatrix4(wall.matrixWorld); }
  else if (meUV && reel === REELS[1] && reelK === reel.items.length - 1 && st >= HACK_ST && st < HACK_ST + 1.02) meAt = wallPoint(meUV.u, meUV.v, corner).applyMatrix4(wall.matrixWorld);
  if (meAt){
    meAt.project(camera);
    meEl.style.transform = `translate(${(meAt.x*.5+.5)*innerWidth}px,${Math.max(56, (-meAt.y*.5+.5)*innerHeight)}px) translate(-50%,-100%)`;
  }
  meEl.style.opacity = meAt ? 1 : 0;
  // caption under the reel's bottom-left corner (kept on screen when the camera has pushed in); on a tall screen the
  // copy sits right under the reel, so the caption goes up top instead
  const caps = CAPTIONS.find(c => st > c.from && st < c.to);
  if (caps){
    const r = reelRegion(), k = beatAt(caps.at, st + REEL_SWEEP/2);
    wallPoint(r.x/faceC.width + .004, 1 - (r.y + r.h)/faceC.height - .012, corner).applyMatrix4(wall.matrixWorld).project(camera);
    const cx = Math.min(innerWidth - 240, Math.max(16, (corner.x*.5+.5)*innerWidth)), cy = land ? Math.min(innerHeight - 88, (-corner.y*.5+.5)*innerHeight) : 18;
    reelCap.style.transform = `translate(${cx}px,${cy}px)`;
    let key = caps.caps[k];
    // while the pitch plays, its caption runs the clock, so it reads as a video worth stopping for
    if (caps === CAPTIONS[1] && REELS[1].items[k]?.src === 'video' && REEL.video){
      const v = REEL.video, tm = s => `${Math.floor(s/60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      key = `${key} · ▶ ${tm(v.currentTime || 0)} / ${tm(v.duration || 97)}`;
    }
    if (reelCap.dataset.k !== key){ reelCap.dataset.k = key; reelCap.querySelector('span').textContent = key; reelCap.querySelector('b').textContent = String(k + 1).padStart(2, '0') + ' / ' + String(caps.caps.length).padStart(2, '0'); }
  }
  reelCap.style.opacity = caps && !(meAt && !land) ? 1 : 0; // on a tall screen the Me label takes the caption's place
  nav.style.opacity = ((st > SCHOOL_ST - .15 && st < HACK_ST + 1.1) || uniforms.uDim.value > .3) ? 0 : 1; // out of the reels' way

  // LEDs + HUD + live counters
  ledT += dt;
  if (ledT > .35 && !reduced){
    ledT = 0;
    for (let k=0;k<6;k++){ const i=Math.floor(Math.random()*COUNT); leds.setColorAt(i, Math.random()>.5 ? LEDOFF : (Math.random()>.85 ? AMBER : LEDGREEN)); }
    leds.instanceColor.needsUpdate = true;
  }
  tapT += dt; if (tapT > 1.4){ tapT = 0; rTaps.set(tapsNow()); } // a roll now and then, not a constant blur
  hudT += dt;
  if (hudT > .5){
    hudT = 0;
    jobs = Math.max(COUNT-6, Math.min(COUNT, jobs + (Math.random()>.5?1:-1)));
    if (Math.random() < .12) phones = Math.max(498, Math.min(526, phones + (Math.random() > .5 ? 1 : -1)));
    rJobs.set(String(jobs));
    rPhones.set(String(phones));
    hTime.textContent = hhmm(clock.preview ?? clock.live);
    hShift.textContent = shiftName(clock.live);
    const on = Math.max(Math.round(prog), 1) === 1 ? 0 : Math.round(prog); navLinks.forEach(l=>l.classList.toggle('on', +l.dataset.i===on));
  }
  requestAnimationFrame(frame);
}

// finale reel media
// the school photos are graded: mostly grey with a cool cast like the wall's ink, a little more contrast
function grade(im, sat){
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4){
    const l = (.299*p[i] + .587*p[i+1] + .114*p[i+2] - 128)*1.12 + 120;
    p[i] = l*.9*(1 - sat) + p[i]*sat; p[i+1] = l*.96*(1 - sat) + p[i+1]*sat; p[i+2] = l*1.06*(1 - sat) + p[i+2]*sat;
  }
  g.putImageData(d, 0, 0); return c;
}
const GRADE = {}; // photos are graded in the screen shader now (uFaceSat), so the pitch video gets the same look
['crowd', 'pitch', 'ivo', 'kate', 'prize', 'group', 'school', 'director'].forEach(n => { const im = new Image(); im.onload = () => { REEL[n] = n in GRADE ? grade(im, GRADE[n]) : im; if (n === 'pitch') paintPick(im); reelShown.reel = null; /* repaint: it may have been asked for before it loaded */ }; im.src = `/media/${n}.jpg`; });
let videoOn = false;
{ const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none'; v.setAttribute('playsinline', ''); v.src = '/media/pitch.mp4'; REEL.video = v; }
const fontsReady = document.fonts && document.fonts.load
  ? Promise.all(['900 120px "Big Shoulders Display"', '300 92px "Cormorant Garamond"', '400 64px Michroma', '400 20px Outfit', '700 20px Outfit', '900 20px Outfit'].map(f => document.fonts.load(f))).catch(()=>{})
  : Promise.resolve();
// debug: #shot=6.4 jumps straight to that story time (used for headless screenshots)
const SHOT = /shot=([\d.]+)/.exec(location.hash);
if (SHOT){ window.__pick = (x, y) => { const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(x/innerWidth*2 - 1, -(y/innerHeight)*2 + 1), camera); return r.intersectObject(phone, true).slice(0, 8).map(h => `${[].concat(h.object.material).map(m => m.name || m.type).join('|')} @${h.distance.toFixed(4)} vis:${h.object.visible}`); }; window.__ui = () => UI.toDataURL('image/png'); window.__video = () => REEL.video; window.__goSt = st => scrollTo(0, scrollForSt(st)); } // for headless checks
function scrollForSt(st){
  const i = Math.min(secs.length-1, Math.floor(st/2)), hold = Math.max(0, heights[i]-innerHeight), into = st - 2*i;
  return into <= 1 ? tops[i] + into*hold : tops[i] + hold + (into-1)*innerHeight;
}
// ---------- loader: counts phones "coming online" as the models and fonts actually load ----------
const ld = { el: document.getElementById('loader'), n: document.getElementById('ldN'), wallEl: document.getElementById('ldWall'), items: 0, total: 1, fonts: 0, t0: performance.now(), done: false };
THREE.DefaultLoadingManager.onStart = (u, l, t) => { ld.total = Math.max(ld.total, t); };
THREE.DefaultLoadingManager.onProgress = (u, l, t) => { ld.items = l; ld.total = Math.max(ld.total, t); paintLoader(); };
THREE.DefaultLoadingManager.onLoad = () => { ld.items = ld.total; paintLoader(); finishLoader(); };
// the loader's wall: 64 phones in a shuffled order, each lighting as its share of the load arrives; the newest ones
// flash amber or green for a moment, like the status lights on the real wall
const LD_CELLS = [...(ld.wallEl?.children || [])]; // the 64 cells are in the HTML, so the wall is there before any script loads
const LD_ORDER = LD_CELLS.map((_, i) => i).sort(() => Math.random() - .5);
let ldLit = 0;
function paintLoader(){
  const p = clamp01(.15*ld.fonts + .85*(ld.items/ld.total));
  if (ld.n) ld.n.textContent = String(Math.round(p*512)).padStart(3, '0');
  const want = Math.round(p*LD_CELLS.length);
  for (; ldLit < want; ldLit++){
    const c = LD_CELLS[LD_ORDER[ldLit]];
    c.className = Math.random() < .25 ? 'amb' : 'grn';
    setTimeout(() => { c.className = 'on'; }, 260 + Math.random()*240);
  }
}
function finishLoader(){
  if (ld.done || !ld.fonts || ld.items < ld.total) return;
  ld.done = true;
  // let the domains roll for a moment at least (they keep rolling as it fades), then lift and let the desk light come up
  setTimeout(() => { ld.el.classList.add('done'); desk.begin(); }, Math.max(0, 900 - (performance.now() - ld.t0)));
}
setTimeout(() => { if (!ld.done){ ld.done = true; ld.el.classList.add('done'); desk.begin(); } }, 9000);

const start = () => {
  fitLockup();
  ld.fonts = 1; paintLoader(); finishLoader();
  paintName(); paintMacName(); drawNotif(); measure();
  if (SHOT){ scrollTo(0, scrollForSt(+SHOT[1])); sy = scrollY; }
  requestAnimationFrame(frame);
};
fontsReady.then(start, start);

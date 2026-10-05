// Wear Close bracelet, C3: a flat leather strap with a pin-and-hole fastening, and the square NFC node in front.
// The strap is one piece swept along the wrist's oval: it starts at the back, runs all the way round under the
// node, and laps back over its own start, where a keeper loop holds both layers, a metal stud pokes through one of
// the tail's punched holes, and the tail ends in a rounded tip. Leather: a pebble grain normal map, edge paint a
// shade darker, a little sheen. Units: 1 = 10 cm.
import * as THREE from 'three';
import { slab } from './shapes.js';

const smooth = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a)/(b - a))); return t*t*(3 - 2*t); };

// ---------- leather grain ----------
// a tileable height field of small pebbles, turned into a normal map (and a roughness map from the same field)
let grainCache = null;
function leatherGrain(){
  if (grainCache) return grainCache;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  let seed = 7; const rnd = () => { seed = (seed*16807) % 2147483647; return seed/2147483647; };
  const blob = (x, y, r, a) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]){
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r*2, r*2);
    }
  };
  for (let i = 0; i < 5200; i++) blob(rnd()*S, rnd()*S, 2.2 + rnd()*4.2, .22 + rnd()*.3);
  // a few fine creases, the way real hide has them
  g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1;
  for (let i = 0; i < 140; i++){
    let x = rnd()*S, y = rnd()*S, a = rnd()*Math.PI; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++){ a += (rnd() - .5)*.9; x += Math.cos(a)*6; y += Math.sin(a)*6; g.lineTo(x, y); }
    g.stroke();
  }
  const h = g.getImageData(0, 0, S, S).data, H = (x, y) => h[(((y + S) % S)*S + ((x + S) % S))*4]/255;
  const nC = document.createElement('canvas'); nC.width = nC.height = S;
  const nG = nC.getContext('2d'), nd = nG.createImageData(S, S);
  const rC = document.createElement('canvas'); rC.width = rC.height = S;
  const rG = rC.getContext('2d'), rd = rG.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const dx = (H(x + 1, y) - H(x - 1, y))*2.2, dy = (H(x, y + 1) - H(x, y - 1))*2.2, l = Math.hypot(dx, dy, 1), i = (y*S + x)*4;
    nd.data[i] = (-dx/l*.5 + .5)*255; nd.data[i+1] = (dy/l*.5 + .5)*255; nd.data[i+2] = (1/l*.5 + .5)*255; nd.data[i+3] = 255;
    const r = 150 + (H(x, y) - .5)*-120; rd.data[i] = rd.data[i+1] = rd.data[i+2] = r; rd.data[i+3] = 255; // pebble tops a touch smoother
  }
  nG.putImageData(nd, 0, 0); rG.putImageData(rd, 0, 0);
  const tex = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  return (grainCache = { normal: tex(nC), rough: tex(rC) });
}

// ---------- sweeping a rounded-rectangle section along a path ----------
// frames[i] = { c: centre, t: tangent, o: the "out" direction (thickness), w: width, d: thickness, u: arc length }
// The width runs along o × t. Section corners are rounded with radius ~half the thickness; vertices on the narrow
// edges get the edge colour. Open sweeps get flat end caps.
function sweep(frames, { closed = false, cs = 5, face = new THREE.Color(1,1,1), edge = face, uScale = 1 } = {}){
  const P = 4*(cs + 1), pos = [], nrm = [], col = [], uv = [], idx = [];
  const a1 = new THREE.Vector3(), q = new THREE.Vector3(), nv = new THREE.Vector3();
  for (const f of frames){
    a1.crossVectors(f.o, f.t).normalize();
    const rc = Math.min(f.d*.32, f.w*.5), hx = Math.max(0, f.w/2 - rc), hy = Math.max(0, f.d/2 - rc);
    for (let k = 0; k < 4; k++){
      const sx = k === 0 || k === 3 ? 1 : -1, sy = k < 2 ? 1 : -1;
      for (let j = 0; j <= cs; j++){
        const th = (k + j/cs)*Math.PI/2, cx = Math.cos(th), cy = Math.sin(th);
        q.copy(f.c).addScaledVector(a1, sx*hx + rc*cx).addScaledVector(f.o, sy*hy + rc*cy);
        nv.copy(a1).multiplyScalar(cx).addScaledVector(f.o, cy).normalize();
        pos.push(q.x, q.y, q.z); nrm.push(nv.x, nv.y, nv.z);
        const e = Math.abs(cx) > .62 ? 1 : 0, cc = e ? edge : face; col.push(cc.r, cc.g, cc.b);
        uv.push(f.u*uScale, (sx*hx + rc*cx)*uScale + .5); // world-scaled both ways, so the grain isn't stretched
      }
    }
  }
  const n = frames.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++){
    const i2 = (i + 1) % n;
    for (let j = 0; j < P; j++){
      const j2 = (j + 1) % P, a = i*P + j, b = i2*P + j, c = i*P + j2, d = i2*P + j2;
      idx.push(a, c, b, c, d, b);
    }
  }
  if (!closed){
    for (const [ri, sgn] of [[0, -1], [n - 1, 1]]){
      const f = frames[ri], base = pos.length/3;
      pos.push(f.c.x, f.c.y, f.c.z); nrm.push(f.t.x*sgn, f.t.y*sgn, f.t.z*sgn); col.push(edge.r, edge.g, edge.b); uv.push(f.u*uScale, .5);
      for (let j = 0; j < P; j++){
        const s = ri*P + j; pos.push(pos[s*3], pos[s*3+1], pos[s*3+2]); nrm.push(f.t.x*sgn, f.t.y*sgn, f.t.z*sgn); col.push(edge.r, edge.g, edge.b); uv.push(uv[s*2], uv[s*2+1]);
      }
      for (let j = 0; j < P; j++){ const a = base + 1 + j, b = base + 1 + (j + 1) % P; if (sgn > 0) idx.push(base, a, b); else idx.push(base, b, a); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

// ---------- the bracelet ----------
export const STRAP = { RX: .3, RZ: .235, W: .092, T: .022, NODE: .16, NODE_D: .05 };
// shape: each bracelet is its own piece of leather: its wrist (RX, RZ), its bends (seed), how far the tail runs past the
// stud (OV, which hole it's done up on), how many holes show
export function makeStrap(stone, envTex, shape = {}){
  const { W, T, NODE, NODE_D } = STRAP;
  const RX = shape.RX ?? STRAP.RX, RZ = shape.RZ ?? STRAP.RZ, OV = shape.OV ?? .95, HOLES = shape.holes ?? 3, STUD = shape.studAt ?? .36, KEEP = shape.keeperAt ?? .13;
  let sd = (shape.seed ?? 1)*7919 % 233280; const rnd = () => { sd = (sd*9301 + 49297) % 233280; return sd/233280; };
  const g = new THREE.Group();
  const grain = leatherGrain();
  const leather = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: stone ? .82 : .74, roughnessMap: grain.rough,
    normalMap: grain.normal, normalScale: new THREE.Vector2(.28, .28),
    sheen: stone ? .45 : .3, sheenRoughness: .55, sheenColor: new THREE.Color(stone ? 0xfff3e2 : 0x77736e),
    envMap: envTex, envMapIntensity: stone ? .5 : .65
  });
  const face = new THREE.Color(stone ? 0xcdbba4 : 0x353331), edgeC = new THREE.Color(stone ? 0xa8937b : 0x1d1c1b);
  // metal: champagne rose gold for Stone, black anodised for Charcoal
  const bezM = new THREE.MeshStandardMaterial({ color: stone ? 0xd8b08c : 0x1d1d20, metalness: stone ? 1 : .85, roughness: stone ? .24 : .34, envMap: envTex, envMapIntensity: stone ? .85 : .7, emissive: 0x000000 });
  const studM = bezM.clone(); // the same metal, but it doesn't light up with the node when a pulse lands
  // the node's face: frosted ceramic, cream or charcoal
  const capM = new THREE.MeshPhysicalMaterial({ emissive: 0x000000, color: stone ? 0xd9ccb9 : 0x18181a, roughness: .6, metalness: 0, sheen: .25, sheenRoughness: .7, sheenColor: new THREE.Color(stone ? 0xffffff : 0x55555a), envMap: envTex, envMapIntensity: .55 });

  // the wrist's oval, never quite perfect and never in one plane (worn leather keeps its own bends, different on each
  // bracelet), flattened where the rigid node sits on it. Every term repeats once per turn, so the tail stays on the start.
  const ph = [0, 0, 0, 0, 0].map(() => rnd()*Math.PI*2), amp = [.018 + .016*rnd(), .008 + .012*rnd(), .014 + .016*rnd()];
  const wob = a => 1 + amp[0]*Math.sin(3*a + ph[0]) + amp[1]*Math.sin(5*a + ph[1]) + amp[2]*Math.sin(2*a + ph[2]);
  const wA = .012 + .01*rnd(), wB = .006 + .006*rnd();
  const warp = a => wA*Math.sin(2*a + ph[3]) + wB*Math.sin(3*a + ph[4]);
  const zFront = RZ*wob(Math.PI/2);
  const pathAt = (a, out) => {
    const k = wob(a); out.set(RX*k*Math.cos(a), warp(a), RZ*k*Math.sin(a));
    if (out.z > 0){ const f = 1 - smooth(NODE*.42, NODE*.78, Math.abs(out.x)); out.z = THREE.MathUtils.lerp(out.z, zFront, f); }
    return out;
  };
  // the strap: from its start at the back (under), all the way round, and over its own start as the tail
  // where the strap starts (and so where the fastening sits): on a side, where a three-quarter view sees the stud and the holes
  const A0 = shape.startA ?? -Math.PI/2 - .45, A1 = A0 + Math.PI*2 + OV;
  const tipLen = (W/2)/((RX + RZ)/2); // a semicircular tip, in angle
  const lift = a => T*1.04*smooth(A0 + Math.PI*2 - .32, A0 + Math.PI*2 - .03, a);
  const N = 900, frames = [], p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  let u = 0, prev = null;
  const frameAt = (a, liftBy = lift(a)) => {
    pathAt(a, p0); pathAt(a + 1e-3, p1);
    const t = p1.clone().sub(p0).normalize(), o = new THREE.Vector3(t.z, 0, -t.x);
    if (o.dot(p0) < 0) o.negate();
    return { c: p0.clone().addScaledVector(o, liftBy), t, o };
  };
  for (let i = 0; i <= N; i++){
    const a = A0 + (A1 - A0)*i/N, f = frameAt(a);
    if (prev) u += f.c.distanceTo(prev);
    prev = f.c;
    const tip = smooth(A1 - tipLen, A1, a), w = W*Math.sqrt(Math.max(.0004, 1 - tip*tip));
    frames.push({ ...f, w, d: T, u });
  }
  const strap = new THREE.Mesh(sweep(frames, { face, edge: edgeC, uScale: 1/.2 }), leather); // one grain tile per 2 cm
  g.add(strap);

  // keeper loop: a short band of the same leather wrapped round both layers
  {
    const ak = A0 + KEEP, f = frameAt(ak, 0), up = new THREE.Vector3(0, 1, 0);
    const hx = T*1.04 + T/2 + .007, hn = -T/2 - .005, hy = W/2 + .007; // spans from under the base to over the tail
    const kf = [], KN = 64; let ku = 0, kp = null;
    const outC = (hx + hn)/2, outH = (hx - hn)/2, rC = .012;
    for (let i = 0; i < KN; i++){
      // a rounded rectangle in the strap's (out, up) plane, centred on both layers
      const s = i/KN*Math.PI*2, cx = Math.cos(s), cy = Math.sin(s);
      const ex = Math.sign(cx)*Math.max(0, outH - rC) + rC*cx, ey = Math.sign(cy)*Math.max(0, hy - rC) + rC*cy;
      const c = f.c.clone().addScaledVector(f.o, outC + ex).addScaledVector(up, ey);
      const nx = cx, ny = cy, o = f.o.clone().multiplyScalar(nx).addScaledVector(up, ny).normalize();
      const t = new THREE.Vector3().crossVectors(f.t, o).normalize(); // the way the loop runs
      if (kp) ku += c.distanceTo(kp); kp = c;
      kf.push({ c, t, o, w: .048, d: .011, u: ku });
    }
    g.add(new THREE.Mesh(sweep(kf, { closed: true, face, edge: edgeC, uScale: 1/.2 }), leather));
  }
  // the stud through the tail, and the punched holes after it
  const surf = (a, extra = 0) => { const f = frameAt(a); return { p: f.c.clone().addScaledVector(f.o, T/2 + extra), o: f.o }; };
  const tailA = a => a + Math.PI*2; // the tail runs over the start, one turn later
  {
    const { p, o } = surf(tailA(A0 + STUD));
    const stud = new THREE.Mesh(new THREE.SphereGeometry(.017, 28, 14, 0, Math.PI*2, 0, Math.PI/2), studM);
    stud.scale.set(1, .62, 1); stud.position.copy(p); stud.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), o); g.add(stud);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.0175, .0028, 10, 32), studM);
    collar.position.copy(p); collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), o); g.add(collar);
  }
  const holeM = new THREE.MeshStandardMaterial({ color: stone ? 0x4a3f34 : 0x0b0b0b, roughness: 1, metalness: 0 });
  const rimM = new THREE.MeshStandardMaterial({ color: edgeC, roughness: .7, metalness: 0 });
  for (let k = 1; k <= HOLES; k++){
    const da = STUD + .13*k;
    if (da > OV - tipLen - .03) break; // never punched into the rounded tip
    const { p, o } = surf(tailA(A0 + da), .0006);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), o);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(.0105, 24), holeM); hole.position.copy(p); hole.quaternion.copy(q); g.add(hole);
    const rim = new THREE.Mesh(new THREE.RingGeometry(.0105, .0135, 28), rimM); rim.position.copy(p).addScaledVector(o, .0002); rim.quaternion.copy(q); g.add(rim);
  }

  // the node: a metal frame with a frosted face, sitting on the strap in front
  const node = new THREE.Group();
  node.add(new THREE.Mesh(slab(NODE, NODE, NODE_D, .048, .01), bezM));
  const cap = new THREE.Mesh(slab(NODE - .022, NODE - .022, .012, .038, .005), [capM, capM]); cap.position.z = NODE_D/2 - .004; node.add(cap);
  node.position.set(0, warp(Math.PI/2), zFront + T/2 + NODE_D/2 - .003);
  g.add(node);
  return { g, node, bezM, capM };
}

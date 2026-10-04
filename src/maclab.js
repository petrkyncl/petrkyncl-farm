// Dev-only: the MacBook alone, to identify its parts and check the lid hinge.
// /mac-lab.html#front | #side | #top    ?open=0..1 lid angle factor (when hinged)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const view = (location.hash || '#front').slice(1);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1b1f);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
const cam = new THREE.PerspectiveCamera(30, innerWidth/innerHeight, .01, 10);
const P = { front:[0,.22,.75], side:[.8,.15,0], top:[0,.9,.05], back:[0,.25,-.8], quarter:[.5,.35,.55], hinge:[.42,.02,-.11], lowside:[.6,.012,.0], frontedge:[.6,.004,.1], backedge:[.6,.004,-.11] }[view] || [0,.22,.75];
let ortho = null;
if (view === 'frontedge' || view === 'backedge'){
  // orthographic, exactly perpendicular to the side, 2 cm tall window around the edge
  const z = view === 'frontedge' ? .1 : -.11, hh = .012, a = innerWidth/innerHeight;
  ortho = new THREE.OrthographicCamera(-hh*a, hh*a, hh, -hh, .01, 5); ortho.position.set(.6, .002, z); ortho.lookAt(0, .002, z);
} else { cam.position.set(...P); if (view==='hinge') cam.lookAt(.12, .004, -.1); else if (view==='lowside') cam.lookAt(0,.004,0); else cam.lookAt(0, .07, -.04);
  if (view==='hinge'||view==='lowside'){ cam.fov = view==='hinge' ? 8 : 12; cam.updateProjectionMatrix(); } }

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('/models/macbook-pro-14-m5.glb');
scene.add(gltf.scene); scene.updateMatrixWorld(true);
// optional hinge test: ?lid=<radians>&py=<pivot y>&pz=<pivot z>
const qs = new URLSearchParams(location.search);
// hinge solver: ?solve — finds the closing angle that lays the lid shell flat, and the pivot that puts the closed
// lid flush with the base's front edge, sitting on its top
if (qs.has('solve')){
  const LID = ['KjpcUkkMjGYeXkV','JNlPAPsywCtwJrd','QSjoCOCzvxPnLpK','LQtuXuSGFKsUXjP','nAIWMiVEtSYdjdZ','tfTbkkzhxqpKRgC','xiLiwJHfkqIwaTs','LBeBZdkKmrJVhJd','OCxZAMeEkQKexHA','XodVrcYKiUPGCmX','eFpSjyrDhTgtyuf','MwJmMcLbTBwQpxl','WyuoVWKMOcOlXJM'];
  const pts = (pred, yMin = -1) => { const out = []; const v = new THREE.Vector3(); gltf.scene.traverse(o => { if (!o.isMesh || !pred(o)) return; const p = o.geometry.attributes.position; for (let i=0;i<p.count;i++){ v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y > yMin) out.push(v.y, v.z); } }); return out; };
  // flat part only: the hinge barrel at the bottom of the open lid (y < 3 cm) would skew both metrics
  const shell = pts(o => o.name === 'KjpcUkkMjGYeXkV', .03), lidP = pts(o => LID.includes(o.name) && o.name !== 'WyuoVWKMOcOlXJM', .025), baseP = pts(o => !LID.includes(o.name));
  const rot = (arr, a) => { const c = Math.cos(a), s = Math.sin(a), out = new Float64Array(arr.length); for (let i=0;i<arr.length;i+=2){ out[i] = arr[i]*c - arr[i+1]*s; out[i+1] = arr[i]*s + arr[i+1]*c; } return out; };
  const ext = (arr, k) => { let lo = 1e9, hi = -1e9; for (let i=k;i<arr.length;i+=2){ lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); } return [lo, hi]; };
  // flatness: the shell's height range is smallest when it lies level
  let a0 = 1.7, a1 = 2.2;
  for (let it=0; it<60; it++){ const m1 = a0 + (a1-a0)*.382, m2 = a0 + (a1-a0)*.618; const h1 = ext(rot(shell,m1),0), h2 = ext(rot(shell,m2),0); if (h1[1]-h1[0] < h2[1]-h2[0]) a1 = m2; else a0 = m1; }
  const A = (a0+a1)/2, L = rot(lidP, A);
  const [ly0, ly1] = ext(L, 0), [lz0, lz1] = ext(L, 1);
  const by = ext(baseP, 0), bz = ext(baseP, 1);
  // base top = the highest base vertex inside the lid's footprint
  const top = by[1]; // the deck (top case) is the base's highest surface
  const ty = top + .0002 - ly0, tz = bz[1] - lz1; // sit on top with a hair of clearance, front edges flush
  // pivot p with  R p' + (I - R) p = translation  →  solve (I - R) p = t
  const c = Math.cos(A), s = Math.sin(A), m00 = 1 - c, m01 = s, m10 = -s, m11 = 1 - c, det = m00*m11 - m01*m10;
  const py = ( m11*ty - m01*tz)/det, pz = (-m10*ty + m00*tz)/det;
  window.solve = { angle:+A.toFixed(5), pivot:[+py.toFixed(5), +pz.toFixed(5)], lidThick:+((ly1-ly0)*1000).toFixed(2), shellH:+((ext(rot(shell,A),0)[1]-ext(rot(shell,A),0)[0])*1000).toFixed(2), baseTop:+top.toFixed(5), lidLen:+((lz1-lz0)*1000).toFixed(2), baseLen:+((bz[1]-bz[0])*1000).toFixed(2) };
  qs.set('lid', A); qs.set('py', py); qs.set('pz', pz); if (!qs.has('noextra')) qs.set('extra', 'WyuoVWKMOcOlXJM');
}
(qs.get('hide')||'').split(',').filter(Boolean).forEach(n => { const o = gltf.scene.getObjectByName(n); if (o) o.visible = false; });
if (qs.has('lid') || qs.has('solve')){
  const LID_PARTS = ['KjpcUkkMjGYeXkV','JNlPAPsywCtwJrd','QSjoCOCzvxPnLpK','LQtuXuSGFKsUXjP','nAIWMiVEtSYdjdZ','tfTbkkzhxqpKRgC','xiLiwJHfkqIwaTs','LBeBZdkKmrJVhJd','OCxZAMeEkQKexHA','XodVrcYKiUPGCmX','eFpSjyrDhTgtyuf','MwJmMcLbTBwQpxl'];
  const pivot = new THREE.Group(); pivot.position.set(0, +(qs.get('py') ?? 0), +(qs.get('pz') ?? -.108)); gltf.scene.add(pivot); gltf.scene.updateMatrixWorld(true);
  const extra = (qs.get('extra') || '').split(',').filter(Boolean);
  const lid = []; gltf.scene.traverse(o => { if (o.isMesh && (LID_PARTS.includes(o.name) || extra.includes(o.name))) lid.push(o); });
  lid.forEach(o => pivot.attach(o));
  pivot.rotation.x = +qs.get('lid'); scene.updateMatrixWorld(true);
  // precise (per-vertex) extents of the lid and of the base, in model space
  const box = objs => { const b = new THREE.Box3(); objs.forEach(o => b.expandByObject(o, true)); return b; };
  const base = []; gltf.scene.traverse(o => { if (o.isMesh && !lid.includes(o)) base.push(o); });
  const lb = box(lid), bb = box(base);
  // also the lid's outer shell alone, to judge how flat it lies
  const shell = box(lid.filter(o => o.name === 'KjpcUkkMjGYeXkV'));
  const r = a => a.toArray().map(v => +v.toFixed(5));
  window.lidBox = { lid:[r(lb.min), r(lb.max)], shell:[r(shell.min), r(shell.max)], base:[r(bb.min), r(bb.max)] };
  // which lid meshes end up behind the base's back edge once closed
  const v = new THREE.Vector3(), stray = {};
  lid.forEach(o => { const p = o.geometry.attributes.position; let n = 0, ymin = 1, ymax = -1, zmin = 1;
    for (let i=0;i<p.count;i++){ v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.z < bb.min.z - .0003){ n++; ymin = Math.min(ymin, v.y); ymax = Math.max(ymax, v.y); zmin = Math.min(zmin, v.z); } }
    if (n) stray[o.name] = {n, of:p.count, y:[+ymin.toFixed(4), +ymax.toFixed(4)], zmin:+zmin.toFixed(4)}; });
  window.lidBox.stray = stray;
}
const rows = [];
gltf.scene.traverse(o => {
  if (!o.isMesh) return;
  const b = new THREE.Box3().setFromObject(o), m = o.material;
  rows.push({ node:o.name, parent:o.parent?.name, mat:m.name, color:'#'+m.color.getHexString(), met:+m.metalness.toFixed(2), rough:+m.roughness.toFixed(2),
    maps:['map','normalMap','emissiveMap','metalnessMap'].filter(k => m[k]).join(','), tris:(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3,
    min:b.min.toArray().map(v=>+v.toFixed(3)), max:b.max.toArray().map(v=>+v.toFixed(3)) });
});
window.parts = rows;
const nodes = []; gltf.scene.traverse(o => nodes.push(`${'  '.repeat(depth(o))}${o.type} ${o.name}`));
function depth(o){ let d = 0; while (o.parent && o.parent !== scene){ d++; o = o.parent; } return d; }
window.tree = nodes.join('\n');
renderer.render(scene, ortho || cam);
document.title = 'ready';

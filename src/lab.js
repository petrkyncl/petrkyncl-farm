// Dev-only: the iPhone alone, framed like Petr's reference photo, for side-by-side checks.
// /phone-lab.html#back (default) | #front | #side | #card
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPhone, createCard, loadIphone, paint, DEEP_BLUE, PH, PD, CARD } from './phone.js';

const view = (location.hash || '#back').slice(1);
const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xffffff); window.labScene = scene;
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
const key = new THREE.DirectionalLight(0xffffff, .8); key.position.set(-2, 3, -4); scene.add(key);
scene.add(new THREE.AmbientLight(0xffffff, .6));

const useGlb = location.search.includes('glb');
const ph = createPhone(envTex); if (!useGlb) scene.add(ph.phone);
if (view === 'card' || location.search.includes('card')){ const c = createCard(envTex); c.card.position.set(0, ph.magsafe[1], ph.backZ - CARD.d/2 - .0006); ph.phone.add(c.card); }

// orthographic, phone body filling 963 of 1024 px like the reference
const aspect = innerWidth/innerHeight, h = PH/(963/1024);
const cam = new THREE.OrthographicCamera(-h*aspect/2, h*aspect/2, h/2, -h/2, .01, 20);
if (view === 'front'){ cam.position.set(0, 0, 5); }
else if (view === 'island'){ const z = .14; cam.left = -z*aspect; cam.right = z*aspect; cam.top = .737 + z; cam.bottom = .737 - z; cam.updateProjectionMatrix(); cam.position.set(0, 0, 5); }
else if (view === 'side'){ cam.position.set(5, 0, 0); }
else if (view === 'cardside'){ const z = .32; cam.left = -z*aspect; cam.right = z*aspect; cam.top = -.02 + z; cam.bottom = -.02 - z; cam.updateProjectionMatrix(); cam.position.set(5, 0, -.3); }
else { cam.position.set(0, 0, -5); }
cam.lookAt(0, 0, 0);
if (useGlb){
  const { model, mats } = await loadIphone('/models/iphone-17-pro-max.glb', envTex);
  window.mats = mats; paint(mats, DEEP_BLUE); scene.add(model);
  // ?red=Mat%20Name,Other  paints materials red to identify parts
  (new URLSearchParams(location.search).get('red') || '').split(',').filter(Boolean).forEach(n => { const m = mats[n]; if (m){ m.color.setHex(0xff0000); if (m.emissive) m.emissive.setHex(0x660000); m.map = null; m.needsUpdate = true; } });
  console.log(Object.keys(mats).join(', '));
}
renderer.render(scene, cam);
document.title = 'ready';

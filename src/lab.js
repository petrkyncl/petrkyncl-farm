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
if (view === 'card'){ const c = createCard(envTex); c.card.position.set(0, ph.magsafe[1], ph.backZ - CARD.d/2 - .0006); ph.phone.add(c.card); }

// orthographic, phone body filling 963 of 1024 px like the reference
const aspect = innerWidth/innerHeight, h = PH/(963/1024);
const cam = new THREE.OrthographicCamera(-h*aspect/2, h*aspect/2, h/2, -h/2, .01, 20);
if (view === 'front'){ cam.position.set(0, 0, 5); }
else if (view === 'side'){ cam.position.set(5, 0, 0); }
else { cam.position.set(0, 0, -5); }
cam.lookAt(0, 0, 0);
if (useGlb){
  const { model, mats } = await loadIphone('/models/iphone-17-pro-max.glb', envTex);
  window.mats = mats; paint(mats, DEEP_BLUE); scene.add(model);
  console.log(Object.keys(mats).join(', '));
}
renderer.render(scene, cam);
document.title = 'ready';

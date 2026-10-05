// /head-lab.html: the dotted head alone, to tune it. ?yaw=0.3 fixes the turn (for screenshots), otherwise the mouse turns it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createHead } from './head.js';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070b);
const camera = new THREE.PerspectiveCamera(30, innerWidth/innerHeight, .01, 50); camera.position.set(0, 0, 2.3);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .35, .4, .6));
composer.addPass(new OutputPass());

const head = await createHead();
scene.add(head.group); window.__head = head;
const fixedYaw = q.has('yaw') ? +q.get('yaw') : null;
head.uniforms.uIn.value = q.has('in') ? +q.get('in') : 0;
let mx = 0, my = 0, yaw = 0, pitch = 0, t0 = performance.now();
addEventListener('pointermove', e => { mx = e.clientX/innerWidth*2 - 1; my = e.clientY/innerHeight*2 - 1; });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); });
function frame(now){
  const t = (now - t0)/1000;
  head.uniforms.uTime.value = t;
  if (!q.has('in')) head.uniforms.uIn.value = Math.min(1, t/2.2);
  head.uniforms.uPx.value = renderer.domElement.height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  head.uniforms.uScan.value = .55 - ((t*.22) % 1.6);
  const ty = fixedYaw ?? mx*1.2 + Math.sin(t*.3)*.06, tp = fixedYaw !== null ? 0 : my*.18;
  yaw += (ty - yaw)*.06; pitch += (tp - pitch)*.06;
  head.group.rotation.set(q.has('pitch') ? +q.get('pitch') : pitch, yaw, 0);
  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

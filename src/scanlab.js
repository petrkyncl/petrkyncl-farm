// /scan-lab.html?yaw=0: the raw head scan (textured), to see what the phone captured
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x20232a);
const camera = new THREE.PerspectiveCamera(30, innerWidth/innerHeight, .01, 100);
scene.add(new THREE.AmbientLight(0xffffff, 2.5));
const gltf = await new GLTFLoader().loadAsync('/models/_scan.glb');
const m = gltf.scene; const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
m.traverse(o => { if (o.isMesh){ o.material = new THREE.MeshBasicMaterial({ map: o.material.map }); } });
const piv = new THREE.Group(); m.position.sub(c); piv.add(m); scene.add(piv);
piv.rotation.y = +(q.get('yaw') || 0);
camera.position.set(0, 0, Math.max(sz.x, sz.y)*2.2); camera.lookAt(0, 0, 0);
renderer.render(scene, camera);
window.__info = { size: sz.toArray(), center: c.toArray() };

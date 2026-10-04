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
const P = { front:[0,.22,.75], side:[.8,.15,0], top:[0,.9,.05], back:[0,.25,-.8], quarter:[.5,.35,.55] }[view] || [0,.22,.75];
cam.position.set(...P); cam.lookAt(0, .07, -.04);

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('/models/macbook-pro-14-m5.glb');
scene.add(gltf.scene); scene.updateMatrixWorld(true);
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
renderer.render(scene, cam);
document.title = 'ready';

// The intro: a desk in a quiet room, nothing on it but the MacBook. It opens, the screen lights up with the
// miniature phone wall, and the camera dives into it, which is where the page cuts to the real wall.
// The whole desk rides with the camera; a virtual camera path inside desk space frames each shot.
// Units: 1 = 10 cm. The viewer sits in front of the desk, looking toward -z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { slab } from './shapes.js';

const clamp01 = v => v<0 ? 0 : v>1 ? 1 : v;
const smooth = (a,b,t) => { t = clamp01((t-a)/(b-a)); return t*t*(3-2*t); };
const lerp = (a,b,t) => a + (b-a)*t;
const easeIO = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const easeIn = t => t*t*t;

// light oak: pale base, fine darker grain, a few lighter streaks, a soft tone gradient across the plank
function oakTexture(){
  const c = document.createElement('canvas'); c.width = 2048; c.height = 512;
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.fillStyle = '#c9ab7e'; g.fillRect(0,0,w,h);
  let s = 11; const r = () => (s = (s*16807) % 2147483647) / 2147483647;
  for (let i=0;i<320;i++){
    const y0 = r()*h, amp = 3 + r()*14, f = .0015 + r()*.004, ph = r()*6, a = .04 + r()*.12, dark = r() > .35;
    g.strokeStyle = dark ? `rgba(120,86,52,${a})` : `rgba(240,222,190,${a*.9})`;
    g.lineWidth = dark ? .5 + r()*1.8 : 1 + r()*3; g.beginPath();
    for (let x=0;x<=w;x+=16){ const y = y0 + Math.sin(x*f+ph)*amp + Math.sin(x*f*3.1+ph*2)*amp*.25; x ? g.lineTo(x,y) : g.moveTo(x,y); }
    g.stroke();
  }
  // plank joints
  g.fillStyle = 'rgba(100,72,44,.35)';
  [.33, .66].forEach(k => g.fillRect(0, h*k, w, 1.5));
  const grd = g.createLinearGradient(0,0,0,h); grd.addColorStop(0,'rgba(0,0,0,.06)'); grd.addColorStop(.5,'rgba(255,255,255,.04)'); grd.addColorStop(1,'rgba(0,0,0,.08)');
  g.fillStyle = grd; g.fillRect(0,0,w,h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createDesk({ envTex, nameTex, stacked }){
  const root = new THREE.Group(); root.matrixAutoUpdate = false;
  const scene = new THREE.Group(); root.add(scene);

  // ---------- room ----------
  const wallM = new THREE.MeshStandardMaterial({color:0x766f68, roughness:.96});
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), wallM); backWall.position.set(0, 5, -5.2); scene.add(backWall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({color:0x3a383a, roughness:.92}));
  floor.rotation.x = -Math.PI/2; floor.position.set(0, -7.4, 10); scene.add(floor);

  // ---------- desk: light oak top on dark steel legs ----------
  const oak = oakTexture();
  const deskTopM = new THREE.MeshStandardMaterial({map:oak, roughness:.62, metalness:0, envMap:envTex, envMapIntensity:.22});
  const deskTop = new THREE.Mesh(slab(17, 7.4, .36, .18, .05), [deskTopM, deskTopM]);
  deskTop.rotation.x = -Math.PI/2; deskTop.position.set(0, -.18, 0); scene.add(deskTop);
  const legM = new THREE.MeshStandardMaterial({color:0x3a3b40, metalness:.5, roughness:.6, envMap:envTex, envMapIntensity:.3});
  [-7.6, 7.6].forEach(x => { const leg = new THREE.Mesh(new THREE.BoxGeometry(.5, 7.2, 6.4), legM); leg.position.set(x, -3.95, 0); scene.add(leg); });

  // ---------- lighting rig: a window-like key, soft fill, and the MacBook screen itself once it's on ----------
  const key = new THREE.DirectionalLight(0xffffff, 0); key.position.set(-6, 9, 7); key.target.position.set(.5, 0, 1); scene.add(key, key.target);
  const fill = new THREE.HemisphereLight(0x5a6478, 0x2a241c, 0); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd6a8, 0); rim.position.set(6, 4, -6); rim.target.position.set(.5, 0, 1); scene.add(rim, rim.target);
  const glow = new THREE.PointLight(0x9fb4ff, 0, 7, 2); glow.position.set(.5, 1.4, .9); scene.add(glow);
  // a ceiling lamp over the desk: a pool of light on the top and the wall behind, so the room has depth at night
  const lamp = new THREE.PointLight(0xffe2c0, 0, 60, 2); lamp.position.set(1.2, 8.5, -1.0); scene.add(lamp);
  const KEY_DAY = new THREE.Color(0xfff1dc), KEY_NIGHT = new THREE.Color(0x8aa0d8), KEY_GOLD = new THREE.Color(0xffb070);
  let day = 0, gold = 0;

  // ---------- the MacBook screen: a miniature of the phone wall, same grid and name, so the cut lines up ----------
  const mbUniforms = { uName:{value:nameTex}, uPow:{value:0}, uTime:{value:0}, uFlash:{value:0}, uFlip:{value:new THREE.Vector2(0,1)} };
  const screenMat = new THREE.ShaderMaterial({
    uniforms: mbUniforms,
    vertexShader:`uniform vec2 uFlip; varying vec2 vUv; void main(){ vUv = mix(uv, 1.0 - uv, uFlip); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`
      uniform sampler2D uName; uniform float uPow, uTime, uFlash; varying vec2 vUv;
      void main(){
        vec2 grid = vec2(26.0, 10.0), g = vUv*grid, f = fract(g), cell = floor(g);
        float inside = step(.1,f.x)*step(f.x,.9)*step(.05,f.y)*step(f.y,.95);
        float nm = texture2D(uName, (cell+f)/grid).r;
        float flick = .82 + .18*fract(sin(dot(cell, vec2(12.9898,78.233)))*43758.5453 + uTime*.3);
        vec3 bg = vec3(.025,.032,.05), ink = vec3(.82,.88,1.0);
        vec3 col = mix(bg*.6, mix(bg*2.6*flick, ink, nm), inside);
        float notch = step(abs(vUv.x-.5), .045)*step(.965, vUv.y);
        col = mix(col, vec3(0.0), notch);
        col *= uPow;
        col = pow(col, vec3(2.2)) * (1.0 + uFlash*5.0);
        gl_FragColor = vec4(col, 1.0);
      }`
  });

  // ---------- the MacBook Pro 14" (M5, Space Black) ----------
  // The model ships with the lid open at ~110°. Its lid parts get re-parented under a pivot on the hinge axis so the
  // lid can close and open. Angle and pivot were solved in /mac-lab.html?solve: the angle that lays the lid's flat
  // shell level, and the pivot that closes it flush with the base's front edge, resting on the deck.
  const LID_PARTS = ['KjpcUkkMjGYeXkV','JNlPAPsywCtwJrd','QSjoCOCzvxPnLpK','LQtuXuSGFKsUXjP','nAIWMiVEtSYdjdZ','tfTbkkzhxqpKRgC',
    'xiLiwJHfkqIwaTs','LBeBZdkKmrJVhJd','OCxZAMeEkQKexHA','XodVrcYKiUPGCmX','eFpSjyrDhTgtyuf','MwJmMcLbTBwQpxl','WyuoVWKMOcOlXJM'];
  const LID_SHUT = 1.92008, PIVOT = [-.00078, -.10748], Y = new THREE.Vector3(0, 1, 0);
  let macPivot = null, hingeCover = null, keyLegends = null;
  const mac = new THREE.Group(); mac.position.set(.5, .09, 1.3); mac.rotation.y = -.06; scene.add(mac);
  // dive target: centre and facing of the open screen, in desk space (known from the model, valid before it loads)
  const SCREEN_C = new THREE.Vector3(0, .105, -.1515).multiplyScalar(10).applyAxisAngle(Y, mac.rotation.y).add(mac.position);
  const SCREEN_N = new THREE.Vector3(0, .376, .926).applyAxisAngle(Y, mac.rotation.y);
  const C_EYE = SCREEN_C.clone().addScaledVector(SCREEN_N, .3);
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  loader.loadAsync('/models/macbook-pro-14-m5.glb').then(gltf => {
    const model = gltf.scene; model.scale.setScalar(10); mac.add(model);
    const pivot = new THREE.Group(); pivot.position.set(0, PIVOT[0], PIVOT[1]); model.add(pivot);
    mac.updateMatrixWorld(true);
    const lid = []; model.traverse(o => { if (o.isMesh && LID_PARTS.includes(o.name)) lid.push(o); });
    lid.forEach(o => pivot.attach(o));
    // Space Black is dark: keep the environment's reflections low, and the logo glossy rather than a mirror
    model.traverse(o => {
      if (!o.isMesh || !('envMap' in o.material)) return;
      const m = o.material; m.envMap = envTex; m.envMapIntensity = .35;
      if (m.name === 'zNRfbdNyoCOxSDD') m.color.setHex(0x3e3d40);
      if (m.name === 'pKaDkdyuuvylYHt'){ m.roughness = .22; m.envMapIntensity = .25; m.color.setHex(0x1c1c1e); }
      m.needsUpdate = true;
    });
    const screen = lid.find(o => o.name === 'tfTbkkzhxqpKRgC');
    if (screen) screen.material = screenMat;
    keyLegends = model.getObjectByName('wyClPAIazRlKQnt'); // key legends: lit by the keyboard backlight
    if (keyLegends){ const km = keyLegends.material = keyLegends.material.clone(); km.emissive = new THREE.Color(0x000000); km.roughness = .9; km.color.setHex(0xbfbfbf); }
    const caps = model.getObjectByName('LsmCMkPRBVEEGpg'); if (caps) caps.material.roughness = .8; // matte keycaps: no lamp speculars
    hingeCover = model.getObjectByName('UEFeUEhkJPdlgXF'); // base-side hinge cover: hidden by the lid when open, pokes out behind when shut
    macPivot = pivot; macPivot.rotation.x = LID_SHUT;
  }).catch(e => console.warn('MacBook model failed to load', e));

  // ---------- virtual camera shots: wide on the desk → over the MacBook → into its screen ----------
  // Shot A frames the whole desk with the MacBook right of the copy column; B hangs over the open MacBook.
  // From B the camera first swings onto the screen's own axis (AXIS_FAR, straight out from the screen centre,
  // rolled level with the screen), then travels down that axis into the screen. No zooming in from an angle.
  const shots = () => stacked() ? {
    A: [new THREE.Vector3(1.2, 5.6, 11.5), new THREE.Vector3(.4, -.6, .4)],
    B: [new THREE.Vector3(.9, 3.4, 6.4), new THREE.Vector3(.5, .5, 1.0)]
  } : {
    A: [new THREE.Vector3(2.6, 2.3, 9.8), new THREE.Vector3(-1.3, .05, .5)],
    B: [new THREE.Vector3(1.7, 2.6, 5.4), new THREE.Vector3(.4, .8, 1.0)]
  };
  const SCREEN_U = new THREE.Vector3(0, .926, -.376).applyAxisAngle(Y, mac.rotation.y);
  const AXIS_FAR = SCREEN_C.clone().addScaledVector(SCREEN_N, 4.0);
  const eye = new THREE.Vector3(), tgt = new THREE.Vector3(), up = new THREE.Vector3(0,1,0), WORLD_UP = new THREE.Vector3(0,1,0), vcam = new THREE.Matrix4();

  let powerT = null;
  function update(st, now, mouse, reduced){
    root.visible = st < 1.06;
    if (!root.visible) return;
    if (powerT === null) powerT = now;
    const p = reduced ? 9 : (now - powerT)/1000;
    // the room fades up from black over the first second
    const on = smooth(.1, 1.1, p);
    key.color.copy(KEY_NIGHT).lerp(KEY_DAY, day).lerp(KEY_GOLD, gold*.7);
    key.intensity = on*lerp(2.2, 4.2, day) + on*gold*1.2;
    fill.intensity = on*lerp(1.0, 1.6, day);
    rim.intensity = on*lerp(1.1, .4, day);
    lamp.intensity = on*lerp(150, 60, day);

    // the MacBook opens, wakes up, keyboard backlight glows, the screen lights the desk
    const open = easeIO(smooth(.24, .52, st));
    if (macPivot){ macPivot.rotation.x = LID_SHUT*(1 - open); if (hingeCover) hingeCover.visible = macPivot.rotation.x < 1; }
    const pw = smooth(.46, .56, st);
    const flicker = st < .56 && Math.random() > .7 ? .4 : 1;
    mbUniforms.uPow.value = pw*flicker;
    mbUniforms.uTime.value = now/1000;
    mbUniforms.uFlash.value = smooth(.86, 1.0, st);
    if (keyLegends) keyLegends.material.emissive.setRGB(.55, .6, .75).multiplyScalar(pw*.16); // backlit legends, not lamps
    glow.intensity = pw*flicker*lerp(2.4, .8, day);

    // virtual camera
    const S = shots();
    if (st < .55){ const k = easeIO(clamp01(st/.55)); eye.lerpVectors(S.A[0], S.B[0], k); tgt.lerpVectors(S.A[1], S.B[1], k); up.copy(WORLD_UP); }
    else if (st < .8){ const k = easeIO((st-.55)/.25); eye.lerpVectors(S.B[0], AXIS_FAR, k); tgt.lerpVectors(S.B[1], SCREEN_C, k); up.lerpVectors(WORLD_UP, SCREEN_U, k).normalize(); }
    else { const k = easeIn(clamp01((st-.8)/.2)); eye.lerpVectors(AXIS_FAR, C_EYE, k); tgt.copy(SCREEN_C); up.copy(SCREEN_U); }
    const drift = (1 - smooth(.55, .78, st));
    eye.x += mouse.x*.6*drift + Math.sin(now*.00023)*.18*drift;
    eye.y += mouse.y*.35*drift + Math.cos(now*.00019)*.12*drift;
    vcam.lookAt(eye, tgt, up).setPosition(eye);
    root.matrix.copy(vcam).invert();
    root.matrixWorldNeedsUpdate = true;
  }

  return { root, update, setDaylight: (d, g) => { day = d; gold = g; } };
}

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

// Solid oak top, 170 × 74 cm: glued staves (each its own tone), cathedral grain that opens up along the stave,
// fine medullary rays, the odd small knot. Drawn at ~12 px/mm so the grain still reads in close-ups.
function oakTexture(){
  const c = document.createElement('canvas'); c.width = 2048; c.height = 896;
  const g = c.getContext('2d'), w = c.width, h = c.height;
  let sd = 23; const r = () => (sd = (sd*16807) % 2147483647) / 2147483647;
  const TONES = ['#c7a673','#bd9b68','#cfae7d','#c2a070','#b89368','#cba877','#c49f6e','#d2b283'];
  const staves = 11, sh = h/staves;
  for (let i=0;i<staves;i++){
    const y0 = i*sh, tone = TONES[Math.floor(r()*TONES.length)];
    g.fillStyle = tone; g.fillRect(0, y0, w, sh+1);
    // slight tone drift along the stave
    const lg = g.createLinearGradient(0, 0, w, 0); lg.addColorStop(0, `rgba(0,0,0,${.02+r()*.05})`); lg.addColorStop(.5, `rgba(255,255,255,${r()*.05})`); lg.addColorStop(1, `rgba(0,0,0,${.02+r()*.06})`);
    g.fillStyle = lg; g.fillRect(0, y0, w, sh+1);
    // grain: nested arcs (a cathedral) or straight lines, both long and wavy
    g.save(); g.beginPath(); g.rect(0, y0, w, sh); g.clip();
    const cathedral = r() > .45, cx = r()*w, cy = y0 + sh*(.2 + r()*.6), n = 34 + Math.floor(r()*26);
    for (let k=0;k<n;k++){
      const a = .05 + r()*.14, dark = r() > .3;
      g.strokeStyle = dark ? `rgba(104,70,40,${a})` : `rgba(240,224,196,${a*.8})`;
      g.lineWidth = .6 + r()*(dark ? 1.6 : 2.4);
      g.beginPath();
      if (cathedral){
        const rx = 120 + k*(26 + r()*10), ry = (sh*.11)*(1 + k*.22);
        g.ellipse(cx, cy, rx*2.2, ry, 0, 0, Math.PI*2);
      } else {
        const yy = y0 + r()*sh, amp = 1 + r()*5, f = .002 + r()*.004, ph = r()*6;
        for (let x=0;x<=w;x+=12){ const y = yy + Math.sin(x*f+ph)*amp + Math.sin(x*f*2.7+ph*2)*amp*.3; x ? g.lineTo(x,y) : g.moveTo(x,y); }
      }
      g.stroke();
    }
    // medullary rays: short, faint, lighter flecks
    for (let k=0;k<180;k++){ g.fillStyle = `rgba(245,232,205,${.05+r()*.1})`; g.fillRect(r()*w, y0 + r()*sh, 3 + r()*14, .8 + r()*1.2); }
    // a knot now and then
    if (r() > .6){ const kx = r()*w, ky = y0 + sh*(.3 + r()*.4), kr = 6 + r()*10;
      for (let q=4;q>0;q--){ g.strokeStyle = `rgba(90,58,32,${.12 + q*.05})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(kx, ky, kr*q*.8, kr*q*.45, .3, 0, Math.PI*2); g.stroke(); }
      g.fillStyle = 'rgba(80,52,30,.5)'; g.beginPath(); g.ellipse(kx, ky, kr*.8, kr*.45, .3, 0, Math.PI*2); g.fill(); }
    g.restore();
    // glue line between staves
    g.fillStyle = 'rgba(90,64,38,.45)'; g.fillRect(0, y0 + sh - .6, w, 1.2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// dark low-pile office carpet: dense fine fibre noise with a faint tufting grid
function carpetTexture(){
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
  let sd = 5; const r = () => (sd = (sd*16807) % 2147483647) / 2147483647;
  for (let y=0;y<n;y++) for (let x=0;x<n;x++){
    const tuft = ((x % 4) < 2) !== ((y % 4) < 2) ? 4 : -4;
    const v = 46 + tuft + (r() - .5)*26 + (r() > .985 ? 22 : 0);
    const i = (y*n + x)*4; d[i] = v; d[i+1] = v + 1; d[i+2] = v + 4; d[i+3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 45); t.anisotropy = 8;
  return t;
}

// a block with 45° chamfers on every edge (straight bevel, one segment)
function chamferedBox(w, h, d, ch){
  const shp = new THREE.Shape(); const x = w/2 - ch, y = h/2 - ch;
  shp.moveTo(-x,-y); shp.lineTo(x,-y); shp.lineTo(x,y); shp.lineTo(-x,y); shp.closePath();
  const g = new THREE.ExtrudeGeometry(shp, {depth:d - 2*ch, bevelEnabled:true, bevelThickness:ch, bevelSize:ch, bevelSegments:1, UVGenerator:THREE.ExtrudeGeometry.WorldUVGenerator});
  g.translate(0, 0, -(d - 2*ch)/2);
  return g;
}

export function createDesk({ envTex, nameTex, stacked }){
  const root = new THREE.Group(); root.matrixAutoUpdate = false;
  const scene = new THREE.Group(); root.add(scene);

  // ---------- room ----------
  // like the office: white walls, dark low-pile carpet. Room materials skip the scene fog (it is tuned for the wall
  // of phones and would tint them blue/purple here).
  const wallM = new THREE.MeshStandardMaterial({color:0xeeece8, roughness:.92, fog:false});
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), wallM); backWall.position.set(0, 5, -5.2); scene.add(backWall);
  const carpet = carpetTexture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({map:carpet, bumpMap:carpet, bumpScale:.6, roughness:1, fog:false}));
  floor.rotation.x = -Math.PI/2; floor.position.set(0, -7.4, 10); scene.add(floor);

  // ---------- desk: 4 cm solid oak top with chamfered edges, on a black steel sit-stand frame ----------
  const oak = oakTexture(); oak.repeat.set(1/17, 1/7.4);
  const deskTopM = new THREE.MeshPhysicalMaterial({map:oak, roughness:.58, metalness:0, clearcoat:.08, clearcoatRoughness:.6, envMap:envTex, envMapIntensity:.2, fog:false});
  const deskTop = new THREE.Mesh(chamferedBox(17, 7.4, .4, .06), deskTopM);
  deskTop.rotation.x = -Math.PI/2; deskTop.position.set(0, -.2, 0); scene.add(deskTop);
  const steelM = new THREE.MeshStandardMaterial({color:0x1d1e22, metalness:.55, roughness:.48, envMap:envTex, envMapIntensity:.25, fog:false});
  const FLOOR_Y = -7.4;
  function leg(x){
    const l = new THREE.Group(); l.position.x = x; scene.add(l);
    // foot: a flat bar along the depth with rounded ends and two levelling pads
    const foot = new THREE.Mesh(slab(5.8, .8, .3, .4, .03), [steelM, steelM]); foot.rotation.x = -Math.PI/2; foot.rotation.z = Math.PI/2; foot.position.set(0, FLOOR_Y + .19, .2); l.add(foot);
    [-2.5, 2.5].forEach(z => { const pad = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, .06, 20), steelM); pad.position.set(0, FLOOR_Y + .03, .2 + z); l.add(pad); });
    // two-stage column: the lower stage is a touch wider, with a visible seam where the upper one slides in
    // columns stand upright: shape w × h in the XY plane, extruded along z = depth
    const lower = new THREE.Mesh(chamferedBox(.9, 3.5, .7, .025), steelM); lower.position.set(0, FLOOR_Y + .34 + 1.75, .1); l.add(lower);
    const upper = new THREE.Mesh(chamferedBox(.78, 3.3, .58, .02), steelM); upper.position.set(0, -.52 - 1.65, .1); l.add(upper);
    // top bracket under the desktop
    const bracket = new THREE.Mesh(chamferedBox(1.1, 5.4, .12, .015), steelM); bracket.rotation.x = -Math.PI/2; bracket.position.set(0, -.46, .1); l.add(bracket);
  }
  leg(-6.9); leg(6.9);
  const rail = new THREE.Mesh(chamferedBox(12.6, .5, .24, .02), steelM); rail.position.set(0, -.6, -1.4); scene.add(rail);
  const motorBox = new THREE.Mesh(chamferedBox(2.2, .5, .8, .03), steelM); motorBox.position.set(0, -.68, -.3); scene.add(motorBox);

  // skirting board where the wall meets the floor, and a soft contact shadow along it
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(60, .9, .16), new THREE.MeshStandardMaterial({color:0xf2f0ec, roughness:.55, fog:false}));
  skirt.position.set(0, FLOOR_Y + .45, -5.12); scene.add(skirt);
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); })();
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(60, 2.2), new THREE.MeshBasicMaterial({map:shadowTex, transparent:true, depthWrite:false, fog:false}));
  contact.rotation.x = -Math.PI/2; contact.position.set(0, FLOOR_Y + .003, -5.2 + 1.1 + .08); scene.add(contact);

  // ---------- lighting rig: a window-like key, soft fill, and the MacBook screen itself once it's on ----------
  const key = new THREE.DirectionalLight(0xffffff, 0); key.position.set(-6, 9, 7); key.target.position.set(.5, 0, 1); scene.add(key, key.target);
  const fill = new THREE.HemisphereLight(0x8d8f93, 0x2a2a2c, 0); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd6a8, 0); rim.position.set(6, 4, -6); rim.target.position.set(.5, 0, 1); scene.add(rim, rim.target);
  const glow = new THREE.PointLight(0x9fb4ff, 0, 7, 2); glow.position.set(.5, 1.4, .9); scene.add(glow);
  // a ceiling lamp over the desk: a pool of light on the top and the wall behind, so the room has depth at night
  const lamp = new THREE.PointLight(0xfff4e6, 0, 60, 2); lamp.position.set(1.2, 12, 1.5); scene.add(lamp);
  const KEY_DAY = new THREE.Color(0xfff1dc), KEY_NIGHT = new THREE.Color(0xe9e7e2), KEY_GOLD = new THREE.Color(0xffb070);
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
    A: [new THREE.Vector3(1.0, 6.5, 26), new THREE.Vector3(.4, -2.8, 0)],
    B: [new THREE.Vector3(.9, 3.4, 6.4), new THREE.Vector3(.5, .5, 1.0)]
  } : {
    A: [new THREE.Vector3(3.6, 5.2, 21), new THREE.Vector3(-4.6, -2.6, 0)],
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
    lamp.intensity = on*lerp(120, 50, day);

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

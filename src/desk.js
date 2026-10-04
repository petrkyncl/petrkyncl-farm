// The intro: a YouTube-studio desk in a dark room. Lights come on, the MacBook opens,
// and the camera dives into its screen, which shows the same phone wall the page cuts to.
// The whole desk rides with the camera; a virtual camera path inside desk space frames each shot.
// Units: 1 = 10 cm. The viewer sits in front of the desk, looking toward -z.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { rrShape, slab, flat, faceBack } from './shapes.js';

const clamp01 = v => v<0 ? 0 : v>1 ? 1 : v;
const smooth = (a,b,t) => { t = clamp01((t-a)/(b-a)); return t*t*(3-2*t); };
const easeIO = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const easeIn = t => t*t*t;

function canvasTex(w, h, draw, srgb = true){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function woodTexture(){
  return canvasTex(2048, 512, (g, w, h) => {
    g.fillStyle = '#3b2719'; g.fillRect(0,0,w,h);
    let s = 7; const r = () => (s = (s*16807) % 2147483647) / 2147483647;
    for (let i=0;i<260;i++){
      const y0 = r()*h, amp = 4 + r()*16, f = .002 + r()*.004, ph = r()*6, a = .05 + r()*.14;
      g.strokeStyle = r() > .5 ? `rgba(20,11,6,${a})` : `rgba(96,64,40,${a*.8})`;
      g.lineWidth = .6 + r()*2.6; g.beginPath();
      for (let x=0;x<=w;x+=16){ const y = y0 + Math.sin(x*f+ph)*amp + Math.sin(x*f*3.1+ph*2)*amp*.25; x ? g.lineTo(x,y) : g.moveTo(x,y); }
      g.stroke();
    }
    const grd = g.createLinearGradient(0,0,0,h); grd.addColorStop(0,'rgba(0,0,0,.18)'); grd.addColorStop(.5,'rgba(0,0,0,0)'); grd.addColorStop(1,'rgba(0,0,0,.22)');
    g.fillStyle = grd; g.fillRect(0,0,w,h);
  });
}

function keyboardTexture(){
  return canvasTex(1024, 400, (g, w, h) => {
    g.fillStyle = '#0d0e11'; g.fillRect(0,0,w,h);
    const rows = [14, 14, 14, 13, 12], kh = 58, gap = 9;
    rows.forEach((n, ri) => {
      const y = 14 + ri*(kh+gap), kw = (w - 28 - gap*(n-1))/n;
      for (let i=0;i<n;i++){ g.fillStyle = '#18191d'; g.beginPath(); g.roundRect(14 + i*(kw+gap), y, kw, kh, 9); g.fill(); }
    });
    const y = 14 + 5*(kh+gap);
    g.fillStyle = '#18191d';
    [[14,110],[132,110],[250,120],[378,370],[756,120],[884,126]].forEach(([x,ww]) => { g.beginPath(); g.roundRect(x, y, ww, kh, 9); g.fill(); });
  });
}

export function createDesk({ envTex, nameTex, photo, stacked }){
  let face = photo;
  RectAreaLightUniformsLib.init();
  const root = new THREE.Group(); root.matrixAutoUpdate = false;
  const scene = new THREE.Group(); root.add(scene);

  const metalDark = new THREE.MeshStandardMaterial({color:0x2a2b2f, metalness:.88, roughness:.36, envMap:envTex, envMapIntensity:.8});
  const metalSilver = new THREE.MeshStandardMaterial({color:0x7d8086, metalness:1, roughness:.42, envMap:envTex, envMapIntensity:.55});
  const blackMatte = new THREE.MeshStandardMaterial({color:0x0e0f11, roughness:.8, metalness:.1, envMap:envTex, envMapIntensity:.3});
  const glassBlack = new THREE.MeshPhysicalMaterial({color:0x030304, roughness:.08, clearcoat:1, envMap:envTex, envMapIntensity:1});

  // ---------- room: back wall, desk ----------
  const wallM = new THREE.MeshStandardMaterial({color:0x17181c, roughness:.93});
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(46, 22), wallM); backWall.position.set(0, 4, -4.8); scene.add(backWall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 30), new THREE.MeshStandardMaterial({color:0x0b0b0d, roughness:.85}));
  floor.rotation.x = -Math.PI/2; floor.position.set(0, -7.4, 8); scene.add(floor);

  const wood = woodTexture(); wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  const deskTopM = new THREE.MeshStandardMaterial({map:wood, roughness:.55, metalness:0, envMap:envTex, envMapIntensity:.35});
  const deskTop = new THREE.Mesh(slab(17, 7.4, .36, .18, .05), [deskTopM, deskTopM]);
  deskTop.rotation.x = -Math.PI/2; deskTop.position.set(0, -.18, 0); scene.add(deskTop);
  [-7.6, 7.6].forEach(x => { const leg = new THREE.Mesh(new THREE.BoxGeometry(.5, 7.2, 6.4), metalDark); leg.position.set(x, -3.95, 0); scene.add(leg); });

  // ---------- monitor (Pro Display XDR-ish) with the camera feed ----------
  const MON = new THREE.Group(); MON.position.set(-.4, 4.25, -2.75); scene.add(MON);
  MON.add(new THREE.Mesh(slab(7.2, 4.2, .26, .14, .05), [glassBlack, metalSilver]));
  const camFeed = document.createElement('canvas'); camFeed.width = 1280; camFeed.height = 720;
  const cf = camFeed.getContext('2d');
  const feedTex = new THREE.CanvasTexture(camFeed); feedTex.colorSpace = THREE.SRGBColorSpace; feedTex.anisotropy = 8;
  const feedMat = new THREE.MeshBasicMaterial({map:feedTex, color:0x000000});
  const feed = new THREE.Mesh(flat(6.96, 3.92, .05), feedMat); feed.position.z = .131; MON.add(feed);
  const arm = new THREE.Mesh(slab(.85, 3.3, .3, .1, .04), [metalSilver, metalSilver]); arm.position.set(0, -2.15, -.42); arm.rotation.x = .12; MON.add(arm);
  const foot = new THREE.Mesh(slab(2.3, 2.1, .14, .3, .05), [metalSilver, metalSilver]); foot.rotation.x = -Math.PI/2; foot.position.set(0, -4.18, -.3); MON.add(foot);

  // webcam on top, red tally light when recording
  const cam = new THREE.Group(); cam.position.set(0, 2.32, .02); MON.add(cam);
  cam.add(new THREE.Mesh(slab(1.0, .34, .36, .16, .05), [blackMatte, blackMatte]));
  const camLens = new THREE.Mesh(new THREE.CircleGeometry(.12, 32), glassBlack); camLens.position.z = .182; cam.add(camLens);
  const tallyM = new THREE.MeshBasicMaterial({color:0x000000});
  const tally = new THREE.Mesh(new THREE.CircleGeometry(.025, 16), tallyM); tally.position.set(.32, 0, .182); cam.add(tally);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(.5, .12, .5), blackMatte); clip.position.set(0, -.2, -.08); cam.add(clip);

  // ---------- MacBook Pro 16 (space black) ----------
  const MB = new THREE.Group(); MB.position.set(.5, .03, 1.3); MB.rotation.y = -.06; scene.add(MB);
  const base = new THREE.Mesh(slab(3.56, 2.48, .16, .12, .05), [metalDark, metalDark]);
  base.rotation.x = -Math.PI/2; base.position.y = .08; MB.add(base);
  const kb = keyboardTexture();
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.13), new THREE.MeshStandardMaterial({map:kb, roughness:.6, emissive:0x000000, emissiveMap:kb}));
  keys.rotation.x = -Math.PI/2; keys.position.set(0, .162, -.36); MB.add(keys);
  const pad = new THREE.Mesh(flat(1.5, .92, .08), new THREE.MeshStandardMaterial({color:0x232428, roughness:.32, metalness:.6, envMap:envTex}));
  pad.rotation.x = -Math.PI/2; pad.position.set(0, .162, .66); MB.add(pad);
  const hinge = new THREE.Group(); hinge.position.set(0, .16, -1.24); MB.add(hinge);
  const lid = new THREE.Group(); hinge.add(lid);
  const lidSlab = new THREE.Mesh(slab(3.56, 2.48, .07, .12, .025), [metalDark, metalDark]);
  lidSlab.rotation.x = -Math.PI/2; lidSlab.position.set(0, .035, 1.24); lid.add(lidSlab);
  const bezel = new THREE.Mesh(flat(3.48, 2.4, .1), glassBlack); bezel.rotation.x = Math.PI/2; bezel.position.set(0, -.002, 1.24); lid.add(bezel);
  const mbUniforms = { uName:{value:nameTex}, uPow:{value:0}, uTime:{value:0}, uFlash:{value:0}, uFlip:{value:new THREE.Vector2(0,0)} };
  const mbScreen = new THREE.Mesh(flat(3.34, 2.17, .07), new THREE.ShaderMaterial({
    uniforms: mbUniforms,
    vertexShader:`uniform vec2 uFlip; varying vec2 vUv; void main(){ vUv = mix(uv, 1.0 - uv, uFlip); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`
      uniform sampler2D uName; uniform float uPow, uTime, uFlash; varying vec2 vUv;
      void main(){
        // a miniature of the phone wall: same grid, same name, so the cut into the real wall lines up
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
  }));
  mbScreen.rotation.x = Math.PI/2; mbScreen.position.set(0, -.004, 1.24); lid.add(mbScreen);

  // ---------- broadcast mic on a boom arm ----------
  const PERSON = new THREE.Vector3(.2, 3.1, 5.2);
  const boomM = new THREE.MeshStandardMaterial({color:0x111214, metalness:.7, roughness:.4, envMap:envTex, envMapIntensity:.6});
  const boomPath = new THREE.CatmullRomCurve3([new THREE.Vector3(6.9, .2, -2.6), new THREE.Vector3(6.6, 2.6, -2.3), new THREE.Vector3(5.9, 4.6, -1.4), new THREE.Vector3(4.6, 4.2, .2), new THREE.Vector3(3.9, 3.6, 1.1)]);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(boomPath, 80, .075, 10, false), boomM));
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(.5, .7, .6), boomM); clamp.position.set(6.9, -.05, -2.6); scene.add(clamp);
  const mic = new THREE.Group(); mic.position.set(3.75, 3.25, 1.35); scene.add(mic);
  mic.lookAt(scene.localToWorld(PERSON.clone()));
  const micBody = new THREE.Mesh(new THREE.CylinderGeometry(.31, .29, 1.45, 40), new THREE.MeshStandardMaterial({color:0x151618, roughness:.55, metalness:.4, envMap:envTex, envMapIntensity:.6}));
  micBody.rotation.x = Math.PI/2; mic.add(micBody);
  const foam = new THREE.Mesh(new THREE.SphereGeometry(.4, 32, 20), new THREE.MeshStandardMaterial({color:0x1d1e21, roughness:1}));
  foam.scale.set(1, 1, 1.25); foam.position.z = .78; mic.add(foam);
  const rear = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .1, 32), metalSilver); rear.rotation.x = Math.PI/2; rear.position.z = -.76; mic.add(rear);
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(.46, .045, 10, 40, Math.PI), boomM); yoke.rotation.set(0, Math.PI/2, Math.PI/2); yoke.position.z = -.1; mic.add(yoke);

  // ---------- softbox key light ----------
  const SB = new THREE.Group(); SB.position.set(-7.4, 5.6, 3.4); scene.add(SB);
  SB.lookAt(scene.localToWorld(new THREE.Vector3(.2, 2.6, 3.6)));
  const sbBody = new THREE.CylinderGeometry(.5, 1.7, 1.7, 4, 1, true); sbBody.rotateX(-Math.PI/2); sbBody.rotateZ(Math.PI/4);
  SB.add(new THREE.Mesh(sbBody, new THREE.MeshStandardMaterial({color:0x0c0c0e, roughness:.95, side:THREE.DoubleSide})));
  const diffuserM = new THREE.MeshBasicMaterial({color:0x000000});
  const diffuser = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 2.36), diffuserM); diffuser.position.z = .86; SB.add(diffuser);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 13, 10), boomM); pole.position.set(-7.4, -1.2, 3.0); scene.add(pole);
  const softLight = new THREE.RectAreaLight(0xfff4e8, 0, 2.4, 2.4); softLight.position.set(0, 0, .9); SB.add(softLight);
  softLight.lookAt(SB.localToWorld(new THREE.Vector3(0, 0, 5)));

  // ---------- warm LED strip behind the desk, washing the wall ----------
  const stripM = new THREE.MeshBasicMaterial({color:0x000000});
  const strip = new THREE.Mesh(new THREE.BoxGeometry(15, .05, .05), stripM); strip.position.set(0, .1, -3.9); scene.add(strip);
  const wash = new THREE.RectAreaLight(0xff9a3c, 0, 15, .4); wash.position.set(0, .2, -3.85); wash.lookAt(scene.localToWorld(new THREE.Vector3(0, 3, -4.8))); scene.add(wash);
  const monGlow = new THREE.PointLight(0x9fb4ff, 0, 9, 2); monGlow.position.set(-.4, 4, -1.6); scene.add(monGlow);

  // ---------- where the MacBook screen ends up once open (desk space), for the final dive ----------
  const OPEN = -Math.PI/2 - .32;
  hinge.rotation.x = OPEN; scene.updateMatrixWorld(true);
  const SCREEN_C = mbScreen.getWorldPosition(new THREE.Vector3());
  const SCREEN_N = new THREE.Vector3(0,0,1).applyQuaternion(mbScreen.getWorldQuaternion(new THREE.Quaternion()));
  hinge.rotation.x = 0;

  // ---------- virtual camera shots ----------
  const shots = () => stacked() ? {
    A: [new THREE.Vector3(3.2, 7.5, 21), new THREE.Vector3(-.2, -1.6, -1)],
    B: [new THREE.Vector3(1.4, 4.6, 9.5), new THREE.Vector3(.4, -.4, .6)]
  } : {
    A: [new THREE.Vector3(6.4, 6.4, 15.5), new THREE.Vector3(-4.2, 2.2, -1)],
    B: [new THREE.Vector3(3.0, 3.7, 7.4), new THREE.Vector3(-1.5, 1.1, .5)]
  };
  const eye = new THREE.Vector3(), tgt = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);
  const vcam = new THREE.Matrix4(), C_EYE = SCREEN_C.clone().addScaledVector(SCREEN_N, .3);

  // ---------- camera feed: my face on the monitor, like a live preview ----------
  let feedKey = '';
  function drawFeed(now, rec){
    const sec = Math.floor(now/1000), key = sec + ':' + Math.floor(now/90);
    if (key === feedKey) return; feedKey = key;
    const w = 1280, h = 720;
    const bg = cf.createRadialGradient(w*.62, h*.45, 40, w*.6, h*.5, w*.75);
    bg.addColorStop(0, '#2a2622'); bg.addColorStop(1, '#0b0b0d'); cf.fillStyle = bg; cf.fillRect(0,0,w,h);
    // out-of-focus studio lights behind me
    [[180,210,70,'255,170,80'],[300,430,46,'255,150,70'],[1080,170,60,'120,150,255'],[1160,520,40,'255,170,80']].forEach(([x,y,r,c]) => {
      const gg = cf.createRadialGradient(x,y,0,x,y,r); gg.addColorStop(0,`rgba(${c},.55)`); gg.addColorStop(1,`rgba(${c},0)`); cf.fillStyle = gg; cf.fillRect(x-r,y-r,r*2,r*2);
    });
    if (face){ const s = h*1.02/face.height, dw = face.width*s; cf.drawImage(face, w*.58 - dw/2, h - face.height*s + 8, dw, face.height*s); }
    const vg = cf.createRadialGradient(w/2,h/2,h*.35,w/2,h/2,w*.7); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.55)'); cf.fillStyle = vg; cf.fillRect(0,0,w,h);
    // camera UI
    cf.strokeStyle = 'rgba(255,255,255,.18)'; cf.lineWidth = 2;
    [w/3, w*2/3].forEach(x => { cf.beginPath(); cf.moveTo(x, 0); cf.lineTo(x, h); cf.stroke(); });
    [h/3, h*2/3].forEach(y => { cf.beginPath(); cf.moveTo(0, y); cf.lineTo(w, y); cf.stroke(); });
    cf.strokeStyle = 'rgba(255,255,255,.8)'; cf.lineWidth = 4;
    [[40,40,1,1],[w-40,40,-1,1],[40,h-40,1,-1],[w-40,h-40,-1,-1]].forEach(([x,y,sx,sy]) => { cf.beginPath(); cf.moveTo(x, y+sy*50); cf.lineTo(x, y); cf.lineTo(x+sx*50, y); cf.stroke(); });
    cf.font = '500 30px "Martian Mono", ui-monospace, monospace'; cf.textBaseline = 'middle';
    if (rec && sec % 2 === 0){ cf.fillStyle = '#ff3b30'; cf.beginPath(); cf.arc(86, 86, 12, 0, Math.PI*2); cf.fill(); }
    cf.fillStyle = '#fff'; cf.fillText('REC', 110, 88);
    const tc = 12*60 + 41 + Math.floor(now/1000) % 3600;
    cf.fillText(`00:${String(Math.floor(tc/60)%60).padStart(2,'0')}:${String(tc%60).padStart(2,'0')}`, 200, 88);
    cf.textAlign = 'right'; cf.fillText('4K · 30', w-80, 88); cf.textAlign = 'left';
    for (let i=0;i<24;i++){ const lv = Math.abs(Math.sin(i*.7 + now/160))*Math.abs(Math.sin(now/530 + i*.2)); cf.fillStyle = i > 19 ? '#ff6b3d' : i > 15 ? '#ffb547' : '#58ff9a'; cf.globalAlpha = lv > i/24 ? .95 : .18; cf.fillRect(80 + i*14, h-86, 10, 26); }
    cf.globalAlpha = 1;
    feedTex.needsUpdate = true;
  }

  let powerT = null;
  function update(st, now, mouse, reduced){
    root.visible = st < 1.06;
    if (!root.visible) return;
    if (powerT === null) powerT = now;
    const p = reduced ? 9 : (now - powerT)/1000;
    // lights come on by themselves: the softbox flickers to life, then the monitor, then the strip
    const flick = (a, b) => p < a ? 0 : p > b ? 1 : (Math.random() > .45 ? .25 + .75*(p-a)/(b-a) : .05);
    const sb = flick(.25, .85), mon = flick(.7, 1.0), led = smooth(1.0, 1.8, p);
    diffuserM.color.setRGB(2.7, 2.65, 2.5).multiplyScalar(sb);
    softLight.intensity = 9*sb;
    feedMat.color.setScalar(.72*mon);
    monGlow.intensity = 2.2*mon;
    stripM.color.setRGB(3.2, 1.5, .45).multiplyScalar(led);
    wash.intensity = 7*led;
    tallyM.color.setRGB(2.4, .2, .15).multiplyScalar(mon*(Math.floor(now/600)%2 ? 1 : .35));
    drawFeed(now, mon > .5);

    // the MacBook opens, wakes up, keyboard backlight glows
    const open = easeIO(smooth(.24, .52, st));
    hinge.rotation.x = OPEN*open;
    if (macPivot){ macPivot.rotation.x = LID_SHUT*(1 - open); if (hingeCover) hingeCover.visible = macPivot.rotation.x < 1; }
    const pw = smooth(.46, .56, st);
    mbUniforms.uPow.value = pw*(st < .56 && Math.random() > .7 ? .4 : 1);
    mbUniforms.uTime.value = now/1000;
    mbUniforms.uFlash.value = smooth(.86, 1.0, st);
    keys.material.emissive.setRGB(.5, .55, .7).multiplyScalar(pw*.35);

    // virtual camera: wide → over the MacBook → into its screen
    const S = shots();
    if (st < .55){ const k = easeIO(clamp01(st/.55)); eye.lerpVectors(S.A[0], S.B[0], k); tgt.lerpVectors(S.A[1], S.B[1], k); }
    else { const k = easeIn(clamp01((st-.55)/.45)); eye.lerpVectors(S.B[0], C_EYE, k); tgt.lerpVectors(S.B[1], SCREEN_C, k); }
    const drift = (1 - smooth(.55, .9, st));
    eye.x += mouse.x*.6*drift + Math.sin(now*.00023)*.18*drift;
    eye.y += mouse.y*.35*drift + Math.cos(now*.00019)*.12*drift;
    vcam.lookAt(eye, tgt, up).setPosition(eye);
    root.matrix.copy(vcam).invert();
    root.matrixWorldNeedsUpdate = true;
  }

  // ---------- the real MacBook Pro 14" (M5, Space Black) replaces the hand-built one once it loads ----------
  // The model ships with the lid open at ~110°. Its lid parts get re-parented under a pivot on the hinge axis so the
  // lid can close and open; its screen gets the miniature phone wall. Angle and pivot are solved in /mac-lab.html?solve:
  // the angle that lays the lid's flat shell level, and the pivot that closes it flush with the base's front edge.
  const LID_PARTS = ['KjpcUkkMjGYeXkV','JNlPAPsywCtwJrd','QSjoCOCzvxPnLpK','LQtuXuSGFKsUXjP','nAIWMiVEtSYdjdZ','tfTbkkzhxqpKRgC',
    'xiLiwJHfkqIwaTs','LBeBZdkKmrJVhJd','OCxZAMeEkQKexHA','XodVrcYKiUPGCmX','eFpSjyrDhTgtyuf','MwJmMcLbTBwQpxl','WyuoVWKMOcOlXJM'];
  const LID_SHUT = 1.92008, PIVOT = [-.00078, -.10748], Y = new THREE.Vector3(0, 1, 0);
  let macPivot = null, hingeCover = null;
  const mac = new THREE.Group(); mac.position.set(.5, .09, 1.3); mac.rotation.y = -.06;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  loader.loadAsync('/models/macbook-pro-14-m5.glb').then(gltf => {
    const model = gltf.scene; model.scale.setScalar(10); mac.add(model);
    const pivot = new THREE.Group(); pivot.position.set(0, PIVOT[0], PIVOT[1]); model.add(pivot);
    scene.add(mac); mac.updateMatrixWorld(true);
    const lid = []; model.traverse(o => { if (o.isMesh && LID_PARTS.includes(o.name)) lid.push(o); });
    lid.forEach(o => pivot.attach(o));
    // Space Black is dark: keep the studio environment's reflections low, and the logo glossy rather than a mirror
    model.traverse(o => {
      if (!o.isMesh || !('envMap' in o.material)) return;
      const m = o.material; m.envMap = envTex; m.envMapIntensity = .35;
      if (m.name === 'zNRfbdNyoCOxSDD') m.color.setHex(0x3e3d40);
      if (m.name === 'pKaDkdyuuvylYHt'){ m.roughness = .22; m.envMapIntensity = .25; m.color.setHex(0x1c1c1e); }
      m.needsUpdate = true;
    });
    const screen = lid.find(o => o.name === 'tfTbkkzhxqpKRgC');
    if (screen){ screen.material = mbScreen.material; mbUniforms.uFlip.value.set(0, 1); } // the model's screen UVs run bottom-up
    MB.visible = false; macPivot = pivot;
    hingeCover = model.getObjectByName('UEFeUEhkJPdlgXF'); // base-side hinge cover: hidden by the lid when open, pokes out behind when shut
    // dive target: centre and facing of the open screen, in desk space
    SCREEN_C.set(0, .105, -.1515).multiplyScalar(10).applyAxisAngle(Y, mac.rotation.y).add(mac.position);
    SCREEN_N.set(0, .376, .926).applyAxisAngle(Y, mac.rotation.y);
    C_EYE.copy(SCREEN_C).addScaledVector(SCREEN_N, .3);
  }).catch(e => console.warn('MacBook model failed, keeping the hand-built one', e));

  return { root, update, setPhoto: img => { face = img; feedKey = ''; } };
}

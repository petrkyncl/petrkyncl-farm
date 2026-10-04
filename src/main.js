import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import './style.css';

const GROUP_IMG = '/group.png';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const clamp01 = v => v<0 ? 0 : v>1 ? 1 : v;
const smooth = (a,b,t) => { t = clamp01((t-a)/(b-a)); return t*t*(3-2*t); };
const lerp = (a,b,t) => a + (b-a)*t;
const easeIO = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const outBack = t => 1 + 2.70158*Math.pow(t-1,3) + 1.70158*Math.pow(t-1,2);
const isStacked = () => innerWidth < 1024 || innerWidth/innerHeight < 23/20;

// ---------- Prague clock ----------
const fmt = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Prague', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
function pragueHours(){ const p = {}; for (const x of fmt.formatToParts(new Date())) p[x.type] = x.value; return (+p.hour % 24) + (+p.minute)/60 + (+p.second)/3600; }
const hhmm = h => { const m = Math.floor(((h%24)+24)%24*60); return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); };
const shiftName = h => h<5 ? 'Night shift' : h<11 ? 'Morning' : h<17 ? 'Day shift' : h<22 ? 'Evening' : 'Night shift';

// ---------- renderer / scene ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(2, devicePixelRatio||1));
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
const room = new THREE.Color('#06070a');
scene.background = room.clone();
scene.fog = new THREE.Fog(room.clone(), 24, 70);
const camera = new THREE.PerspectiveCamera(40, 1, .1, 200);
scene.add(camera);
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;

const amb = new THREE.AmbientLight(0x3a4050, 1.7); scene.add(amb);
const key = new THREE.DirectionalLight(0x9fb0ff, 1.7); key.position.set(-8,12,18); scene.add(key);
const rim = new THREE.DirectionalLight(0xffc27a, 1.1); rim.position.set(14,-4,8); scene.add(rim);

const wall = new THREE.Group(); scene.add(wall);

// ---------- wall layout ----------
const land = innerWidth >= innerHeight;
const C = land ? 26 : 12, R = land ? 10 : 14, COUNT = C*R;
const SX = 1.06, SY = 2.06, ARC = land ? 26 : 30;
const BW = .94, BH = 1.94, BD = .09, SW = .86, SH = 1.80;

let seed = 11;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const base = [];
for (let r=0;r<R;r++) for (let c=0;c<C;c++){
  const u = (c-(C-1)/2)*SX, th = u/ARC;
  base.push({x:ARC*Math.sin(th), y:(r-(R-1)/2)*SY, z:ARC*(1-Math.cos(th)), ry:-th, c, r});
}

// ---------- textures for video-wall mode ----------
const WALL_ASPECT = (C*SX)/(R*SY);
function wallCanvas(){ const c=document.createElement('canvas'); c.height=1024; c.width=Math.round(1024*WALL_ASPECT); const g=c.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,c.width,c.height); return [c,g]; }
const [nameC, nameG] = wallCanvas();
const [faceC, faceG] = wallCanvas();
const nameTex = new THREE.CanvasTexture(nameC), faceTex = new THREE.CanvasTexture(faceC);

function paintName(){
  const w=nameC.width, h=nameC.height;
  nameG.fillStyle='#000'; nameG.fillRect(0,0,w,h);
  nameG.fillStyle='#fff'; nameG.textAlign='center'; nameG.textBaseline='middle';
  const size = Math.min(h*.5, w*(land?.24:.36));
  nameG.font = `900 ${size}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`;
  if (land){ nameG.fillText('PETR', w/2, h*.29); nameG.fillText('KYNČL', w/2, h*.71); }
  else { nameG.font = `900 ${size*.9}px "Big Shoulders Display", Impact, sans-serif`; nameG.fillText('PETR', w/2, h*.17); nameG.fillText('KYNČL', w/2, h*.39); }
  nameTex.needsUpdate = true;
}
// Finale: the hackathon group photo on the wall. On a tall wall it's cropped around me (far right, ME_X).
const ME_X = .884;
let meUV = null;
function paintFace(img){
  const w=faceC.width, h=faceC.height;
  faceG.fillStyle='#000'; faceG.fillRect(0,0,w,h);
  // tall wall: copy covers the lower half on phones, so the photo sits in the top part
  const s = land ? Math.min(w/img.width, h*1.02/img.height) : h*.42/img.height, dw=img.width*s, dh=img.height*s;
  const x = dw <= w ? (w-dw)/2 : Math.min(0, Math.max(w-dw, w/2 - ME_X*dw)), y = land ? h-dh : h*.03;
  faceG.drawImage(img,x,y,dw,dh);
  meUV = {u:(x + ME_X*dw)/w, v:1 - y/h};
  faceTex.needsUpdate = true;
}
const N = new THREE.Vector3();
function wallPoint(u, v, out){
  const th = ((u*C - .5) - (C-1)/2)*SX/ARC;
  out.set(ARC*Math.sin(th), (v*R - .5 - (R-1)/2)*SY, ARC*(1-Math.cos(th)));
  return out.addScaledVector(N.set(-Math.sin(th),0,Math.cos(th)), BD/2+.02);
}

// ---------- wall geometry ----------
const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(BW,BH,BD), new THREE.MeshStandardMaterial({color:0x0c0e13, metalness:.62, roughness:.36}), COUNT);
const screenGeo = new THREE.PlaneGeometry(SW,SH);
const aCell = new Float32Array(COUNT*2), aId = new Float32Array(COUNT), aType = new Float32Array(COUNT), aSeed = new Float32Array(COUNT), aDelay = new Float32Array(COUNT);
for (let i=0;i<COUNT;i++){
  const b=base[i]; aCell[i*2]=b.c; aCell[i*2+1]=b.r; aId[i]=i;
  aType[i]=Math.floor(rnd()*5); aSeed[i]=rnd();
  aDelay[i]= (b.c/(C-1))*.75 + rnd()*.25; // left-to-right wave with jitter
}
screenGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell,2));
screenGeo.setAttribute('aId', new THREE.InstancedBufferAttribute(aId,1));
screenGeo.setAttribute('aType', new THREE.InstancedBufferAttribute(aType,1));
screenGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed,1));
screenGeo.setAttribute('aDelay', new THREE.InstancedBufferAttribute(aDelay,1));

const uniforms = {
  uTime:{value:0}, uWall:{value:1}, uImg:{value:0}, uFrom:{value:9}, uTo:{value:9}, uSweep:{value:0},
  uHover:{value:-1}, uBoot:{value:reduced?1.1:0}, uGrid:{value:new THREE.Vector2(C,R)},
  uName:{value:nameTex}, uFace:{value:faceTex}, uRoom:{value:room.clone()}, uGain:{value:1}, uDim:{value:0}
};

const screenMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader:`
    attribute vec2 aCell; attribute float aId, aType, aSeed, aDelay;
    varying vec2 vUv, vCell; varying float vId, vType, vSeed, vDelay, vDepth;
    void main(){
      vUv=uv; vCell=aCell; vId=aId; vType=aType; vSeed=aSeed; vDelay=aDelay;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader:`
    uniform float uTime, uWall, uImg, uFrom, uTo, uSweep, uHover, uBoot, uGain, uDim;
    uniform vec2 uGrid; uniform sampler2D uName, uFace; uniform vec3 uRoom;
    varying vec2 vUv, vCell; varying float vId, vType, vSeed, vDelay, vDepth;
    const float ASP = 2.093;
    float hash(float n){ return fract(sin(n*12.9898+4.1414)*43758.5453); }
    float sdBox(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r; }
    float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
    float fillD(float d, float aa){ return 1.0-smoothstep(0.0,aa,d); }
    float curveX(float y, vec2 a, vec2 b){ return mix(b.x, a.x, smoothstep(b.y, a.y, y)); }
    float dot2(vec2 v){ return dot(v,v); }
    float heart(vec2 p, float sz){
      p = p/sz + vec2(0.0,.5); p.x = abs(p.x);
      float d = (p.y+p.x > 1.0) ? sqrt(dot2(p-vec2(.25,.75))) - .35355
                                : sqrt(min(dot2(p-vec2(0.0,1.0)), dot2(p-.5*max(p.x+p.y,0.0)))) * sign(p.x-p.y);
      return fillD(d*sz, .01);
    }

    float app(float type, vec2 q, float t, float s){
      float c = 0.0;
      c += fillD(sdBox(q-vec2(.84,ASP-.07),vec2(.07,.018),.008),.01)*.45;
      c += fillD(sdBox(q-vec2(.16,ASP-.07),vec2(.05,.012),.006),.01)*.35;
      if (type < .5){
        float rows = 9.0;
        float y = (ASP-.17-q.y)/(ASP-.24)*rows + t*.9 + s*7.0;
        float r = floor(y), fy = fract(y);
        float w = .3+.6*hash(r+s*31.0);
        float bar = step(.2,fy)*step(fy,.6)*step(.24,q.x)*step(q.x,.24+.64*w);
        float dot = fillD(length(vec2(q.x-.13,(fy-.4)*(ASP-.24)/rows))-.045,.012);
        c += (bar*mix(.4,.9,hash(r*1.7+s)) + dot*.7)*step(q.y,ASP-.17)*step(.05,q.y);
      } else if (type < 1.5){
        vec2 n1=vec2(.38,1.58), n2=vec2(.62,1.05), n3=vec2(.38,.52);
        float d = min(sdBox(q-n1,vec2(.26,.085),.03), min(sdBox(q-n2,vec2(.26,.085),.03), sdBox(q-n3,vec2(.26,.085),.03)));
        c += fillD(d,.012)*.85;
        float y1 = step(n2.y+.085,q.y)*step(q.y,n1.y-.085);
        float y2 = step(n3.y+.085,q.y)*step(q.y,n2.y-.085);
        c += fillD(abs(q.x-curveX(q.y,n1-vec2(0.,.085),n2+vec2(0.,.085)))-.006,.01)*y1*.55;
        c += fillD(abs(q.x-curveX(q.y,n2-vec2(0.,.085),n3+vec2(0.,.085)))-.006,.01)*y2*.55;
        float k = fract(t*.32+s);
        float py = k<.5 ? mix(n1.y-.085,n2.y+.085,k*2.0) : mix(n2.y-.085,n3.y+.085,(k-.5)*2.0);
        float px = k<.5 ? curveX(py,n1-vec2(0.,.085),n2+vec2(0.,.085)) : curveX(py,n2-vec2(0.,.085),n3+vec2(0.,.085));
        c += fillD(length(q-vec2(px,py))-.03,.015);
        float rt = fract(t*.45+s*.7);
        c += fillD(abs(length(q-vec2(.78,1.82))-rt*.22)-.006,.01)*(1.0-rt)*.9;
      } else if (type < 2.5){
        vec2 ctr = vec2(.5,1.32);
        float cyc = fract(t*.28+s);
        float on = smoothstep(.12,.22,cyc)*(1.0-smoothstep(.82,.92,cyc));
        c += fillD(abs(length(q-ctr)-.3)-.012,.01)*mix(.35,.95,on);
        float ck = min(sdSeg(q,ctr+vec2(-.13,0.),ctr+vec2(-.03,-.1)), sdSeg(q,ctr+vec2(-.03,-.1),ctr+vec2(.15,.12)));
        c += fillD(ck-.028,.012)*on;
        c += fillD(sdBox(q-vec2(.5,.78),vec2(.3,.05),.02),.01)*(.35+.6*on);
        for (int i=0;i<3;i++){ float fi=float(i); c += fillD(sdBox(q-vec2(.18+.25*hash(fi+s*9.),.5-fi*.13),vec2(.25*hash(fi*3.+s)+.08,.022),.01),.01)*.4; }
      } else if (type < 3.5){
        float off = fract(t*.18+s)*.42;
        for (int i=0;i<6;i++){
          float fi=float(i);
          float y = .25 + fi*.42 - off;
          float side = mod(fi+floor(s*2.0),2.0);
          float w = .28+.22*hash(fi+s*13.0);
          vec2 cpos = vec2(side>.5 ? .9-w : .1+w, y);
          float b = sdBox(q-cpos, vec2(w,.12), .06);
          float vis = step(.1,y)*step(y,ASP-.18);
          c += fillD(b,.012)*mix(.38,.92,side)*vis;
        }
      } else if (type < 4.5){
        float x = q.x;
        float f = .55 + x*.85 + .14*sin(x*11.0+s*20.0) + .06*sin(x*27.0+s*7.0);
        float df = abs(q.y-f)/sqrt(1.0+pow(.85+1.54*cos(x*11.0+s*20.0),2.0));
        float inside = step(.08,x)*step(x,.94);
        c += fillD(df-.012,.012)*inside;
        c += (1.0-smoothstep(f-.01,f,q.y))*step(.45,q.y)*inside*.16;
        float dash = step(.5,fract(x*14.0));
        c += fillD(abs(q.y-1.62)-.004,.006)*dash*.5;
        float mx = .08+fract(t*.16+s)*.86;
        float my = .55 + mx*.85 + .14*sin(mx*11.0+s*20.0) + .06*sin(mx*27.0+s*7.0);
        c += fillD(length(q-vec2(mx,my))-.035,.015);
        c += fillD(sdBox(q-vec2(.5,.26),vec2(.4,.012),.004),.01)*.45;
      } else if (type < 5.5){
        // Recents: live call waveform, transcript lines typing in underneath
        vec2 pc = vec2(.5,1.74);
        c += fillD(abs(sdBox(q-pc,vec2(.38,.13),.13))-.007,.01)*.5;
        c += fillD(length(q-vec2(.22,1.74))-.034,.012)*(.45+.55*step(.5,fract(t*1.1)));
        float bx = (q.x-.33)/.5;
        if (bx > 0.0 && bx < 1.0){
          float i = floor(bx*13.0), fx = fract(bx*13.0);
          float hgt = .015 + .085*abs(sin(i*1.7 + t*4.0 + s*9.0))*(.35 + .65*hash(i + floor(t*7.0) + s));
          c += step(.28,fx)*step(fx,.72)*step(abs(q.y-1.74),hgt)*.9;
        }
        float cyc = fract(t*.11 + s);
        for (int i=0;i<7;i++){
          float fi = float(i);
          float y = 1.43 - fi*.165;
          float w = .34 + .38*hash(fi + s*17.0);
          float k = clamp(cyc*9.0 - fi, 0.0, 1.0);
          float ln = fillD(sdBox(q-vec2(.21+w*k*.5, y), vec2(w*k*.5, .021), .01), .01)*step(.02,k);
          float who = step(.5, hash(fi*2.3 + floor(s*5.0)));
          c += ln*mix(.42,.8,who);
          c += fillD(length(q-vec2(.11,y))-.028,.01)*step(.02,k)*mix(.3,.9,who);
        }
      } else {
        // Wear Close: two bracelets, a heart travels from one to the other, then the notification lands
        vec2 A = vec2(.5,.5), B = vec2(.5,1.36);
        float k = fract(t*.22 + s);
        for (int j=0;j<2;j++){
          vec2 P = j==0 ? A : B;
          float e1 = abs(length((q-P-vec2(0.0,.022))*vec2(1.0,1.7))-.24)-.011;
          float e2 = abs(length((q-P+vec2(0.0,.022))*vec2(1.0,1.7))-.24)-.011;
          float front = step(q.y, P.y);
          c += fillD(min(e1,e2),.01)*mix(.38,.85,front);
          c += fillD(sdBox(q-P-vec2(0.0,.141),vec2(.026,.03),.012),.01)*.7;
          float nd = sdBox(q-P+vec2(0.0,.141),vec2(.062,.056),.022);
          c = mix(c, j==0 ? .95 : .18, fillD(nd,.01));
          c += fillD(abs(nd)-.008,.008)*.9;
        }
        float seg = step(abs(q.x-.5),.006)*step(A.y+.2,q.y)*step(q.y,B.y-.22);
        c += seg*step(.5,fract(q.y*16.0 - t*1.5))*.45;
        float hy = mix(A.y+.04, B.y-.04, smoothstep(0.0,.55,k));
        c += heart(q-vec2(.5,hy), .085)*(1.0-step(.58,k));
        float pr = clamp((k-.56)/.44, 0.0, 1.0);
        c += fillD(abs(length((q-B)*vec2(1.0,1.7))-(.24+pr*.36))-.008,.01)*(1.0-pr)*step(.56,k);
        float ap = smoothstep(.56,.62,k)*(1.0-smoothstep(.95,1.0,k));
        c += fillD(sdBox(q-vec2(.5,1.84),vec2(.4,.085),.07),.01)*.88*ap;
        c -= heart(q-vec2(.2,1.84),.05)*ap*.75;
        c -= fillD(sdBox(q-vec2(.53,1.865),vec2(.2,.014),.007),.008)*ap*.6;
        c -= fillD(sdBox(q-vec2(.47,1.815),vec2(.14,.012),.006),.008)*ap*.4;
      }
      return c;
    }

    void main(){
      vec2 q = vec2(vUv.x, vUv.y*ASP);
      float t = uTime + vSeed*30.0;
      float typ = vDelay < uSweep ? uTo : uFrom;
      if (typ > 8.5) typ = vType;
      float a = clamp(app(typ, q, t, vSeed), 0.0, 1.2);

      vec2 wuv = (vCell + vUv) / uGrid;
      vec3 fc = texture2D(uFace, wuv).rgb;
      float fl = smoothstep(.05, 1.0, dot(fc, vec3(.299,.587,.114)))*.9;
      float nm = texture2D(uName, wuv).r;
      float img = mix(nm, fl, uImg);
      vec2 pg = fract(vUv*vec2(54.0,112.0));
      img *= .74 + .26*step(.18,pg.x)*step(.18,pg.y);
      float glitch = step(.985, hash(vId*.37 + floor(uTime*3.0)));
      float wm = smoothstep(vDelay, vDelay+.2, uWall*1.25) * (1.0 - glitch*.85*step(.99,uWall));
      float b = mix(a*mix(1.0,.55,uWall), img*1.05, wm);

      vec3 bg = vec3(.028,.036,.058);
      vec3 ink = vec3(.82,.88,1.0) * (.88 + .16*hash(vId*1.3));
      vec3 col = bg + (ink-bg)*b;
      col *= .92 + .08*sin(vUv.y*620.0 + uTime*6.0);
      vec2 e = min(vUv, 1.0-vUv); col *= smoothstep(0.0,.04,e.x)*smoothstep(0.0,.02,e.y)*.25+.75;
      if (abs(vId-uHover) < .5) col = col*1.45 + vec3(.06,.035,0.0);
      float on = step(vSeed, uBoot);
      float flash = on*(1.0-smoothstep(0.0,.06,uBoot-vSeed));
      col = mix(bg*.35, col, on) + vec3(.6,.65,.75)*flash;
      col *= mix(1.0, .28, uDim);
      // the screens are authored in display space; the composer works in linear light
      col = pow(max(col, vec3(0.0)), vec3(2.2)) * uGain;
      col = mix(col, uRoom, smoothstep(34.0, 72.0, vDepth));
      gl_FragColor = vec4(col, 1.0);
    }`
});
const screens = new THREE.InstancedMesh(screenGeo, screenMat, COUNT);
const shelves = new THREE.InstancedMesh(new THREE.BoxGeometry(SX*.98, .05, .42), new THREE.MeshStandardMaterial({color:0x14161c, metalness:.7, roughness:.45}), COUNT);
const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(.06,.035,.02), new THREE.MeshBasicMaterial(), COUNT);
const AMBER = new THREE.Color('#ffb547').multiplyScalar(2.2);
const LEDOFF = new THREE.Color(0x2a2418), LEDGREEN = new THREE.Color(0x58ff9a).multiplyScalar(1.3);
wall.add(bodies, screens, shelves, leds);

const lift = new Float32Array(COUNT);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
function place(i){
  const b=base[i], l=lift[i];
  tmpE.set(0,b.ry,0); tmpQ.setFromEuler(tmpE);
  N.set(Math.sin(b.ry),0,Math.cos(b.ry));
  const k = 1 + l*.08;
  tmpP.set(b.x,b.y,b.z).addScaledVector(N, l*.9); tmpS.set(k,k,k);
  tmpM.compose(tmpP,tmpQ,tmpS); bodies.setMatrixAt(i,tmpM);
  tmpP.addScaledVector(N, BD/2+.002); tmpM.compose(tmpP,tmpQ,tmpS); screens.setMatrixAt(i,tmpM);
}
for (let i=0;i<COUNT;i++){
  place(i);
  const b=base[i]; tmpE.set(0,b.ry,0); tmpQ.setFromEuler(tmpE); N.set(Math.sin(b.ry),0,Math.cos(b.ry));
  tmpP.set(b.x,b.y-BH/2-.07,b.z).addScaledVector(N,.08); tmpS.set(1,1,1); tmpM.compose(tmpP,tmpQ,tmpS); shelves.setMatrixAt(i,tmpM);
  tmpP.addScaledVector(N,.215); tmpP.x += Math.cos(b.ry)*.36; tmpP.z -= Math.sin(b.ry)*.36; tmpM.compose(tmpP,tmpQ,tmpS); leds.setMatrixAt(i,tmpM);
  leds.setColorAt(i, rnd()>.12 ? LEDGREEN : AMBER);
}
[bodies,screens,shelves,leds].forEach(m=>{ m.instanceMatrix.needsUpdate=true; });
leds.instanceColor.needsUpdate = true;

// =====================================================================
// Product stage: rides with the camera, so objects stay framed while the wall moves behind them.
// Units: 1 = 10 cm.
// =====================================================================
const stage = new THREE.Group(); camera.add(stage);
const pKey = new THREE.DirectionalLight(0xffffff, 1.0); pKey.position.set(-2.5,3,3); camera.add(pKey); pKey.target = stage;

function rrShape(w,h,r){
  const s = new THREE.Shape(), x=w/2, y=h/2; r = Math.min(r,x,y);
  s.moveTo(-x+r,-y); s.lineTo(x-r,-y); s.absarc(x-r,-y+r,r,-Math.PI/2,0,false);
  s.lineTo(x,y-r); s.absarc(x-r,y-r,r,0,Math.PI/2,false);
  s.lineTo(-x+r,y); s.absarc(-x+r,y-r,r,Math.PI/2,Math.PI,false);
  s.lineTo(-x,-y+r); s.absarc(-x+r,-y+r,r,Math.PI,Math.PI*1.5,false);
  return s;
}
// rounded slab centred on the origin, caps facing ±z (material group 0 = caps, 1 = sides)
function slab(w,h,d,r,b){
  const g = new THREE.ExtrudeGeometry(rrShape(w-2*b,h-2*b,Math.max(.002,r-b)), {depth:Math.max(.001,d-2*b), bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelSegments:6, curveSegments:28});
  g.translate(0,0,-(d-2*b)/2); return g;
}
function flat(w,h,r){
  const g = new THREE.ShapeGeometry(rrShape(w,h,r), 28), p = g.attributes.position, uv = g.attributes.uv;
  for (let i=0;i<p.count;i++) uv.setXY(i, p.getX(i)/w+.5, p.getY(i)/h+.5);
  return g;
}
const faceBack = m => { m.rotation.y = Math.PI; return m; };

// ---------- phone ("iPhone 18 Pro Max"-ish, deep blue aluminium) ----------
const PW=.78, PH=1.63, PD=.083;
const phone = new THREE.Group(); stage.add(phone);
const frameMat = new THREE.MeshStandardMaterial({color:0x40506e, metalness:.92, roughness:.3, envMap:envTex, envMapIntensity:1});
const backMat = new THREE.MeshPhysicalMaterial({color:0x26334a, roughness:.5, clearcoat:.5, clearcoatRoughness:.4, envMap:envTex, envMapIntensity:.8});
phone.add(new THREE.Mesh(slab(PW,PH,PD,.118,.028), [backMat, frameMat]));
const frontGlass = new THREE.Mesh(flat(PW-.01,PH-.01,.113), new THREE.MeshPhysicalMaterial({color:0x020203, roughness:.1, clearcoat:1, envMap:envTex}));
frontGlass.position.z = PD/2+.0006; phone.add(frontGlass);

const UI = document.createElement('canvas'); UI.width = 600; UI.height = 1254;
const ui = UI.getContext('2d');
const uiTex = new THREE.CanvasTexture(UI); uiTex.colorSpace = THREE.SRGBColorSpace; uiTex.anisotropy = 8;
const screenUI = new THREE.Mesh(flat(PW-.046,PH-.046,.094), new THREE.MeshBasicMaterial({map:uiTex, color:0xc2c2c2}));
screenUI.position.z = PD/2+.0012; phone.add(screenUI);
const sheen = new THREE.Mesh(flat(PW-.01,PH-.01,.113), new THREE.MeshStandardMaterial({color:0x000000, roughness:.05, metalness:0, envMap:envTex, envMapIntensity:1.4, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
sheen.position.z = PD/2+.0018; phone.add(sheen);

// back: full-width camera plateau, lens triangle, flash + LiDAR, MagSafe ring
const yP = PH/2-.19;
const plateau = new THREE.Mesh(slab(PW-.06,.3,.02,.1,.008), [frameMat, frameMat]);
plateau.position.set(0, yP, -PD/2-.009); phone.add(plateau);
const lensGlass = new THREE.MeshPhysicalMaterial({color:0x07090f, roughness:.04, clearcoat:1, envMap:envTex, envMapIntensity:1.5});
const lensCore = new THREE.MeshStandardMaterial({color:0x0b1426, emissive:0x101c38, roughness:.2});
function lens(x,y,r){
  const g = new THREE.Group(); g.position.set(x, y, -PD/2-.029);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r*1.13, r*1.13, .02, 48), frameMat); ring.rotation.x = Math.PI/2; g.add(ring);
  const glass = faceBack(new THREE.Mesh(new THREE.CircleGeometry(r*.94, 48), lensGlass)); glass.position.z = -.0102; g.add(glass);
  const core = faceBack(new THREE.Mesh(new THREE.RingGeometry(r*.28, r*.46, 40), lensCore)); core.position.z = -.0106; g.add(core);
  phone.add(g);
}
lens(-.262, yP+.07, .056); lens(-.262, yP-.07, .056); lens(-.128, yP, .056);
const flash = faceBack(new THREE.Mesh(new THREE.CircleGeometry(.022, 32), new THREE.MeshStandardMaterial({color:0xfff1d0, roughness:.3, emissive:0x2a2418})));
flash.position.set(.22, yP+.055, -PD/2-.0195); phone.add(flash);
const lidar = faceBack(new THREE.Mesh(new THREE.CircleGeometry(.022, 32), lensGlass)); lidar.position.set(.22, yP-.055, -PD/2-.0195); phone.add(lidar);
const magRing = faceBack(new THREE.Mesh(new THREE.RingGeometry(.248, .256, 96), new THREE.MeshStandardMaterial({color:0x5d6d8c, roughness:.4, metalness:.3})));
magRing.position.set(0, -.08, -PD/2-.0008); phone.add(magRing);
[[PW/2+.003,.22,.2],[PW/2+.003,-.25,.13],[-PW/2-.003,.44,.07],[-PW/2-.003,.27,.12],[-PW/2-.003,.11,.12]].forEach(([x,y,h])=>{
  const b = new THREE.Mesh(new THREE.BoxGeometry(.012,h,.028), frameMat); b.position.set(x,y,0); phone.add(b);
});

// ---------- Recents puck ----------
const PR=.27, PT=.072, PE=.024;
const prof = [new THREE.Vector2(0,-PT/2), new THREE.Vector2(PR-PE,-PT/2)];
for (let i=1;i<=8;i++){ const a=-Math.PI/2+i/8*Math.PI/2; prof.push(new THREE.Vector2(PR-PE+Math.cos(a)*PE, -PT/2+PE+Math.sin(a)*PE)); }
for (let i=1;i<=8;i++){ const a=i/8*Math.PI/2; prof.push(new THREE.Vector2(PR-PE+Math.cos(a)*PE, PT/2-PE+Math.sin(a)*PE)); }
prof.push(new THREE.Vector2(0,PT/2));
const puckGeo = new THREE.LatheGeometry(prof, 80); puckGeo.rotateX(Math.PI/2);
const puck = new THREE.Group(); phone.add(puck);
puck.add(new THREE.Mesh(puckGeo, new THREE.MeshPhysicalMaterial({color:0x8f8c86, roughness:.42, clearcoat:.5, clearcoatRoughness:.3, envMap:envTex, envMapIntensity:.55})));
// warm grey ceramic puck, dark glass centre where the live waveform shows
const puckGlass = faceBack(new THREE.Mesh(new THREE.CircleGeometry(.178, 64), new THREE.MeshPhysicalMaterial({color:0x08090b, roughness:.08, clearcoat:1, envMap:envTex})));
puckGlass.position.z = -PT/2-.0008; puck.add(puckGlass);
const ledMat = new THREE.MeshBasicMaterial({color:0x000000});
const ledRing = new THREE.Mesh(new THREE.TorusGeometry(.205, .0065, 12, 140), ledMat); ledRing.position.z = -PT/2-.001; puck.add(ledRing);
const PF = document.createElement('canvas'); PF.width = PF.height = 256; const pf = PF.getContext('2d');
const puckTex = new THREE.CanvasTexture(PF); puckTex.colorSpace = THREE.SRGBColorSpace;
const puckFace = faceBack(new THREE.Mesh(new THREE.CircleGeometry(.17, 64), new THREE.MeshBasicMaterial({map:puckTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false})));
puckFace.position.z = -PT/2-.0016; puck.add(puckFace);
const ATTACH = new THREE.Vector3(0, -.08, -PD/2-PT/2-.002);
const snapRing = new THREE.Mesh(new THREE.TorusGeometry(.272, .007, 10, 140), new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,1.5,.6), transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
snapRing.position.copy(ATTACH); phone.add(snapRing);

// ---------- Wear Close bracelets (A2: double cord, square NFC node in front, slider at the back) ----------
const BS = 1.3; // bracelets read better a touch larger than life next to the phone
function makeBracelet(stone){
  const g = new THREE.Group();
  const cord = new THREE.MeshStandardMaterial({color: stone?0xb3a48c:0x2c2c2f, roughness:.95, metalness:0, envMap:envTex, envMapIntensity:.5});
  const capM = new THREE.MeshPhysicalMaterial({color: stone?0xc9bfae:0x242427, roughness:.34, clearcoat:.7, clearcoatRoughness:.3, envMap:envTex, envMapIntensity:.45});
  const bezM = new THREE.MeshStandardMaterial({color: stone?0xc99a74:0x5c5d62, metalness:1, roughness:.28, envMap:envTex, envMapIntensity:.7, emissive:0x000000});
  const RX=.31, RZ=.29, rr=.0165, off=.023;
  for (const o of [-off, off]){
    const pts = []; for (let i=0;i<96;i++){ const a=i/96*Math.PI*2; pts.push(new THREE.Vector3(Math.cos(a)*RX, o, Math.sin(a)*RZ)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 220, rr, 14, true), cord));
  }
  const node = new THREE.Mesh(slab(.15,.15,.052,.046,.013), [capM, bezM]); node.position.set(0,0,RZ+.024); g.add(node);
  const slider = new THREE.Mesh(slab(.075,.075,.056,.026,.012), [bezM, bezM]); slider.position.set(0,0,-RZ-.014); g.add(slider);
  for (const k of [-1,1]){
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(rr,rr,.11,12), cord); tail.rotation.z = Math.PI/2; tail.rotation.y = k*.35; tail.position.set(k*.085, 0, -RZ-.05); g.add(tail);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(rr*1.3,rr*1.3,.034,18), bezM); tip.rotation.z = Math.PI/2; tip.rotation.y = k*.35; tip.position.set(k*.15, 0, -RZ-.073); g.add(tip);
  }
  g.rotation.x = .42; g.scale.setScalar(BS);
  return {g, node, bezM, capM};
}
const stone = makeBracelet(true), charcoal = makeBracelet(false);
stage.add(stone.g, charcoal.g);
const STONE_AT = new THREE.Vector3(-.02,-.46,.12), CHAR_AT = new THREE.Vector3(.95,.16,-.4);

// node positions at rest, in stage space (for ripples, the pulse arc and the phone tap)
const nodeAt = (b, at) => new THREE.Vector3(0,0,(.29+.05)*BS).applyEuler(b.g.rotation).add(at);
const STONE_NODE = nodeAt(stone, STONE_AT), CHAR_NODE = nodeAt(charcoal, CHAR_AT);

const ripples = [0,1,2].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(.94,1,72), new THREE.MeshBasicMaterial({color:new THREE.Color(1.8,1.4,1.1), transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false})); m.position.copy(STONE_NODE); stage.add(m); return m; });
const arc = new THREE.QuadraticBezierCurve3(STONE_NODE.clone(), STONE_NODE.clone().lerp(CHAR_NODE,.5).add(new THREE.Vector3(-.05,.62,.35)), CHAR_NODE.clone());
const ARC_SEG = 140;
const pulseTube = new THREE.Mesh(new THREE.TubeGeometry(arc, ARC_SEG, .008, 8, false), new THREE.MeshBasicMaterial({color:new THREE.Color(2.6,1.2,.75), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
const pulseHead = new THREE.Mesh(new THREE.SphereGeometry(.03, 20, 14), new THREE.MeshBasicMaterial({color:new THREE.Color(5,2.6,1.6)}));
stage.add(pulseTube, pulseHead);

const NC = document.createElement('canvas'); NC.width = 720; NC.height = 196; const nc = NC.getContext('2d');
const notifTex = new THREE.CanvasTexture(NC); notifTex.colorSpace = THREE.SRGBColorSpace;
const notif = new THREE.Mesh(new THREE.PlaneGeometry(.95, .95*196/720), new THREE.MeshBasicMaterial({map:notifTex, transparent:true, depthWrite:false, color:0xb4b4b4}));
notif.position.copy(CHAR_AT).add(new THREE.Vector3(.02,.62,.22)); stage.add(notif);

// ---------- phone UI (2D canvas → texture) ----------
const SF = '-apple-system, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
const SERIF = '"Cormorant Garamond", Georgia, serif';
function rr(x,y,w,h,r){ ui.beginPath(); ui.roundRect(x,y,w,h,r); }
function wrap(text, maxW){ const words = text.split(' '), lines = []; let cur = ''; for (const w of words){ const t = cur ? cur+' '+w : w; if (ui.measureText(t).width > maxW && cur){ lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
function heart2d(g,cx,cy,s){ g.beginPath(); g.moveTo(cx,cy+s*.42); g.bezierCurveTo(cx-s*1.15,cy-s*.35,cx-s*.5,cy-s*1.05,cx,cy-s*.42); g.bezierCurveTo(cx+s*.5,cy-s*1.05,cx+s*1.15,cy-s*.35,cx,cy+s*.42); g.fill(); }

function statusBar(dark, rec){
  const fg = dark ? '#ffffff' : '#1b1a18';
  ui.fillStyle = fg; ui.font = `600 30px ${SF}`; ui.textBaseline = 'middle'; ui.textAlign = 'left';
  ui.fillText(hhmm(clock.shown), 66, 64);
  ui.fillStyle = '#000'; rr(204,28,192,62,31); ui.fill();
  if (rec > 0){ ui.fillStyle = `rgba(255,181,71,${rec})`; ui.beginPath(); ui.arc(370,59,7,0,Math.PI*2); ui.fill(); }
  ui.fillStyle = fg;
  for (let i=0;i<4;i++){ rr(424+i*11, 74-(i+1)*6.5, 7, (i+1)*6.5, 2); ui.fill(); }
  ui.strokeStyle = fg; ui.lineWidth = 3; ui.lineCap = 'round';
  for (let i=0;i<3;i++){ ui.beginPath(); ui.arc(486, 76, 6+i*6.5, Math.PI*1.25, Math.PI*1.75); ui.stroke(); }
  ui.lineWidth = 2; rr(512,52,40,22,6); ui.stroke(); rr(515,55,28,16,3); ui.fill(); rr(554,59,3,8,1); ui.fill();
}

const CALL = {name:'Dentist', sub:'Dr. Novák'};
const LINES = [
  ['Dr. Novák','The filling is holding up really well.'],
  ['You','Great. Anything I should do differently?'],
  ['Dr. Novák','Floss every night, especially on the left side.'],
  ['You','And when do you want to see me again?'],
  ['Dr. Novák','March 3rd at 9:30, for the cleaning.']
];
const QUERY = 'What did the dentist tell me?';
const ANSWER = 'Floss every night, especially on the left side. Your next visit is March 3 at 9:30.';

function drawCall(rec, secs, t){
  const g = ui.createLinearGradient(0,0,0,1254); g.addColorStop(0,'#26333f'); g.addColorStop(1,'#07090c');
  ui.fillStyle = g; ui.fillRect(0,0,600,1254);
  statusBar(true, rec);
  ui.fillStyle = '#3e4c5b'; ui.beginPath(); ui.arc(300,300,92,0,Math.PI*2); ui.fill();
  ui.fillStyle = '#fff'; ui.textAlign = 'center'; ui.font = `500 84px ${SF}`; ui.fillText('D', 300, 304);
  ui.font = `500 60px ${SF}`; ui.fillText(CALL.name, 300, 460);
  ui.fillStyle = 'rgba(255,255,255,.6)'; ui.font = `400 28px ${SF}`;
  ui.fillText(`${CALL.sub} · ${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`, 300, 514);
  if (rec > 0){
    ui.globalAlpha = rec;
    ui.fillStyle = 'rgba(255,181,71,.14)'; rr(128,566,344,58,29); ui.fill();
    ui.strokeStyle = 'rgba(255,181,71,.7)'; ui.lineWidth = 2; ui.stroke();
    ui.fillStyle = '#ffb547'; ui.beginPath(); ui.arc(162,595,8,0,Math.PI*2); ui.fill();
    ui.font = `500 24px ${SF}`; ui.textAlign = 'left'; ui.fillText('Recording to Recents', 184, 596);
    for (let i=0;i<14;i++){ const h = 6 + 26*Math.abs(Math.sin(i*1.7 + t*7))*(.4+.6*Math.abs(Math.sin(i*3.1+t*3))); rr(150+i*22, 680-h/2, 9, h, 4); ui.fill(); }
    ui.globalAlpha = 1;
  }
  const labels = ['mute','keypad','speaker','add call','FaceTime','contacts'];
  ui.textAlign = 'center';
  for (let i=0;i<6;i++){
    const x = 150 + (i%3)*150, y = 820 + Math.floor(i/3)*175;
    ui.fillStyle = 'rgba(255,255,255,.14)'; ui.beginPath(); ui.arc(x,y,56,0,Math.PI*2); ui.fill();
    ui.fillStyle = 'rgba(255,255,255,.85)'; ui.beginPath(); ui.arc(x,y,9,0,Math.PI*2); ui.fill();
    ui.fillStyle = 'rgba(255,255,255,.75)'; ui.font = `400 22px ${SF}`; ui.fillText(labels[i], x, y+86);
  }
  ui.fillStyle = '#ff3b30'; ui.beginPath(); ui.arc(300,1150,58,0,Math.PI*2); ui.fill();
  ui.save(); ui.translate(300,1150); ui.rotate(Math.PI*.75); ui.fillStyle = '#fff'; rr(-30,-9,60,18,9); ui.fill(); ui.restore();
}
function appHeader(sub){
  ui.fillStyle = '#0b0d10'; ui.fillRect(0,0,600,1254);
  statusBar(true, 1);
  ui.textAlign = 'left'; ui.fillStyle = '#fff'; ui.font = `700 54px ${SF}`; ui.fillText('Recents', 46, 178);
  ui.fillStyle = 'rgba(255,255,255,.5)'; ui.font = `400 24px ${SF}`; ui.fillText(sub, 48, 226);
  ui.fillStyle = 'rgba(255,255,255,.1)'; ui.fillRect(46, 262, 508, 2);
}
function drawTranscript(p){
  appHeader('Dentist · Today 14:02 · 4 min');
  const total = LINES.reduce((s,l)=>s+l[1].length, 0);
  let budget = Math.floor(p*total*1.05), y = 318;
  for (const [who, text] of LINES){
    if (budget <= 0) break;
    const shown = text.slice(0, Math.min(text.length, budget)); budget -= text.length;
    ui.fillStyle = who==='You' ? 'rgba(255,255,255,.45)' : '#ffb547'; ui.font = `600 21px ${SF}`; ui.fillText(who.toUpperCase(), 48, y);
    ui.fillStyle = '#f2f3f5'; ui.font = `400 31px ${SF}`;
    const lines = wrap(text, 504), shownLines = wrap(shown, 504);
    shownLines.forEach((l,i)=> ui.fillText(l, 48, y+44+i*42));
    y += 44 + lines.length*42 + 30;
  }
  ui.fillStyle = 'rgba(255,181,71,.9)'; ui.beginPath(); ui.arc(62,1170,7,0,Math.PI*2); ui.fill();
  ui.fillStyle = 'rgba(255,255,255,.55)'; ui.font = `500 22px ${SF}`; ui.fillText('Live transcript', 80, 1171);
}
function drawAsk(p, t){
  appHeader('Ask anything about your calls');
  const ans = smooth(.55, .95, p), rows = [['Dentist','Today 14:02'],['Mom','Yesterday 19:40'],['Landlord','Mon 10:15']];
  ui.globalAlpha = 1 - ans*.85;
  rows.forEach(([n,d],i)=>{
    const y = 300 + i*112;
    ui.fillStyle = 'rgba(255,255,255,.06)'; rr(46,y,508,92,22); ui.fill();
    ui.fillStyle = '#fff'; ui.font = `600 28px ${SF}`; ui.fillText(n, 76, y+36);
    ui.fillStyle = 'rgba(255,255,255,.45)'; ui.font = `400 22px ${SF}`; ui.fillText(d, 76, y+66);
    ui.fillStyle = 'rgba(255,181,71,.8)'; for (let k=0;k<9;k++){ const h = 6+16*Math.abs(Math.sin(k*1.9+i)); rr(420+k*13, y+46-h/2, 6, h, 3); ui.fill(); }
  });
  ui.globalAlpha = 1;
  // answer card slides up from the search bar
  if (ans > 0){
    const y = lerp(1060, 640, outBack(ans));
    ui.globalAlpha = Math.min(1, ans*1.6);
    ui.fillStyle = '#f3f0ea'; rr(40, y, 520, 360, 34); ui.fill();
    ui.fillStyle = '#b06a12'; ui.font = `700 22px ${SF}`; ui.fillText('✦ RECENTS', 74, y+56);
    ui.fillStyle = '#16171a'; ui.font = `500 33px ${SF}`;
    wrap(ANSWER, 452).forEach((l,i)=> ui.fillText(l, 74, y+112+i*45));
    ui.fillStyle = '#76736d'; ui.font = `400 21px ${SF}`; ui.fillText('From your call with Dentist · Today', 74, y+322);
    ui.globalAlpha = 1;
  }
  ui.fillStyle = '#1a1d22'; rr(40,1066,520,86,43); ui.fill();
  const n = Math.floor(clamp01(p/.48)*QUERY.length), typed = QUERY.slice(0,n);
  ui.font = `400 29px ${SF}`; ui.fillStyle = n ? '#fff' : 'rgba(255,255,255,.35)';
  ui.fillText(n ? typed : 'Ask Recents…', 82, 1110);
  if (n < QUERY.length && Math.floor(t*2)%2===0){ const w = ui.measureText(typed).width; ui.fillStyle = '#ffb547'; ui.fillRect(84+w, 1092, 3, 36); }
}
function drawPulse(stateP, t){
  ui.fillStyle = '#f3efe8'; ui.fillRect(0,0,600,1254);
  statusBar(false, 0);
  ui.textAlign = 'center'; ui.fillStyle = '#7d776c'; ui.font = `500 21px ${SF}`;
  ui.letterSpacing = '6px'; ui.fillText('WEAR CLOSE', 303, 170); ui.letterSpacing = '0px';
  ui.fillStyle = '#1b1a18'; ui.font = `300 92px ${SERIF}`; ui.fillText('Sarah', 300, 310);
  ui.fillStyle = '#8a8478'; ui.font = `400 24px ${SF}`; ui.fillText('Toronto · 5:14 PM', 300, 366);
  const cx = 300, cy = 660;
  if (stateP >= 1){
    const k = stateP >= 2 ? 0 : (t*1.4)%1;
    for (let i=0;i<3;i++){ const kk = (k + i/3)%1; ui.strokeStyle = `rgba(201,116,98,${(1-kk)*.6})`; ui.lineWidth = 3; ui.beginPath(); ui.arc(cx,cy,150+kk*130,0,Math.PI*2); ui.stroke(); }
  }
  ui.strokeStyle = '#1b1a18'; ui.lineWidth = 2; ui.beginPath(); ui.arc(cx,cy,170,0,Math.PI*2); ui.stroke();
  ui.fillStyle = stateP >= 2 ? '#c97462' : '#e6dfd2'; ui.beginPath(); ui.arc(cx,cy,132,0,Math.PI*2); ui.fill();
  ui.fillStyle = stateP >= 2 ? '#fff' : '#1b1a18'; heart2d(ui, cx, cy+8, 58);
  ui.fillStyle = '#1b1a18'; ui.font = `400 27px ${SF}`;
  ui.fillText(stateP >= 2 ? 'Sarah felt it.' : stateP >= 1 ? 'Sending your pulse…' : 'Bring your phone to your bracelet', 300, 960);
  ui.fillStyle = '#8a8478'; ui.font = `400 22px ${SF}`; ui.fillText('412 days together', 300, 1150);
  ui.textAlign = 'left';
}
let uiKey = '';
function renderUI(kind, p, now){
  const t = now/1000, secs = 252 + Math.floor(t)%600;
  const k = kind==='call' ? `c${Math.round(p*20)}${secs}${Math.floor(t*24)}` : kind==='ask' ? `a${Math.round(p*90)}${Math.floor(t*2)}` : kind==='pulse' ? `p${p}${p===1?Math.floor(t*30):0}` : `t${Math.round(p*200)}`;
  const kk = k + hhmm(clock.shown);
  if (kk === uiKey) return;
  uiKey = kk;
  ui.save();
  if (kind==='call') drawCall(p, secs, t);
  else if (kind==='transcript') drawTranscript(p);
  else if (kind==='ask') drawAsk(p, t);
  else drawPulse(p, t);
  ui.restore();
  uiTex.needsUpdate = true;
}
function drawPuckFace(level, t){
  pf.clearRect(0,0,256,256);
  if (level <= 0){ puckTex.needsUpdate = true; return; }
  pf.fillStyle = `rgba(255,181,71,${.9*level})`;
  for (let i=0;i<40;i++){
    const a = i/40*Math.PI*2, h = 10 + 34*Math.abs(Math.sin(i*1.3 + t*5))*(.35+.65*Math.abs(Math.sin(i*2.7 - t*2.3)));
    pf.save(); pf.translate(128,128); pf.rotate(a); pf.beginPath(); pf.roundRect(-3, -66-h, 6, h, 3); pf.fill(); pf.restore();
  }
  pf.beginPath(); pf.arc(128,128,10,0,Math.PI*2); pf.fill();
  puckTex.needsUpdate = true;
}
function drawNotif(){
  nc.clearRect(0,0,720,196);
  nc.fillStyle = 'rgba(247,244,239,.96)'; nc.beginPath(); nc.roundRect(4,4,712,188,46); nc.fill();
  nc.fillStyle = '#e4dccd'; nc.beginPath(); nc.roundRect(30,42,112,112,28); nc.fill();
  nc.fillStyle = '#1b1a18'; heart2d(nc, 86, 104, 30);
  nc.fillStyle = '#7d776c'; nc.font = `600 22px ${SF}`; nc.letterSpacing = '4px'; nc.textBaseline = 'middle';
  nc.fillText('WEAR CLOSE', 170, 70); nc.letterSpacing = '0px';
  nc.textAlign = 'right'; nc.font = `400 22px ${SF}`; nc.fillText('now', 680, 70); nc.textAlign = 'left';
  nc.fillStyle = '#1b1a18'; nc.font = `600 36px ${SF}`; nc.fillText('Petr is thinking about you.', 170, 126);
  notifTex.needsUpdate = true;
}

// ---------- keyframed poses (story time st: chapter i holds on [2i,2i+1], moves to i+1 on [2i+1,2i+2]) ----------
const TAU = Math.PI*2;
const TAP_ROT = [-1.02, TAU+.12, .22];
const TAP_POS = STONE_NODE.clone().add(new THREE.Vector3(-.06, .5, .2)).toArray();
const PHONE_KEYS = [
  [3.25, [1.4,-2.9,-.8], [.7,-1.4,.35], 1],
  [3.95, [0,0,0], [-.06,-.34,.05], 1],
  [4.0,  [0,0,0], [-.06,-.34,.05], 1],
  [4.18, [0,.02,0], [-.04,Math.PI-.42,-.04], 1],
  [4.55, [0,.02,0], [-.04,Math.PI-.36,-.03], 1],
  [4.72, [0,0,0], [-.05,TAU-.3,.03], 1],
  [5.05, [0,0,0], [-.05,TAU-.27,.03], 1],
  [5.6,  [-.55,.6,.3], [-.18,TAU+.3,.5], .6],
  [6.02, [-.55,.6,.3], [-.18,TAU+.3,.5], .6],
  [6.24, TAP_POS, TAP_ROT, .6],
  [6.42, TAP_POS, TAP_ROT, .6],
  [6.62, [-.6,.56,.3], [-.18,TAU+.28,.45], .6],
  [7.02, [-.6,.56,.3], [-.18,TAU+.28,.45], .6],
  [7.55, [-1.3,-3.0,-.4], [.6,TAU+.9,.9], .6]
];
function pose(keys, st, obj){
  let i = 0; while (i < keys.length-2 && st >= keys[i+1][0]) i++;
  const a = keys[i], b = keys[i+1], f = easeIO(clamp01((st-a[0])/(b[0]-a[0])));
  obj.position.set(lerp(a[1][0],b[1][0],f), lerp(a[1][1],b[1][1],f), lerp(a[1][2],b[1][2],f));
  obj.rotation.set(lerp(a[2][0],b[2][0],f), lerp(a[2][1],b[2][1],f), lerp(a[2][2],b[2][2],f));
  obj.scale.setScalar(lerp(a[3],b[3],f));
}
const SNAP = 4.4, ARRIVE = 6.56;
const fx = {snapT:-1e9, arriveT:-1e9, shake:0, prevSt:0};
const PUCK_FROM = new THREE.Vector3(-1.15, .6, -1.25), PUCK_AWAY = new THREE.Vector3(2.6, -1.4, -2.2);

function updateStage(st, now){
  const t = now/1000;
  const vis = smooth(3.2, 3.85, st) * (1 - smooth(7.05, 7.6, st));
  stage.visible = vis > .002;
  uniforms.uDim.value = vis;
  if (!stage.visible) return;

  // crossing events are time-based so the snap and the arrival feel physical at any scroll speed
  if (fx.prevSt < SNAP && st >= SNAP){ fx.snapT = now; fx.shake = 1; }
  if (fx.prevSt < ARRIVE && st >= ARRIVE){ fx.arriveT = now; }
  fx.prevSt = st;

  // phone
  phone.visible = st > 3.22 && st < 7.58;
  pose(PHONE_KEYS, st, phone);
  if (!reduced){ phone.position.y += Math.sin(t*1.1)*.018; phone.rotation.z += Math.sin(t*.8)*.012; }

  // puck: magnet pull (accelerating), snap, recording, then off it goes
  const flyK = clamp01((st-4.18)/(SNAP-4.18)), awayK = smooth(5.0, 5.32, st);
  puck.visible = st > 4.18 && awayK < 1;
  if (puck.visible){
    const e = flyK*flyK*flyK;
    puck.position.lerpVectors(PUCK_FROM, ATTACH, e);
    puck.position.y += Math.sin(flyK*Math.PI)*.22*(1-flyK);
    puck.rotation.set((1-e)*.9, (1-e)*-.7, (1-e)*7);
    const since = (now - fx.snapT)/1000;
    if (st >= SNAP && since < .5) puck.position.z -= Math.sin(Math.min(1,since/.5)*Math.PI*3)*Math.exp(-since*7)*.03;
    if (awayK > 0){ puck.position.lerp(PUCK_AWAY, easeIO(awayK)); puck.rotation.z += awayK*5; }
  }
  const sinceSnap = (now - fx.snapT)/1000;
  const on = st >= SNAP && awayK < 1 ? Math.min(1, Math.max(0, sinceSnap/.35)) * (sinceSnap < .35 ? (Math.random()>.35?1:.25) : 1) : 0;
  const rec = st >= SNAP && st < 5.0 ? on : 0;
  ledMat.color.setRGB(2.6, 1.55, .55).multiplyScalar(on*(.75 + .25*Math.sin(t*3.2)));
  drawPuckFace(rec, t);
  const ringK = st >= SNAP ? clamp01(sinceSnap/.75) : 1;
  snapRing.material.opacity = (1-ringK)*.95; snapRing.scale.setScalar(1 + ringK*1.8);

  // screen content
  if (st < 4.6) renderUI('call', st >= SNAP ? on : 0, now);
  else if (st < 4.8) renderUI('transcript', smooth(4.6, 4.8, st), now);
  else if (st < 5.3) renderUI('ask', clamp01((st-4.8)/.17), now);
  else renderUI('pulse', st < 6.22 ? 0 : st < ARRIVE ? 1 : 2, now);

  // bracelets
  const bIn = smooth(5.35, 5.95, st), bOut = smooth(7.02, 7.5, st), bVis = bIn*(1-bOut);
  stone.g.visible = charcoal.g.visible = bVis > .002;
  if (stone.g.visible){
    stone.g.position.copy(STONE_AT).add(new THREE.Vector3(0, (1-bIn)*-2.4 - bOut*2.6 + (reduced?0:Math.sin(t*.9)*.02), 0));
    stone.g.rotation.y = (1-bIn)*-2.2 + (reduced?0:Math.sin(t*.5)*.06);
    const cIn = smooth(5.45, 6.05, st);
    charcoal.g.position.copy(CHAR_AT).add(new THREE.Vector3(0, (1-cIn)*-2.6 - bOut*2.6 + (reduced?0:Math.sin(t*.9+1.7)*.02), 0));
    charcoal.g.rotation.y = (1-cIn)*2.4 + (reduced?0:Math.sin(t*.5+1)*.06);
    const sinceArr = (now - fx.arriveT)/1000;
    if (st >= ARRIVE && sinceArr < .6 && !reduced){ const j = (1-sinceArr/.6)*.012; charcoal.g.position.x += (Math.random()-.5)*j; charcoal.g.position.y += (Math.random()-.5)*j; }
    const glow = st >= ARRIVE ? .35 + .65*Math.exp(-Math.max(0,sinceArr)*2.2) : 0;
    charcoal.bezM.emissive.setRGB(1.0,.42,.18).multiplyScalar(glow*1.6);
    stone.bezM.emissive.setRGB(1.0,.55,.3).multiplyScalar(st > 6.2 && st < 6.5 ? smooth(6.2,6.26,st)*(1-smooth(6.42,6.5,st)) : 0);
  }
  // NFC ripples at the moment of the tap
  ripples.forEach((m,i)=>{
    const k = clamp01((st - 6.2 - i*.045)/.2);
    m.visible = k > 0 && k < 1 && bVis > .5;
    m.scale.setScalar(.06 + k*.36); m.material.opacity = (1-k)*.85;
  });
  // the pulse: a comet along the arc
  const head = clamp01((st-6.3)/(ARRIVE-6.3)), tail = clamp01((st-6.36)/(ARRIVE-6.3+.04));
  const travelling = head > 0 && tail < 1 && bVis > .5;
  pulseTube.visible = pulseHead.visible = travelling;
  if (travelling){
    const h = Math.floor(head*ARC_SEG), tl = Math.floor(tail*ARC_SEG);
    pulseTube.geometry.setDrawRange(tl*48, Math.max(0,h-tl)*48);
    arc.getPoint(head, pulseHead.position);
  }
  // notification on her side
  const sinceArr = (now - fx.arriveT)/1000;
  const pop = st >= ARRIVE ? (sinceArr < .6 && sinceArr >= 0 ? outBack(clamp01(sinceArr/.5)) : 1) : 0;
  notif.visible = pop > .001 && bVis > .01;
  notif.scale.setScalar(Math.max(.001, pop*(1-bOut)));
  notif.position.y = CHAR_AT.y + .62 + (reduced?0:Math.sin(t*1.2)*.012);
}

function placeStage(){
  const d = 4.4, halfH = d*Math.tan(THREE.MathUtils.degToRad(20)), halfW = halfH*camera.aspect;
  if (isStacked()){ stage.position.set(0, halfH*.4, -d*1.06); stage.scale.setScalar(.56); }
  else { stage.position.set(halfW*.34, -.04, -d); stage.scale.setScalar(1); }
}

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .5, .42, .62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function size(){
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth*.5, innerHeight*.5);
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  placeStage();
}
size();
addEventListener('resize', () => { size(); measure(); });

// ---------- time of day ----------
const clock = {live: pragueHours(), shown: pragueHours(), preview: null, idx: 0};
const PRESETS = [null, 7.5, 13, 19.75, 2.5];
const ROOM_N = new THREE.Color('#05060b'), ROOM_D = new THREE.Color('#0f0e0d'), ROOM_G = new THREE.Color('#150c07');
const AMB_N = new THREE.Color(0x2b3452), AMB_D = new THREE.Color(0x5d5850);
const KEY_N = new THREE.Color(0x7d90ff), KEY_D = new THREE.Color(0xfff2de), KEY_G = new THREE.Color(0xffa45c);
let roomCss = '';
function applyLight(h){
  const e = Math.sin((h-6)/12*Math.PI);
  const day = smooth(-.08,.45,e), gold = smooth(-.22,.04,e)*(1-smooth(.12,.5,e));
  room.copy(ROOM_N).lerp(ROOM_D, day).lerp(ROOM_G, gold*.7);
  scene.background.copy(room); scene.fog.color.copy(room); uniforms.uRoom.value.copy(room);
  amb.color.copy(AMB_N).lerp(AMB_D, day); amb.intensity = lerp(1.3, 2.7, day);
  key.color.copy(KEY_N).lerp(KEY_D, day).lerp(KEY_G, gold*.8); key.intensity = lerp(1.1, 3.0, day) + gold*1.4;
  const ang = (h-6)/12*Math.PI; key.position.set(-Math.cos(ang)*22, 3 + Math.max(0,e)*16, 14);
  rim.intensity = lerp(1.3, .8, day);
  pKey.color.copy(KEY_N).lerp(KEY_D, Math.max(day,.4)).lerp(KEY_G, gold*.6);
  uniforms.uGain.value = lerp(1.06, .9, day);
  bloom.strength = lerp(.52, .34, day) + Math.max(0, 1 - (performance.now()-fx.snapT)/600)*.5;
  const hex = '#' + room.getHexString();
  if (hex !== roomCss){ roomCss = hex; document.documentElement.style.setProperty('--room', hex); }
}
const clockBtn = document.getElementById('clock'), hTime = document.getElementById('hTime'), hShift = document.getElementById('hShift');
clockBtn.addEventListener('click', () => {
  clock.idx = (clock.idx+1) % PRESETS.length; clock.preview = PRESETS[clock.idx];
  clockBtn.classList.toggle('preview', clock.preview !== null);
});

// ---------- scroll → story ----------
const secs = [...document.querySelectorAll('.ch')];
let tops = [], heights = [];
function measure(){ tops = secs.map(s => s.offsetTop); heights = secs.map(s => s.offsetHeight); }
measure();
function storyAt(y){
  const V = innerHeight; let i = 0;
  while (i < secs.length-1 && y >= tops[i+1]) i++;
  const hold = Math.max(0, heights[i]-V), into = y - tops[i];
  if (i === secs.length-1) return {prog:i, st:2*i+1};
  if (into < hold) return {prog:i, st:2*i + into/hold};
  const f = clamp01((into-hold)/V);
  return {prog:i+f, st:2*i+1+f};
}

// ---------- camera path ----------
const fitDist = (R*SY/2)/Math.tan(THREE.MathUtils.degToRad(20)) * (land ? 1.12 : 1.02);
const KP = land ? [
  [-4.8,.4,fitDist,  -4.8,0,0],
  [-6.2,2.4,9.8,     -7.2,2.2,1.2],
  [6.4,-2.2,10.6,     7.6,-2.4,1.4],
  [-1.6,-3.6,12.4,   -.8,-4.2,.3],
  [4.4,4.2,9.2,       5.4,4.2,.9],
  [-4.8,.2,fitDist*1.04, -4.8,0,0]
] : [
  [0,.6,fitDist,      0,0,0],
  [-2.4,6.4,13,      -2.6,6.2,1.5],
  [2.4,-1.8,13.4,     2.8,-2,1.5],
  [-1.4,-8.4,14,     -1.2,-8.6,1],
  [2,10.4,13,         2.4,10.2,1.2],
  [0,.4,fitDist*1.04, 0,0,0]
];
const posCurve = new THREE.CatmullRomCurve3(KP.map(k=>new THREE.Vector3(k[0],k[1],k[2])), false, 'centripetal');
const tgtCurve = new THREE.CatmullRomCurve3(KP.map(k=>new THREE.Vector3(k[3],k[4],k[5])), false, 'centripetal');
const S = KP.length;

// ---------- input ----------
const ndc = new THREE.Vector2(9,9), ray = new THREE.Raycaster();
let mx=0, my=0, pmx=0, pmy=0, hover=-1, overLink=false, tapUntil=0;
const cross = document.getElementById('cross'), sel = document.getElementById('sel'), tag = document.getElementById('tag');
addEventListener('pointermove', e => {
  ndc.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1);
  mx = ndc.x; my = ndc.y;
  overLink = !!e.target.closest('a,button');
  cross.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
}, {passive:true});
document.addEventListener('mouseleave', () => ndc.set(9,9));
addEventListener('pointerdown', e => { if (e.pointerType!=='mouse'){ ndc.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1); tapUntil = performance.now()+2200; } }, {passive:true});

document.getElementById('copy').addEventListener('click', () => {
  const t = document.getElementById('mailtxt').textContent, b = document.getElementById('copy');
  const done = () => { b.textContent='Copied'; setTimeout(()=>b.textContent='Copy',1600); };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(done).catch(()=>getSelection().selectAllChildren(document.getElementById('mailtxt')));
  else getSelection().selectAllChildren(document.getElementById('mailtxt'));
});

const JOBS = ['instagram · scroll + like','mationx · flow 3/3 running','internát · gate.open ✓','whatsapp · warm-up day 6/14','scanner · margin +18%','recents · transcribing 04:12','wear close · pulse to sarah ♥'];
const scrollCue = document.getElementById('scroll'), meEl = document.getElementById('me'), nav = document.querySelector('.nav');
const navLinks = [...document.querySelectorAll('.nav a')];
const sPhones = document.getElementById('sPhones'), sTaps = document.getElementById('sTaps');
document.getElementById('hDev').textContent = COUNT;

// ---------- loop ----------
let sy = scrollY, last = performance.now(), boot = reduced ? 1.1 : 0, hudT = 0, ledT = 0, jobs = COUNT-3, phones = 512;
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), corner = new THREE.Vector3();
const CORNERS = [[-BW/2,-BH/2],[BW/2,-BH/2],[BW/2,BH/2],[-BW/2,BH/2]];

function frame(now){
  const dt = Math.min(.05,(now-last)/1000); last = now;
  if (!reduced) uniforms.uTime.value += dt;
  boot = Math.min(1.1, boot + dt*.55); uniforms.uBoot.value = boot;

  // clock + light
  clock.live = pragueHours();
  const want = clock.preview ?? clock.live;
  const dh = ((want - clock.shown + 36) % 24) - 12;
  clock.shown = (clock.shown + (Math.abs(dh) < .01 ? dh : dh*(reduced?1:.05)) + 24) % 24;
  applyLight(clock.shown);

  sy += (scrollY - sy)*(reduced ? 1 : .085);
  const {prog, st} = storyAt(sy);
  let a = Math.floor(prog), f = prog-a; if (a>=S-1){ a=S-2; f=1; }
  const loc = smooth(.18,.86,f);

  // camera
  const tt = (a+loc)/(S-1);
  posCurve.getPoint(tt, camPos); tgtCurve.getPoint(tt, camTgt);
  pmx += (mx-pmx)*.05; pmy += (my-pmy)*.05;
  const pm = (reduced || !fine) ? 0 : 1;
  fx.shake *= .9;
  const sk = fx.shake*.05;
  camera.position.set(camPos.x + pmx*.9*pm + Math.sin(now*.00021)*.25*pm + (Math.random()-.5)*sk, camPos.y + pmy*.6*pm + Math.cos(now*.00017)*.18*pm + (Math.random()-.5)*sk, camPos.z);
  camera.lookAt(camTgt);
  wall.rotation.y = pmx*.025*pm; wall.rotation.x = -pmy*.015*pm;

  // wall story: mixed, WhatsApp chat, call transcript, bracelet pulse, dorm gate
  const U = uniforms, types = [9,3,5,6,2];
  if (a===0){ U.uWall.value = 1-loc; U.uImg.value=0; U.uFrom.value=9; U.uTo.value=types[1]; U.uSweep.value=smooth(.5,1,loc)*1.05; }
  else if (a===S-2){ U.uWall.value = loc; U.uImg.value=1; U.uFrom.value=types[a]; U.uTo.value=types[a]; U.uSweep.value=0; }
  else { U.uWall.value=0; U.uImg.value=1; U.uFrom.value=types[a]; U.uTo.value=types[a+1]; U.uSweep.value=loc*1.05; }

  updateStage(st, now);

  // hover via raycast (off while the stage owns the frame)
  let h = -1;
  if (ndc.x < 2 && (fine || now < tapUntil) && U.uDim.value < .3){
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(screens, false)[0];
    if (hit && hit.instanceId !== undefined) h = hit.instanceId;
  }
  if (overLink) h = -1;
  hover = h; U.uHover.value = h;
  for (let i=0;i<COUNT;i++){
    const tg = (i===hover && !reduced) ? 1 : 0;
    if (Math.abs(lift[i]-tg) > .002){ lift[i] += (tg-lift[i])*.18; place(i); bodies.instanceMatrix.needsUpdate = true; screens.instanceMatrix.needsUpdate = true; }
  }

  composer.render();

  if (hover >= 0){
    screens.getMatrixAt(hover, tmpM);
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for (const [cx,cy] of CORNERS){
      corner.set(cx,cy,0).applyMatrix4(tmpM).applyMatrix4(wall.matrixWorld).project(camera);
      const sx=(corner.x*.5+.5)*innerWidth, sy2=(-corner.y*.5+.5)*innerHeight;
      x0=Math.min(x0,sx); y0=Math.min(y0,sy2); x1=Math.max(x1,sx); y1=Math.max(y1,sy2);
    }
    const pad=6;
    sel.style.left=(x0-pad)+'px'; sel.style.top=(y0-pad)+'px'; sel.style.width=(x1-x0+pad*2)+'px'; sel.style.height=(y1-y0+pad*2)+'px';
    const inWall = U.uWall.value > .5;
    const typ = (U.uSweep.value > aDelay[hover]) ? U.uTo.value : U.uFrom.value;
    const job = inWall ? `pixel ${base[hover].c},${base[hover].r}` : JOBS[typ>8.5 ? aType[hover] : typ];
    tag.textContent = `#${String(hover+1).padStart(3,'0')} · ${job}`;
    sel.style.opacity = 1; cross.style.opacity = 0;
  } else { sel.style.opacity = 0; cross.style.opacity = (fine && !reduced && ndc.x<2) ? (overLink ? .35 : .9) : 0; }

  scrollCue.style.opacity = prog < .15 ? 1 : 0;
  const meOn = meUV && a===S-2 && loc > .9;
  if (meOn){
    wallPoint(meUV.u, meUV.v, corner).applyMatrix4(wall.matrixWorld).project(camera);
    meEl.style.transform = `translate(${(corner.x*.5+.5)*innerWidth}px,${Math.max(56, (-corner.y*.5+.5)*innerHeight)}px) translate(-50%,-100%)`;
  }
  meEl.style.opacity = meOn ? 1 : 0;
  nav.style.opacity = (a===S-2 && loc > .6) ? 0 : 1;

  // LEDs + HUD + live counters
  ledT += dt;
  if (ledT > .35 && !reduced){
    ledT = 0;
    for (let k=0;k<6;k++){ const i=Math.floor(Math.random()*COUNT); leds.setColorAt(i, Math.random()>.5 ? LEDOFF : (Math.random()>.85 ? AMBER : LEDGREEN)); }
    leds.instanceColor.needsUpdate = true;
  }
  sTaps.textContent = Math.floor(clock.live*3600*31.7).toLocaleString('en-US');
  hudT += dt;
  if (hudT > .5){
    hudT = 0;
    jobs = Math.max(COUNT-6, Math.min(COUNT, jobs + (Math.random()>.5?1:-1)));
    phones = Math.max(498, Math.min(526, phones + Math.round((Math.random()-.5)*3)));
    document.getElementById('hJobs').textContent = jobs;
    sPhones.textContent = phones;
    hTime.textContent = hhmm(clock.preview ?? clock.live);
    hShift.textContent = clock.preview === null ? shiftName(clock.live) : 'Preview · ' + shiftName(clock.preview);
    const on = Math.round(prog); navLinks.forEach((l,i)=>l.classList.toggle('on', i===on));
  }
  requestAnimationFrame(frame);
}

const img = new Image();
img.onload = () => paintFace(img);
img.src = GROUP_IMG;
const fontsReady = document.fonts && document.fonts.load
  ? Promise.all(['900 120px "Big Shoulders Display"', '300 92px "Cormorant Garamond"'].map(f => document.fonts.load(f))).catch(()=>{})
  : Promise.resolve();
const start = () => { paintName(); drawNotif(); measure(); requestAnimationFrame(frame); };
fontsReady.then(start, start);

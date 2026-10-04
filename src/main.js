import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { rrShape, slab, flat, faceBack } from './shapes.js';
import { createDesk } from './desk.js';
import { reel } from './reels.js';
import { createPhone, createCard, outlineGeometry, loadIphone, paint, DEEP_BLUE_NIGHT, PD, CARD, DISPLAY, PLATEAU } from './phone.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
const BW = .94, BH = 1.94, BD = .085, SW = .885, SH = 1.885;

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
// "So far": the wall becomes a board that rewrites itself milestone by milestone (A = previous, B = next)
const [boardAC, boardAG] = wallCanvas(), [boardBC, boardBG] = wallCanvas();
const boardATex = new THREE.CanvasTexture(boardAC), boardBTex = new THREE.CanvasTexture(boardBC);
function paintBoard(g, tex, lines){
  const c = g.canvas, w = c.width, h = c.height;
  g.fillStyle = '#000'; g.fillRect(0,0,w,h);
  if (lines && lines.length){
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length;
    // measured fit: never wider than the hero name, and centred a little right so it clears the copy column
    const font = s => `900 ${s}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`;
    let size = h*(n === 1 ? .5 : .4);
    g.font = font(size);
    const widest = Math.max(...lines.map(l => g.measureText(l).width)), maxW = w*(land ? .42 : .86);
    if (widest > maxW){ size *= maxW/widest; g.font = font(size); }
    const cx = land ? w*.57 : w/2, top = land ? .5 : .28, gap = land ? .42 : .22;
    lines.forEach((l, i) => g.fillText(l, cx, h*(top + (i - (n-1)/2)*gap)));
  }
  tex.needsUpdate = true;
}

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
// each slot is an Android phone: rounded glass slab, metal rail, punch-hole screen, USB-C cable running back into the rack
// glossy, but not so glossy that the key light's specular blooms into a blob across a cluster of phones
const wallGlass = new THREE.MeshPhysicalMaterial({color:0x040507, roughness:.32, metalness:0, clearcoat:.6, clearcoatRoughness:.38, envMap:envTex, envMapIntensity:.32});
const wallRail = new THREE.MeshStandardMaterial({color:0x3b3f47, metalness:.9, roughness:.38, envMap:envTex, envMapIntensity:.3});
const bodies = new THREE.InstancedMesh(slab(BW,BH,BD,.135,.022), [wallGlass, wallRail], COUNT);
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
  uTime:{value:0}, uWall:{value:1}, uFrom:{value:9}, uTo:{value:9}, uSweep:{value:0},
  uHover:{value:-1}, uBoot:{value:reduced?1.1:0}, uGrid:{value:new THREE.Vector2(C,R)},
  uName:{value:nameTex}, uFace:{value:faceTex}, uRoom:{value:room.clone()}, uGain:{value:1}, uDim:{value:0},
  uBoardA:{value:boardATex}, uBoardB:{value:boardBTex}, uBoardWipe:{value:0}, uImgFrom:{value:0}, uImgTo:{value:0}, uImgWipe:{value:0}
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
    uniform float uTime, uWall, uFrom, uTo, uSweep, uHover, uBoot, uGain, uDim, uBoardWipe, uImgFrom, uImgTo, uImgWipe;
    uniform vec2 uGrid; uniform sampler2D uName, uFace, uBoardA, uBoardB; uniform vec3 uRoom;
    varying vec2 vUv, vCell; varying float vId, vType, vSeed, vDelay, vDepth;
    const float ASP = ${(SH/SW).toFixed(4)};
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

    // ===== real apps for the automation chapter: few, but each one actually doing something =====
    float bar(vec2 q, float x0, float y, float w, float h){ return fillD(sdBox(q - vec2(x0 + w*.5, y), vec2(w*.5, h), h), .006); }
    float ring(vec2 q, vec2 c, float r, float th){ return fillD(abs(length(q - c) - r) - th, .006); }
    float dot1(vec2 q, vec2 c, float r){ return fillD(length(q - c) - r, .006); }
    vec3 statusBar(vec2 q, vec3 col, vec3 fg){
      col = mix(col, fg, bar(q, .08, ASP-.07, .1, .014));
      col = mix(col, fg, bar(q, .78, ASP-.07, .14, .014));
      return col;
    }

    // Gboard, dark: four rows of keys; while typing the key under the "finger" lights up
    vec3 keyboard(vec2 q, float top, float keyId, float press){
      vec3 col = vec3(.12,.125,.135);
      float y0 = .075, rowH = (top - y0)/4.0;
      if (q.y < y0 || q.y > top) return col;
      float r = floor((q.y - y0)/rowH), fy = (q.y - y0)/rowH - r;
      float x0 = .015, x1 = .985, n = 10.0, base = 0.0;
      if (r > 2.5){ n = 10.0; base = 0.0; }
      else if (r > 1.5){ n = 9.0; x0 = .065; x1 = .935; base = 10.0; }
      else if (r > .5){ n = 9.0; base = 19.0; }
      float kw = (x1 - x0)/n, ci = floor((q.x - x0)/kw), fx = (q.x - x0)/kw - ci;
      vec3 key = vec3(.235,.25,.27);
      if (r < .5){
        // bottom row: ?123  ,  space  .  enter
        float xs = q.x;
        float k0 = step(.015, xs)*step(xs, .16), k1 = step(.17, xs)*step(xs, .27), k2 = step(.28, xs)*step(xs, .72), k3 = step(.73, xs)*step(xs, .83), k4 = step(.84, xs)*step(xs, .985);
        float inside = (k0 + k1 + k2 + k3 + k4)*step(.14, fy)*step(fy, .86);
        vec3 kc = k4 > .5 ? vec3(.54,.7,.98)*.75 : (k0 + k1 + k3 > .5 ? vec3(.18,.19,.2) : key);
        col = mix(col, kc, inside);
        return col;
      }
      if (ci < 0.0 || ci > n - 1.0) return col;
      float inside = step(.07, fx)*step(fx, .93)*step(.14, fy)*step(fy, .86);
      bool special = r > .5 && r < 1.5 && (ci < .5 || ci > n - 1.5);
      vec3 kc = special ? vec3(.18,.19,.2) : key;
      if (!special && abs(base + ci - keyId) < .5) kc = mix(kc, vec3(.62,.66,.72), press);
      col = mix(col, kc, inside);
      // a hint of the legend on each key
      col = mix(col, vec3(.8,.82,.85), inside*fillD(length(vec2((fx - .5)*kw, (fy - .5)*rowH)) - .007, .004)*.7);
      return col;
    }

    // WhatsApp (tg = 0) / Telegram (tg = 1): type a message, send it, the other side types back, a reply lands
    vec3 chatApp(vec2 q, float t, float s, float tg){
      vec3 BG = mix(vec3(.043,.078,.102), vec3(.055,.09,.13), tg), HEAD = mix(vec3(.122,.173,.204), vec3(.09,.13,.17), tg);
      vec3 OUT = mix(vec3(0.0,.361,.294), vec3(.17,.32,.48), tg), IN = mix(vec3(.125,.173,.2), vec3(.1,.15,.2), tg);
      vec3 ACC = mix(vec3(0.0,.659,.518), vec3(.33,.62,.93), tg), TXT = vec3(.86,.89,.9);
      float L = 7.5, tt = t + s*L*3.0 + L*6.0, cyc = floor(tt/L), k = tt - cyc*L; // +6 loops: every chat already has a history
      float typed = clamp((k - .4)/3.0, 0.0, 1.0)*(1.0 - step(3.45, k));
      float sent = smoothstep(3.45, 3.8, k), reply = smoothstep(5.6, 5.95, k);
      float F = cyc*2.0 + sent + reply;
      float inTop = .735, kbTop = .63, headY = ASP - .30;
      vec3 col = BG;
      if (tg < .5){
        vec2 dg = fract(q*9.0) - .5; float dn = hash(floor(q.x*9.0) + floor(q.y*9.0)*17.0 + s*3.0);
        col += vec3(.018,.026,.03)*fillD(abs(length(dg)-.22)-.018, .03)*step(.55, dn);
      } else col += vec3(.0,.02,.04)*q.y;
      // messages: absolute index m, even = mine; they rise from the input bar and push the older ones up
      for (int j=0; j<7; j++){
        float m = ceil(F) - 1.0 - float(j);
        if (m < 0.0) break;
        float row = F - 1.0 - m;
        float mine = 1.0 - mod(m, 2.0);
        float two = step(.55, hash(m*3.7 + s*11.0));
        float h = mix(.036, .058, two), w = .17 + .2*hash(m*1.3 + s*7.0);
        vec2 cp = vec2(mine > .5 ? .95 - w : .05 + w, inTop + .045 + row*.14 + h);
        float vis = step(inTop + .012, q.y)*step(q.y, headY);
        vec3 bc = mine > .5 ? OUT : IN;
        col = mix(col, bc, fillD(sdBox(q - cp, vec2(w, h), .03), .006)*vis);
        float tl = bar(q, cp.x - w + .035, cp.y + h - .024, w*1.5, .009) + two*bar(q, cp.x - w + .035, cp.y + h - .054, w*1.1, .009);
        col = mix(col, TXT*.9, clamp(tl, 0.0, 1.0)*vis);
        float readNow = step(m + 1.5, F) + step(abs(m - cyc*2.0), .1)*step(4.2, k);
        vec3 tick = mix(vec3(.55,.6,.62), mix(vec3(.33,.72,.93), vec3(.45,.85,.6), tg), clamp(readNow, 0.0, 1.0));
        col = mix(col, tick, bar(q, cp.x + w - .07, cp.y - h + .016, .04, .006)*vis*mine);
      }
      // header with the contact; "typing…" while the other side writes back
      col = mix(col, HEAD, step(headY, q.y));
      col = mix(col, vec3(.42,.47,.5), dot1(q, vec2(.15, headY + .12), .05));
      col = mix(col, TXT, bar(q, .23, headY + .14, .26, .016));
      float typingBack = step(4.4, k)*step(k, 5.6);
      col = mix(col, mix(vec3(.45,.52,.55), ACC, typingBack), bar(q, .23, headY + .09, typingBack > .5 ? .1 : .14, .01));
      for (int d=0; d<3; d++){ float fd = float(d); col = mix(col, ACC, dot1(q, vec2(.37 + fd*.025, headY + .09), .007)*typingBack*step(.5, fract(t*2.5 - fd*.2))); }
      col = mix(col, vec3(.75,.8,.82), bar(q, .74, headY + .12, .04, .016) + bar(q, .84, headY + .12, .04, .016));
      // input bar: the message grows character by character, caret blinking; mic turns into send, send flashes
      col = mix(col, BG, step(kbTop, q.y)*step(q.y, inTop + .012));
      col = mix(col, mix(vec3(.165,.224,.259), vec3(.12,.17,.22), tg), fillD(sdBox(q - vec2(.41, .683), vec2(.37, .042), .042), .006));
      float tw = typed*(.38 + .16*hash(cyc + s*5.0));
      col = mix(col, TXT, bar(q, .1, .683, tw, .011)*step(.001, typed));
      col = mix(col, ACC, step(.5, fract(t*1.6))*bar(q, .1 + tw + .006, .683, .004, .02)*step(k, 3.45));
      float flash = smoothstep(3.3, 3.45, k)*(1.0 - smoothstep(3.45, 3.75, k));
      col = mix(col, ACC*(1.0 + flash*.6), dot1(q, vec2(.9, .683), .045 + flash*.008));
      float sendIcon = step(.001, typed)*step(k, 3.5);
      col = mix(col, vec3(.95), mix(bar(q, .892, .683, .016, .016), fillD(sdBox(q - vec2(.902, .683), vec2(.016, .009), .004), .004), sendIcon));
      // keyboard with the pressed key
      float pr = step(.001, typed)*step(fract(k*7.0), .55);
      float kid = floor(hash(floor(k*7.0) + cyc*13.0 + s*31.0)*27.99);
      if (q.y < kbTop) col = keyboard(q, kbTop, kid, pr);
      col = statusBar(q, col, vec3(.92));
      return col;
    }

    // a "photo": two-tone sky, a sun, a hill line; seeded so every post and video looks different
    vec3 photo(vec2 uv, float sd){
      vec3 c1 = vec3(.98,.62,.36), c2 = vec3(.42,.24,.52);
      float pick = hash(sd*7.1);
      if (pick > .75){ c1 = vec3(.4,.78,.85); c2 = vec3(.1,.25,.5); }
      else if (pick > .5){ c1 = vec3(.62,.82,.5); c2 = vec3(.12,.3,.22); }
      else if (pick > .25){ c1 = vec3(.95,.5,.62); c2 = vec3(.12,.12,.32); }
      vec3 col = mix(c2, c1, smoothstep(0.0, 1.0, uv.y));
      vec2 sun = vec2(.25 + .5*hash(sd*3.3), .62 + .2*hash(sd*5.9));
      col = mix(col, vec3(1.0,.95,.82), fillD(length(uv - sun) - .09, .02)*.85);
      float hill = .3 + .08*sin(uv.x*6.0 + sd*20.0) + .04*sin(uv.x*13.0 + sd*7.0);
      col = mix(col, c2*.55, step(uv.y, hill));
      return col*.82;
    }

    // Instagram, dark: scroll the feed post by post, double-tap the photo, the heart pops and the like turns red
    vec3 instaApp(vec2 q, float t, float s){
      float L = 4.6, P = 1.42, tt = t + s*L*4.0, n = floor(tt/L), k = tt - n*L;
      float topY = ASP - .2, navY = .12;
      float cy = topY - q.y + (n + smoothstep(3.5, 4.4, k))*P;
      float pi = floor(cy/P), ly = cy - pi*P;
      vec3 col = vec3(0.0);
      // post header: avatar with the gradient story ring, username
      vec2 hp = vec2(q.x, -ly);
      col = mix(col, mix(vec3(.98,.75,.25), vec3(.85,.2,.55), q.x*6.0), ring(hp, vec2(.08, -.06), .042, .006));
      col = mix(col, vec3(.45), dot1(hp, vec2(.08, -.06), .033));
      col = mix(col, vec3(.92), bar(hp, .15, -.06, .2 + .1*hash(pi + s), .011));
      // the photo
      if (ly > .12 && ly < 1.12) col = photo(vec2(q.x, 1.0 - (ly - .12)), pi + s*13.0);
      // actions: heart, comment, share, bookmark
      vec2 ap = vec2(q.x, -(ly - 1.17));
      float liked = (abs(pi - n) < .5) ? step(1.15, k) : step(.35, hash(pi*2.3 + s));
      float hOut = clamp(heart(ap - vec2(.07, 0.0), .042) - heart(ap - vec2(.07, .004), .03), 0.0, 1.0);
      col = mix(col, vec3(.92), hOut*(1.0 - liked));
      col = mix(col, vec3(1.0,.19,.3), heart(ap - vec2(.07, 0.0), .042)*liked);
      col = mix(col, vec3(.92), ring(ap, vec2(.17, 0.0), .026, .005));
      col = mix(col, vec3(.92), fillD(sdSeg(ap, vec2(.25, -.02), vec2(.3, .02)) - .005, .005) + fillD(sdSeg(ap, vec2(.25, -.02), vec2(.285, .015)) - .004, .005)*0.0);
      col = mix(col, vec3(.92), fillD(abs(sdBox(ap - vec2(.93, 0.0), vec2(.018, .028), .003)) - .004, .005));
      // likes count and caption
      col = mix(col, vec3(.92), bar(vec2(q.x, -ly), .045, -1.25, .22, .01));
      col = mix(col, vec3(.7), bar(vec2(q.x, -ly), .045, -1.3, .6*hash(pi*1.7 + s) + .25, .009));
      // the double-tap heart over the current photo
      float pop = smoothstep(1.0, 1.25, k)*(1.0 - smoothstep(1.55, 1.85, k));
      if (abs(pi - n) < .5 && ly > .12 && ly < 1.12){ float sc = .14*(.6 + .4*smoothstep(1.0, 1.2, k)); col = mix(col, vec3(1.0), heart(vec2(q.x, -ly) - vec2(.5, -.62), sc)*pop); }
      // top bar and bottom nav
      col = mix(col, vec3(0.0), step(topY, q.y));
      col = mix(col, vec3(.95), bar(q, .06, topY + .07, .24, .02));
      col = mix(col, vec3(.95), clamp(heart(q - vec2(.8, topY + .07), .03) - heart(q - vec2(.8, topY + .073), .02), 0.0, 1.0));
      col = mix(col, vec3(0.0), step(q.y, navY));
      for (int i=0; i<5; i++){ float fi = float(i); col = mix(col, vec3(.9), fillD(abs(sdBox(q - vec2(.1 + fi*.2, .06), vec2(.025, .025), .008)) - .004, .005)); }
      return statusBar(q, col, vec3(.92));
    }

    // TikTok: a video plays, the like goes red with a burst, then a swipe up to the next one
    vec3 tiktokApp(vec2 q, float t, float s){
      float L = 4.2, tt = t + s*L*5.0, n = floor(tt/L), k = tt - n*L;
      float sw = smoothstep(3.55, 4.2, k);
      float vy = q.y + sw*ASP, vi = n + floor(vy/ASP), y = mod(vy, ASP);
      vec2 uv = vec2(q.x, y/ASP);
      // the video: a slow push-in on a seeded photo, a person swaying in front of it
      vec2 zuv = (uv - .5)*(1.0 - .06*fract(t*.2)) + .5;
      vec3 col = photo(zuv, vi*1.9 + s*17.0);
      float sway = .03*sin(t*2.4 + vi);
      vec2 pc = vec2(.5 + sway, .5);
      float person = fillD(length((uv - pc - vec2(0.0, .08))*vec2(1.0, 2.13)) - .1, .01) + fillD(sdBox((uv - pc + vec2(0.0, .12))*vec2(1.0, 2.13), vec2(.17, .3), .12), .01);
      col = mix(col, col*.25 + vec3(.05), clamp(person, 0.0, 1.0)*.85);
      col *= mix(.45, 1.0, smoothstep(.0, .35, uv.y));
      // overlay (doesn't move with the swipe)
      col = mix(col, vec3(.95), bar(q, .3, ASP - .14, .14, .011) + bar(q, .52, ASP - .14, .18, .013));
      col = mix(col, vec3(.95), bar(q, .52, ASP - .165, .18, .004));
      float liked = step(1.6, k);
      col = mix(col, vec3(.6), dot1(q, vec2(.9, 1.0), .05)); col = mix(col, vec3(1.0,.17,.33), dot1(q, vec2(.9, .95), .014));
      col = mix(col, mix(vec3(.95), vec3(1.0,.17,.33), liked), heart(q - vec2(.9, .82), .05));
      float burst = smoothstep(1.6, 1.75, k)*(1.0 - smoothstep(1.75, 2.1, k));
      col = mix(col, vec3(1.0,.4,.5), ring(q, vec2(.9, .82), .04 + burst*.05, .004)*burst);
      col = mix(col, vec3(.95), dot1(q, vec2(.9, .67), .03)); col = mix(col, vec3(.95), dot1(q, vec2(.9, .53), .03)); col = mix(col, vec3(.95), dot1(q, vec2(.9, .39), .03));
      float spin = t*1.5; vec2 dq = q - vec2(.9, .22);
      col = mix(col, vec3(.15), dot1(q, vec2(.9, .22), .045)); col = mix(col, vec3(.6), dot1(q, vec2(.9, .22), .016)*(.6 + .4*sin(atan(dq.y, dq.x)*4.0 + spin)));
      col = mix(col, vec3(.97), bar(q, .05, .33, .22, .013));
      col = mix(col, vec3(.85), bar(q, .05, .28, .55, .009) + bar(q, .05, .245, .38, .009));
      col = mix(col, vec3(.85), bar(q, .1, .19, .35, .008));
      col = mix(col, vec3(1.0,.17,.33), bar(q, 0.0, .105, ASP*0.0 + .95*fract(k/L), .003));
      col = mix(col, vec3(0.0), step(q.y, .1));
      for (int i=0; i<5; i++){ float fi = float(i); if (i == 2) continue; col = mix(col, vec3(.85), dot1(q, vec2(.1 + fi*.2, .05), .018)); }
      col = mix(col, vec3(.25,.95,.95), fillD(sdBox(q - vec2(.49, .05), vec2(.05, .028), .012), .004));
      col = mix(col, vec3(1.0,.17,.33), fillD(sdBox(q - vec2(.51, .05), vec2(.05, .028), .012), .004));
      col = mix(col, vec3(.97), fillD(sdBox(q - vec2(.5, .05), vec2(.045, .028), .012), .004));
      return statusBar(q, col, vec3(.95));
    }

    // what a phone on the farm is doing right now: mostly chats, some feeds
    vec3 automation(vec2 q, float t, float s){
      float pick = hash(s*91.7);
      if (pick < .38) return chatApp(q, t, s, 0.0);
      if (pick < .55) return chatApp(q, t, s, 1.0);
      if (pick < .8) return instaApp(q, t, s);
      return tiktokApp(q, t, s);
    }

    void main(){
      // rounded display corners: outside them the black glass of the body shows through
      vec2 pp = (vUv - .5)*vec2(${SW.toFixed(3)}, ${SH.toFixed(3)});
      float dEdge = sdBox(pp, vec2(${(SW/2).toFixed(4)}, ${(SH/2).toFixed(4)}), .108);
      if (dEdge > 0.0) discard;
      vec2 q = vec2(vUv.x, vUv.y*ASP);
      float t = uTime + vSeed*30.0;
      float typ = vDelay < uSweep ? uTo : uFrom;
      if (typ > 8.5) typ = 7.0; // "mixed" means the automation mix
      bool real = typ > 6.5 || (typ > 2.5 && typ < 3.5);
      float a = real ? 0.0 : clamp(app(typ, q, t, vSeed), 0.0, 1.2);

      vec2 wuv = (vCell + vUv) / uGrid;
      vec3 fc = texture2D(uFace, wuv).rgb;
      float fl = smoothstep(.05, 1.0, dot(fc, vec3(.299,.587,.114)))*.9;
      float nm = texture2D(uName, wuv).r;
      // sample everything up front (no texture reads in divergent branches), then pick per cell
      float bd = mix(texture2D(uBoardA, wuv).r, texture2D(uBoardB, wuv).r, step(vDelay, uBoardWipe));
      float iA = uImgFrom < .5 ? nm : (uImgFrom < 1.5 ? bd : fl);
      float iB = uImgTo < .5 ? nm : (uImgTo < 1.5 ? bd : fl);
      float img = mix(iA, iB, step(vDelay, uImgWipe));
      vec2 pg = fract(vUv*vec2(54.0,112.0));
      img *= .74 + .26*step(.18,pg.x)*step(.18,pg.y);
      float glitch = step(.985, hash(vId*.37 + floor(uTime*3.0)));
      float wm = smoothstep(vDelay, vDelay+.2, uWall*1.25) * (1.0 - glitch*.85*step(.99,uWall));

      vec3 bg = vec3(.028,.036,.058);
      vec3 ink = vec3(.82,.88,1.0) * (.88 + .16*hash(vId*1.3));
      vec3 ac = typ > 6.5 ? automation(q, t, vSeed) : ((typ > 2.5 && typ < 3.5) ? chatApp(q, t, vSeed, 0.0) : bg + (ink-bg)*a);
      vec3 col = mix(ac*mix(1.0,.3,uWall), bg + (ink-bg)*img*1.05, wm);
      col *= .92 + .08*sin(vUv.y*620.0 + uTime*6.0);
      col *= mix(.78, 1.0, smoothstep(0.0, .06, -dEdge));
      if (abs(vId-uHover) < .5) col = col*1.45 + vec3(.06,.035,0.0);
      // Android: punch-hole camera at the top, gesture bar at the bottom
      col *= smoothstep(0.0, .006, length(pp - vec2(0.0, ${(SH/2-.062).toFixed(4)})) - .027);
      col = mix(col, vec3(.78,.8,.84), fillD(sdBox(pp - vec2(0.0, ${(-SH/2+.04).toFixed(4)}), vec2(.12,.008), .008), .005)*.75);
      float on = step(vSeed, uBoot);
      float flash = on*(1.0-smoothstep(0.0,.06,uBoot-vSeed));
      col = mix(bg*.35, col, on) + vec3(.6,.65,.75)*flash;
      col *= mix(1.0, .42, uDim);
      // the screens are authored in display space; the composer works in linear light
      col = pow(max(col, vec3(0.0)), vec3(2.2)) * uGain;
      col = mix(col, uRoom, smoothstep(34.0, 72.0, vDepth));
      gl_FragColor = vec4(col, 1.0);
    }`
});
const screens = new THREE.InstancedMesh(screenGeo, screenMat, COUNT);
const shelves = new THREE.InstancedMesh(new THREE.BoxGeometry(SX*.98, .05, .42), new THREE.MeshStandardMaterial({color:0x14161c, metalness:.7, roughness:.45}), COUNT);
const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(.06,.035,.02), new THREE.MeshBasicMaterial(), COUNT);
const cablePath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0,-BH/2+.02,-.012), new THREE.Vector3(0,-BH/2-.022,-.014), new THREE.Vector3(.012,-BH/2-.03,-.08),
  new THREE.Vector3(.03,-BH/2-.03,-.22), new THREE.Vector3(.055,-BH/2-.03,-.38)]);
const plug = new THREE.BoxGeometry(.07,.046,.034); plug.translate(0,-BH/2-.008,-.012);
const cables = new THREE.InstancedMesh(mergeGeometries([new THREE.TubeGeometry(cablePath, 20, .013, 6, false), plug]), new THREE.MeshStandardMaterial({color:0xd6d6d1, roughness:.48, metalness:0, envMap:envTex, envMapIntensity:.25}), COUNT);
const AMBER = new THREE.Color('#ffb547').multiplyScalar(2.2);
const LEDOFF = new THREE.Color(0x2a2418), LEDGREEN = new THREE.Color(0x58ff9a).multiplyScalar(1.3);
wall.add(bodies, screens, shelves, leds, cables);

const lift = new Float32Array(COUNT);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
function place(i){
  const b=base[i], l=lift[i];
  tmpE.set(0,b.ry,0); tmpQ.setFromEuler(tmpE);
  N.set(Math.sin(b.ry),0,Math.cos(b.ry));
  const k = 1 + l*.08;
  tmpP.set(b.x,b.y,b.z).addScaledVector(N, l*.9); tmpS.set(k,k,k);
  tmpM.compose(tmpP,tmpQ,tmpS); bodies.setMatrixAt(i,tmpM); cables.setMatrixAt(i,tmpM);
  tmpP.addScaledVector(N, BD/2+.002); tmpM.compose(tmpP,tmpQ,tmpS); screens.setMatrixAt(i,tmpM);
}
for (let i=0;i<COUNT;i++){
  place(i);
  const b=base[i]; tmpE.set(0,b.ry,0); tmpQ.setFromEuler(tmpE); N.set(Math.sin(b.ry),0,Math.cos(b.ry));
  tmpP.set(b.x,b.y-BH/2-.07,b.z).addScaledVector(N,.08); tmpS.set(1,1,1); tmpM.compose(tmpP,tmpQ,tmpS); shelves.setMatrixAt(i,tmpM);
  tmpP.addScaledVector(N,.215); tmpP.x += Math.cos(b.ry)*.36; tmpP.z -= Math.sin(b.ry)*.36; tmpM.compose(tmpP,tmpQ,tmpS); leds.setMatrixAt(i,tmpM);
  leds.setColorAt(i, rnd()>.12 ? LEDGREEN : AMBER);
}
[bodies,screens,shelves,leds,cables].forEach(m=>{ m.instanceMatrix.needsUpdate=true; });
leds.instanceColor.needsUpdate = true;

// =====================================================================
// Product stage: rides with the camera, so objects stay framed while the wall moves behind them.
// Units: 1 = 10 cm.
// =====================================================================
const stage = new THREE.Group(); camera.add(stage);
const pKey = new THREE.DirectionalLight(0xffffff, .6); pKey.position.set(-3,1.2,2.5); camera.add(pKey); pKey.target = stage;


// ---------- iPhone 17 Pro Max + the Recents card (see phone.js) ----------
const ph = createPhone(envTex), phone = ph.phone; stage.add(phone);
// the model's display is 0.8924 × 1.9378 (its own units): the UI canvas keeps that aspect so nothing stretches
const UW = 600, UH = Math.round(UW*1.9378/0.8924);
// the model's Dynamic Island, measured off its geometry, as fractions of the display (seen from the front)
const ISLAND = { cx:.5096, cy:.0345, w:.2689, h:.0379 };
const UI = document.createElement('canvas'); UI.width = UW; UI.height = UH;
const ui = UI.getContext('2d');
const uiTex = new THREE.CanvasTexture(UI); uiTex.colorSpace = THREE.SRGBColorSpace; uiTex.anisotropy = 8;
ph.display.material.map = uiTex; ph.display.material.needsUpdate = true;
const rc = createCard(envTex), card = rc.card; phone.add(card);
// swap the hand-built phone for the real model as soon as it loads; the procedural one stays as a fallback
loadIphone('/models/iphone-17-pro-max.glb', envTex).then(({ model, mats }) => {
  paint(mats, DEEP_BLUE_NIGHT);
  const keep = new Set([card]);
  phone.children.forEach(c => { if (!keep.has(c) && !soundRings.includes(c)) c.visible = false; });
  const oled = mats['OLED'];
  if (oled){
    // the model's screen UVs run right to left and use glTF's flipY = false
    uiTex.flipY = false; uiTex.repeat.x = -1; uiTex.offset.x = 1; uiTex.needsUpdate = true;
    oled.map = uiTex; oled.emissiveMap = uiTex; oled.emissive.setHex(0xffffff); oled.emissiveIntensity = .5; oled.color.setHex(0x000000); oled.needsUpdate = true;
  }
  // the front cover glass is near-mirror; tone its highlight down so the bloom doesn't flare
  if (mats['Glass']){ mats['Glass'].roughness = .16; mats['Glass'].envMapIntensity = .35; }
  if (oled){ oled.roughness = .42; oled.envMapIntensity = .15; }
  // the island is one black pill: its cut-out walls and the front sensors behind it must not catch light
  if (mats['OLED off']){ mats['OLED off'].color.setHex(0x000000); mats['OLED off'].roughness = .5; mats['OLED off'].envMapIntensity = 0; }
  if (mats['Camera filter']){ mats['Camera filter'].color.setHex(0x030305); mats['Camera filter'].envMapIntensity = .15; }
  // the display frame lines both island cut-outs and the bezel; glossy it outlines them in grey, so it goes matte black
  if (mats['Display Frame']){ mats['Display Frame'].color.setHex(0x000000); mats['Display Frame'].roughness = .9; mats['Display Frame'].envMapIntensity = 0; }
  phone.add(model);
}).catch(e => console.warn('iPhone model failed, keeping the procedural one', e));
const ATTACH = new THREE.Vector3(ph.magsafe[0], ph.magsafe[1], ph.backZ - CARD.d/2 - .0006);
const soundRings = [0,1,2].map(() => {
  const r = faceBack(new THREE.Mesh(outlineGeometry(CARD.w, CARD.h, CARD.r, .005), new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,1.35,.55), transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false})));
  r.position.set(ATTACH.x, ATTACH.y, ph.backZ - .0015); phone.add(r); return r;
});

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
  // the clock and icons sit in the "ears" either side of the Dynamic Island, centred on its axis
  const iw = ISLAND.w*UW, ih = ISLAND.h*UH, icx = ISLAND.cx*UW, cy = ISLAND.cy*UH, iy = cy - ih/2;
  const fg = dark ? '#ffffff' : '#1b1a18';
  ui.fillStyle = fg; ui.font = `600 25px ${SF}`; ui.textBaseline = 'middle'; ui.textAlign = 'center';
  ui.fillText(hhmm(clock.shown), (icx - iw/2)/2 + 8, cy + 1);
  ui.fillStyle = '#000'; rr(icx - iw/2, iy, iw, ih, ih/2); ui.fill();
  // iOS shows the recording dot in the right ear, next to the island
  if (rec > 0){ ui.fillStyle = `rgba(255,181,71,${rec})`; ui.beginPath(); ui.arc(icx + iw/2 + 14, cy, 6, 0, Math.PI*2); ui.fill(); }
  const rx = icx + iw/2 + (UW - icx - iw/2)/2 + 4;
  ui.fillStyle = fg; ui.textAlign = 'left';
  for (let i=0;i<4;i++){ rr(rx - 52 + i*8, cy + 8 - (i+1)*4.4, 5.5, (i+1)*4.4, 1.5); ui.fill(); }
  ui.strokeStyle = fg; ui.lineWidth = 2.6; ui.lineCap = 'round';
  for (let i=0;i<3;i++){ ui.beginPath(); ui.arc(rx - 6, cy + 9, 4 + i*4.6, Math.PI*1.25, Math.PI*1.75); ui.stroke(); }
  ui.lineWidth = 1.8; rr(rx + 12, cy - 7, 30, 15, 4.5); ui.stroke(); rr(rx + 14.5, cy - 4.5, 21, 10, 2.5); ui.fill(); rr(rx + 43.5, cy - 3, 2.5, 6, 1); ui.fill();
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

// iOS 26 in-call screen (Liquid Glass): teal-to-blue wash, glass buttons, a glass banner while Recents records
function glass(x, y, w, h, r, fill = .14){
  ui.save();
  ui.fillStyle = `rgba(255,255,255,${fill})`; rr(x, y, w, h, r); ui.fill();
  const hl = ui.createLinearGradient(0, y, 0, y + h); hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(.5, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(255,255,255,.06)');
  ui.fillStyle = hl; rr(x, y, w, h, r); ui.fill();
  ui.strokeStyle = 'rgba(255,255,255,.34)'; ui.lineWidth = 1.6; rr(x + .8, y + .8, w - 1.6, h - 1.6, r); ui.stroke();
  ui.restore();
}
// Material Symbols paths (Apache 2.0), 24×24 viewBox; close to Apple's SF Symbols at this size
const ICON = {
  speaker: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  facetime: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  mute: 'M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z',
  more: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  end: 'M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z'
};
const iconPaths = Object.fromEntries(Object.entries(ICON).map(([k, d]) => [k, new Path2D(d)]));
const callIcons = Object.fromEntries(Object.keys(ICON).map(k => [k, (x, y, s = 40) => {
  ui.save(); ui.translate(x - s/2, y - s/2); ui.scale(s/24, s/24);
  if (k === 'facetime') ui.globalAlpha *= .45;
  ui.fill(iconPaths[k]); ui.restore();
}]));
callIcons.keypad = (x, y) => { for (let i=0;i<3;i++) for (let j=0;j<3;j++){ ui.beginPath(); ui.arc(x + (i-1)*13, y + (j-1)*13, 5, 0, Math.PI*2); ui.fill(); } };
function drawCall(rec, secs, t){
  const W = UW, H = UH, ky = H/1316;
  const base = ui.createLinearGradient(0, 0, W*.4, H); base.addColorStop(0, '#3b7389'); base.addColorStop(.55, '#2c6c82'); base.addColorStop(1, '#0a5784');
  ui.fillStyle = base; ui.fillRect(0, 0, W, H);
  const blue = ui.createRadialGradient(W*1.05, -H*.05, 10, W*1.05, -H*.05, W*1.25); blue.addColorStop(0, 'rgba(24,46,150,.95)'); blue.addColorStop(1, 'rgba(24,46,150,0)');
  ui.fillStyle = blue; ui.fillRect(0, 0, W, H);
  const teal = ui.createRadialGradient(-W*.1, H*.62, 10, -W*.1, H*.62, W*.9); teal.addColorStop(0, 'rgba(60,150,150,.45)'); teal.addColorStop(1, 'rgba(60,150,150,0)');
  ui.fillStyle = teal; ui.fillRect(0, 0, W, H);
  statusBar(true, 1);
  ui.textAlign = 'center'; ui.textBaseline = 'middle';
  ui.fillStyle = 'rgba(230,236,242,.62)'; ui.font = `600 27px ${SF}`;
  ui.fillText(`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`, W/2, 186*ky);
  ui.fillStyle = '#fff'; ui.font = `700 52px ${SF}`; ui.fillText(CALL.name, W/2, 240*ky);
  // while the card records: a glass banner where iOS would offer to hold the call
  if (rec > 0){
    ui.globalAlpha = rec;
    const bx = 44, by = 720*ky, bw = W - 88, bh = 118*ky;
    glass(bx, by, bw, bh, 30);
    ui.textAlign = 'left'; ui.fillStyle = '#fff'; ui.font = `600 26px ${SF}`; ui.fillText('Recording to Recents', bx + 30, by + bh*.38);
    ui.fillStyle = 'rgba(255,255,255,.62)'; ui.font = `400 22px ${SF}`; ui.fillText('Transcript ready when you hang up.', bx + 30, by + bh*.68);
    ui.fillStyle = '#ffb547';
    for (let i=0;i<7;i++){ const h = 8 + 22*Math.abs(Math.sin(i*1.7 + t*7))*(.4 + .6*Math.abs(Math.sin(i*3.1 + t*3))); rr(bx + bw - 118 + i*13, by + bh/2 - h/2, 6, h, 3); ui.fill(); }
    ui.globalAlpha = 1; ui.textAlign = 'center';
  }
  const buttons = [['speaker','Speaker'],['facetime','FaceTime'],['mute','Mute'],['more','More'],['end','End'],['keypad','Keypad']];
  buttons.forEach(([icon, label], i) => {
    const x = [118, 300, 482][i%3], y = (i < 3 ? 943 : 1135)*ky, r = 59;
    if (icon === 'end'){ ui.fillStyle = '#e0322c'; ui.beginPath(); ui.arc(x, y, r, 0, Math.PI*2); ui.fill(); }
    else { glass(x - r, y - r, r*2, r*2, r); }
    ui.fillStyle = '#fff'; ui.strokeStyle = '#fff'; ui.globalAlpha = 1;
    callIcons[icon](x, y, icon === 'end' ? 46 : 40); ui.globalAlpha = 1;
    ui.fillStyle = '#fff'; ui.font = `500 22px ${SF}`; ui.fillText(label, x, y + r + 26);
  });
}
function appHeader(sub){
  ui.fillStyle = '#0b0d10'; ui.fillRect(0,0,600,UH);
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
  ui.fillStyle = '#f3efe8'; ui.fillRect(0,0,600,UH);
  statusBar(false, 0);
  ui.textAlign = 'center'; ui.fillStyle = '#7d776c'; ui.font = `500 21px ${SF}`;
  ui.letterSpacing = '6px'; ui.fillText('WEAR CLOSE', 303, 170); ui.letterSpacing = '0px';
  ui.fillStyle = '#1b1a18'; ui.font = `300 92px ${SERIF}`; ui.fillText('Zuzka', 300, 310);
  ui.fillStyle = '#8a8478'; ui.font = `400 24px ${SF}`; ui.fillText('286 km away', 300, 366);
  const cx = 300, cy = 660;
  if (stateP >= 1){
    const k = stateP >= 2 ? 0 : (t*1.4)%1;
    for (let i=0;i<3;i++){ const kk = (k + i/3)%1; ui.strokeStyle = `rgba(201,116,98,${(1-kk)*.6})`; ui.lineWidth = 3; ui.beginPath(); ui.arc(cx,cy,150+kk*130,0,Math.PI*2); ui.stroke(); }
  }
  ui.strokeStyle = '#1b1a18'; ui.lineWidth = 2; ui.beginPath(); ui.arc(cx,cy,170,0,Math.PI*2); ui.stroke();
  ui.fillStyle = stateP >= 2 ? '#c97462' : '#e6dfd2'; ui.beginPath(); ui.arc(cx,cy,132,0,Math.PI*2); ui.fill();
  ui.fillStyle = stateP >= 2 ? '#fff' : '#1b1a18'; heart2d(ui, cx, cy+8, 58);
  ui.fillStyle = '#1b1a18'; ui.font = `400 27px ${SF}`;
  ui.fillText(stateP >= 2 ? 'Zuzka felt it.' : stateP >= 1 ? 'Sending your pulse…' : 'Bring your phone to your bracelet', 300, 960);
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
const TAP_ROT = [-1.02, .12, .22];
const TAP_POS = STONE_NODE.clone().add(new THREE.Vector3(-.06, .5, .2)).toArray();
// lying back-up, long edge to the camera, close in: the card next to the camera plateau, like Ruune shows it
// close enough that the 1.3 mm difference reads: frame the stretch from the lenses to the card's top edge
const PROFILE_S = 4.4, PROFILE_ROT = [Math.PI/2, 0, Math.PI/2], PROFILE_POS = [.91, .04 - PD/2*PROFILE_S, .3];
const PHONE_KEYS = [
  // it leaves the wall of phones far behind and flies to the viewer, turning once on the way
  [3.02, [2.2,1.1,-11], [.25,-3.4,.5], 1],
  [3.95, [0,0,0], [-.06,-.34,.05], 1],
  [4.0,  [0,0,0], [-.06,-.34,.05], 1],
  [4.15, [0,.02,0], [-.05,Math.PI-.45,-.04], 1],
  [4.43, [0,.02,0], [-.05,Math.PI-.38,-.03], 1],
  [4.56, [.9,-.06,.3], [Math.PI/2 + .3, .12, Math.PI/2], 2.6],
  [4.6, PROFILE_POS, PROFILE_ROT, PROFILE_S],
  [4.68, PROFILE_POS, PROFILE_ROT, PROFILE_S],
  [4.79, [0,0,0], [-.05,-.3,.03], 1],
  [5.05, [0,0,0], [-.05,-.27,.03], 1],
  [5.6,  [-.55,.6,.3], [-.18,.3,.5], .6],
  [6.02, [-.55,.6,.3], [-.18,.3,.5], .6],
  [6.24, TAP_POS, TAP_ROT, .6],
  [6.42, TAP_POS, TAP_ROT, .6],
  [6.62, [-.6,.56,.3], [-.18,.28,.45], .6],
  [7.02, [-.6,.56,.3], [-.18,.28,.45], .6],
  [7.55, [-1.3,-3.0,-.4], [.6,.9,.9], .6]
];
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), ea = new THREE.Euler(), eb = new THREE.Euler();
function pose(keys, st, obj){
  let i = 0; while (i < keys.length-2 && st >= keys[i+1][0]) i++;
  const a = keys[i], b = keys[i+1], f = easeIO(clamp01((st-a[0])/(b[0]-a[0])));
  obj.position.set(lerp(a[1][0],b[1][0],f), lerp(a[1][1],b[1][1],f), lerp(a[1][2],b[1][2],f));
  qa.setFromEuler(ea.set(...a[2])); qb.setFromEuler(eb.set(...b[2]));
  obj.quaternion.slerpQuaternions(qa, qb, f);
  obj.scale.setScalar(lerp(a[3],b[3],f));
}
const SNAP = 4.33, ARRIVE = 6.56;
const fx = {snapT:-1e9, arriveT:-1e9, shake:0, prevSt:0};
// the card glides in from beyond the frame edge, hovers over the back showing its face, then the magnet takes it
const CARD_FROM = new THREE.Vector3(-3.4, 1.4, -2.6), CARD_AWAY = new THREE.Vector3(2.6, -1.4, -2.2), CARD_IN = 4.03, CARD_HOVER = 4.2;
const dimsEl = document.getElementById('dims'), dimCard = document.getElementById('dimCard'), dimCam = document.getElementById('dimCam');
const dA = new THREE.Vector3(), dB = new THREE.Vector3();
function toScreen(local, out){ out.copy(local); phone.localToWorld(out); out.project(camera); return [(out.x*.5+.5)*innerWidth, (-out.y*.5+.5)*innerHeight]; }
// a dimension line drawn like a technical drawing: two ticks, a bar offset to the side, a label
function dimension(el, pa, pb, label, sub){
  const [x1,y1] = toScreen(pa, dA), [x2,y2] = toScreen(pb, dB);
  const off = 26, bx = Math.max(x1,x2) + off;
  el.innerHTML = `<line x1="${x1+6}" y1="${y1}" x2="${bx+6}" y2="${y1}"/><line x1="${x2+6}" y1="${y2}" x2="${bx+6}" y2="${y2}"/><line class="bar" x1="${bx}" y1="${y1}" x2="${bx}" y2="${y2}"/><text x="${bx+14}" y="${(y1+y2)/2+4}">${label}</text><text class="sub" x="${bx+14}" y="${(y1+y2)/2+20}">${sub}</text>`;
}

function updateStage(st, now){
  const t = now/1000;
  const vis = smooth(3.02, 3.5, st) * (1 - smooth(7.05, 7.6, st));
  stage.visible = vis > .002;
  uniforms.uDim.value = vis;
  if (!stage.visible) return;

  // crossing events are time-based so the snap and the arrival feel physical at any scroll speed
  if (fx.prevSt < SNAP && st >= SNAP){ fx.snapT = now; fx.shake = 1; }
  if (fx.prevSt < ARRIVE && st >= ARRIVE){ fx.arriveT = now; }
  fx.prevSt = st;

  // phone
  phone.visible = st > 3.03 && st < 7.58;
  pose(PHONE_KEYS, st, phone);
  // idle float, except during the dead-on profile where it has to hold perfectly still
  const still = smooth(4.57, 4.6, st)*(1 - smooth(4.68, 4.71, st));
  if (!reduced){ phone.position.y += Math.sin(t*1.1)*.018*(1-still); phone.rotation.z += Math.sin(t*.8)*.012*(1-still); }
  // on phones the stage is centred, so slide the lens-to-card stretch of the profile to the middle of the screen
  if (isStacked()) phone.position.x += .5*still;

  // card: glide in, hover, magnet pull (accelerating), snap, recording, then off it goes
  const glideK = smooth(CARD_IN, CARD_HOVER, st), pullK = clamp01((st - CARD_HOVER)/(SNAP - CARD_HOVER)), awayK = smooth(5.0, 5.32, st);
  card.visible = st > CARD_IN && awayK < 1;
  if (card.visible){
    // hover beside the phone (local -x is screen right while the back faces us), a little proud of the back
    const hover = ATTACH.clone(); hover.x -= .78; hover.y += .08; hover.z -= .32;
    // glide: a soft arc from off-frame into the hover spot, turning to face the camera and slowly settling
    card.position.lerpVectors(CARD_FROM, hover, easeIO(glideK));
    card.position.y += Math.sin(glideK*Math.PI)*.25;
    const bob = reduced ? 0 : Math.sin(t*2.2)*.012*(1 - pullK);
    card.position.y += bob;
    card.rotation.set((1-glideK)*.9 + Math.sin(t*1.4)*.04*(1-pullK), (1-glideK)*-1.6, (1-glideK)*1.2);
    // pull: accelerates the last few centimetres like a real magnet
    if (pullK > 0){ const e = pullK*pullK*pullK; card.position.lerp(ATTACH, e); card.rotation.set(card.rotation.x*(1 - e), card.rotation.y*(1 - e), card.rotation.z*(1 - e)); }
    const since = (now - fx.snapT)/1000;
    if (st >= SNAP && since < .5) card.position.z -= Math.sin(Math.min(1,since/.5)*Math.PI*3)*Math.exp(-since*7)*.02;
    if (awayK > 0){ card.position.lerp(CARD_AWAY, easeIO(awayK)); card.rotation.z += awayK*4; }
  }
  const sinceSnap = (now - fx.snapT)/1000;
  const on = st >= SNAP && awayK < 1 ? Math.min(1, Math.max(0, sinceSnap/.35)) * (sinceSnap < .35 ? (Math.random()>.35?1:.25) : 1) : 0;
  rc.ledM.color.setRGB(3.2, 1.8, .55).multiplyScalar(on*(.6 + .4*Math.sin(t*4)));
  // while it records, soft outlines ripple off the card
  const recBack = st >= SNAP && st < 4.5 && !reduced;
  soundRings.forEach((r, i) => {
    const k = ((t*.55 + i/3) % 1);
    r.visible = recBack;
    r.scale.setScalar(1 + k*.55); r.material.opacity = (1-k)*.55*on;
  });
  // side profile: 2.9 mm card next to the 4.2 mm camera bump
  const dimK = smooth(4.59, 4.61, st)*(1 - smooth(4.68, 4.7, st));
  dimsEl.style.opacity = dimK.toFixed(3);
  if (dimK > 0){
    const ex = CARD.w/2 + .002, cy = ATTACH.y;
    const cyEnd = cy + CARD.h/2 - .05; // the card's end nearest the camera, so both stay in the close-up
    dimension(dimCard, new THREE.Vector3(ex, cyEnd, ph.backZ), new THREE.Vector3(ex, cyEnd, ph.backZ - CARD.d), '2.9 mm', 'Recents');
    dimension(dimCam, new THREE.Vector3(ph.lensEdge[0], ph.lensEdge[1], ph.backZ), new THREE.Vector3(ph.lensEdge[0], ph.lensEdge[1], ph.lensTop), '4.2 mm', 'camera bump');
  }

  // screen content
  if (st < 4.7) renderUI('call', st >= SNAP ? on : 0, now);
  else if (st < 4.86) renderUI('transcript', smooth(4.72, 4.86, st), now);
  else if (st < 5.3) renderUI('ask', clamp01((st-4.86)/.13), now);
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

// ---------- intro desk (rides with the camera, like the stage) ----------
const desk = createDesk({envTex, nameTex, stacked:isStacked});
camera.add(desk.root);
const flashEl = document.getElementById('flash');

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .5, .42, .74);
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
  desk.setDaylight(day, gold);
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
  [-4.8,.35,fitDist*.98, -4.8,0,0],
  [-4.8,.2,fitDist*1.04, -4.8,0,0]
] : [
  [0,.6,fitDist,      0,0,0],
  [-2.4,6.4,13,      -2.6,6.2,1.5],
  [2.4,-1.8,13.4,     2.8,-2,1.5],
  [-1.4,-8.4,14,     -1.2,-8.6,1],
  [2,10.4,13,         2.4,10.2,1.2],
  [0,.5,fitDist, 0,0,0],
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

const JOBS = ['instagram · scroll + like','mationx · flow 3/3 running','internát · gate.open ✓','whatsapp · typing a reply','scanner · margin +18%','recents · transcribing 04:12','wear close · pulse to zuzka ♥'];
// the automation mix, chosen per phone exactly like the shader does (hash of its seed)
const glslHash = n => { const x = Math.sin(n*12.9898 + 4.1414)*43758.5453; return x - Math.floor(x); };
const mixJob = sd => { const p = glslHash(sd*91.7); return p < .38 ? 'whatsapp · typing a reply' : p < .55 ? 'telegram · sending 3/12' : p < .8 ? 'instagram · liking the feed' : 'tiktok · watching, liking'; };
const scrollCue = document.getElementById('scroll'), meEl = document.getElementById('me'), nav = document.querySelector('.nav');
const navLinks = [...document.querySelectorAll('.nav a')];
const sPhones = document.getElementById('sPhones'), sTaps = document.getElementById('sTaps');
const rPhones = reel(sPhones), rTaps = reel(sTaps), rHands = reel(document.getElementById('sHands')), rJobs = reel(document.getElementById('hJobs'));
const tapsNow = () => Math.floor(clock.live*3600*31.7).toLocaleString('en-US');
// the counters spin up like a slot machine every time the MationX chapter comes into view
new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ rPhones.reveal(String(phones)); rTaps.reveal(tapsNow()); rHands.reveal('0'); } }), {threshold:.6})
  .observe(document.querySelector('.stats'));
let tapT = 0;
document.getElementById('hDev').textContent = COUNT;

// ---------- "So far" ----------
const WALL_MODES = [{img:0}, {t:7}, {t:5}, {t:6}, {t:2}, {img:1}, {img:2}];
const ROAD_ST = 12; // story time where the "So far" chapter (section 6) starts holding
const ROAD = [...document.querySelectorAll('.road li')].map(li => ({li, wall: li.dataset.wall.split('|')}));
const roadEl = document.querySelector('.road');
let roadK = -1, roadT0 = -1e9;
function updateRoad(st, now){
  const k = Math.max(0, Math.min(ROAD.length-1, Math.floor((st - ROAD_ST)*ROAD.length)));
  if (k !== roadK){
    paintBoard(boardAG, boardATex, roadK >= 0 ? ROAD[roadK].wall : null);
    paintBoard(boardBG, boardBTex, ROAD[k].wall);
    roadK = k; roadT0 = now;
    ROAD.forEach((r, i) => { r.li.classList.toggle('on', i === k); r.li.classList.toggle('done', i < k); });
  }
  uniforms.uBoardWipe.value = reduced ? 1.1 : clamp01((now - roadT0)/900)*1.1;
  roadEl.style.setProperty('--p', clamp01(st - ROAD_ST).toFixed(3));
}

// ---------- loop ----------
let storyNow = 0;
let sy = scrollY, last = performance.now(), boot = reduced ? 1.1 : 0, hudT = 0, ledT = 0, jobs = COUNT-3, phones = 512;
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), corner = new THREE.Vector3();
const CORNERS = [[-BW/2,-BH/2],[BW/2,-BH/2],[BW/2,BH/2],[-BW/2,BH/2]];

function frame(now){
  const dt = Math.min(.05,(now-last)/1000); last = now;
  if (!reduced) uniforms.uTime.value += dt;
  // the wall powers up right after the dive out of the MacBook
  boot = storyNow < .97 && !reduced ? 0 : Math.min(1.1, boot + dt*.8); uniforms.uBoot.value = boot;

  // clock + light
  clock.live = pragueHours();
  storyNow = storyAt(sy).st;
  const want = clock.preview ?? clock.live;
  const dh = ((want - clock.shown + 36) % 24) - 12;
  clock.shown = (clock.shown + (Math.abs(dh) < .01 ? dh : dh*(reduced?1:.05)) + 24) % 24;
  applyLight(clock.shown);

  sy += (scrollY - sy)*(reduced ? 1 : .085);
  const {prog, st} = storyAt(sy);
  // chapter 0 is the desk; the wall's own chapters start at 1
  const wp = Math.max(0, prog-1);
  let a = Math.floor(wp), f = wp-a; if (a>=S-1){ a=S-2; f=1; }
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

  // wall story. Each wall chapter either shows app screens (t = screen type) or a full-wall image
  // (img: 0 name, 1 milestone board, 2 hackathon photo); transitions sweep across the phones
  const U = uniforms, A = WALL_MODES[a], B = WALL_MODES[a+1];
  const isImg = m => m.img !== undefined ? 1 : 0;
  U.uWall.value = lerp(isImg(A), isImg(B), loc);
  U.uFrom.value = a === 0 ? 9 : (A.t ?? B.t ?? 9); U.uTo.value = B.t ?? A.t ?? 9;
  U.uSweep.value = (a === 0 ? smooth(.5, 1, loc) : loc)*1.05;
  U.uImgFrom.value = A.img ?? B.img ?? 0; U.uImgTo.value = B.img ?? A.img ?? 0; U.uImgWipe.value = loc*1.05;
  updateRoad(st, now);

  const deskP = 1 - smooth(.97, 1.03, st);
  wall.visible = deskP < .999;
  // the desk brings its own lights; the wall's blue-tinted rig stays out of the room
  amb.intensity *= 1 - .95*deskP; key.intensity *= 1 - deskP; rim.intensity *= 1 - deskP;
  desk.update(st, now, {x:pmx*pm, y:pmy*pm}, reduced);
  flashEl.style.opacity = (smooth(.9, 1.0, st)*(1 - smooth(1.0, 1.14, st))*.9).toFixed(3);
  updateStage(st - 2, now);

  // hover via raycast (off while the stage owns the frame)
  let h = -1;
  // no hover while the desk owns the frame (a hidden wall still raycasts) or while the stage does
  if (ndc.x < 2 && (fine || now < tapUntil) && U.uDim.value < .3 && wall.visible){
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(screens, false)[0];
    if (hit && hit.instanceId !== undefined) h = hit.instanceId;
  }
  if (overLink) h = -1;
  hover = h; U.uHover.value = h;
  for (let i=0;i<COUNT;i++){
    const tg = (i===hover && !reduced) ? 1 : 0;
    if (Math.abs(lift[i]-tg) > .002){ lift[i] += (tg-lift[i])*.18; place(i); bodies.instanceMatrix.needsUpdate = true; screens.instanceMatrix.needsUpdate = true; cables.instanceMatrix.needsUpdate = true; }
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
    const job = inWall ? `pixel ${base[hover].c},${base[hover].r}` : (typ > 6.5 ? mixJob(aSeed[hover]) : JOBS[typ]);
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
  nav.style.opacity = ((a===S-2 && loc > .6) || uniforms.uDim.value > .3) ? 0 : 1;

  // LEDs + HUD + live counters
  ledT += dt;
  if (ledT > .35 && !reduced){
    ledT = 0;
    for (let k=0;k<6;k++){ const i=Math.floor(Math.random()*COUNT); leds.setColorAt(i, Math.random()>.5 ? LEDOFF : (Math.random()>.85 ? AMBER : LEDGREEN)); }
    leds.instanceColor.needsUpdate = true;
  }
  tapT += dt; if (tapT > 1.4){ tapT = 0; rTaps.set(tapsNow()); } // a roll now and then, not a constant blur
  hudT += dt;
  if (hudT > .5){
    hudT = 0;
    jobs = Math.max(COUNT-6, Math.min(COUNT, jobs + (Math.random()>.5?1:-1)));
    if (Math.random() < .12) phones = Math.max(498, Math.min(526, phones + (Math.random() > .5 ? 1 : -1)));
    rJobs.set(String(jobs));
    rPhones.set(String(phones));
    hTime.textContent = hhmm(clock.preview ?? clock.live);
    hShift.textContent = clock.preview === null ? shiftName(clock.live) : 'Preview · ' + shiftName(clock.preview);
    const on = Math.max(Math.round(prog), 1) === 1 ? 0 : Math.round(prog); navLinks.forEach(l=>l.classList.toggle('on', +l.dataset.i===on));
  }
  requestAnimationFrame(frame);
}

const img = new Image();
img.onload = () => paintFace(img);
img.src = GROUP_IMG;
const fontsReady = document.fonts && document.fonts.load
  ? Promise.all(['900 120px "Big Shoulders Display"', '300 92px "Cormorant Garamond"'].map(f => document.fonts.load(f))).catch(()=>{})
  : Promise.resolve();
// debug: #shot=6.4 jumps straight to that story time (used for headless screenshots)
const SHOT = /shot=([\d.]+)/.exec(location.hash);
function scrollForSt(st){
  const i = Math.min(secs.length-1, Math.floor(st/2)), hold = Math.max(0, heights[i]-innerHeight), into = st - 2*i;
  return into <= 1 ? tops[i] + into*hold : tops[i] + hold + (into-1)*innerHeight;
}
// ---------- loader: counts phones "coming online" as the models and fonts actually load ----------
const ld = { el: document.getElementById('loader'), n: document.getElementById('ldN'), bar: document.getElementById('ldBar'), items: 0, total: 1, fonts: 0, t0: performance.now(), done: false };
THREE.DefaultLoadingManager.onStart = (u, l, t) => { ld.total = Math.max(ld.total, t); };
THREE.DefaultLoadingManager.onProgress = (u, l, t) => { ld.items = l; ld.total = Math.max(ld.total, t); paintLoader(); };
THREE.DefaultLoadingManager.onLoad = () => { ld.items = ld.total; paintLoader(); finishLoader(); };
function paintLoader(){
  const p = clamp01(.15*ld.fonts + .85*(ld.items/ld.total));
  ld.n.textContent = String(Math.round(p*512)).padStart(3, '0');
  ld.bar.style.transform = `scaleX(${p})`;
}
function finishLoader(){
  if (ld.done || !ld.fonts || ld.items < ld.total) return;
  ld.done = true;
  // stay at least a moment so it reads as intentional, then lift and let the desk light come up
  setTimeout(() => { ld.el.classList.add('done'); desk.begin(); }, Math.max(0, 650 - (performance.now() - ld.t0)));
}
setTimeout(() => { if (!ld.done){ ld.done = true; ld.el.classList.add('done'); desk.begin(); } }, 9000);

const start = () => {
  ld.fonts = 1; paintLoader(); finishLoader();
  paintName(); drawNotif(); measure();
  if (SHOT){ scrollTo(0, scrollForSt(+SHOT[1])); sy = scrollY; }
  requestAnimationFrame(frame);
};
fontsReady.then(start, start);

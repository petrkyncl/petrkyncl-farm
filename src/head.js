// Petr's head as a cloud of dots: a hex lattice laid over his profile photo, pushed out by a depth map
// (Depth Anything V2 on the photo, see public/media/head.bin: Float32 [x, y, z, lum, nx, ny, nz] per dot, 1 unit = photo height).
// Dot size follows the photo's brightness, so the face reads like a halftone that has depth: turn it and the nose,
// cheek and ear move against each other.
import * as THREE from 'three';

export async function createHead(url = '/media/head.bin'){
  const buf = await (await fetch(url, { cache: 'no-cache' })).arrayBuffer(); // always revalidate: the data gets regenerated
  const S = 7, a = new Float32Array(buf), n = a.length/S;
  const pos = new Float32Array(n*3), nrm = new Float32Array(n*3), lum = new Float32Array(n), seed = new Float32Array(n);
  for (let i = 0; i < n; i++){
    pos[i*3] = a[i*S]; pos[i*3+1] = a[i*S+1]; pos[i*3+2] = a[i*S+2]; lum[i] = a[i*S+3];
    nrm[i*3] = a[i*S+4]; nrm[i*3+1] = a[i*S+5]; nrm[i*3+2] = a[i*S+6]; seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aLum', new THREE.BufferAttribute(lum, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.computeBoundingSphere();
  const uniforms = {
    uTime: { value: 0 }, uIn: { value: 1 }, uPx: { value: 600 }, uSize: { value: 1 }, uFade: { value: new THREE.Vector2(-.24, -.36) },
    uColor: { value: new THREE.Color(.82, .9, 1.0) }, uScan: { value: -9 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aLum, aSeed;
      uniform float uTime, uIn, uPx, uSize, uScan; uniform vec2 uFade;
      varying float vA, vScan;
      float hash(float n){ return fract(sin(n*91.7)*43758.5); }
      void main(){
        vec3 p = position;
        // assembling: each dot comes in from a scatter along its own direction, the far ones last
        float k = clamp(uIn*1.6 - aSeed*.6, 0.0, 1.0); k = k*k*(3.0 - 2.0*k);
        vec3 scatter = vec3(hash(aSeed*7.0) - .5, hash(aSeed*13.0) - .5, hash(aSeed*3.0)*.8) * .9;
        p = mix(p + scatter, p, k);
        // a breath of movement, never still
        p.z += sin(uTime*.9 + p.y*14.0 + aSeed*6.0)*.0025;
        vec4 mv = modelViewMatrix*vec4(p, 1.0);
        gl_Position = projectionMatrix*mv;
        // bright skin = big dots, shadow = small ones; the neck and shirt fade out under the jaw
        float l = smoothstep(.12, .92, aLum);
        float fade = smoothstep(uFade.y, uFade.x, position.y);
        vScan = exp(-pow((position.y - uScan)*10.0, 2.0)); // a soft band of light passing down, now and then
        // diameter in world units: the lattice spacing is 8.6 px of a 2000 px photo (.0043); the brightest dots fill
        // about 80% of it, the darkest a fifth (uPx = viewport height / (2 tan(fov/2)), so world → pixels)
        float sz = .0043*(.26 + .62*l + .06*vScan)*uSize;
        gl_PointSize = max(1.0, sz*uPx/ -mv.z);
        // dots on a surface turned away from you fade, so the silhouette doesn't pile up into a bright rim
        float facing = normalize(normalMatrix*normal).z;
        vA = (.45 + .75*l)*fade*k*smoothstep(-.1, .55, facing);
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA, vScan;
      void main(){
        float d = length(gl_PointCoord - .5);
        float a = smoothstep(.5, .32, d);
        if (a < .01) discard;
        gl_FragColor = vec4(uColor*(1.0 + .22*vScan), a*vA);
      }`
  });
  const points = new THREE.Points(geo, mat);
  // pivot near the middle of the skull so turning feels like a head turning
  const pivot = new THREE.Group(); points.position.set(.01, -.04, -.26); pivot.add(points);
  return { group: pivot, points, uniforms, count: n };
}

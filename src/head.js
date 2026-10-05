// Petr's head as a cloud of dots, from a phone scan of his head (a textured mesh): dots spread evenly over its surface
// (Poisson disk, see public/media/head.bin: Float32 [x, y, z, lum, nx, ny, nz] per dot, the head centred, crown to chin
// ≈ 0.62). Dot size follows the scan's brightness, so the face reads like a halftone with real depth; dots on the far
// side fade by their normal, so it can turn all the way round.
import * as THREE from 'three';

export async function createHead(url = '/media/head.bin', { spacing = .0052 } = {}){
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
    uTime: { value: 0 }, uIn: { value: 1 }, uPx: { value: 600 }, uSize: { value: 1 }, uFade: { value: new THREE.Vector2(-.44, -.6) },
    uColor: { value: new THREE.Color(.82, .9, 1.0) }, uScan: { value: -9 }, uSpacing: { value: spacing }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aLum, aSeed;
      uniform float uTime, uIn, uPx, uSize, uScan, uSpacing; uniform vec2 uFade;
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
        // the scan's own brightness, lit again by one soft key from the upper left so the form reads
        vec3 nv = normalize(normalMatrix*normal);
        float key = max(dot(nv, normalize(vec3(-.55, .45, .7))), 0.0);
        float l = smoothstep(.04, .7, aLum)*(.28 + .95*key);
        float fade = smoothstep(uFade.y, uFade.x, position.y);
        vScan = exp(-pow((position.y - uScan)*10.0, 2.0)); // a soft band of light passing down, now and then
        // diameter in world units, against the dot spacing: the brightest dots fill most of it, the darkest a quarter
        // (uPx = viewport height / (2 tan(fov/2)), so world → pixels)
        float sz = uSpacing*(.16 + .5*l + .06*vScan)*uSize;
        gl_PointSize = max(1.0, sz*uPx/ -mv.z);
        // dots on a surface turned away from you fade, so the silhouette doesn't pile up into a bright rim
        float facing = nv.z;
        vA = (.3 + .7*l)*fade*k*smoothstep(-.05, .45, facing);
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
  // the data is centred on the skull, so turning it feels like a head turning
  const pivot = new THREE.Group(); pivot.add(points);
  return { group: pivot, points, uniforms, count: n };
}

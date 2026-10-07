// Small geometry helpers shared by the desk, the phone and the bracelets.
import * as THREE from 'three';

export function rrShape(w, h, r){
  const s = new THREE.Shape(), x = w/2, y = h/2; r = Math.min(r, x, y);
  s.moveTo(-x+r, -y); s.lineTo(x-r, -y); s.absarc(x-r, -y+r, r, -Math.PI/2, 0, false);
  s.lineTo(x, y-r); s.absarc(x-r, y-r, r, 0, Math.PI/2, false);
  s.lineTo(-x+r, y); s.absarc(-x+r, y-r, r, Math.PI/2, Math.PI, false);
  s.lineTo(-x, -y+r); s.absarc(-x+r, -y+r, r, Math.PI, Math.PI*1.5, false);
  return s;
}

// Rounded slab centred on the origin, caps facing ±z (material group 0 = caps, 1 = sides).
export function slab(w, h, d, r, b, curveSegments = 28, bevelSegments = 6){
  const g = new THREE.ExtrudeGeometry(rrShape(w-2*b, h-2*b, Math.max(.002, r-b)), {depth:Math.max(.001, d-2*b), bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelSegments, curveSegments});
  g.translate(0, 0, -(d-2*b)/2); return g;
}

// Flat rounded rectangle facing +z with 0..1 UVs.
export function flat(w, h, r){
  const g = new THREE.ShapeGeometry(rrShape(w, h, r), 28), p = g.attributes.position, uv = g.attributes.uv;
  for (let i=0;i<p.count;i++) uv.setXY(i, p.getX(i)/w+.5, p.getY(i)/h+.5);
  return g;
}

export const faceBack = m => { m.rotation.y = Math.PI; return m; };

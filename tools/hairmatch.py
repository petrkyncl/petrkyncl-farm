# Make the rebuilt crown (the hole the phone scan left on top, filled by hairfill.py) look like the scanned hair around it:
# same brightness distribution, same dot density, same roughness of normals. The fill is the tail of head.bin.
import numpy as np, sys
from scipy.spatial import cKDTree
src, dst = sys.argv[1], sys.argv[2]
a = np.fromfile(src, np.float32).reshape(-1, 7)
P, L, N = a[:, :3], a[:, 3].copy(), a[:, 4:7].copy()
n = len(a)
head = P[:, 1] > -.05
c = np.array([P[head, 0].mean(), .0, P[head, 2].mean()], np.float32)
d = P - c; r = np.linalg.norm(d, axis=1)
el = np.arcsin(np.clip(d[:, 1] / r, -1, 1)); az = np.arctan2(d[:, 2], d[:, 0])
cut = .27 + .15 * np.sin(az)            # hairfill.py's cut (front .42, back .12)
above = el >= cut - .01
i = n - 1
while i >= 0 and above[i]: i -= 1
new = np.zeros(n, bool); new[i + 1:] = True
band = (~new) & (el < cut) & (el > cut - .3) & (P[:, 1] > .05)
rng = np.random.default_rng(11)

# 1) brightness: rank-preserving remap of the fill onto the scanned hair's distribution
fi = np.where(new)[0]
order = np.argsort(L[fi] + rng.normal(0, .02, len(fi)))   # a little shuffle so it isn't a copy of the smooth fill pattern
target = np.sort(rng.choice(L[band], len(fi)))
L[fi[order]] = target

# 2) density: thin the fill to the scan's spacing (nearest-6 distance .00729 vs .00644)
def nn6(m):
    t = cKDTree(P[m]); dd, _ = t.query(P[m], k=7); return np.median(dd[:, 6])
keep_p = min(1.0, (nn6(new) / nn6(band)) ** 2)
keep = np.ones(n, bool); keep[fi] = rng.random(len(fi)) < keep_p

# 3) roughness: tilt each fill normal by an angle drawn from the scan hair's normal-vs-radial spread (capped at 80°)
rad_b = d[band] / r[band, None]
dev_b = np.arccos(np.clip((N[band] * rad_b).sum(1), -1, 1))
dev_b = dev_b[dev_b < np.radians(80)]
ang = rng.choice(dev_b, len(fi)) * .85
base = N[fi]
t = np.cross(base, rng.normal(size=(len(fi), 3))); t /= np.linalg.norm(t, axis=1, keepdims=True)
Nn = base * np.cos(ang)[:, None] + t * np.sin(ang)[:, None]
N[fi] = Nn / np.linalg.norm(Nn, axis=1, keepdims=True)

out = np.concatenate([P, L[:, None], N], 1)[keep].astype(np.float32)
out.tofile(dst)
key = lambda m: np.maximum(N[m] @ (np.array([-.55, .45, .7]) / np.linalg.norm([-.55, .45, .7])), 0).mean()
print(f'fill {len(fi)} -> {keep[fi].sum()} (keep {keep_p:.2f}); lum p50 fill {np.median(L[fi]):.3f} vs band {np.median(L[band]):.3f}; key fill {key(new):.3f} vs band {key(band):.3f}; total {len(out)}')

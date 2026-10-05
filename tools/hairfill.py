# Fill the hole on top of the scanned head and smooth the lumps at the back: above a cut the hair is rebuilt as a
# radial surface r(direction) around the skull's centre (robust per-cell radius, outliers dropped, holes filled along
# a fitted dome, then smoothed), and resampled at the scan's own dot density. Luminance comes from the nearest scan
# dots, or a hair tone where the scan had nothing. Input/output: Float32 [x, y, z, lum, nx, ny, nz].
import numpy as np, sys
from scipy.spatial import cKDTree
from scipy.ndimage import median_filter, gaussian_filter
# the cut follows the head: above the hairline in front (the face looks along +z, az = +pi/2), low at the back where
# the lumps are
CUT_FRONT = float(sys.argv[1]) if len(sys.argv) > 1 else .42
CUT_BACK = float(sys.argv[2]) if len(sys.argv) > 2 else .12
cut_of = lambda az: (CUT_FRONT + CUT_BACK)/2 + (CUT_FRONT - CUT_BACK)/2*np.sin(az)
EL_CUT = CUT_BACK
a = np.fromfile('scan_raw.bin', np.float32).reshape(-1, 7)
P, L = a[:, :3], a[:, 3]
head = P[:, 1] > -.05
c = np.array([P[head, 0].mean(), .0, P[head, 2].mean()], np.float32)
d = P - c; r = np.linalg.norm(d, axis=1); el = np.arcsin(np.clip(d[:, 1]/np.maximum(r, 1e-6), -1, 1)); az = np.arctan2(d[:, 2], d[:, 0])
# azimuthal equidistant around the top: rho = colatitude
rho = np.pi/2 - el
R0 = np.pi/2 - EL_CUT + .08                  # a little below the cut, so the seam has support
G = 160; h = 2*R0/G
U, V = rho*np.cos(az), rho*np.sin(az)
sel = rho < R0
iu = np.clip(((U[sel] + R0)/h).astype(int), 0, G-1); iv = np.clip(((V[sel] + R0)/h).astype(int), 0, G-1)
rr = r[sel]
grid = np.full((G, G), np.nan, np.float32)
from collections import defaultdict
buck = defaultdict(list)
for i, j, x in zip(iu, iv, rr): buck[(i, j)].append(x)
for (i, j), xs in buck.items():
    if len(xs) >= 2: grid[i, j] = np.percentile(xs, 80)    # the outer surface; stray inner bits don't count
gu = (np.arange(G) + .5)*h - R0
UU, VV = np.meshgrid(gu, gu, indexing='ij'); RHO = np.hypot(UU, VV)
inside = RHO < R0
known = ~np.isnan(grid) & inside
# outliers: flaps sticking out or caving in compared with the neighbourhood
med = median_filter(np.where(known, grid, np.nanmedian(grid)), size=9)
known &= np.abs(grid - med) < .012
# dome fit (quadratic in u, v) on the known cells
A = np.stack([np.ones(known.sum()), UU[known], VV[known], UU[known]**2, UU[known]*VV[known], VV[known]**2], 1)
coef, *_ = np.linalg.lstsq(A, grid[known], rcond=None)
fit = coef[0] + coef[1]*UU + coef[2]*VV + coef[3]*UU**2 + coef[4]*UU*VV + coef[5]*VV**2
res = np.where(known, grid - fit, 0).astype(np.float32)
for _ in range(1500):                       # fill the residual into the gaps (harmonic), knowns held fixed
    avg = .25*(np.roll(res, 1, 0) + np.roll(res, -1, 0) + np.roll(res, 1, 1) + np.roll(res, -1, 1))
    res = np.where(known, res, avg)
surf = gaussian_filter(fit + res, 2.2)      # and take the lumps out
# resample at the scan's density
keepOrig = el < cut_of(az)
area_per_dot = None
# density from the original dots just below the cut band (a belt of the head)
belt = (el > CUT_BACK - .25) & (el < CUT_BACK - .05) & head
# belt area ≈ ∫ r² cos(el) d(el) d(az)
rb = np.median(r[belt]); band = np.cos((CUT_BACK - .15))*rb*rb*.2*2*np.pi
dens = belt.sum()/band
rng = np.random.default_rng(5)
pts = []
cut_rho = np.pi/2 - EL_CUT
gr_u, gr_v = np.gradient(surf, h)
for i in range(G):
    for j in range(G):
        if RHO[i, j] >= np.pi/2 - cut_of(np.arctan2(VV[i, j], UU[i, j])) + h: continue
        rc = surf[i, j]; rho0 = max(RHO[i, j], 1e-4)
        dA = (np.sin(rho0)/rho0)*h*h*rc*rc*np.sqrt(1 + (gr_u[i, j]**2 + gr_v[i, j]**2)/(rc*rc))
        n = rng.poisson(dA*dens)
        for _ in range(n):
            u = UU[i, j] + (rng.random() - .5)*h; v = VV[i, j] + (rng.random() - .5)*h
            rh = np.hypot(u, v)
            if rh >= np.pi/2 - cut_of(np.arctan2(v, u)): continue
            pts.append((u, v))
pts = np.array(pts, np.float32)
def surf_at(u, v):
    fi = np.clip((u + R0)/h - .5, 0, G - 1.001); fj = np.clip((v + R0)/h - .5, 0, G - 1.001)
    i0, j0 = fi.astype(int), fj.astype(int); ti, tj = fi - i0, fj - j0
    return (surf[i0, j0]*(1-ti)*(1-tj) + surf[i0+1, j0]*ti*(1-tj) + surf[i0, j0+1]*(1-ti)*tj + surf[i0+1, j0+1]*ti*tj)
def to_xyz(u, v, rad):
    rh = np.hypot(u, v); ph = np.arctan2(v, u); e = np.pi/2 - rh
    return np.stack([c[0] + rad*np.cos(e)*np.cos(ph), c[1] + rad*np.sin(e), c[2] + rad*np.cos(e)*np.sin(ph)], 1)
u, v = pts[:, 0], pts[:, 1]
X = to_xyz(u, v, surf_at(u, v))
eps = 1e-3
Xu = to_xyz(u + eps, v, surf_at(u + eps, v)) - to_xyz(u - eps, v, surf_at(u - eps, v))
Xv = to_xyz(u, v + eps, surf_at(u, v + eps)) - to_xyz(u, v - eps, surf_at(u, v - eps))
N = np.cross(Xu, Xv); N /= np.linalg.norm(N, axis=1, keepdims=True)
flip = (N*(X - c)).sum(1) < 0; N[flip] *= -1
# luminance from the nearest scan dots (only where the scan had the surface nearby), else a hair tone
tree = cKDTree(P)
dist, idx = tree.query(X, k=6, distance_upper_bound=.014)
ok = np.isfinite(dist)
lum = np.zeros(len(X), np.float32); cnt = ok.sum(1)
lum_sum = np.where(ok, L[np.minimum(idx, len(L)-1)], 0).sum(1)
hair = np.median(L[(el > CUT_FRONT + .2) & np.isfinite(L)])
lum = np.where(cnt > 0, lum_sum/np.maximum(cnt, 1), hair*(.75 + .5*rng.random(len(X))))
out_new = np.concatenate([X, lum[:, None], N], 1).astype(np.float32)
out = np.concatenate([a[keepOrig], out_new], 0)
out.tofile('scan.bin')
print('kept', keepOrig.sum(), 'new', len(out_new), 'holes filled cells', int((inside & ~known & (RHO < cut_rho)).sum()), 'hair lum', float(hair))

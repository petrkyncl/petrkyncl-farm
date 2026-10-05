import numpy as np, trimesh
from PIL import Image, ImageFilter
V = np.load('mesh_v.npy'); Fc = np.load('mesh_f.npy'); UV = np.load('mesh_uv.npy')
tex = Image.open('tex_l.png').filter(ImageFilter.GaussianBlur(3)); T = np.asarray(tex, np.float32)/255; TH, TW = T.shape
mesh = trimesh.Trimesh(V, Fc, process=False)
# head and neck only (the shoulders would spend dots nobody sees)
cent = mesh.triangles_center
ycut = .06
keepF = cent[:, 1] > ycut
sub = trimesh.Trimesh(V, Fc[keepF], process=False)
print('area', sub.area, 'faces', keepF.sum())
R = float(__import__('sys').argv[1]) if len(__import__('sys').argv) > 1 else .0042
pts, fi = trimesh.sample.sample_surface_even(sub, int(sub.area/(R*R*.866)*2.2), radius=R, seed=3)
print('points', len(pts))
tri = sub.triangles[fi]
bary = trimesh.triangles.points_to_barycentric(tri, pts)
fuv = UV[Fc[keepF][fi]]  # (n, 3, 2)
uv = (fuv*bary[:, :, None]).sum(1)
u = np.clip(uv[:, 0], 0, 1)*(TW - 1); v = np.clip(1 - uv[:, 1], 0, 1)*(TH - 1)
lum = T[v.astype(int), u.astype(int)]
nrm = sub.face_normals[fi]
# centre the head: x/z on the skull's middle, y so the head's middle sits at 0; scale so crown→chin ≈ 0.62
ymax = V[:, 1].max()
head = pts[:, 1] > ymax - .55
cx, cz = pts[head, 0].mean(), pts[head, 2].mean()
s = .62/.5
P = np.stack([(pts[:, 0] - cx)*s, (pts[:, 1] - (ymax - .26))*s, (pts[:, 2] - cz)*s], 1)
out = np.concatenate([P, lum[:, None], nrm], 1).astype(np.float32)
out.tofile('scan.bin')
print('y', P[:, 1].min(), P[:, 1].max(), 'lum', lum.min(), lum.max())

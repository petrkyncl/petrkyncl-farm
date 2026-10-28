# petrkyncl-farm

Live: **[3d.petrkyncl.com](https://3d.petrkyncl.com)**

My portfolio as one scroll-driven three.js scene. It opens on a desk at night with a closed MacBook, the lid
opens and the screen wakes up, the camera dives into the screen and comes out in front of a wall of phones
running MationX, then moves on through the other projects.

Vite + three.js, no framework. Everything is drawn in WebGL; the copy is plain HTML on top.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

## Where things are

| File | What it does |
| --- | --- |
| `src/main.js` | the scene, the scroll timeline and every section after the desk |
| `src/desk.js` | the opening: desk, lamp, bokeh, the MacBook and the camera dive into its screen |
| `src/macbook.js` | which parts of the MacBook model are the lid, screen, keys and hinge, plus the solved lid hinge |
| `src/phone.js` | the phones on the wall and the iPhone model |
| `src/head.js` | the dot-cloud head, built from `public/media/head.bin` |
| `src/bracelet.js`, `src/reels.js`, `src/shapes.js` | smaller pieces used by the sections |
| `*-lab.html`, `src/*lab.js` | dev-only pages for one object at a time; `/mac-lab.html?solve` solves the lid hinge |
| `tools/` | Python scripts that turn a head scan into the dot cloud (the raw scan stays out of git) |

## 3D models and textures

- MacBook Pro 14": [2021 Macbook Pro 14" (M1 Pro / M1 Max)](https://sketchfab.com/3d-models/2021-macbook-pro-14-m1-pro-m1-max-f6b0b940fb6a4286b18a674ef32af2d3)
  by akshatmittal, CC BY 4.0. Lifted 3.3 mm, compressed with meshopt and WebP, painted Space Black in `desk.js`.
- iPhone 17 Pro Max: [model](https://sketchfab.com/3d-models/none-66809964eff043a39d553c3795995008) by Ranguel, CC BY 4.0.
- Oak veneer: [Poly Haven](https://polyhaven.com/a/oak_veneer_05), CC0.

## License

The code is MIT, see `LICENSE`. The models and textures above keep their own licenses. Photos and videos in
`public/media/` are not covered by the MIT license.

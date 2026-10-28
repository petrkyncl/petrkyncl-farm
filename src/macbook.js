// The MacBook Pro 14" on the desk: "2021 Macbook Pro 14" (M1 Pro / M1 Max)" by akshatmittal, CC BY 4.0,
// https://sketchfab.com/3d-models/2021-macbook-pro-14-m1-pro-m1-max-f6b0b940fb6a4286b18a674ef32af2d3
// The 14" body is the same from 2021 to M5; desk.js paints it Space Black. The file is lifted 3.3 mm so the feet stand at
// y = -9.4 mm and the deck at 3.4 mm, and compressed with meshopt and WebP (see README, "3D models").
// Units are metres, lid open at ~110°. Node and material names are the model's own (Sketchfab scrambles them).
export const MODEL_URL = '/models/macbook-pro-14.glb';

// meshes that turn with the lid; the hinge barrel and its cover stay with the base
export const LID_PARTS = ['zlRXoydEgBQgFUa','JtnJKXAEPaOoepM','NhThIZELXlNUoIr','fiqlelggeOoTUAw','abgVijaHVNRUvcc','FnbkdmFKVeCCxTX',
  'YvEVHGlTGUxXlGj','RYgQzNzcnFbacQH','WeTEPJkcTkMBwBo','yxTDdMZViYkuOKm','pPCeNYAcgHQGnfB','CpRxqsFibJhVZKA'];

export const PART = {
  shell: 'zlRXoydEgBQgFUa',      // the lid's outer aluminium shell
  lidFoot: 'RYgQzNzcnFbacQH',    // the strip along the bottom of the open lid, next to the hinge
  screen: 'abgVijaHVNRUvcc',     // the display panel, UV 0..1 with v = 1 at the top
  keyLegends: 'QYMcPaZnXQfyXcJ', // lit by the keyboard backlight
  keycaps: 'RkSurqpnfNMQZfv',
  // base side of the hinge: hidden by the lid when open, pokes out behind it when shut
  hinge: ['ehiyYGFzDbgxhiD','CEvArJuvvmtQsgk','aUVveCqqwsqchVB'],
  camera: ['pPCeNYAcgHQGnfB','WeTEPJkcTkMBwBo'], // the ring and housing around the lens: white in the model
};

// lid closing angle and hinge pivot (y, z), solved in /mac-lab.html?solve
export const LID_SHUT = 1.91822, PIVOT = [-.00038, -.11361];

export const MAT = {
  // every exterior metal part, painted Space Black: cases, lid, hinge and its cover
  aluminium: ['hPcehRUjcLAosED','zqeFZcIteZtOShc','BMKLbAPYqPmfArt','LJSCtLIrHNHZnIH','yVmFXNTCIwNkqVT','VqwNZwmDotIMflD',
    'HpEeGHRuOqfcIZU','SKOFticEGTqECbB'], // + bottom plate and the speaker grilles (textured)
  // inside of the ports, MagSafe and the side vents: near black, not bare silver
  ports: ['kOcboIDeohDRqCf','HPAOpCInJKBtaOC','zaEqorbaeeADKgU','XNDkEZQapqqDHpk','JjuwNKnMBUdtRLb','WLATjirhQCUYAAG'],
  trackpad: 'pZbDFXVUkfRwjmQ',
  logo: 'ZpTrUizuxJQUyzW',
  lens: 'CGiumILqqSMVyeb', // the camera lens: a mirror in the model, which turns it into a white dot under the desk lamp
};

// the screen's UVs already run the same way as the wall texture: no flip in the screen shader
export const SCREEN_UV_FLIP = [0, 0];

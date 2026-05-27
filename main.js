/**
 * ═══════════════════════════════════════════════════════════════════
 *  SOLAR SYSTEM — main.js
 *  Senior Frontend Developer: Full Procedural 3D Solar System
 *  Stack: Three.js r165 (ES module CDN) + OrbitControls
 *
 *  Sections:
 *   1. Perlin Noise Engine
 *   2. Procedural Texture Generators
 *   3. Scene / Camera / Renderer Setup
 *   4. Star Field (Particle System)
 *   5. Sun (with corona glow mesh)
 *   6. Planet Factory
 *   7. Saturn Ring
 *   8. Orbit Path Visuals
 *   9. Raycaster / Click Interaction
 *  10. Animation Loop
 *  11. Window Resize Handler
 *  12. Boot / Loader
 * ═══════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ─────────────────────────────────────────────────────────────────
   §1  PERLIN / FRACTAL NOISE ENGINE
   Classic permutation-table Perlin Noise (Ken Perlin, 2002)
────────────────────────────────────────────────────────────────── */
const Noise = (() => {
  // Build a 512-entry permutation table
  const p = new Uint8Array(512);
  const perm = [
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,
    69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,
    252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,
    171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,
    122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,
    63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,
    188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,
    38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,
    42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,
    43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,
    218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,
    145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,
    115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,
    141,128,195,78,66,215,61,156,180
  ];
  for (let i = 0; i < 256; i++) p[i] = p[i + 256] = perm[i];

  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (hash, x, y, z) => {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };

  /**
   * noise3d — returns value in [-1, 1]
   */
  const noise3d = (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A  = p[X]+Y,  AA = p[A]+Z,  AB = p[A+1]+Z;
    const B  = p[X+1]+Y,BA = p[B]+Z,  BB = p[B+1]+Z;
    return lerp(
      lerp(lerp(grad(p[AA],x,y,z),    grad(p[BA],x-1,y,z),u),
           lerp(grad(p[AB],x,y-1,z),  grad(p[BB],x-1,y-1,z),u), v),
      lerp(lerp(grad(p[AA+1],x,y,z-1),grad(p[BA+1],x-1,y,z-1),u),
           lerp(grad(p[AB+1],x,y-1,z-1),grad(p[BB+1],x-1,y-1,z-1),u),v), w);
  };

  /**
   * fbm — Fractal Brownian Motion (octaves of noise)
   */
  const fbm = (x, y, z, octaves = 6, lacunarity = 2.0, gain = 0.5) => {
    let val = 0, amp = 0.5, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      val += noise3d(x * freq, y * freq, z * freq) * amp;
      max += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return val / max; // normalise to [-1,1]
  };

  return { noise3d, fbm };
})();

/* ─────────────────────────────────────────────────────────────────
   §2  PROCEDURAL TEXTURE GENERATORS
   All textures built on HTML5 Canvas — no external images used.
────────────────────────────────────────────────────────────────── */

/**
 * Helper — create an offscreen canvas + its ImageData
 */
function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(w, h);
  return { canvas, ctx, imgData };
}

/**
 * Helper — convert imgData to THREE.CanvasTexture
 */
function toTexture(canvas, ctx, imgData) {
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ── 2a  SUN Texture ──────────────────────────────────────────────
function makeSunTexture(w = 512, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w * 4;
      const ny = y / h * 4;
      // Turbulent fire using fbm with time-offset layers
      const n  = Noise.fbm(nx, ny, 0.5,  8, 2.1, 0.55);
      const n2 = Noise.fbm(nx + 3.7, ny + 1.1, 1.2, 6, 2.0, 0.5);
      const t  = (n + n2 * 0.5 + 1) / 2; // [0,1]

      // Fire palette: deep red → orange → yellow → white-hot
      let r, g, b;
      if (t < 0.3) {
        r = 180 + t * 200; g = t * 120; b = 0;
      } else if (t < 0.65) {
        const s = (t - 0.3) / 0.35;
        r = 255; g = 120 + s * 130; b = s * 30;
      } else {
        const s = (t - 0.65) / 0.35;
        r = 255; g = 250; b = 100 + s * 155;
      }
      const i = (y * w + x) * 4;
      d[i]   = Math.min(255, r);
      d[i+1] = Math.min(255, g);
      d[i+2] = Math.min(255, b);
      d[i+3] = 255;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2b  EARTH Texture ────────────────────────────────────────────
function makeEarthTexture(w = 1024, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w * 3;
      const ny = y / h * 3;
      const lat = (y / h - 0.5) * Math.PI; // [-π/2, π/2]

      // Base continent mask using fBm
      const landN = Noise.fbm(nx, ny, 2.4, 8, 2.2, 0.5);
      const landT = (landN + 1) / 2;          // [0,1]
      const isLand = landT > 0.48;

      // Polar ice caps
      const isPolar = Math.abs(lat) > 1.22; // ~70°

      let r, g, b;
      if (isPolar) {
        const iceVar = Noise.fbm(nx * 4, ny * 4, 5.5, 4, 2, 0.5);
        const iv = 220 + iceVar * 30;
        r = iv; g = iv; b = Math.min(255, iv + 10);
      } else if (isLand) {
        // Forest / grassland / desert gradient by noise
        const veg = Noise.fbm(nx * 2 + 10, ny * 2 + 10, 7.7, 5, 2, 0.5);
        const vt = (veg + 1) / 2;
        // Desert / savanna / forest tones
        if (vt < 0.35) {
          r = 194; g = 164; b = 104; // sandy desert
        } else if (vt < 0.62) {
          r = 100; g = 130; b = 60;  // grassland
        } else {
          r = 34;  g = 85;  b = 34;  // forest
        }
        // Mountain snow at higher noise
        if (landT > 0.70) { r = 200; g = 200; b = 195; }
      } else {
        // Ocean depth using noise
        const deep = Noise.fbm(nx * 2, ny * 2, 1.1, 5, 2, 0.5);
        const dt = (deep + 1) / 2;
        r = 10 + dt * 20;
        g = 50 + dt * 80;
        b = 130 + dt * 80;
      }
      const i = (y * w + x) * 4;
      d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2c  EARTH Cloud Texture ──────────────────────────────────────
function makeCloudTexture(w = 1024, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w * 4;
      const ny = y / h * 4;
      const n = Noise.fbm(nx, ny, 9.3, 7, 2.1, 0.54);
      const t = (n + 1) / 2;
      const alpha = t > 0.52 ? Math.min(255, (t - 0.52) / 0.48 * 255 * 1.4) : 0;
      const i = (y * w + x) * 4;
      d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = alpha;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2d  MARS Texture ─────────────────────────────────────────────
function makeMarsTexture(w = 1024, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w * 4;
      const ny = y / h * 4;
      const lat = (y / h - 0.5) * Math.PI;
      const n  = Noise.fbm(nx, ny, 3.3, 8, 2.1, 0.52);
      const n2 = Noise.fbm(nx + 5, ny + 5, 8.1, 5, 2, 0.5);
      const t  = (n + 1) / 2;
      const t2 = (n2 + 1) / 2;

      // Polar ice
      if (Math.abs(lat) > 1.30) {
        const iv = 210 + t * 30;
        d[(y*w+x)*4]   = iv;
        d[(y*w+x)*4+1] = iv - 5;
        d[(y*w+x)*4+2] = iv - 15;
        d[(y*w+x)*4+3] = 255;
        continue;
      }

      // Rusty terrain palette
      let r = 160 + t * 65;
      let g = 60  + t * 50;
      let b = 30  + t * 20;

      // Darker basaltic regions
      if (t2 < 0.35) { r *= 0.6; g *= 0.55; b *= 0.5; }

      // Crater highlights (simple threshold)
      const craterN = Noise.fbm(nx * 8, ny * 8, 12.0, 3, 2, 0.45);
      if (craterN > 0.55) { r += 25; g += 18; b += 10; }

      const i = (y * w + x) * 4;
      d[i]   = Math.min(255, r);
      d[i+1] = Math.min(255, g);
      d[i+2] = Math.min(255, b);
      d[i+3] = 255;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2e  JUPITER Texture ──────────────────────────────────────────
function makeJupiterTexture(w = 1024, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;

  // Jupiter band colours (lat-based)
  const bands = [
    { top: 0.00, r: 210, g: 180, b: 140 },
    { top: 0.08, r: 180, g: 120, b: 80  },
    { top: 0.16, r: 230, g: 200, b: 160 },
    { top: 0.22, r: 160, g: 95,  b: 50  },
    { top: 0.30, r: 220, g: 185, b: 140 },
    { top: 0.40, r: 175, g: 110, b: 65  },
    { top: 0.48, r: 240, g: 210, b: 170 },
    { top: 0.55, r: 160, g: 90,  b: 45  },
    { top: 0.62, r: 225, g: 195, b: 155 },
    { top: 0.70, r: 185, g: 125, b: 75  },
    { top: 0.78, r: 235, g: 205, b: 160 },
    { top: 0.85, r: 165, g: 100, b: 55  },
    { top: 0.92, r: 220, g: 190, b: 150 },
    { top: 1.00, r: 190, g: 140, b: 95  },
  ];

  for (let y = 0; y < h; y++) {
    const fy = y / h;
    // find band colour
    let bc = bands[bands.length - 1];
    for (let k = 0; k < bands.length - 1; k++) {
      if (fy >= bands[k].top && fy < bands[k+1].top) { bc = bands[k]; break; }
    }

    for (let x = 0; x < w; x++) {
      const nx = x / w * 6;
      const ny = y / h * 3;

      // Turbulent band-wavy distortion
      const warp = Noise.fbm(nx * 0.8, ny * 3, 4.5, 5, 2, 0.5) * 0.18;
      const bandShift = Noise.fbm(nx + warp, ny * 4, 2.2, 6, 2, 0.5);
      const bt = (bandShift + 1) / 2;

      let r = bc.r + bt * 30 - 15;
      let g = bc.g + bt * 25 - 12;
      let b = bc.b + bt * 20 - 10;

      // Great Red Spot area (approx center)
      const grsX = 0.55, grsY = 0.56;
      const dx = (x / w - grsX) * 2.5;
      const dy = (y / h - grsY) * 5.0;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < 0.06) {
        const grsT = 1 - dist2 / 0.06;
        r = r * (1 - grsT) + 200 * grsT;
        g = g * (1 - grsT) + 80  * grsT;
        b = b * (1 - grsT) + 40  * grsT;
        // Swirl inside GRS
        const swirlN = Noise.fbm(nx * 3 + dist2 * 20, ny * 3, 7.7, 4, 2, 0.5);
        r += swirlN * 25;
      }

      const i = (y * w + x) * 4;
      d[i]   = Math.max(0, Math.min(255, r));
      d[i+1] = Math.max(0, Math.min(255, g));
      d[i+2] = Math.max(0, Math.min(255, b));
      d[i+3] = 255;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2f  SATURN Texture ───────────────────────────────────────────
function makeSaturnTexture(w = 1024, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    const fy = y / h;
    for (let x = 0; x < w; x++) {
      const nx = x / w * 5;
      const ny = y / h * 3;
      const warp = Noise.fbm(nx * 0.6, ny * 4, 3.3, 4, 2, 0.5) * 0.12;
      const n  = Noise.fbm(nx + warp, ny * 5, 1.1, 6, 2, 0.5);
      const bt = (n + 1) / 2;

      // Saturn palette: warm gold/tan banding
      const baseR = 210 + bt * 35;
      const baseG = 175 + bt * 30;
      const baseB = 100 + bt * 20;

      // Slight polar darkening
      const poleDim = 1 - Math.pow(Math.abs(fy - 0.5) * 2, 2) * 0.15;

      const i = (y * w + x) * 4;
      d[i]   = Math.min(255, baseR * poleDim);
      d[i+1] = Math.min(255, baseG * poleDim);
      d[i+2] = Math.min(255, baseB * poleDim);
      d[i+3] = 255;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2g  SATURN RING Texture ──────────────────────────────────────
function makeSaturnRingTexture(w = 512, h = 1) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let x = 0; x < w; x++) {
    const t = x / w; // 0 = inner, 1 = outer
    const n = Noise.fbm(t * 10, 0, 0, 6, 2.2, 0.5);
    const density = (n + 1) / 2;

    // Ring zones
    let r = 0, g = 0, b = 0, a = 0;
    if (t < 0.06) {
      // Gap (Cassini-like inner gap)
      a = 0;
    } else if (t < 0.35) {
      // B ring — brightest, icy
      const s = (t - 0.06) / 0.29;
      r = 200 + density * 45;
      g = 190 + density * 40;
      b = 170 + density * 35;
      a = (0.6 + density * 0.35) * 255;
    } else if (t < 0.40) {
      // Cassini Division — near gap
      a = density * 60;
      r = 130; g = 120; b = 110;
    } else if (t < 0.72) {
      // A ring — slightly less bright
      r = 185 + density * 40;
      g = 172 + density * 38;
      b = 150 + density * 30;
      a = (0.45 + density * 0.35) * 255;
    } else if (t < 0.77) {
      // Outer gap / Encke
      a = density * 40;
      r = 140; g = 130; b = 110;
    } else {
      // F ring + outer — faint
      r = 170 + density * 30;
      g = 160 + density * 28;
      b = 140 + density * 20;
      a = (0.1 + density * 0.2) * 255;
    }
    const i = x * 4;
    d[i]   = Math.min(255, r);
    d[i+1] = Math.min(255, g);
    d[i+2] = Math.min(255, b);
    d[i+3] = Math.min(255, a);
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2h  VENUS Texture ────────────────────────────────────────────
function makeVenusTexture(w = 512, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w * 4;
      const ny = y / h * 4;
      const n  = Noise.fbm(nx, ny, 5.5, 7, 2, 0.52);
      const t  = (n + 1) / 2;
      // Thick cloud bands in pale yellow/cream
      const r = 230 + t * 20;
      const g = 200 + t * 30;
      const b = 100 + t * 40;
      const i = (y * w + x) * 4;
      d[i]   = Math.min(255, r);
      d[i+1] = Math.min(255, g);
      d[i+2] = Math.min(255, b);
      d[i+3] = 255;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2i  MERCURY Texture ──────────────────────────────────────────
function makeMercuryTexture(w = 512, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w * 5;
      const ny = y / h * 5;
      const n = Noise.fbm(nx, ny, 3.3, 7, 2.2, 0.5);
      const t = (n + 1) / 2;
      // Cratered grey world
      const base = 90 + t * 90;
      const crater = Noise.fbm(nx * 5, ny * 5, 9.9, 3, 2, 0.45);
      const cv = (crater + 1) / 2;
      const rim = cv > 0.72 ? 20 : 0;
      const dark = cv < 0.22 ? -30 : 0;
      const i = (y * w + x) * 4;
      d[i] = d[i+1] = d[i+2] = Math.max(0, Math.min(255, base + rim + dark));
      d[i+3] = 255;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2j  URANUS Texture ───────────────────────────────────────────
function makeUranusTexture(w = 512, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w * 3;
      const ny = y / h * 3;
      const n = Noise.fbm(nx, ny * 4, 2.2, 5, 2, 0.5);
      const t = (n + 1) / 2;
      const i = (y * w + x) * 4;
      d[i]   = 120 + t * 40;
      d[i+1] = 195 + t * 40;
      d[i+2] = 210 + t * 35;
      d[i+3] = 255;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

// ── 2k  NEPTUNE Texture ──────────────────────────────────────────
function makeNeptuneTexture(w = 512, h = 512) {
  const { canvas, ctx, imgData } = makeCanvas(w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w * 4;
      const ny = y / h * 4;
      const n  = Noise.fbm(nx, ny, 6.6, 7, 2.2, 0.55);
      const n2 = Noise.fbm(nx + 2, ny + 2, 9.9, 5, 2, 0.5);
      const t  = (n + n2 * 0.4 + 1) / 2;
      const i  = (y * w + x) * 4;
      d[i]   = 30  + t * 50;
      d[i+1] = 80  + t * 80;
      d[i+2] = 200 + t * 45;
      d[i+3] = 255;
    }
  }
  return toTexture(canvas, ctx, imgData);
}

/* ─────────────────────────────────────────────────────────────────
   §3  SCENE / CAMERA / RENDERER SETUP
────────────────────────────────────────────────────────────────── */
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 8000);
camera.position.set(0, 60, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance   = 10;
controls.maxDistance   = 1500;
controls.autoRotate    = false;

/* ─────────────────────────────────────────────────────────────────
   §4  STAR FIELD — THREE.Points particle system
────────────────────────────────────────────────────────────────── */
function createStarField() {
  const COUNT = 12000;
  const positions = new Float32Array(COUNT * 3);
  const colors    = new Float32Array(COUNT * 3);

  const starColors = [
    [1.0, 0.97, 0.85],   // warm white
    [0.8, 0.9,  1.0 ],   // cool blue-white
    [1.0, 0.85, 0.65],   // yellow dwarf
    [1.0, 0.6,  0.4 ],   // orange giant
  ];

  for (let i = 0; i < COUNT; i++) {
    // Distribute on sphere shell
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 1200 + Math.random() * 800;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const c = starColors[Math.floor(Math.random() * starColors.length)];
    const brightness = 0.5 + Math.random() * 0.5;
    colors[i * 3]     = c[0] * brightness;
    colors[i * 3 + 1] = c[1] * brightness;
    colors[i * 3 + 2] = c[2] * brightness;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

  const mat = new THREE.PointsMaterial({
    size: 0.9,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
  });

  scene.add(new THREE.Points(geo, mat));
}

/* ─────────────────────────────────────────────────────────────────
   §5  SUN
────────────────────────────────────────────────────────────────── */
let sunMesh;

function createSun(sunTexture) {
  // Core sphere
  const geo = new THREE.SphereGeometry(14, 64, 64);
  const mat = new THREE.MeshBasicMaterial({ map: sunTexture });
  sunMesh   = new THREE.Mesh(geo, mat);
  scene.add(sunMesh);

  // Corona glow — additive sprite-like sphere
  const glowGeo = new THREE.SphereGeometry(16.5, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.55, 0.05),
    transparent: true,
    opacity: 0.18,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  sunMesh.add(new THREE.Mesh(glowGeo, glowMat));

  // Second wider corona
  const glow2Geo = new THREE.SphereGeometry(20, 32, 32);
  const glow2Mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.35, 0.0),
    transparent: true,
    opacity: 0.06,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  sunMesh.add(new THREE.Mesh(glow2Geo, glow2Mat));

  // Point light at origin (sun)
  const sunLight = new THREE.PointLight(0xfff5e0, 2.5, 1800);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.setScalar(2048);
  scene.add(sunLight);

  // Ambient for dark-side visibility
  scene.add(new THREE.AmbientLight(0x111133, 0.4));
}

/* ─────────────────────────────────────────────────────────────────
   §6  PLANET FACTORY
────────────────────────────────────────────────────────────────── */

/**
 * Planet data — distance is scene units from sun center
 */
const PLANET_DATA = [
  {
    name: 'Mercury',
    radius: 1.8,
    distance: 28,
    orbitSpeed: 0.0165,
    rotSpeed: 0.003,
    tilt: 0.034,
    texFn: makeMercuryTexture,
    info: { Type: 'Terrestrial', Diameter: '4,879 km', Distance: '57.9M km', 'Day Length': '1,408 hrs', Moons: '0' }
  },
  {
    name: 'Venus',
    radius: 3.2,
    distance: 42,
    orbitSpeed: 0.012,
    rotSpeed: 0.001,
    tilt: 3.096,
    texFn: makeVenusTexture,
    info: { Type: 'Terrestrial', Diameter: '12,104 km', Distance: '108.2M km', 'Day Length': '5,832 hrs', Moons: '0' }
  },
  {
    name: 'Earth',
    radius: 3.5,
    distance: 58,
    orbitSpeed: 0.01,
    rotSpeed: 0.008,
    tilt: 0.4101,
    texFn: makeEarthTexture,
    cloudTexFn: makeCloudTexture,
    info: { Type: 'Terrestrial', Diameter: '12,742 km', Distance: '149.6M km', 'Day Length': '24 hrs', Moons: '1' }
  },
  {
    name: 'Mars',
    radius: 2.5,
    distance: 76,
    orbitSpeed: 0.0081,
    rotSpeed: 0.007,
    tilt: 0.4363,
    texFn: makeMarsTexture,
    info: { Type: 'Terrestrial', Diameter: '6,779 km', Distance: '227.9M km', 'Day Length': '24.6 hrs', Moons: '2' }
  },
  {
    name: 'Jupiter',
    radius: 9.5,
    distance: 110,
    orbitSpeed: 0.0043,
    rotSpeed: 0.018,
    tilt: 0.0546,
    texFn: makeJupiterTexture,
    info: { Type: 'Gas Giant', Diameter: '139,820 km', Distance: '778.5M km', 'Day Length': '9.9 hrs', Moons: '95' }
  },
  {
    name: 'Saturn',
    radius: 8.0,
    distance: 148,
    orbitSpeed: 0.0032,
    rotSpeed: 0.015,
    tilt: 0.4665,
    texFn: makeSaturnTexture,
    hasRing: true,
    info: { Type: 'Gas Giant', Diameter: '116,460 km', Distance: '1.43B km', 'Day Length': '10.7 hrs', Moons: '146' }
  },
  {
    name: 'Uranus',
    radius: 5.5,
    distance: 190,
    orbitSpeed: 0.0022,
    rotSpeed: 0.012,
    tilt: 1.7063,
    texFn: makeUranusTexture,
    info: { Type: 'Ice Giant', Diameter: '50,724 km', Distance: '2.87B km', 'Day Length': '17.2 hrs', Moons: '28' }
  },
  {
    name: 'Neptune',
    radius: 5.2,
    distance: 235,
    orbitSpeed: 0.0016,
    rotSpeed: 0.01,
    tilt: 0.4943,
    texFn: makeNeptuneTexture,
    info: { Type: 'Ice Giant', Diameter: '49,244 km', Distance: '4.50B km', 'Day Length': '16.1 hrs', Moons: '16' }
  },
];

// Stores live planet objects for animation
const planets = [];

function createPlanet(data, ringTexture) {
  // Pivot group — handles orbital revolution
  const pivot = new THREE.Object3D();
  scene.add(pivot);

  // Tilt group — tilts the orbit plane slightly per planet
  const tiltGroup = new THREE.Object3D();
  tiltGroup.rotation.z = (Math.random() - 0.5) * 0.15;
  pivot.add(tiltGroup);

  // Planet mesh
  const geo = new THREE.SphereGeometry(data.radius, 64, 64);
  const tex = data.texFn();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.85,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  mesh.rotation.z    = data.tilt;
  mesh.position.x    = data.distance;
  mesh.userData      = { planetName: data.name, info: data.info };
  tiltGroup.add(mesh);

  // Cloud layer for Earth
  if (data.cloudTexFn) {
    const cloudGeo = new THREE.SphereGeometry(data.radius * 1.015, 64, 64);
    const cloudTex = data.cloudTexFn();
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.82,
      roughness: 1,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    mesh.add(clouds);

    planets.push({
      pivot, mesh,
      orbitSpeed: data.orbitSpeed,
      rotSpeed:   data.rotSpeed,
      cloudMesh:  clouds,
    });
  } else {
    planets.push({ pivot, mesh, orbitSpeed: data.orbitSpeed, rotSpeed: data.rotSpeed });
  }

  // Saturn ring
  if (data.hasRing && ringTexture) {
    createRing(mesh, data.radius, ringTexture);
  }

  return mesh;
}

/* ─────────────────────────────────────────────────────────────────
   §7  SATURN RING
────────────────────────────────────────────────────────────────── */
function createRing(planetMesh, planetRadius, ringTexture) {
  const innerR = planetRadius * 1.25;
  const outerR = planetRadius * 2.55;
  const geo    = new THREE.RingGeometry(innerR, outerR, 180, 8);

  // Remap UVs so the texture maps radially (inner→outer = U 0→1)
  const pos  = geo.attributes.position;
  const uv   = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    const u = (r - innerR) / (outerR - innerR);
    uv.setXY(i, u, 0);
  }
  uv.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: ringTexture,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI / 2;
  planetMesh.add(ring);
}

/* ─────────────────────────────────────────────────────────────────
   §8  ORBIT PATH VISUALS
────────────────────────────────────────────────────────────────── */
function createOrbitRing(radius) {
  const points = [];
  const SEGS   = 256;
  for (let i = 0; i <= SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.35 });
  scene.add(new THREE.Line(geo, mat));
}

/* ─────────────────────────────────────────────────────────────────
   §9  RAYCASTER — CLICK INTERACTION
────────────────────────────────────────────────────────────────── */
const raycaster   = new THREE.Raycaster();
const mouse       = new THREE.Vector2();
const clickables  = []; // filled after planet creation

const planetCard  = document.getElementById('planet-info');
const planetName  = document.getElementById('planet-name');
const planetStats = document.getElementById('planet-stats');

function showPlanetInfo(name, info) {
  planetName.textContent = name.toUpperCase();
  planetStats.innerHTML  = Object.entries(info)
    .map(([k, v]) => `<div class="stat-row"><span class="stat-label">${k}</span><span class="stat-value">${v}</span></div>`)
    .join('');
  planetCard.classList.remove('hidden');
}

function hidePlanetInfo() { planetCard.classList.add('hidden'); }

// Close card on clicking the ✕
planetCard.addEventListener('click', hidePlanetInfo);

renderer.domElement.addEventListener('click', (e) => {
  // Ignore if orbiting
  if (controls.autoRotate) return;

  mouse.x = (e.clientX / window.innerWidth)  *  2 - 1;
  mouse.y = (e.clientY / window.innerHeight) * -2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(clickables, false);
  if (hits.length) {
    const obj = hits[0].object;
    if (obj.userData.planetName) {
      showPlanetInfo(obj.userData.planetName, obj.userData.info);
    }
  } else {
    hidePlanetInfo();
  }
});

/* ─────────────────────────────────────────────────────────────────
   §10 ANIMATION LOOP
────────────────────────────────────────────────────────────────── */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  // Rotate sun
  if (sunMesh) sunMesh.rotation.y = elapsed * 0.04;

  // Orbit & rotate each planet
  planets.forEach(({ pivot, mesh, orbitSpeed, rotSpeed, cloudMesh }) => {
    pivot.rotation.y = elapsed * orbitSpeed;
    mesh.rotation.y += rotSpeed * 0.016;
    if (cloudMesh) cloudMesh.rotation.y += rotSpeed * 0.0055;
  });

  controls.update();
  renderer.render(scene, camera);
}

/* ─────────────────────────────────────────────────────────────────
   §11 WINDOW RESIZE
────────────────────────────────────────────────────────────────── */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ─────────────────────────────────────────────────────────────────
   §12 BOOT / LOADER
   Generates all textures, builds the scene, then fades out loader.
────────────────────────────────────────────────────────────────── */
async function init() {
  const loaderBar = document.getElementById('loaderBar');
  const loaderPct = document.getElementById('loaderPct');
  const loaderEl  = document.getElementById('loader');

  // Total tasks: 1 sun + 8 planets + 1 ring + stars + orbits = ~12
  const tasks = [
    'Sun Texture',
    'Mercury Texture', 'Venus Texture', 'Earth Texture', 'Earth Clouds',
    'Mars Texture', 'Jupiter Texture', 'Saturn Texture',
    'Saturn Ring', 'Uranus Texture', 'Neptune Texture',
    'Star Field', 'Orbit Rings', 'Scene Ready',
  ];
  let step = 0;
  const setProgress = () => {
    step++;
    const pct = Math.round((step / tasks.length) * 100);
    loaderBar.style.width = pct + '%';
    loaderPct.textContent = pct + '%';
  };

  // Defer each texture generation to next microtask to allow UI updates
  const next = () => new Promise(r => setTimeout(r, 0));

  // Sun
  await next(); const sunTex = makeSunTexture(); setProgress();
  createSun(sunTex);

  // Ring texture (needed for Saturn)
  await next(); const ringTex = makeSaturnRingTexture(); setProgress();

  // Planets
  for (const pData of PLANET_DATA) {
    await next();
    const mesh = createPlanet(pData, ringTex);
    clickables.push(mesh);
    createOrbitRing(pData.distance);
    setProgress();
  }

  // Star field
  await next(); createStarField(); setProgress();

  // "Scene Ready" step
  await next(); setProgress();

  // Start render loop
  animate();

  // Fade out loader
  await new Promise(r => setTimeout(r, 200));
  loaderEl.classList.add('fade-out');
  setTimeout(() => loaderEl.style.display = 'none', 900);
}

init();

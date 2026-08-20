(function () {
  const CAM = [1.2629783123314589, 2.664606471394044, -1.8178993743288914];
  const FOV = 50, FOCUS = 3.8, APERTURE = 1.79, OPACITY = 0.8;
  const NOISE_SCALE = 0.6, NOISE_INTENSITY = 0.85, PLANE = 10.0, LOOP = 24.0;
  const N = 190; // grid resolution -> N*N points

  function basis() {
    const f = [-CAM[0], -CAM[1], -CAM[2]];
    let l = Math.hypot(f[0], f[1], f[2]); f[0] /= l; f[1] /= l; f[2] /= l;
    let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];
    l = Math.hypot(r[0], r[1], r[2]); r = [r[0] / l, r[1] / l, r[2] / l];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { f, r, u: [-u[0], -u[1], -u[2]] };
  }

  function noise(x, y, z, t) {
    // cheap periodic pseudo-noise: sum of sines that loops with t
    const s = Math.sin, c = Math.cos;
    let n = s(x * 1.0 + c(t) * 1.3) * c(z * 0.9 + s(t) * 1.1);
    n += 0.55 * s(x * 2.1 + y * 1.7 + s(t + 1.7) * 1.6) * c(z * 1.9 + c(t) * 1.2);
    n += 0.3 * s(x * 4.3 + c(t * 1.0 + 0.6) * 2.0) * c(z * 3.7 + s(t) * 1.8);
    return n * 0.62;
  }

  function start(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    let W = 0, H = 0, dpr = 1, img = null, buf = null, focal = 0;
    const B = basis();

    const px = new Float32Array(N * N), pz = new Float32Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const jx = (Math.random() - 0.5) * (2 * PLANE / N) * 1.6;
      const jz = (Math.random() - 0.5) * (2 * PLANE / N) * 1.6;
      px[i * N + j] = ((j / (N - 1)) - 0.5) * 2 * PLANE + jx;
      pz[i * N + j] = ((i / (N - 1)) - 0.5) * 2 * PLANE + jz;
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(1, Math.round(canvas.clientWidth * dpr));
      H = Math.max(1, Math.round(canvas.clientHeight * dpr));
      canvas.width = W; canvas.height = H;
      img = ctx.createImageData(W, H);
      buf = new Float32Array(W * H);
      focal = (H / 2) / Math.tan((FOV * Math.PI / 180) / 2);
    }
    resize();
    new ResizeObserver(resize).observe(canvas);

    let intro = 0, target = 0;
    canvas.__setHover = (v) => { target = v ? 1 : 0; };

    let raf, t0 = performance.now();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const time = (now - t0) / 1000;
      intro += (target - intro) * 0.05;
      const ct = time * (6.28318530718 / LOOP);
      const inten = NOISE_INTENSITY * (1 - 0.45 * intro);
      buf.fill(0);
      const cx = W / 2, cy = H / 2;
      for (let k = 0, n = N * N; k < n; k++) {
        const ox = px[k], oz = pz[k];
        const nx = ox * NOISE_SCALE, nz = oz * NOISE_SCALE;
        const dx = noise(nx, 0, nz, ct) * inten;
        const dy = noise(nx + 30, 0, nz, ct + 2.094) * inten * 3.4;
        const dz = noise(nx, 30, nz, ct + 4.188) * inten;
        const wx = ox + dx, wy = dy, wz = oz + dz;
        const vx = wx - CAM[0], vy = wy - CAM[1], vz = wz - CAM[2];
        const zc = vx * B.f[0] + vy * B.f[1] + vz * B.f[2];
        if (zc < 0.15) continue;
        const xc = vx * B.r[0] + vy * B.r[1] + vz * B.r[2];
        const yc = vx * B.u[0] + vy * B.u[1] + vz * B.u[2];
        const sx = cx + (xc * focal) / zc, sy = cy + (yc * focal) / zc;
        if (sx < -4 || sy < -4 || sx > W + 4 || sy > H + 4) continue;
        let coc = Math.abs(zc - FOCUS) * APERTURE * 0.55;
        let rad = Math.min(2.6, 0.5 + coc);
        const bright = OPACITY / (1 + coc * coc * 2.2);
        const ir = Math.ceil(rad), ix = sx | 0, iy = sy | 0;
        if (ir <= 0) { const o = iy * W + ix; if (o >= 0 && o < buf.length) buf[o] += bright; continue; }
        const inv = 1 / (rad * rad);
        for (let yy = iy - ir; yy <= iy + ir; yy++) {
          if (yy < 0 || yy >= H) continue;
          const row = yy * W;
          for (let xx = ix - ir; xx <= ix + ir; xx++) {
            if (xx < 0 || xx >= W) continue;
            const ddx = xx + 0.5 - sx, ddy = yy + 0.5 - sy;
            const f = 1 - (ddx * ddx + ddy * ddy) * inv;
            if (f > 0) buf[row + xx] += bright * f * 0.9;
          }
        }
      }
      const d = img.data;
      for (let y = 0; y < H; y++) {
        const vy2 = (y / H - 0.5) * 2;
        for (let x = 0; x < W; x++) {
          const vx2 = (x / W - 0.5) * 2;
          const r2 = Math.sqrt(vx2 * vx2 * 0.85 + vy2 * vy2);
          const vig = Math.max(0, 1 - Math.max(0, r2 - 0.4) * 1.5);
          let v = buf[y * W + x] * vig;
          v = v > 1 ? 1 : v;
          const o = (y * W + x) * 4;
          d[o] = (19 + v * 187) | 0; d[o + 1] = (26 + v * 195) | 0; d[o + 2] = (34 + v * 199) | 0; d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }

  window.SkalParticles = { start };
})();

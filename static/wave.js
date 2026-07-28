/* =========================================================
   표지 배경 물결 — React 컴포넌트(HeroWave)를 프레임워크 없이 옮겼다.

   원본이 하던 일                     여기서 대신하는 방법
   ─────────────────────────────    ─────────────────────────────
   useRef + useEffect                 DOM에서 canvas를 직접 찾음
   window resize 리스너               같음 (다만 연타를 막으려 지연을 둠)
   canvas 자기 자신을 확대            작은 캔버스를 따로 두고 그것을 확대

   픽셀 하나하나를 직접 계산하는 방식이라 무겁다. 발표장 노트북에서
   버벅이지 않도록 세 가지 안전장치를 넣었다.
     1) 실제 그리는 해상도를 화면의 1/4로 줄이고 확대한다
     2) 초당 30번만 그린다 (물결이 느려서 60번은 필요 없다)
     3) 첫 프레임이 느리면 해상도를 더 낮춘다
   그리고 이 파일이 통째로 실패해도 표지 글자는 그대로 보인다.
   ========================================================= */

(function () {
  const canvas = document.getElementById("hero-wave");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  /* ---------- 삼각함수 표 ----------
     픽셀마다 sin/cos를 부르면 느리다. 1024칸짜리 표를 미리 만들어 찾아 쓴다.
     & 1023 은 나머지 연산 역할을 하는데, 음수에도 올바르게 돈다. */
  const N = 1024;
  const SIN = new Float32Array(N);
  const COS = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    SIN[i] = Math.sin(a);
    COS[i] = Math.cos(a);
  }
  const K = N / (Math.PI * 2);
  const fsin = (x) => SIN[Math.floor(x * K) & (N - 1)];
  const fcos = (x) => COS[Math.floor(x * K) & (N - 1)];

  /* ---------- 실제로 그릴 작은 캔버스 ---------- */
  const buf = document.createElement("canvas");
  const bctx = buf.getContext("2d", { alpha: false });

  let scale = 4;          // 화면 4픽셀당 1픽셀만 계산한다
  let W = 0, H = 0, img = null, data = null;

  /* 원본 수식을 그대로 쓰면 가장 밝은 곳이 RGB(20,27,36) 밖에 안 된다.
     이 페이지 배경이 #0a0a0a(10,10,10) 이라 그대로 두면 물결이 보이지 않는다.
     그래서 수식은 건드리지 않고 마지막 색에만 배율을 곱한다.
     숫자를 키우면 물결이 진해지고, 줄이면 옅어진다. */
  const GAIN = 3.6;

  function resize() {
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    canvas.width = cw;
    canvas.height = ch;

    W = Math.max(1, Math.floor(cw / scale));
    H = Math.max(1, Math.floor(ch / scale));
    buf.width = W;
    buf.height = H;
    img = bctx.createImageData(W, H);
    data = img.data;

    // 작은 그림을 부드럽게 늘려서 흐릿한 그러데이션처럼 보이게 한다
    ctx.imageSmoothingEnabled = true;
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function draw(time) {
    let p = 0;
    for (let y = 0; y < H; y++) {
      const uy = (2 * y - H) / H;
      for (let x = 0; x < W; x++) {
        const ux = (2 * x - W) / H;

        // 값 두 개(a, d)를 서로 되먹이며 4번 돌린다 — 물결이 겹치는 느낌이 여기서 나온다
        let a = 0;
        let d = 0;
        for (let i = 0; i < 4; i++) {
          a += fcos(i - d + time * 0.5 - a * ux);
          d += fsin(i * uy + a);
        }

        const wave = (fsin(a) + fcos(d)) * 0.5;
        const intensity = 0.3 + 0.4 * wave;
        const base = 0.1 + 0.15 * fcos(ux + uy + time * 0.3);
        const blue = 0.2 * fsin(a * 1.5 + time * 0.2);
        const purple = 0.15 * fcos(d * 2 + time * 0.1);

        const g = intensity * GAIN * 255;
        data[p++] = clamp01(base + purple * 0.8) * g;
        data[p++] = clamp01(base + blue * 0.6) * g;
        data[p++] = clamp01(base + blue * 1.2 + purple * 0.4) * g;
        data[p++] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    ctx.drawImage(buf, 0, 0, W, H, 0, 0, canvas.width, canvas.height);
  }

  /* ---------- 움직임을 줄여 달라는 설정이면 한 장만 그리고 끝 ---------- */
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  const FRAME = 1000 / 30;   // 초당 30번
  const t0 = performance.now();
  let last = 0;
  let raf = 0;
  let checked = false;

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME) return;
    last = now;

    const began = performance.now();
    draw((now - t0) * 0.001);

    // 첫 프레임이 오래 걸리면 이 컴퓨터에는 버거운 것이므로 해상도를 낮춘다
    if (!checked) {
      checked = true;
      if (performance.now() - began > 12 && scale < 8) {
        scale = 8;
        resize();
      }
    }
  }

  function start() {
    cancelAnimationFrame(raf);

    // 먼저 한 장을 바로 그려 둔다. requestAnimationFrame 은 탭이 화면에
    // 보이지 않으면 실행되지 않으므로, 이게 없으면 다른 탭에 있다가 돌아왔을 때
    // 잠깐 빈 캔버스가 보인다.
    draw((performance.now() - t0) * 0.001);

    if (still.matches) return;   // 움직임 줄이기 설정이면 이 한 장으로 끝
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---------- 창 크기가 바뀌면 다시 맞추기 (연타 방지) ---------- */
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      if (still.matches) draw(0);
    }, 150);
  });

  /* ---------- 다른 탭을 보고 있으면 그리지 않는다 (배터리 절약) ---------- */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  // 설정을 도중에 바꿔도 따라가도록
  if (still.addEventListener) still.addEventListener("change", start);

  resize();
  start();
})();

/* =========================================================
   소멸위험지수 계산기

   조절 막대는 Radix UI Slider를 네이티브 <input type="range">로 옮긴 것이다.
   Radix가 하던 일                    여기서 대신하는 방법
   ─────────────────────────────    ─────────────────────────────
   Track / Range 두 겹의 div          트랙 배경을 linear-gradient 한 겹으로
   Thumb 위치 계산                    브라우저 기본 동작 (키보드 조작도 공짜)
   Tooltip (showTooltip)              손잡이를 따라다니는 말풍선, 항상 보임

   HTML에 이미 슬라이더와 기본 결과가 적혀 있고, 이 파일은 값만 바꿔 끼운다.
   ========================================================= */

(function () {
  const young = document.getElementById("s-young");
  const aged = document.getElementById("s-aged");
  if (!young || !aged) return;

  const out = {
    formula: document.getElementById("calc-formula"),
    value: document.getElementById("calc-value"),
    badge: document.getElementById("calc-badge"),
    needle: document.getElementById("calc-needle"),
    compare: document.getElementById("calc-compare"),
  };
  const presets = Array.from(document.querySelectorAll(".presets button"));
  const GU = REPORT_DATA.busanGu;

  // 등급 경계는 data.js의 levels를 그대로 읽는다 (20, 40)
  const bounds = REPORT_DATA.levels.map((l) => l.value).sort((a, b) => a - b);
  const RISK = bounds[0];
  const WATCH = bounds[1];
  const TOP = 60; // 보고서 등급표는 60까지만 정의한다 = 눈금자의 오른쪽 끝

  function grade(v) {
    if (v < RISK) return { name: "위험", tone: "var(--status-critical)" };
    if (v < WATCH) return { name: "경계", tone: "var(--status-warning)" };
    if (v < TOP) return { name: "관리", tone: "var(--chart-1)" };
    return { name: "보통", tone: "var(--chart-3)" };
  }

  /* 슬라이더가 얼마나 차 있는지를 0~1 값으로 .slider 에 적어 둔다.
     트랙의 색칠 길이와 말풍선 위치가 이 값 하나를 같이 본다. */
  function paint(el) {
    const min = Number(el.min);
    const max = Number(el.max);
    const box = el.parentElement;
    box.style.setProperty("--p", ((el.value - min) / (max - min)).toFixed(4));
    box.querySelector(".slider-bubble").textContent = Number(el.value).toFixed(1) + "%";
  }

  /* 계산한 지수가 부산 9개 구 중 어디와 비슷한지 문장으로 만든다 */
  function compareText(v) {
    const near = GU.reduce((a, b) =>
      Math.abs(b.index - v) < Math.abs(a.index - v) ? b : a
    );
    const gap = Math.abs(near.index - v);
    const name = (d) => `<strong>${d.gu}(${d.index.toFixed(1)})</strong>`;

    if (gap <= 1.5) return `지금 값은 부산 ${name(near)}와 거의 같은 수준입니다.`;
    if (gap <= 5) return `지금 값은 부산 ${name(near)}와 가장 비슷합니다.`;

    if (v < near.index) {
      const worst = GU.reduce((a, b) => (b.index < a.index ? b : a));
      return `부산에서 가장 위험한 ${name(worst)}보다도 낮습니다.`;
    }
    const best = GU.reduce((a, b) => (b.index > a.index ? b : a));
    return `부산에서 지수가 가장 높은 ${name(best)}보다도 높습니다.`;
  }

  function syncPresets(y, a) {
    for (const b of presets) {
      const same =
        Math.abs(Number(b.dataset.young) - y) < 0.05 &&
        Math.abs(Number(b.dataset.aged) - a) < 0.05;
      b.setAttribute("aria-pressed", same ? "true" : "false");
    }
  }

  function update() {
    paint(young);
    paint(aged);

    const y = Number(young.value);
    const a = Number(aged.value);
    const v = Math.round((y / a) * 1000) / 10; // 소수점 한 자리
    const g = grade(v);

    out.formula.textContent = `${y.toFixed(1)} ÷ ${a.toFixed(1)} × 100`;
    out.value.textContent = v.toFixed(1);
    out.badge.textContent = g.name;
    out.badge.style.setProperty("--tone", g.tone);
    out.needle.style.setProperty("--pos", Math.min(v / TOP, 1) * 100 + "%");

    let text = compareText(v);
    if (v >= TOP) text += ` (${TOP} 이상은 보고서 등급표의 범위 밖입니다.)`;
    out.compare.innerHTML = text;

    syncPresets(y, a);
  }

  young.addEventListener("input", update);
  aged.addEventListener("input", update);

  for (const b of presets) {
    b.addEventListener("click", () => {
      young.value = b.dataset.young;
      aged.value = b.dataset.aged;
      update();
    });
  }

  update();
})();

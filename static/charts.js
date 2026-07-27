/* =========================================================
   차트 라이브러리 (vanilla JS + SVG)
   - 꺾은선그래프.txt (recharts PointsChart)  → renderLineChart
   - 산점도 차트.txt (shadcn Chart/Tooltip)   → renderScatterChart + 공용 툴팁/범례
   - 파이차트.txt   (shadcn ChartContainer)   → renderDonutChart
   React 컴포넌트의 디자인(점선 그리드, 별 기준선, 팝오버 툴팁,
   사각 스와치 범례)을 그대로 옮기되 프레임워크 없이 동작한다.
   ========================================================= */

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

function fmt(value) {
  return Math.round(value * 10) % 10 === 0
    ? Math.round(value).toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/* ---------- 공용 툴팁 (shadcn ChartTooltipContent 변환) ---------- */
const tip = (() => {
  let node = null;
  function ensure() {
    if (!node) {
      node = document.createElement("div");
      node.className = "chart-tip";
      document.body.appendChild(node);
    }
    return node;
  }
  return {
    show(html, x, y) {
      const n = ensure();
      n.innerHTML = html;
      n.style.opacity = "1";
      const r = n.getBoundingClientRect();
      const px = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8);
      const py = Math.min(Math.max(8, y - r.height - 10), window.innerHeight - r.height - 8);
      n.style.transform = `translate(${px}px, ${Math.max(8, py)}px)`;
    },
    hide() {
      if (node) node.style.opacity = "0";
    },
  };
})();

function tipRow(color, name, value) {
  return `<div class="tip-row">
    <span class="tip-swatch" style="background:${color}"></span>
    <span class="tip-name">${name}</span>
    <span class="tip-value">${value}</span>
  </div>`;
}

/* ---------- 범례 (shadcn ChartLegendContent 변환) ---------- */
function buildLegend(container, items) {
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  for (const it of items) {
    const li = document.createElement("div");
    li.className = "chart-legend-item";
    li.innerHTML = `<span class="tip-swatch" style="background:${it.color}"></span>${it.label}`;
    legend.appendChild(li);
  }
  container.appendChild(legend);
}

/* ---------- 눈금 계산 ---------- */
function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step0;
  const step = step0 * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step)
    ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/* ---------- 모노톤 곡선 (recharts type="monotone" 변환) ---------- */
function monotonePath(pts) {
  if (pts.length < 2) return "";
  const n = pts.length, dx = [], slope = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  m[0] = slope[0]; m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    d += `C${pts[i].x + dx[i] / 3},${pts[i].y + m[i] * dx[i] / 3},` +
         `${pts[i + 1].x - dx[i] / 3},${pts[i + 1].y - m[i + 1] * dx[i] / 3},` +
         `${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

/* ---------- 별 아이콘 (꺾은선그래프.txt의 lucide Star 기준선 라벨) ---------- */
function starPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(ang)).toFixed(2)},${(cy + rr * Math.sin(ang)).toFixed(2)}`);
  }
  return "M" + pts.join("L") + "Z";
}

/* ---------- 리사이즈 시 다시 그리기 ---------- */
function mountChart(container, renderFn) {
  let raf = 0;
  const draw = () => {
    container.innerHTML = "";
    renderFn(container.clientWidth || 320);
  };
  new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  }).observe(container);
  draw();
}

const TONE = { critical: "var(--status-critical)", warning: "var(--status-warning)" };

/* =========================================================
   1) 꺾은선: 부산 9개 구 소멸위험지수 + 등급 기준선(별)
   ========================================================= */
function renderLineChart(container, { data, levels = [], height = 280 }) {
  mountChart(container, (width) => {
    const M = { top: 18, right: 16, bottom: 30, left: 44 };
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" }, container);

    const values = [...data.map((d) => d.y), ...levels.map((l) => l.value)];
    const lo = Math.min(...values), hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.12, 2);
    const yMin = Math.max(0, lo - pad), yMax = hi + pad;
    const x = (i) => M.left + (iw * i) / (data.length - 1);
    const y = (v) => M.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

    // 점선 그리드 (strokeDasharray 3 3)
    const yTicks = niceTicks(yMin, yMax, 5);
    for (const t of yTicks) {
      svgEl("line", { x1: M.left, x2: M.left + iw, y1: y(t), y2: y(t),
        stroke: "var(--chart-grid)", "stroke-dasharray": "3 3" }, svg);
      svgEl("text", { x: M.left - 8, y: y(t) + 4, "text-anchor": "end",
        class: "tick-label" }, svg).textContent = fmt(t);
    }
    data.forEach((d, i) => {
      svgEl("line", { x1: x(i), x2: x(i), y1: M.top, y2: M.top + ih,
        stroke: "var(--chart-grid)", "stroke-dasharray": "3 3" }, svg);
      svgEl("text", { x: x(i), y: height - 8, "text-anchor": "middle",
        class: "tick-label" }, svg).textContent = d.label;
    });

    // 등급 기준선: 점선(6 6) + 별 + 짧은 라벨
    for (const lv of levels) {
      const c = TONE[lv.tone] || "var(--ink-3)";
      svgEl("line", { x1: M.left, x2: M.left + iw, y1: y(lv.value), y2: y(lv.value),
        stroke: c, "stroke-dasharray": "6 6", "stroke-width": 2, opacity: 0.9 }, svg);
      svgEl("path", { d: starPath(M.left + 9, y(lv.value), 6), fill: c, stroke: c }, svg);
      svgEl("text", { x: M.left + 20, y: y(lv.value) - 6, class: "level-label",
        fill: c }, svg).textContent = lv.short;
    }

    // 선 + 점 (2px monotone, 점은 표면색 링 2px)
    const pts = data.map((d, i) => ({ x: x(i), y: y(d.y) }));
    svgEl("path", { d: monotonePath(pts), fill: "none",
      stroke: "var(--chart-1)", "stroke-width": 2,
      "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    const dots = data.map((d, i) =>
      svgEl("circle", { cx: pts[i].x, cy: pts[i].y, r: 4,
        fill: "var(--chart-1)", stroke: "var(--card)", "stroke-width": 2 }, svg));

    // 호버: 세로 커서선 + activeDot + 툴팁
    const cursor = svgEl("line", { y1: M.top, y2: M.top + ih, stroke: "var(--chart-1)",
      "stroke-dasharray": "4 4", opacity: 0 }, svg);
    const hit = svgEl("rect", { x: M.left, y: M.top, width: iw, height: ih,
      fill: "transparent" }, svg);
    hit.addEventListener("mousemove", (e) => {
      const box = svg.getBoundingClientRect();
      const mx = ((e.clientX - box.left) / box.width) * width;
      let best = 0;
      for (let i = 1; i < data.length; i++)
        if (Math.abs(x(i) - mx) < Math.abs(x(best) - mx)) best = i;
      cursor.setAttribute("x1", x(best));
      cursor.setAttribute("x2", x(best));
      cursor.setAttribute("opacity", 0.7);
      dots.forEach((d, i) => d.setAttribute("r", i === best ? 6 : 4));
      const d = data[best];
      tip.show(`<p class="tip-label">${d.label}</p>` +
        tipRow("var(--chart-1)", "소멸위험지수", fmt(d.y)) +
        tipRow("var(--ink-3)", "인구증감 00~24", `${d.change > 0 ? "+" : ""}${fmt(d.change)}%`),
        e.clientX, e.clientY);
    });
    hit.addEventListener("mouseleave", () => {
      cursor.setAttribute("opacity", 0);
      dots.forEach((d) => d.setAttribute("r", 4));
      tip.hide();
    });
  });
}

/* =========================================================
   2) 산점도: 청년 여성 비중 vs 소멸위험지수 (부산 9개 구)
   ========================================================= */
function renderScatterChart(container, { data, groups, xLabel, yLabel, annotate = [], height = 300 }) {
  mountChart(container, (width) => {
    const M = { top: 16, right: 18, bottom: 42, left: 44 };
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" }, container);

    const xs = data.map((d) => d.x), ys = data.map((d) => d.y);
    const padX = (Math.max(...xs) - Math.min(...xs)) * 0.15 || 1;
    const padY = (Math.max(...ys) - Math.min(...ys)) * 0.15 || 1;
    const xMin = Math.min(...xs) - padX, xMax = Math.max(...xs) + padX;
    const yMin = Math.min(...ys) - padY, yMax = Math.max(...ys) + padY;
    const x = (v) => M.left + ((v - xMin) / (xMax - xMin)) * iw;
    const y = (v) => M.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

    for (const t of niceTicks(yMin, yMax, 5)) {
      svgEl("line", { x1: M.left, x2: M.left + iw, y1: y(t), y2: y(t),
        stroke: "var(--chart-grid)", "stroke-dasharray": "3 3" }, svg);
      svgEl("text", { x: M.left - 8, y: y(t) + 4, "text-anchor": "end",
        class: "tick-label" }, svg).textContent = fmt(t);
    }
    for (const t of niceTicks(xMin, xMax, 6)) {
      svgEl("line", { x1: x(t), x2: x(t), y1: M.top, y2: M.top + ih,
        stroke: "var(--chart-grid)", "stroke-dasharray": "3 3" }, svg);
      svgEl("text", { x: x(t), y: M.top + ih + 16, "text-anchor": "middle",
        class: "tick-label" }, svg).textContent = fmt(t);
    }
    svgEl("text", { x: M.left + iw / 2, y: height - 6, "text-anchor": "middle",
      class: "axis-label" }, svg).textContent = xLabel;
    const yl = svgEl("text", { x: 12, y: M.top + ih / 2, "text-anchor": "middle",
      class: "axis-label", transform: `rotate(-90 12 ${M.top + ih / 2})` }, svg);
    yl.textContent = yLabel;

    // 점(지름 12px) + 표면색 링, 주요 지점만 직접 라벨
    for (const d of data) {
      const g = groups[d.group];
      const dot = svgEl("circle", { cx: x(d.x), cy: y(d.y), r: 6, fill: g.color,
        stroke: "var(--card)", "stroke-width": 2, class: "scatter-dot" }, svg);
      if (annotate.includes(d.label)) {
        svgEl("text", { x: x(d.x) + 10, y: y(d.y) - 8, class: "point-label" }, svg)
          .textContent = d.label;
      }
      dot.addEventListener("mousemove", (e) => {
        dot.setAttribute("r", 8);
        tip.show(`<p class="tip-label">${d.label} <span class="tip-sub">${g.label}</span></p>` +
          tipRow(g.color, xLabel, fmt(d.x) + "%") +
          tipRow(g.color, yLabel, fmt(d.y)) +
          tipRow("var(--ink-3)", "고령인구 비중", fmt(d.aged) + "%") +
          tipRow("var(--ink-3)", "인구증감 00~24", `${d.popChange > 0 ? "+" : ""}${fmt(d.popChange)}%`),
          e.clientX, e.clientY);
      });
      dot.addEventListener("mouseleave", () => {
        dot.setAttribute("r", 6);
        tip.hide();
      });
    }
    buildLegend(container, Object.values(groups));
  });
}

/* =========================================================
   3) 막대: 부산 9개 구 고령인구 비중
   ========================================================= */
function renderBarChart(container, { data, groups, height = 280 }) {
  mountChart(container, (width) => {
    const M = { top: 22, right: 12, bottom: 30, left: 40 };
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" }, container);

    const hi = Math.max(...data.map((d) => d.value)) * 1.12;
    const y = (v) => M.top + ih - (v / hi) * ih;
    const band = iw / data.length;
    const bw = Math.min(24, band * 0.55);

    for (const t of niceTicks(0, hi, 4)) {
      svgEl("line", { x1: M.left, x2: M.left + iw, y1: y(t), y2: y(t),
        stroke: "var(--chart-grid)", "stroke-dasharray": "3 3" }, svg);
      svgEl("text", { x: M.left - 8, y: y(t) + 4, "text-anchor": "end",
        class: "tick-label" }, svg).textContent = fmt(t) + "%";
    }

    const maxV = Math.max(...data.map((d) => d.value));
    const minV = Math.min(...data.map((d) => d.value));
    data.forEach((d, i) => {
      const g = groups[d.group];
      const cx = M.left + band * i + band / 2;
      const top = y(d.value), h = M.top + ih - top, r = Math.min(4, h);
      // 위쪽만 4px 라운드, 바닥은 각지게
      const bar = svgEl("path", {
        d: `M${cx - bw / 2},${M.top + ih} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top}` +
           ` H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${M.top + ih} Z`,
        fill: g.color,
      }, svg);
      svgEl("text", { x: cx, y: height - 8, "text-anchor": "middle",
        class: "tick-label" }, svg).textContent = d.label.replace("구", "");
      if (d.value === maxV || d.value === minV) {
        svgEl("text", { x: cx, y: top - 7, "text-anchor": "middle",
          class: "point-label" }, svg).textContent = fmt(d.value) + "%";
      }
      bar.addEventListener("mousemove", (e) => {
        bar.setAttribute("opacity", 0.85);
        tip.show(`<p class="tip-label">${d.label} <span class="tip-sub">${g.label}</span></p>` +
          tipRow(g.color, "고령인구 비중", fmt(d.value) + "%"),
          e.clientX, e.clientY);
      });
      bar.addEventListener("mouseleave", () => {
        bar.removeAttribute("opacity");
        tip.hide();
      });
    });
    buildLegend(container, Object.values(groups));
  });
}

/* =========================================================
   4) 도넛: 소멸위험 시군구 3유형 (55곳)
   ========================================================= */
function renderDonutChart(container, { data, height = 300 }) {
  mountChart(container, (width) => {
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" }, container);
    const cx = width / 2, cy = height / 2;
    const r1 = Math.min(width, height) / 2 - 12, r0 = r1 * 0.62;
    const total = data.reduce((s, d) => s + d.count, 0);

    const arcPath = (a0, a1) => {
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (r, a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      return `M${p(r1, a0)}A${r1},${r1},0,${large},1,${p(r1, a1)}` +
             `L${p(r0, a1)}A${r0},${r0},0,${large},0,${p(r0, a0)}Z`;
    };

    let ang = -Math.PI / 2;
    for (const d of data) {
      const a0 = ang, a1 = ang + (d.count / total) * Math.PI * 2;
      ang = a1;
      // 표면색 2px 스트로크가 조각 사이 간격 역할
      const seg = svgEl("path", { d: arcPath(a0, a1), fill: d.color,
        stroke: "var(--card)", "stroke-width": 2, class: "donut-seg" }, svg);
      const mid = (a0 + a1) / 2, rm = (r0 + r1) / 2;
      svgEl("text", { x: cx + rm * Math.cos(mid), y: cy + rm * Math.sin(mid) + 4,
        "text-anchor": "middle", class: "seg-label" }, svg).textContent = d.count;
      seg.addEventListener("mousemove", (e) => {
        seg.setAttribute("opacity", 0.85);
        tip.show(`<p class="tip-label">${d.name}</p>` +
          tipRow(d.color, "시군구 수", `${d.count}곳`) +
          tipRow("var(--ink-3)", "평균 소멸위험지수", fmt(d.index)) +
          tipRow("var(--ink-3)", "20~39세 여성", fmt(d.youngF) + "%") +
          tipRow("var(--ink-3)", "인구증감 00~24", `${d.popChange > 0 ? "+" : ""}${fmt(d.popChange)}%`),
          e.clientX, e.clientY);
      });
      seg.addEventListener("mouseleave", () => {
        seg.removeAttribute("opacity");
        tip.hide();
      });
    }
    svgEl("text", { x: cx, y: cy - 2, "text-anchor": "middle", class: "donut-center-num" }, svg)
      .textContent = total;
    svgEl("text", { x: cx, y: cy + 18, "text-anchor": "middle", class: "donut-center-sub" }, svg)
      .textContent = "소멸위험 시군구";
    buildLegend(container, data.map((d) => ({ color: d.color, label: `${d.name} ${d.count}곳` })));
  });
}

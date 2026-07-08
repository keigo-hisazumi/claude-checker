/* ============================================================
   Claude Usage Checker
   Claude Code のローカル使用ログ(JSONL)をブラウザ内だけで解析し、
   トークン使用量と推定コストを可視化する。外部送信は一切行わない。
   ============================================================ */

(() => {
  "use strict";

  // ---------- 料金定義(USD / 100万トークン) ----------
  // モデル ID は "claude-opus-4-5-20251101" のような形式のため部分一致で解決する。
  // 上から順に評価するので、より具体的なパターンを先に置くこと。
  const PRICING_RULES = [
    { pattern: /fable-5|mythos/, label: "Claude Fable 5 / Mythos 5", input: 10, output: 50 },
    { pattern: /opus-4-[5-8]/, label: "Claude Opus 4.5〜4.8", input: 5, output: 25 },
    { pattern: /opus/, label: "Claude Opus 4.1 以前 / Opus 3", input: 15, output: 75 },
    { pattern: /sonnet/, label: "Claude Sonnet(全世代)", input: 3, output: 15 },
    { pattern: /haiku-4-5|4-5-haiku/, label: "Claude Haiku 4.5", input: 1, output: 5 },
    { pattern: /haiku-3-5|3-5-haiku/, label: "Claude Haiku 3.5", input: 0.8, output: 4 },
    { pattern: /haiku/, label: "Claude Haiku 3", input: 0.25, output: 1.25 },
  ];
  // キャッシュ料金は入力単価に対する倍率(5 分 TTL の書込 1.25 倍 / 読取 0.1 倍)
  const CACHE_WRITE_RATIO = 1.25;
  const CACHE_READ_RATIO = 0.1;

  function findPricing(modelId) {
    return PRICING_RULES.find((r) => r.pattern.test(modelId)) || null;
  }

  function costOf(modelId, usage) {
    const p = findPricing(modelId);
    if (!p) return null; // 未知モデルはコスト計上しない(注記を出す)
    return (
      (usage.input * p.input +
        usage.output * p.output +
        usage.cacheWrite * p.input * CACHE_WRITE_RATIO +
        usage.cacheRead * p.input * CACHE_READ_RATIO) /
      1_000_000
    );
  }

  // ---------- DOM 参照 ----------
  const $ = (sel) => document.querySelector(sel);
  const dirInput = $("#dir-input");
  const fileInput = $("#file-input");
  const dropzone = $("#dropzone");
  const demoButton = $("#demo-button");
  const loadStatus = $("#load-status");
  const results = $("#results");
  const tooltip = $("#chart-tooltip");

  // 解析済みデータ(再描画用に保持)
  let currentEntries = [];
  let currentMetric = "cost";

  // ---------- JSONL 解析 ----------
  // Claude Code のログ 1 行 = 1 イベント。type === "assistant" の行が
  // message.usage にトークン数を持つ。message.id + requestId で重複排除する。
  function parseJsonl(text, entries, seen) {
    let added = 0;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        continue; // 壊れた行は無視
      }
      const msg = obj.message;
      const usage = msg && msg.usage;
      if (obj.type !== "assistant" || !usage || !obj.timestamp) continue;
      const model = msg.model || "";
      if (!model || model === "<synthetic>") continue;

      if (msg.id && obj.requestId) {
        const key = `${msg.id}:${obj.requestId}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }

      const ts = new Date(obj.timestamp);
      if (Number.isNaN(ts.getTime())) continue;

      entries.push({
        date: localDateKey(ts),
        model,
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
        cacheWrite: usage.cache_creation_input_tokens || 0,
        cacheRead: usage.cache_read_input_tokens || 0,
      });
      added++;
    }
    return added;
  }

  function localDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function loadFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.name.endsWith(".jsonl"));
    if (files.length === 0) {
      loadStatus.textContent = ".jsonl ファイルが見つかりませんでした。";
      return;
    }
    loadStatus.textContent = `${files.length} 個のファイルを読み込み中…`;
    const entries = [];
    const seen = new Set();
    for (const file of files) {
      try {
        parseJsonl(await file.text(), entries, seen);
      } catch {
        // 読めないファイルはスキップ
      }
    }
    if (entries.length === 0) {
      loadStatus.textContent =
        "使用データが見つかりませんでした。~/.claude/projects/ 配下の JSONL ファイルを指定してください。";
      return;
    }
    loadStatus.textContent = `${files.length} ファイルから ${entries.length.toLocaleString()} 件の API リクエストを読み込みました。`;
    currentEntries = entries;
    render();
  }

  // ---------- 集計 ----------
  function aggregate(entries) {
    const daily = new Map(); // date -> usage 合計
    const byModel = new Map(); // model -> usage 合計
    const totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 };
    const unknownModels = new Set();

    for (const e of entries) {
      const cost = costOf(e.model, e);
      if (cost === null) unknownModels.add(e.model);

      for (const [map, key] of [
        [daily, e.date],
        [byModel, e.model],
      ]) {
        let acc = map.get(key);
        if (!acc) {
          acc = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, count: 0 };
          map.set(key, acc);
        }
        acc.input += e.input;
        acc.output += e.output;
        acc.cacheWrite += e.cacheWrite;
        acc.cacheRead += e.cacheRead;
        acc.cost += cost || 0;
        acc.count++;
      }

      totals.input += e.input;
      totals.output += e.output;
      totals.cacheWrite += e.cacheWrite;
      totals.cacheRead += e.cacheRead;
      totals.cost += cost || 0;
    }

    // 日付範囲を欠損日 0 で埋める(時系列の空白を正しく表現するため)
    const dates = [...daily.keys()].sort();
    const filled = [];
    if (dates.length > 0) {
      const start = new Date(dates[0] + "T00:00:00");
      const end = new Date(dates[dates.length - 1] + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = localDateKey(d);
        filled.push({
          date: key,
          ...(daily.get(key) || {
            input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, count: 0,
          }),
        });
      }
    }

    return { daily: filled, byModel, totals, unknownModels };
  }

  // ---------- フォーマッタ ----------
  const fmtUsd = (v) =>
    "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function fmtCompact(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(Math.round(v));
  }

  const fmtInt = (v) => Math.round(v).toLocaleString("ja-JP");

  // ---------- 描画 ----------
  function render() {
    const agg = aggregate(currentEntries);
    results.hidden = false;
    renderStats(agg);
    renderChart(agg.daily);
    renderDailyTable(agg.daily);
    renderModelTable(agg);
    renderPricingTable();
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderStats(agg) {
    const { totals, daily } = agg;
    const totalTokens =
      totals.input + totals.output + totals.cacheWrite + totals.cacheRead;
    const activeDays = daily.filter((d) => d.count > 0).length;
    const requests = currentEntries.length;

    $("#stat-cost").textContent = fmtUsd(totals.cost);
    $("#stat-cost-sub").textContent = "API 従量課金換算(推定)";
    $("#stat-tokens").textContent = fmtCompact(totalTokens);
    $("#stat-tokens-sub").textContent =
      `入力 ${fmtCompact(totals.input)} / 出力 ${fmtCompact(totals.output)} / キャッシュ ${fmtCompact(totals.cacheWrite + totals.cacheRead)}`;
    $("#stat-days").textContent = `${activeDays} 日`;
    $("#stat-days-sub").textContent = daily.length
      ? `${daily[0].date} 〜 ${daily[daily.length - 1].date}`
      : "";
    $("#stat-entries").textContent = fmtInt(requests);
    $("#stat-entries-sub").textContent = activeDays
      ? `1 日あたり平均 ${fmtInt(requests / activeDays)} 件`
      : "";
  }

  // 日別バーチャート(SVG 手描き・単一系列)
  function renderChart(daily) {
    const wrap = $("#chart");
    wrap.innerHTML = "";
    if (daily.length === 0) return;

    const isCost = currentMetric === "cost";
    $("#chart-title").textContent = isCost ? "日別の推定コスト" : "日別のトークン数";
    const valueOf = (d) =>
      isCost ? d.cost : d.input + d.output + d.cacheWrite + d.cacheRead;

    const M = { top: 16, right: 12, bottom: 28, left: 56 };
    const barGap = 2; // マーク間はサーフェス色の 2px ギャップ
    const idealBar = Math.min(
      24,
      Math.max(3, Math.floor((880 - M.left - M.right) / daily.length) - barGap)
    );
    const width = Math.max(
      640,
      M.left + M.right + daily.length * (idealBar + barGap)
    );
    const height = 260;
    const plotW = width - M.left - M.right;
    const plotH = height - M.top - M.bottom;

    const maxVal = Math.max(...daily.map(valueOf), isCost ? 0.01 : 1);
    const yMax = niceCeil(maxVal);
    const y = (v) => M.top + plotH - (v / yMax) * plotH;
    const slot = plotW / daily.length;

    const svg = el("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: "img",
      "aria-label": isCost ? "日別の推定コストの棒グラフ" : "日別のトークン数の棒グラフ",
    });

    // 水平グリッド線と Y 軸目盛り(きりのよい 4 分割)
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      const yy = y(v);
      svg.append(
        el("line", {
          x1: M.left, x2: width - M.right, y1: yy, y2: yy,
          stroke: i === 0 ? "var(--baseline)" : "var(--grid)",
          "stroke-width": 1,
        }),
        el("text", {
          x: M.left - 8, y: yy + 4,
          "text-anchor": "end",
          fill: "var(--text-muted)",
          "font-size": 11,
          style: "font-variant-numeric: tabular-nums",
        }, isCost ? "$" + (v >= 10 ? Math.round(v) : v.toFixed(v >= 1 ? 1 : 2)) : fmtCompact(v))
      );
    }

    // バー本体(上端 4px 丸め・ベースラインは直角)
    const maxIdx = daily.reduce(
      (best, d, i) => (valueOf(d) > valueOf(daily[best]) ? i : best), 0);

    daily.forEach((d, i) => {
      const v = valueOf(d);
      const bw = Math.min(24, slot - barGap);
      const x = M.left + i * slot + (slot - bw) / 2;
      const top = y(v);
      const h = Math.max(0, M.top + plotH - top);
      const r = Math.min(4, bw / 2, h);
      if (h > 0) {
        const path = `M ${x} ${top + r}
          a ${r} ${r} 0 0 1 ${r} ${-r}
          h ${bw - 2 * r}
          a ${r} ${r} 0 0 1 ${r} ${r}
          v ${h - r} h ${-bw} Z`;
        svg.append(
          el("path", {
            d: path,
            fill: "var(--series-1)",
            "data-index": i,
            class: "bar",
          })
        );
      }
      // ホバー用の透明ヒット領域(マークより大きく取る)
      svg.append(
        el("rect", {
          x: M.left + i * slot, y: M.top,
          width: slot, height: plotH,
          fill: "transparent",
          "data-index": i,
          class: "hit",
        })
      );
      // 最大値の日のみ直接ラベル(選択的ラベリング)
      if (i === maxIdx && v > 0) {
        svg.append(
          el("text", {
            x: x + bw / 2, y: top - 6,
            "text-anchor": "middle",
            fill: "var(--text-secondary)",
            "font-size": 11,
            "font-weight": 600,
          }, isCost ? fmtUsd(v) : fmtCompact(v))
        );
      }
    });

    // X 軸ラベル(重なりを避けて間引き)
    const labelEvery = Math.max(1, Math.ceil(daily.length / Math.floor(plotW / 64)));
    daily.forEach((d, i) => {
      if (i % labelEvery !== 0 && i !== daily.length - 1) return;
      svg.append(
        el("text", {
          x: M.left + i * slot + slot / 2,
          y: height - 8,
          "text-anchor": "middle",
          fill: "var(--text-muted)",
          "font-size": 11,
        }, d.date.slice(5).replace("-", "/"))
      );
    });

    // ツールチップ
    svg.addEventListener("mousemove", (ev) => {
      const t = ev.target.closest("[data-index]");
      if (!t) return hideTooltip();
      const d = daily[Number(t.dataset.index)];
      const tokens = d.input + d.output + d.cacheWrite + d.cacheRead;
      tooltip.innerHTML =
        `<div>${d.date}</div>` +
        `<div class="tt-value">${fmtUsd(d.cost)} ・ ${fmtCompact(tokens)} tokens</div>` +
        `<div>リクエスト ${fmtInt(d.count)} 件</div>`;
      tooltip.hidden = false;
      const pad = 12;
      let tx = ev.clientX + pad;
      let ty = ev.clientY + pad;
      const rect = tooltip.getBoundingClientRect();
      if (tx + rect.width > window.innerWidth - 8) tx = ev.clientX - rect.width - pad;
      if (ty + rect.height > window.innerHeight - 8) ty = ev.clientY - rect.height - pad;
      tooltip.style.left = tx + "px";
      tooltip.style.top = ty + "px";
    });
    svg.addEventListener("mouseleave", hideTooltip);

    wrap.append(svg);
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  // 上限をきりのよい数に切り上げる(1/2/2.5/5 × 10^n)
  function niceCeil(v) {
    const exp = Math.floor(Math.log10(v));
    const base = Math.pow(10, exp);
    for (const m of [1, 2, 2.5, 5, 10]) {
      if (v <= m * base) return m * base;
    }
    return 10 * base;
  }

  function renderDailyTable(daily) {
    const tbody = $("#daily-table tbody");
    tbody.innerHTML = "";
    for (const d of daily) {
      if (d.count === 0) continue;
      tbody.append(
        tr([
          d.date,
          num(d.input), num(d.output), num(d.cacheWrite), num(d.cacheRead),
          num(fmtUsd(d.cost)),
        ])
      );
    }
  }

  function renderModelTable(agg) {
    const tbody = $("#model-table tbody");
    tbody.innerHTML = "";
    const rows = [...agg.byModel.entries()].sort((a, b) => b[1].cost - a[1].cost);
    const totalCost = agg.totals.cost || 1;
    const maxSeries = 8;

    rows.forEach(([model, u], i) => {
      const seriesIdx = Math.min(i, maxSeries - 1) + 1;
      const share = (u.cost / totalCost) * 100;
      const row = tr([
        null,
        num(u.input), num(u.output), num(u.cacheWrite), num(u.cacheRead),
        num(fmtUsd(u.cost)),
        null,
      ]);
      // モデル名セル(スウォッチ + テキスト。テキストは系列色を着けない)
      const nameCell = row.cells[0];
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = `var(--series-${seriesIdx})`;
      nameCell.append(sw, document.createTextNode(model));
      // 構成比メーター
      const meterCell = row.cells[6];
      const meter = document.createElement("div");
      meter.className = "meter";
      const fill = document.createElement("span");
      fill.style.width = Math.max(share, 0.5) + "%";
      fill.style.background = `var(--series-${seriesIdx})`;
      meter.append(fill);
      meter.title = share.toFixed(1) + "%";
      const label = document.createElement("span");
      label.textContent = " " + share.toFixed(1) + "%";
      meterCell.append(meter, label);
      meterCell.style.display = "flex";
      meterCell.style.alignItems = "center";
      meterCell.style.gap = "8px";
      tbody.append(row);
    });

    const note = $("#unknown-models");
    if (agg.unknownModels.size > 0) {
      note.hidden = false;
      note.textContent =
        "※ 料金レート未定義のモデルはコスト $0.00 として集計しています: " +
        [...agg.unknownModels].join(", ");
    } else {
      note.hidden = true;
    }
  }

  function renderPricingTable() {
    const tbody = $("#pricing-table tbody");
    tbody.innerHTML = "";
    for (const p of PRICING_RULES) {
      tbody.append(
        tr([
          p.label,
          num(fmtUsd(p.input)), num(fmtUsd(p.output)),
          num(fmtUsd(p.input * CACHE_WRITE_RATIO)),
          num(fmtUsd(p.input * CACHE_READ_RATIO)),
        ])
      );
    }
  }

  // ---------- DOM ヘルパー ----------
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      node.setAttribute(k, v);
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function tr(cells) {
    const row = document.createElement("tr");
    for (const c of cells) {
      const td = document.createElement("td");
      if (c && typeof c === "object" && c.numeric) {
        td.className = "num";
        td.textContent = c.value;
      } else if (c !== null) {
        td.textContent = typeof c === "number" ? fmtInt(c) : c;
      }
      row.append(td);
    }
    return row;
  }

  const num = (v) => ({
    numeric: true,
    value: typeof v === "number" ? fmtInt(v) : v,
  });

  // ---------- イベント ----------
  dirInput.addEventListener("change", () => loadFiles(dirInput.files));
  fileInput.addEventListener("change", () => loadFiles(fileInput.files));

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput.click();
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const files = await collectDroppedFiles(e.dataTransfer);
    loadFiles(files);
  });

  // ドロップされたフォルダを再帰的に走査して File を集める
  async function collectDroppedFiles(dataTransfer) {
    const out = [];
    const entries = [...dataTransfer.items]
      .map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry())
      .filter(Boolean);
    if (entries.length === 0) return [...dataTransfer.files];

    async function walk(entry) {
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        out.push(file);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          for (const child of batch) await walk(child);
        } while (batch.length > 0);
      }
    }
    for (const entry of entries) await walk(entry);
    return out;
  }

  document.querySelectorAll('input[name="metric"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      currentMetric = radio.value;
      if (currentEntries.length > 0) {
        const agg = aggregate(currentEntries);
        renderChart(agg.daily);
      }
    });
  });

  // ---------- サンプルデータ ----------
  demoButton.addEventListener("click", () => {
    const models = [
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
    ];
    const entries = [];
    const today = new Date();
    for (let back = 29; back >= 0; back--) {
      const d = new Date(today);
      d.setDate(d.getDate() - back);
      if (d.getDay() === 0 && back % 3 === 0) continue; // 使わない日も混ぜる
      const requests = 5 + Math.floor(Math.random() * 40);
      for (let i = 0; i < requests; i++) {
        const model = models[Math.random() < 0.6 ? 0 : Math.random() < 0.7 ? 1 : 2];
        entries.push({
          date: localDateKey(d),
          model,
          input: Math.floor(500 + Math.random() * 4000),
          output: Math.floor(200 + Math.random() * 2500),
          cacheWrite: Math.floor(Math.random() * 30000),
          cacheRead: Math.floor(Math.random() * 200000),
        });
      }
    }
    currentEntries = entries;
    loadStatus.textContent =
      "サンプルデータを表示しています(実際のログではありません)。";
    render();
  });
})();

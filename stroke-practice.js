const SVG_NS = "http://www.w3.org/2000/svg";
const strokeModelCache = new Map();
const PASS_THRESHOLD = 0.72;
const RESAMPLE_POINTS = 32;
const MAX_DIRECTION_ANGLE = 45;
let activePractice = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function svgNode(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function parsePointText(node) {
  const transform = node.getAttribute("transform") || "";
  const matrix = transform.match(/matrix\(([^)]+)\)/i);
  if (matrix) {
    const values = matrix[1].trim().split(/[\s,]+/).map(Number);
    if (values.length === 6 && values.every(Number.isFinite)) return { x: values[4], y: values[5] };
  }
  const translate = transform.match(/translate\(\s*([+-]?[\d.]+)(?:[\s,]+([+-]?[\d.]+))?/i);
  return translate ? { x: Number(translate[1]), y: Number(translate[2] || 0) } : null;
}

function sampleCanonicalPaths(parsedSvg, viewBox) {
  const measuringSvg = svgNode("svg", { viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}` });
  measuringSvg.setAttribute("aria-hidden", "true");
  measuringSvg.style.cssText = "position:fixed;left:-2000px;top:-2000px;width:109px;height:109px;visibility:hidden;pointer-events:none";
  document.body.append(measuringSvg);
  try {
    return parsedSvg.map((stroke, index) => {
      const path = svgNode("path", { d: stroke.d });
      measuringSvg.append(path);
      const length = path.getTotalLength();
      if (!Number.isFinite(length) || length <= 0) throw new Error(`Không đọc được dữ liệu nét ${index + 1}.`);
      const points = [];
      const sampleCount = Math.max(40, Math.min(240, Math.ceil(length * 1.4)));
      for (let step = 0; step <= sampleCount; step++) {
        const point = path.getPointAtLength(length * step / sampleCount);
        points.push({ x: point.x, y: point.y });
      }
      path.remove();
      return { ...stroke, length, points };
    });
  } finally {
    measuringSvg.remove();
  }
}

function parseKanjiSvg(svgText, character, expectedStrokeCount) {
  if (/<(?:script|foreignObject|iframe|object|image|use)\b/i.test(svgText) || /\bon[a-z]+\s*=/i.test(svgText)) {
    throw new Error("Tệp thứ tự nét chứa nội dung không được hỗ trợ.");
  }
  let source = svgText
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[^?]*\?>\s*/i, "")
    .replace(/<!DOCTYPE[\s\S]*?\]\s*>\s*/i, "");
  if (!/\bxmlns:kvg\s*=/.test(source)) source = source.replace(/<svg\b/i, '<svg xmlns:kvg="http://kanjivg.tagaini.net"');
  const documentSvg = new DOMParser().parseFromString(source, "image/svg+xml");
  if (documentSvg.querySelector("parsererror")) throw new Error("Tệp thứ tự nét không đọc được.");
  const root = documentSvg.querySelector("svg");
  const box = (root?.getAttribute("viewBox") || "0 0 109 109").trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error("Khung tọa độ thứ tự nét không hợp lệ.");
  const viewBox = { x: box[0], y: box[1], width: box[2], height: box[3] };
  const strokeGroup = [...documentSvg.querySelectorAll("g")].find(group => (group.getAttribute("id") || "").startsWith("kvg:StrokePaths_"));
  if (!strokeGroup) throw new Error(`Không tìm thấy thứ tự nét cho chữ ${character}.`);
  const paths = [...strokeGroup.querySelectorAll("path")].map(path => {
    const id = path.getAttribute("id") || "";
    const match = id.match(/-s(\d+)$/);
    const d = path.getAttribute("d") || "";
    return { index: match ? Number(match[1]) : 0, id, d };
  }).filter(path => path.d);
  if (!paths.length || paths.some((path, index) => path.index !== index + 1)) throw new Error(`Thứ tự nét của ${character} bị thiếu hoặc sai số thứ tự.`);
  if (expectedStrokeCount && paths.length !== expectedStrokeCount) throw new Error(`Số nét mẫu của ${character} không khớp dữ liệu bài học.`);
  const numberGroup = [...documentSvg.querySelectorAll("g")].find(group => (group.getAttribute("id") || "").startsWith("kvg:StrokeNumbers_"));
  const numbers = numberGroup ? [...numberGroup.querySelectorAll("text")].map(node => {
    const position = parsePointText(node);
    return position ? { ...position, text: (node.textContent || "").trim() } : null;
  }).filter(Boolean) : [];
  return { character, viewBox, strokes: sampleCanonicalPaths(paths, viewBox), numbers };
}

function loadStrokeModel(character, source, expectedStrokeCount = 0) {
  const cacheKey = `${source}:${expectedStrokeCount}`;
  if (strokeModelCache.has(cacheKey)) return strokeModelCache.get(cacheKey);
  const request = fetch(new URL(source, import.meta.url), { cache: "force-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`Không tải được dữ liệu nét (${response.status}).`);
      return response.text();
    })
    .then(text => parseKanjiSvg(text, character, expectedStrokeCount))
    .catch(error => {
      strokeModelCache.delete(cacheKey);
      throw error;
    });
  strokeModelCache.set(cacheKey, request);
  return request;
}

function paintPreview(root, model) {
  const canvas = root.querySelector(".kanji-stroke-mini-canvas");
  if (!canvas) return;
  const { x, y, width, height } = model.viewBox;
  const svg = svgNode("svg", { viewBox: `${x} ${y} ${width} ${height}`, focusable: "false", "aria-hidden": "true" });
  const grid = svgNode("g", { class: "kanji-stroke-grid" });
  grid.append(
    svgNode("line", { x1: x, y1: y + height / 2, x2: x + width, y2: y + height / 2 }),
    svgNode("line", { x1: x + width / 2, y1: y, x2: x + width / 2, y2: y + height })
  );
  svg.append(grid);
  const paths = model.strokes.map(stroke => {
    const path = svgNode("path", { d: stroke.d, class: "kanji-stroke-preview-path", "stroke-linecap": "round", "stroke-linejoin": "round" });
    path.dataset.strokeIndex = String(stroke.index);
    path.dataset.pathLength = String(stroke.length);
    path.setAttribute("stroke-dasharray", String(stroke.length));
    svg.append(path);
    return path;
  });
  const numbers = svgNode("g", { class: "kanji-stroke-preview-numbers" });
  model.numbers.forEach((number, index) => {
    const label = svgNode("text", { x: number.x, y: number.y, class: "kanji-stroke-preview-number", "data-stroke-number": index + 1, "font-size": Math.max(5, width * .073), "text-anchor": "middle" });
    label.textContent = number.text || String(index + 1);
    numbers.append(label);
  });
  svg.append(numbers);
  canvas.replaceChildren(svg);
  root._kanjiStrokePaths = paths;
  root._kanjiStrokeTimer = null;
  root._kanjiStrokeRaf = null;
  root._kanjiStrokeStatus = root.querySelector("[data-stroke-status]");
  setPreviewState(root, -1, 1, false);
}

function stopPreview(root) {
  if (root._kanjiStrokeRaf !== null && root._kanjiStrokeRaf !== undefined) cancelAnimationFrame(root._kanjiStrokeRaf);
  if (root._kanjiStrokeTimer) clearTimeout(root._kanjiStrokeTimer);
  root._kanjiStrokeRaf = null;
  root._kanjiStrokeTimer = null;
}

function setPreviewState(root, activeIndex = -1, progress = 1, animate = false) {
  const paths = root._kanjiStrokePaths || [];
  paths.forEach((path, index) => {
    const length = Number(path.dataset.pathLength) || 1;
    const isCurrent = index === activeIndex;
    if (animate && isCurrent) {
      path.style.stroke = "#2878e3";
      path.style.opacity = "1";
      path.setAttribute("stroke-dashoffset", String(length * (1 - progress)));
    } else if (animate && index > activeIndex) {
      path.style.stroke = "#d7e1ed";
      path.style.opacity = ".55";
      path.setAttribute("stroke-dashoffset", String(length));
    } else {
      path.style.stroke = index <= activeIndex || !animate ? "#334155" : "#d7e1ed";
      path.style.opacity = index <= activeIndex || !animate ? ".95" : ".45";
      path.setAttribute("stroke-dashoffset", index <= activeIndex || !animate ? "0" : String(length));
    }
  });
  root.querySelectorAll(".kanji-stroke-preview-number").forEach((number, index) => {
    number.style.opacity = index <= activeIndex ? "1" : "0";
  });
}

function replayPreview(root) {
  const paths = root._kanjiStrokePaths || [];
  if (!paths.length) return;
  stopPreview(root);
  const status = root._kanjiStrokeStatus;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reducedMotion) {
    setPreviewState(root, paths.length - 1, 1, false);
    if (status) status.textContent = `Thứ tự nét chữ ${root.dataset.strokeCharacter} đã hiển thị.`;
    return;
  }
  setPreviewState(root, 0, 0, true);
  let index = 0;
  const runStep = () => {
    const path = paths[index];
    if (!path) {
      setPreviewState(root, paths.length - 1, 1, false);
      if (status) status.textContent = `Đã xem xong ${paths.length} nét của chữ ${root.dataset.strokeCharacter}.`;
      return;
    }
    const length = Number(path.dataset.pathLength) || 1;
    const start = performance.now();
    const draw = now => {
      const progress = Math.min(1, (now - start) / 390);
      setPreviewState(root, index, progress, true);
      if (progress < 1) {
        root._kanjiStrokeRaf = requestAnimationFrame(draw);
      } else {
        if (status) status.textContent = `Nét ${index + 1} / ${paths.length}`;
        index += 1;
        root._kanjiStrokeTimer = window.setTimeout(runStep, 75);
      }
    };
    path.setAttribute("stroke-dasharray", String(length));
    root._kanjiStrokeRaf = requestAnimationFrame(draw);
  };
  runStep();
}

export function mountKanjiStrokePreviews(root = document) {
  root.querySelectorAll("[data-stroke-preview]").forEach(preview => {
    if (preview.dataset.strokeMounted) return;
    preview.dataset.strokeMounted = "true";
    const replay = preview.querySelector("[data-stroke-replay]");
    const character = preview.dataset.strokeCharacter || "";
    const source = preview.dataset.strokeSrc || "";
    preview._kanjiStrokeStatus = preview.querySelector("[data-stroke-status]");
    if (replay) replay.addEventListener("click", () => replayPreview(preview));
    if (!source) {
      if (preview._kanjiStrokeStatus) preview._kanjiStrokeStatus.textContent = "Chưa có dữ liệu thứ tự nét.";
      return;
    }
    loadStrokeModel(character, source, Number(preview.dataset.strokeCount) || 0)
      .then(model => {
        if (!preview.isConnected) return;
        paintPreview(preview, model);
        if (replay) replay.disabled = false;
        if (preview._kanjiStrokeStatus) preview._kanjiStrokeStatus.textContent = `${model.strokes.length} nét. Chạm nút phát để xem thứ tự.`;
      })
      .catch(error => {
        if (!preview.isConnected) return;
        if (preview._kanjiStrokeStatus) preview._kanjiStrokeStatus.textContent = error.message || "Không tải được thứ tự nét.";
        preview.classList.add("has-stroke-error");
      });
  });
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += distance(points[index - 1], points[index]);
  return length;
}

function resample(points, targetCount = RESAMPLE_POINTS) {
  if (!points.length) return [];
  if (points.length === 1) return Array.from({ length: targetCount }, () => ({ ...points[0] }));
  const total = pathLength(points);
  if (!total) return Array.from({ length: targetCount }, () => ({ ...points[0] }));
  const interval = total / (targetCount - 1);
  const result = [{ ...points[0] }];
  let covered = 0;
  let next = interval;
  let sourceIndex = 0;
  while (result.length < targetCount - 1 && sourceIndex < points.length - 1) {
    const start = points[sourceIndex];
    const end = points[sourceIndex + 1];
    const segment = distance(start, end);
    if (!segment) { sourceIndex += 1; continue; }
    if (covered + segment >= next) {
      const ratio = (next - covered) / segment;
      result.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
      next += interval;
    } else {
      covered += segment;
      sourceIndex += 1;
    }
  }
  while (result.length < targetCount) result.push({ ...points[points.length - 1] });
  return result;
}

function averagePoint(points) {
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
}

function bounds(points) {
  return points.reduce((box, point) => ({ minX: Math.min(box.minX, point.x), minY: Math.min(box.minY, point.y), maxX: Math.max(box.maxX, point.x), maxY: Math.max(box.maxY, point.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function direction(points) {
  const start = points[0];
  const end = points[points.length - 1];
  const length = distance(start, end) || 1;
  return { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
}

function compareStroke(userPoints, standardPoints, viewBox) {
  if (!standardPoints?.length) return { pass: false, score: 0, errors: [], available: false };
  const clamp = point => ({ x: Math.max(viewBox.x, Math.min(viewBox.x + viewBox.width, point.x)) / viewBox.width, y: Math.max(viewBox.y, Math.min(viewBox.y + viewBox.height, point.y)) / viewBox.height });
  const user = resample(userPoints.slice(0, 256).map(clamp));
  const standard = resample(standardPoints.slice(0, 256).map(clamp));
  const userLength = pathLength(user);
  const standardLength = pathLength(standard);
  const isDot = standardLength < .06;
  const errors = [];
  let directionScore = 1;
  let directionPassed = true;
  if (!isDot && userLength >= .03 && standardLength >= .03) {
    const a = direction(user);
    const b = direction(standard);
    const angle = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180 / Math.PI;
    if (angle > MAX_DIRECTION_ANGLE) { directionPassed = false; errors.push("DIRECTION"); directionScore = Math.max(0, 1 - angle / 180); }
    else directionScore = Math.max(0, 1 - angle / (MAX_DIRECTION_ANGLE * 1.5));
  }
  const startDistance = distance(user[0], standard[0]);
  const endDistance = distance(user[user.length - 1], standard[standard.length - 1]);
  if (startDistance > (isDot ? .18 : .12) || endDistance > (isDot ? .18 : .12)) errors.push("START_END");
  const startEndScore = Math.max(0, 1 - (startDistance + endDistance) / 2 / .35);
  const userBox = bounds(user);
  const standardBox = bounds(standard);
  const userCenter = { x: (userBox.minX + userBox.maxX) / 2, y: (userBox.minY + userBox.maxY) / 2 };
  const standardCenter = { x: (standardBox.minX + standardBox.maxX) / 2, y: (standardBox.minY + standardBox.maxY) / 2 };
  const positionDistance = (distance(averagePoint(user), averagePoint(standard)) + distance(userCenter, standardCenter)) / 2;
  const positionScore = Math.max(0, 1 - positionDistance / .3);
  if (positionDistance > .20) errors.push("POSITION");
  const lengthRatio = Math.min(userLength, standardLength) / Math.max(userLength, standardLength, .001);
  const lengthScore = isDot && Math.abs(userLength - standardLength) < .05 ? Math.max(lengthRatio, .9) : lengthRatio;
  if (!isDot && lengthRatio < .45) errors.push("LENGTH");
  const shapeDistance = user.reduce((sum, point, index) => sum + distance(point, standard[index]), 0) / RESAMPLE_POINTS;
  const shapeScore = Math.max(0, 1 - shapeDistance / .25);
  if (!isDot && shapeScore < .55) errors.push("SHAPE");
  const score = shapeScore * .45 + positionScore * .2 + startEndScore * .15 + directionScore * .15 + lengthScore * .05;
  return { pass: directionPassed && score >= PASS_THRESHOLD, score: Math.round(score * 100) / 100, errors, available: true };
}

function compareCharacter(userStrokes, model) {
  const expected = model.strokes.map(stroke => stroke.points);
  const results = [];
  const limit = Math.min(userStrokes.length, expected.length);
  for (let index = 0; index < limit; index += 1) results.push(compareStroke(userStrokes[index], expected[index], model.viewBox));
  for (let index = limit; index < Math.max(userStrokes.length, expected.length); index += 1) results.push({ pass: false, score: 0, errors: ["LENGTH"], available: true });
  const score = results.length ? results.reduce((sum, result) => sum + result.score, 0) / results.length : 0;
  const countCorrect = userStrokes.length === expected.length;
  return { pass: countCorrect && results.every(result => result.pass) && score >= PASS_THRESHOLD, countCorrect, score: Math.round(score * 100) / 100, strokes: results };
}

function pointsToPath(points) {
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function renderBoard(instance) {
  const model = instance.model;
  if (!model) return `<div class="writing-board-loading" role="status">${escapeHtml(instance.error || "Đang tải dữ liệu nét viết…")}</div>`;
  const { x, y, width, height } = model.viewBox;
  const drawing = instance.drawn.map(points => `<path class="writing-user-stroke" d="${escapeHtml(pointsToPath(points))}"/>`).join("");
  const live = instance.current.length ? `<path class="writing-user-stroke writing-user-live" data-writing-live d="${escapeHtml(pointsToPath(instance.current))}"/>` : `<path class="writing-user-stroke writing-user-live" data-writing-live d=""/>`;
  const guidedStroke = instance.mode === "guided" ? model.strokes[instance.guidedIndex] : null;
  const guide = guidedStroke ? `<path class="writing-guide-stroke" d="${escapeHtml(guidedStroke.d)}"/>` : "";
  const activeNumber = instance.mode === "guided" && instance.guidedIndex < model.strokes.length ? model.numbers[instance.guidedIndex] : null;
  const guideNumbers = activeNumber ? `<text x="${activeNumber.x}" y="${activeNumber.y}" class="writing-stroke-number">${escapeHtml(activeNumber.text || instance.guidedIndex + 1)}</text>` : "";
  const faintGlyph = instance.mode === "free" && instance.showFaintGlyph ? `<text class="writing-faint-glyph" x="${x + width / 2}" y="${y + height * .72}" text-anchor="middle">${escapeHtml(instance.character)}</text>` : "";
  return `<svg class="writing-practice-board" data-writing-board viewBox="${x} ${y} ${width} ${height}" role="application" aria-label="Bảng luyện viết chữ ${escapeHtml(instance.character)}" aria-describedby="writing-board-instructions" tabindex="0"><g class="writing-board-grid"><line x1="${x}" y1="${y + height / 2}" x2="${x + width}" y2="${y + height / 2}"/><line x1="${x + width / 2}" y1="${y}" x2="${x + width / 2}" y2="${y + height}"/></g>${faintGlyph}${drawing}${guide}${live}${guideNumbers}</svg>`;
}

function errorLabels(errors = []) {
  const labels = { DIRECTION: "sai hướng nét", POSITION: "lệch vị trí", START_END: "điểm đầu hoặc cuối chưa đúng", SHAPE: "hình dạng nét chưa khớp", LENGTH: "độ dài nét chưa khớp" };
  return errors.map(error => labels[error] || error).join(" · ");
}

function progressMessage(instance) {
  const total = instance.model?.strokes.length || instance.expectedStrokeCount;
  if (instance.mode === "guided") return instance.guidedIndex >= total ? "Hoàn thành tất cả nét hướng dẫn." : `Nét ${instance.guidedIndex + 1} / ${total}`;
  if (instance.mode === "blind") return `Đã vẽ ${instance.drawn.length} / ${total} nét.`;
  return "Bảng vẽ tự do · không chấm điểm";
}

function resultMarkup(result) {
  if (!result) return "";
  const label = result.pass ? "Đạt" : "Chưa đạt";
  const rows = result.strokes.map((stroke, index) => `<li><span>Nét ${index + 1}</span><b class="${stroke.pass ? "is-pass" : "is-fail"}">${stroke.pass ? `Đạt · ${Math.round(stroke.score * 100)}%` : `Cần sửa${stroke.errors.length ? ` · ${errorLabels(stroke.errors)}` : ""}`}</b></li>`).join("");
  return `<section class="writing-result" role="status"><div class="writing-result-heading ${result.pass ? "is-pass" : "is-fail"}"><b>${label} · ${Math.round(result.score * 100)}%</b>${result.countCorrect ? "" : `<span>Số nét đã vẽ chưa khớp mẫu.</span>`}</div><ol>${rows}</ol></section>`;
}

function renderPractice(instance, keepModeFocus = false) {
  const dialog = instance.dialog;
  const total = instance.model?.strokes.length || instance.expectedStrokeCount;
  const labels = ["Có hướng dẫn", "Tự viết", "Tự do"];
  const modes = ["guided", "blind", "free"];
  const hints = {
    guided: "Đồ theo nét mờ. Vẽ đúng nét hiện tại để tự chuyển sang bước kế tiếp.",
    blind: "Tự viết chữ theo đúng thứ tự, sau đó kiểm tra các nét đã vẽ.",
    free: "Tập viết tự do bằng chuột, bút cảm ứng hoặc chạm màn hình. Chế độ này không chấm điểm."
  };
  const modeTabs = modes.map((mode, index) => `<button type="button" class="writing-mode-button ${instance.mode === mode ? "active" : ""}" data-writing-mode="${mode}" aria-pressed="${instance.mode === mode}">${labels[index]}</button>`).join("");
  const currentFeedback = instance.feedback
    ? `<div class="writing-feedback ${instance.feedback.pass ? "is-pass" : "is-fail"}" role="status">${instance.feedback.pass ? "✓ Nét viết đạt chuẩn. Tiếp tục nét tiếp theo." : `✕ ${errorLabels(instance.feedback.errors) || "Nét này chưa khớp mẫu, hãy thử lại."}`}</div>`
    : instance.mode === "guided" && instance.guidedIndex >= total && total ? `<div class="writing-feedback is-pass" role="status">✓ Đã hoàn thành tất cả nét.</div>` : "";
  const showFreeToggle = instance.mode === "free" ? `<label class="writing-hint-toggle"><input type="checkbox" data-writing-hint-toggle ${instance.showFaintGlyph ? "checked" : ""}/><span>Hiện chữ mẫu mờ</span></label>` : "";
  const undoDisabled = instance.drawn.length === 0 ? "disabled" : "";
  const checkButton = instance.mode === "blind" ? `<button class="button button-primary" type="button" data-writing-action="check" ${instance.drawn.length ? "" : "disabled"}>Kiểm tra</button>` : "";
  const result = instance.mode === "blind" ? resultMarkup(instance.blindResult) : "";
  const countLabel = instance.model ? `${total} nét` : "Đang tải…";
  dialog.innerHTML = `<div class="writing-dialog-content"><button class="writing-dialog-close" type="button" data-writing-close aria-label="Đóng luyện viết">×</button><header class="writing-dialog-heading"><span class="section-kicker">KANJI CORE · ${escapeHtml(instance.character)}</span><h2>Luyện viết <span lang="ja">${escapeHtml(instance.character)}</span></h2><p>Luyện nét trực tiếp trên thiết bị · Không lưu bài viết lên máy chủ</p></header><div class="writing-mode-tabs" role="group" aria-label="Chế độ luyện viết">${modeTabs}</div><div class="writing-practice-layout"><section class="writing-board-column"><div class="writing-progress-row"><b data-writing-progress>${escapeHtml(progressMessage(instance))}</b><span>${countLabel}</span></div>${renderBoard(instance)}<p id="writing-board-instructions" class="visually-hidden">Vẽ nét bằng chuột, bút cảm ứng hoặc chạm. Dùng nút hoàn tác để xóa nét vừa vẽ.</p>${currentFeedback}</section><aside class="writing-control-column"><p class="writing-mode-hint">${hints[instance.mode]}</p>${showFreeToggle}<div class="writing-action-row">${checkButton}<button class="button button-outline" type="button" data-writing-action="undo" ${undoDisabled}>Hoàn tác</button><button class="button button-outline" type="button" data-writing-action="clear">Xóa bảng</button></div>${result}<div class="writing-local-note"><b>${escapeHtml(progressMessage(instance))}</b><span>Phản hồi chạy trong trình duyệt bằng dữ liệu nét KanjiVG.</span></div><a class="writing-source-link" href="https://github.com/KanjiVG/kanjivg" target="_blank" rel="noopener noreferrer">Nguồn thứ tự nét: KanjiVG</a></aside></div></div>`;
  if (keepModeFocus) dialog.querySelector(`[data-writing-mode="${instance.mode}"]`)?.focus();
}

function bindPracticeDialog(dialog) {
  if (dialog.dataset.writingBound) return;
  dialog.dataset.writingBound = "true";
  dialog.addEventListener("close", () => {
    if (activePractice?.raf) cancelAnimationFrame(activePractice.raf);
    const trigger = activePractice?.trigger;
    activePractice = null;
    window.setTimeout(() => trigger?.focus?.(), 0);
  });
  dialog.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest("button, [data-writing-action]") : null;
    const instance = activePractice;
    if (!instance) return;
    if (event.target === dialog || target?.hasAttribute("data-writing-close")) { dialog.close(); return; }
    if (target?.dataset.writingMode) {
      instance.mode = target.dataset.writingMode;
      instance.drawn = [];
      instance.current = [];
      instance.guidedIndex = 0;
      instance.feedback = null;
      instance.blindResult = null;
      renderPractice(instance, true);
      return;
    }
    if (target?.dataset.writingAction === "clear") {
      instance.drawn = [];
      instance.current = [];
      instance.guidedIndex = 0;
      instance.feedback = null;
      instance.blindResult = null;
      renderPractice(instance);
      return;
    }
    if (target?.dataset.writingAction === "undo") {
      if (instance.drawn.length) instance.drawn.pop();
      if (instance.mode === "guided") instance.guidedIndex = Math.max(0, instance.guidedIndex - 1);
      instance.feedback = null;
      instance.blindResult = null;
      renderPractice(instance);
      return;
    }
    if (target?.dataset.writingAction === "check" && instance.model) {
      instance.blindResult = compareCharacter(instance.drawn, instance.model);
      renderPractice(instance);
    }
  });
  dialog.addEventListener("change", event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-writing-hint-toggle]") || !activePractice) return;
    activePractice.showFaintGlyph = target.checked;
    renderPractice(activePractice);
  });
  dialog.addEventListener("pointerdown", event => {
    const instance = activePractice;
    const board = event.target instanceof Element ? event.target.closest("[data-writing-board]") : null;
    if (!instance || !board || !instance.model || instance.mode === "guided" && instance.guidedIndex >= instance.model.strokes.length) return;
    event.preventDefault();
    instance.drawing = true;
    instance.pointerId = event.pointerId;
    instance.current = [pointFromPointer(event, board, instance.model.viewBox)];
    try { board.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
    updateLiveStroke(instance);
  });
  dialog.addEventListener("pointermove", event => {
    const instance = activePractice;
    if (!instance?.drawing || event.pointerId !== instance.pointerId) return;
    const board = dialog.querySelector("[data-writing-board]");
    if (!board) return;
    event.preventDefault();
    instance.current.push(pointFromPointer(event, board, instance.model.viewBox));
    if (instance.current.length > 256) instance.current = instance.current.filter((_, index) => index % 2 === 0);
    updateLiveStroke(instance);
  });
  const endDrawing = event => {
    const instance = activePractice;
    if (!instance?.drawing || event.pointerId !== instance.pointerId) return;
    instance.drawing = false;
    const board = dialog.querySelector("[data-writing-board]");
    if (board && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) instance.current.push(pointFromPointer(event, board, instance.model.viewBox));
    const stroke = instance.current.length === 1 ? [instance.current[0], { ...instance.current[0] }] : instance.current;
    instance.current = [];
    if (!stroke.length) return;
    if (instance.mode === "free") {
      instance.drawn.push(stroke);
      instance.feedback = null;
    } else if (instance.mode === "blind") {
      if (instance.drawn.length < Math.min(instance.model.strokes.length + 2, 64)) instance.drawn.push(stroke);
      instance.blindResult = null;
    } else {
      const expected = instance.model.strokes[instance.guidedIndex];
      const result = compareStroke(stroke, expected.points, instance.model.viewBox);
      instance.feedback = result;
      if (result.pass) {
        instance.drawn.push(stroke);
        instance.guidedIndex += 1;
      }
    }
    renderPractice(instance);
  };
  dialog.addEventListener("pointerup", endDrawing);
  dialog.addEventListener("pointercancel", endDrawing);
  dialog.addEventListener("lostpointercapture", endDrawing);
}

function pointFromPointer(event, board, viewBox) {
  const rect = board.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: viewBox.x + Math.max(0, Math.min(1, (event.clientX - rect.left) / width)) * viewBox.width,
    y: viewBox.y + Math.max(0, Math.min(1, (event.clientY - rect.top) / height)) * viewBox.height
  };
}

function updateLiveStroke(instance) {
  const path = instance.dialog.querySelector("[data-writing-live]");
  if (path) path.setAttribute("d", pointsToPath(instance.current));
}

export async function openKanjiWritingPractice({ character, source, expectedStrokeCount = 0, trigger }) {
  const dialog = document.querySelector("#kanji-writing-dialog");
  if (!dialog || !character || !source) return;
  if (dialog.open) dialog.close();
  const instance = {
    dialog, character, source, expectedStrokeCount, trigger,
    mode: "guided", model: null, error: "", drawn: [], current: [], guidedIndex: 0,
    feedback: null, blindResult: null, showFaintGlyph: false, drawing: false
  };
  activePractice = instance;
  bindPracticeDialog(dialog);
  renderPractice(instance);
  if (!dialog.open) dialog.showModal();
  try {
    instance.model = await loadStrokeModel(character, source, expectedStrokeCount);
    if (activePractice !== instance) return;
    renderPractice(instance);
  } catch (error) {
    if (activePractice !== instance) return;
    instance.error = error.message || "Không thể tải dữ liệu nét viết.";
    renderPractice(instance);
  }
}

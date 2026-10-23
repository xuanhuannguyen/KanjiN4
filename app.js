import { mountKanjiStrokePreviews, openKanjiWritingPractice } from "./stroke-practice.js";

const DATA_URL = new URL("./data/lessons.json", import.meta.url);
const FLASHCARD_KANJI_URL = new URL("./data/flashcard-kanji.json", import.meta.url);
const STORAGE_KEY = "kanji-n4-study-v1";
const app = document.querySelector("#app");

const FIRST_LESSON_HINTS = {
  "住": "Người 亻 có một mái nhà để làm chủ 主 — đó là nơi mình sống.",
  "所": "Một cánh cửa 戸 mở ra một nơi chốn để ta bước vào.",
  "京": "Hãy hình dung những mái nhà xếp quanh tháp lớn của kinh đô.",
  "都": "Nơi tập trung người dân và phố xá — một đô thị, thủ đô.",
  "府": "Tòa nhà rộng của chính quyền phủ, nơi giấy tờ được lưu giữ.",
  "県": "Một vùng đất được chia ranh giới để quản lý: tỉnh.",
  "市": "Những quầy hàng tụ họp trên phố thành một khu chợ, một thành phố.",
  "区": "Một đường ranh chia đô thị thành từng khu vực nhỏ.",
  "町": "Một con phố có nhà cửa hai bên — thị trấn hoặc khu phố.",
  "村": "Những mái nhà nhỏ quây quanh một cộng đồng làng quê."
};

let lessons = [];
let allCore = [];
let allVocab = [];
let coreById = new Map();
let vocabById = new Map();
let coreByCharacter = new Map();
let flashcardKanjiByCharacter = new Map();
let progress = loadProgress();
let route = routeFromHash();
let selectedCoreId = null;
let lessonTab = "core";
let vocabFilter = "all";
let vocabLimit = 72;
let vocabSearch = "";
let lessonSearch = "";
let vocabCardPages = new Map();
let flashcardState = {
  mode: "flashcard",
  domain: "core",
  index: 0,
  order: null,
  direction: "kanji-to-meaning",
  flipped: false,
  mastered: new Set(),
  review: new Set(),
  quiz: null,
  match: null
};
let testState = { started: false, submitted: false, questions: [], answers: {}, index: 0 };
let toastTimer = null;

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      knownCore: Array.isArray(saved.knownCore) ? saved.knownCore : [],
      knownVocab: Array.isArray(saved.knownVocab) ? saved.knownVocab : [],
      studyDays: Array.isArray(saved.studyDays) ? saved.studyDays : [],
      lastStudyDate: saved.lastStudyDate || "",
      streak: Number(saved.streak) || 0,
      lastLesson: Number(saved.lastLesson) || 1,
      gamesPlayed: Number(saved.gamesPlayed) || 0,
      bestScores: saved.bestScores && typeof saved.bestScores === "object" ? saved.bestScores : {}
    };
  } catch {
    return { knownCore: [], knownVocab: [], studyDays: [], lastStudyDate: "", streak: 0, lastLesson: 1, gamesPlayed: 0, bestScores: {} };
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recordStudy() {
  const today = dateKey();
  if (progress.lastStudyDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    progress.streak = progress.lastStudyDate === dateKey(yesterday) ? progress.streak + 1 : 1;
    progress.lastStudyDate = today;
    progress.studyDays = [...new Set([...progress.studyDays, today])].slice(-90);
    saveProgress();
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function stripReading(value = "") {
  return value.replace(/[\s　]/g, "").replace(/[()（）]/g, "").toLowerCase();
}

function routeFromHash() {
  const [view, param, domainParam] = window.location.hash.replace(/^#\/?/, "").split("/");
  if (view === "kanji" && param) return { view: "kanji-detail", coreId: param };
  if (view === "lesson" && Number(param) >= 1 && Number(param) <= 20) return { view: "lesson", lesson: Number(param) };
  if (view === "flashcards" && Number(param) >= 1 && Number(param) <= 20) return { view, lesson: Number(param), domain: domainParam === "vocab" ? "vocab" : "core" };
  if (view === "test" && Number(param) >= 1 && Number(param) <= 20) return { view, lesson: Number(param), domain: domainParam === "vocab" ? "vocab" : "core" };
  if (["lessons", "vocabulary", "practice", "review", "dashboard"].includes(view)) return { view };
  return { view: "lessons" };
}

function navigate(view, params = {}) {
  const lessonNumber = Number(params.lesson || route.lesson || progress.lastLesson || 1);
  const hasLessonRoute = ["lesson", "flashcards", "test"].includes(view);
  const hasDomain = view === "flashcards" || view === "test";
  const domain = hasDomain ? (params.domain || (route.view === view ? route.domain : "core")) : "core";
  const coreId = params.coreId || route.coreId || selectedCoreId;
  const nextHash = view === "kanji-detail" ? `#kanji/${coreId}` : hasDomain ? `#${view}/${lessonNumber}/${domain}` : hasLessonRoute ? `#${view}/${lessonNumber}` : `#${view}`;
  if (window.location.hash !== nextHash) window.history.pushState(null, "", nextHash);
  if (hasLessonRoute && (route.view !== view || route.lesson !== lessonNumber || route.domain !== domain)) lessonSearch = "";
  route = view === "kanji-detail" ? { view, lesson: lessonNumber, coreId } : hasLessonRoute ? { view, lesson: lessonNumber, ...(hasDomain ? { domain } : {}) } : { view };
  if (hasLessonRoute) {
    selectedCoreId = params.coreId || lessons[route.lesson - 1]?.core[0]?.id || null;
    if (view === "lesson") lessonTab = params.tab || "core";
    progress.lastLesson = route.lesson;
    saveProgress();
    recordStudy();
  }
  if (view === "kanji-detail") selectedCoreId = coreId;
  if (view === "flashcards" && (route.lesson !== flashcardState.lesson || domain !== flashcardState.domain)) {
    flashcardState = { mode: "flashcard", domain, lesson: lessonNumber, index: 0, order: null, direction: domain === "vocab" ? "term-to-meaning" : "kanji-to-meaning", flipped: false, mastered: new Set(), review: new Set(), quiz: null, match: null };
  }
  if (view === "test") testState = { started: false, submitted: false, questions: [], answers: {}, index: 0, lesson: lessonNumber, domain };
  app.classList.remove("sidebar-open");
  if (view === "vocabulary") vocabLimit = 72;
  render();
}

function icon(name, size = 20) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7H10v7H4a1 1 0 0 1-1-1z"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 16.5A2.5 2.5 0 0 1 6.5 14H20M8 7h8M8 10h6"/>',
    cards: '<rect x="4" y="6" width="14" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12M8 11h6M8 15h5"/>',
    game: '<path d="M6 9h12a4 4 0 0 1 3.7 5.5l-1 2.5a2 2 0 0 1-3.1.8L15 16H9l-2.6 2.8a2 2 0 0 1-3.1-.8l-1-2.5A4 4 0 0 1 6 9Z"/><path d="M7 11v4M5 13h4M16 12h.01M18.5 14h.01"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    chart: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M16 6h4v4"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="m14 18-6-6 6-6"/><path d="M20 12H8"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    spark: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4.5-4-7-4-12-4 2-6 5-6 8-1.5-1-2-2.5-2-4a9 9 0 0 0-2 8 7 7 0 0 0 7 7Z"/><path d="M12 22a3 3 0 0 0 3-3c0-1.7-1.4-2.9-2.5-4-.8 1.7-3.5 2.7-3.5 4a3 3 0 0 0 3 3Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    volume: '<path d="M4 10v4h4l5 4V6l-5 4z"/><path d="M17 9a5 5 0 0 1 0 6M19 5a10 10 0 0 1 0 14"/>',
    tune: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    reset: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'
  };
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

function getLesson(number) { return lessons.find(lesson => lesson.number === Number(number)); }
function getStudyItems(lesson, domain = flashcardState.domain) { return domain === "vocab" ? lesson?.vocab || [] : lesson?.core || []; }
function getFlashcardItems(lesson) {
  const items = getStudyItems(lesson);
  if (!Array.isArray(flashcardState.order) || flashcardState.order.length !== items.length) return items;
  const itemsById = new Map(items.map(item => [item.id, item]));
  const orderedItems = flashcardState.order.map(id => itemsById.get(id)).filter(Boolean);
  return orderedItems.length === items.length ? orderedItems : items;
}
function isStudyKnown(item, domain = flashcardState.domain) { return domain === "vocab" ? isVocabKnown(item) : isCoreKnown(item); }
function studyTerm(item, domain = flashcardState.domain) { return domain === "vocab" ? item.word : item.kanji; }
function studyMeaning(item) { return item.meaning || item.meaningsVi?.[0] || ""; }
function toHiragana(reading) { return String(reading || "").replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60)); }
function coreReadings(item) { return [item.on, item.kun].filter(reading => reading && reading !== "—").map(toHiragana).join(" · ") || "—"; }
function readingMeaningOption(reading, meaning) {
  return `<div class="reading-meaning-option"><b lang="ja">${escapeHtml(reading)}</b><span>${escapeHtml(meaning)}</span></div>`;
}
function vocabMeaningOption(item) {
  return readingMeaningOption(item.reading, studyMeaning(item));
}
function coreMeaningOption(item) { return readingMeaningOption(coreReadings(item), studyMeaning(item)); }
function getMnemonic(core) { return core.mnemonic || FIRST_LESSON_HINTS[core.kanji] || "Nhìn kỹ các nét của chữ, rồi liên hệ với nghĩa và một từ quen thuộc."; }
function isCoreKnown(core) { return progress.knownCore.includes(core.id); }
function isVocabKnown(vocab) { return progress.knownVocab.includes(vocab.id); }
function percent(done, total) { return total ? Math.round(done / total * 100) : 0; }
function setKnown(type, id) {
  const key = type === "core" ? "knownCore" : "knownVocab";
  const items = new Set(progress[key]);
  items.has(id) ? items.delete(id) : items.add(id);
  progress[key] = [...items];
  recordStudy();
  saveProgress();
}

function iconButton(name, label, action, extra = "") {
  return `<button class="icon-button ${extra}" type="button" data-action="${action}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon(name)}</button>`;
}

function navItem(view, label, symbol, badge = "") {
  const active = route.view === view || (view === "lessons" && ["lesson", "flashcards", "test", "kanji-detail"].includes(route.view));
  return `<button class="nav-item ${active ? "active" : ""}" type="button" data-nav="${view}">${icon(symbol)}<span>${label}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ""}</button>`;
}

function renderSidebar() {
  const due = allVocab.length - progress.knownVocab.length;
  return `<aside class="sidebar" id="sidebar">
    <div class="brand-row"><span class="brand-mark">漢</span><span class="brand-name">kanji<span>garden</span></span>${iconButton("close", "Đóng menu", "close-menu", "mobile-close")}</div>
    <div class="level-tag"><span class="level-dot"></span> LỘ TRÌNH JLPT <b>N4</b></div>
    <p class="nav-caption">KHÔNG GIAN HỌC</p>
    <nav class="primary-nav" aria-label="Điều hướng chính">
      ${navItem("dashboard", "Tổng quan", "home")}
      ${navItem("lessons", "20 bài học", "book", "20")}
      ${navItem("vocabulary", "Từ vựng", "cards", String(allVocab.length))}
      ${navItem("practice", "Trò chơi", "game")}
      ${navItem("review", "Ôn tập", "repeat", due ? String(due) : "✓")}
    </nav>
    <div class="sidebar-note"><div class="note-orbit">日</div><p>Học một chút<br/><b>mỗi ngày.</b></p><span>${allCore.length} chữ · ${allVocab.length} từ</span></div>
    <div class="sidebar-footer"><span class="footer-sprout">芽</span><span>Học vui, nhớ lâu.</span><button type="button" class="tiny-text-button" data-action="reset-progress">Đặt lại</button></div>
  </aside>`;
}

function renderTopbar() {
  const lesson = route.lesson ? getLesson(route.lesson) : null;
  const titles = { dashboard: "Chào bạn, hôm nay học gì?", lessons: "Lộ trình N4", lesson: "Bài học", flashcards: `Flashcard · ${route.domain === "vocab" ? "Từ vựng" : "Kanji Core"} · Bài ${route.lesson}`, vocabulary: "Kho từ vựng", practice: "Trò chơi", review: "Góc ôn tập" };
  return `<header class="topbar"><div class="topbar-left"><div><div class="eyebrow">HỌC TIẾNG NHẬT · CẤP ĐỘ N4${lesson ? ` · BÀI ${String(lesson.number).padStart(2, "0")}` : ""}</div><h1>${titles[route.view] || "Kanji N4"}</h1></div></div>
    <div class="topbar-right"><div class="streak-pill">${icon("flame", 17)}<b>${progress.streak}</b><span>ngày liên tiếp</span></div><div class="avatar" aria-label="Học viên">あ</div></div></header>`;
}

function renderBottomNav() {
  return `<nav class="bottom-nav" aria-label="Điều hướng nhanh">${navItem("dashboard", "Nhà", "home")}${navItem("lessons", "Bài học", "book")}${navItem("practice", "Chơi", "game")}${navItem("review", "Ôn", "repeat")}</nav>`;
}

function renderShell(content) {
  return `<div class="app-shell">
    <header class="hikari-header"><div class="hikari-header-inner">
      <button class="hikari-brand" type="button" data-nav="lessons" aria-label="Kanji N4, danh sách bài học"><span class="brand-mark">漢</span><span class="brand-name">KANJI<span>JLPT N4</span></span></button>
    </div></header>
    <div class="main-column"><main id="main-view" class="main-view">${content}</main><footer class="app-footer"><span>漢字 · N4</span><span>${lessons.length} bài học · ${allCore.length} Kanji · ${allVocab.length} từ</span><button class="tiny-text-button" type="button" data-action="reset-progress" aria-label="Đặt lại toàn bộ tiến độ">Đặt lại tiến độ</button></footer></div>
    <dialog id="vocab-dialog" class="hikari-vocab-dialog" aria-labelledby="vocab-dialog-title"></dialog>
    <dialog id="kanji-writing-dialog" class="kanji-writing-dialog" aria-label="Luyện viết Kanji"></dialog>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  </div>`;
}

function renderDashboard() {
  const coreDone = progress.knownCore.length;
  const vocabDone = progress.knownVocab.length;
  const lastLesson = getLesson(progress.lastLesson) || lessons[0];
  const lessonDone = lastLesson.core.filter(isCoreKnown).length;
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    return { key: dateKey(date), label: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getDay()] };
  });
  const weekCount = week.filter(day => progress.studyDays.includes(day.key)).length;
  const artCore = lastLesson.core[1] || lastLesson.core[0];
  return `<section class="welcome-banner">
      <div class="welcome-copy"><span class="banner-kicker"><span class="status-dot"></span> CHÀO MỪNG BẠN QUAY LẠI</span><h2>Thêm một chữ,<br/><em>thêm một thế giới.</em></h2><p>Chỉ cần 10 phút hôm nay để tiến gần hơn đến N4. Chọn bài học tiếp theo và bắt đầu nhé.</p>
        <div class="welcome-actions"><button class="button button-light" type="button" data-lesson="${lastLesson.number}">Tiếp tục bài ${lastLesson.number} ${icon("arrow", 17)}</button><span class="banner-meta">${lessonDone}/10 chữ đã nhớ</span></div>
      </div><div class="welcome-art"><div class="sun-disc"></div><div class="art-ribbon ribbon-one">にほんご</div><div class="art-ribbon ribbon-two">毎日</div><div class="floating-kanji">${escapeHtml(artCore.kanji)}</div><div class="art-stamp">${String(lastLesson.number).padStart(2, "0")}<small>LESSON</small></div><div class="tiny-leaf leaf-one">✳</div><div class="tiny-leaf leaf-two">✦</div><div class="art-caption">${escapeHtml(lastLesson.title)}</div></div>
    </section>
    <section class="stats-grid" aria-label="Tiến độ của bạn">
      ${statCard("book", coreDone, "/ 200", "Kanji đã nhớ", percent(coreDone, 200), "#327868")}
      ${statCard("cards", vocabDone, `/ ${allVocab.length}`, "Từ đã thuộc", percent(vocabDone, allVocab.length), "#d6815c")}
      <div class="stat-card streak-stat"><div class="stat-top"><span class="stat-icon warm">${icon("flame")}</span><span class="stat-caption">CHUỖI NGÀY</span></div><div class="stat-number">${progress.streak}<small> ngày</small></div><div class="stat-bottom"><span>${progress.streak ? "Giữ nhịp thật tốt!" : "Học hôm nay để bắt đầu"}</span><span class="stat-mini">✦</span></div></div>
    </section>
    <section class="content-grid dashboard-grid">
      <div class="panel path-panel"><div class="section-heading"><div><span class="section-kicker">BƯỚC TIẾP THEO</span><h2>Tiếp tục hành trình</h2></div><button class="text-link" type="button" data-nav="lessons">Tất cả bài ${icon("arrow", 16)}</button></div>
        <button class="continue-card" type="button" data-lesson="${lastLesson.number}"><div class="continue-mark">${escapeHtml(lastLesson.core[0].kanji)}<span>${String(lastLesson.number).padStart(2, "0")}</span></div><div class="continue-info"><span class="mini-label">BÀI ${String(lastLesson.number).padStart(2, "0")} · ${escapeHtml(lastLesson.title)}</span><strong>${escapeHtml(lastLesson.title)}</strong><span class="progress-line"><i style="width:${percent(lessonDone, 10)}%"></i></span><small>${lessonDone}/10 Kanji Core đã hoàn thành</small></div><span class="continue-arrow">${icon("arrow")}</span></button>
        <div class="quick-games-heading"><div><span class="section-kicker">HỌC MÀ CHƠI</span><h2>Chơi một vòng nhé?</h2></div><button class="text-link" type="button" data-nav="practice">Xem trò chơi ${icon("arrow", 16)}</button></div>
        <div class="quick-game-grid"><button class="quick-game-card reading" type="button" data-flashcards="${lastLesson.number}" data-domain="core"><span class="quick-game-icon">漢</span><span><b>Ôn Kanji Core bài ${lastLesson.number}</b><small>Flashcard · ghép cặp · trắc nghiệm</small></span>${icon("arrow", 17)}</button><button class="quick-game-card match" type="button" data-flashcards="${lastLesson.number}" data-domain="vocab"><span class="quick-game-icon">語</span><span><b>Ôn từ vựng bài ${lastLesson.number}</b><small>Chỉ dùng từ trong bài này</small></span>${icon("arrow", 17)}</button></div>
      </div>
      <div class="panel routine-panel"><div class="section-heading"><div><span class="section-kicker">NHỊP HỌC CỦA BẠN</span><h2>Mỗi ngày một chút</h2></div><span class="week-total">${weekCount}<small>/7 ngày</small></span></div><p class="panel-intro">Một nhịp học nhỏ đều đặn giúp chữ ở lại lâu hơn.</p><div class="week-chart">${week.map(day => `<div class="week-day"><span class="day-column ${progress.studyDays.includes(day.key) ? "studied" : ""}">${progress.studyDays.includes(day.key) ? "✓" : ""}</span><span>${day.label}</span></div>`).join("")}</div><div class="routine-tip"><span class="tip-spark">${icon("spark", 17)}</span><p><b>Mẹo nhỏ:</b> đọc từ thành tiếng rồi che cách đọc lại. Não sẽ nhớ chủ động hơn!</p></div><button class="review-callout" type="button" data-nav="review"><span class="review-icon">${icon("repeat")}</span><span><b>Ôn lại những từ chưa thuộc</b><small>${Math.max(0, allVocab.length - vocabDone)} từ đang chờ bạn</small></span>${icon("arrow", 17)}</button></div>
    </section>
    <section class="bottom-cta"><div><span class="section-kicker">HỌC THEO NHỊP RIÊNG</span><h2>Hai mươi bài. Một mục tiêu.</h2><p>Tiến độ được lưu ngay trên thiết bị của bạn.</p></div><button class="button button-green" type="button" data-nav="lessons">Khám phá bài học ${icon("arrow", 17)}</button><div class="cta-watermark">あ</div></section>`;
}

function statCard(iconName, amount, total, label, progressValue, color) {
  return `<div class="stat-card"><div class="stat-top"><span class="stat-icon" style="--stat-color:${color}">${icon(iconName)}</span><span class="stat-caption">N4 TRACKER</span></div><div class="stat-number">${amount}<small>${total}</small></div><div class="stat-bottom"><span>${label}</span><span class="stat-percent">${progressValue}%</span></div><div class="stat-progress"><i style="width:${progressValue}%;--stat-color:${color}"></i></div></div>`;
}

function renderLessons() {
  return `<section class="page-intro"><div><span class="section-kicker">TỪ NÉT ĐẦU TIÊN ĐẾN TỪ VỰNG THẬT</span><h2>Chọn bài học tiếp theo</h2><p>20 chủ đề, mỗi bài 10 chữ Kanji Core và các từ vựng đi cùng.</p></div></section>
    <ul class="lesson-catalog">${lessons.map(lesson => lessonCard(lesson)).join("")}</ul>`;
}

function lessonCard(lesson) {
  const lessonLabel = `BÀI ${String(lesson.number).padStart(2, "0")}`;
  const kanjiStrip = lesson.core.map(item => `<span class="lesson-kanji-item"><span class="lesson-kanji-char" lang="ja">${escapeHtml(item.kanji)}</span>${item.hanViet ? `<span class="lesson-kanji-hanviet">${escapeHtml(item.hanViet)}</span>` : ""}</span>`).join("");
  return `<li><button class="lesson-card" type="button" data-lesson="${lesson.number}" aria-label="${lessonLabel}: ${escapeHtml(lesson.title)}"><span class="lesson-card-header"><span class="lesson-card-tag">${lessonLabel}</span><span class="lesson-card-title">${escapeHtml(lesson.title)}</span></span><span class="lesson-kanji-strip" aria-hidden="true">${kanjiStrip}</span></button></li>`;
}

function kanjiArt(core, large = false) {
  const hue = (core.lesson * 31 + Number(core.id.match(/core-(\d+)/)?.[1] || 1) * 9) % 360;
  const word = core.meaning.split(/[;；，,]/)[0].trim();
  const motif = artMotif(core);
  const image = core.hintImage
    ? `<img class="kanji-art-image" src="${escapeHtml(core.hintImage)}" alt="Minh họa gợi nhớ cho ${escapeHtml(core.kanji)}: ${escapeHtml(word)}" loading="lazy" decoding="async"/>`
    : `<svg viewBox="0 0 240 190" aria-hidden="true"><g class="art-motif">${motif}</g><path class="art-hill hill-back" d="M0 160 Q48 101 101 147 T240 120V190H0Z"/><path class="art-hill hill-front" d="M0 170 Q57 127 104 158 T240 143V190H0Z"/><path class="art-orbit" d="M26 100 Q116 0 216 97"/><text x="120" y="142" text-anchor="middle">${escapeHtml(core.kanji)}</text><path class="art-dash" d="M26 142h19M199 108h16M52 42h14"/></svg>`;
  return `<div class="kanji-art ${large ? "large" : ""} ${core.hintImage ? "has-hint-image" : ""}" style="--art-hue:${hue}" role="img" aria-label="Chữ ${escapeHtml(core.kanji)} — ${escapeHtml(word)}"><span class="art-number">${String(core.lesson).padStart(2, "0")}<i>·</i>${String(Number(core.id.match(/core-(\d+)/)?.[1] || 1)).padStart(2, "0")}</span>${image}<span class="art-character">${escapeHtml(core.kanji)}</span><span class="art-side-label">GỢI NHỚ · N4</span></div>`;
}

function artMotif(core) {
  const clue = `${core.meaning} ${getMnemonic(core)}`.toLocaleLowerCase("vi");
  if (/mặt trời|ánh sáng|sáng|ban ngày|minh/.test(clue)) return '<circle cx="47" cy="55" r="14"/><path d="M47 30v-7M47 87v-7M22 55h-7M79 55h-7M29 37l-5-5M70 76l-5-5M65 37l5-5M24 81l5-5"/>';
  if (/tối|bóng đêm|đêm|mặt trăng|mặt nguyệt|ám/.test(clue)) return '<path d="M62 34a22 22 0 1 0 19 35A24 24 0 0 1 62 34Z"/><path d="M29 39h.1M79 49h.1M36 82h.1"/>';
  if (/mưa|tuyết|mây|thời tiết|gió|bão/.test(clue)) return '<path d="M25 62a13 13 0 0 1 13-13 16 16 0 0 1 31-3 11 11 0 0 1 2 22H37a12 12 0 0 1-12-6Z"/><path d="m39 76-4 9m20-9-4 9m19-9-4 9"/>';
  if (/sông|nước|biển|dòng chảy|thủy|ướt/.test(clue)) return '<path d="M18 47q9-8 18 0t18 0 18 0 18 0M18 63q9-8 18 0t18 0 18 0 18 0M18 79q9-8 18 0t18 0 18 0 18 0"/>';
  if (/núi|đồi|rừng|cây|lá|hoa|thiên nhiên|thôn|làng/.test(clue)) return '<path d="m20 79 22-38 18 29 12-18 20 27H20Z"/><path d="M42 41v-9m18 38v-9"/>';
  if (/địa chỉ|nơi|thị trấn|thành phố|đô thị|quận|phủ|kinh đô|địa điểm|nhà bếp|nhà cửa/.test(clue)) return '<path d="m21 58 28-24 28 24M29 53v33h40V53M42 86V67h14v19M35 59h8m17 0h4"/>';
  if (/người|gia đình|cha|mẹ|anh|chị|em|con người|cư dân|dân làng/.test(clue)) return '<circle cx="49" cy="42" r="11"/><path d="M28 84a21 21 0 0 1 42 0M19 48h8m44 0h9M49 23v-7"/>';
  if (/tim|tình cảm|suy nghĩ|tư tưởng|ý nghĩ|nhớ|tâm|ý kiến/.test(clue)) return '<path d="M49 80 25 57a15 15 0 0 1 22-20l2 3 2-3a15 15 0 0 1 22 20L49 80Z"/><path d="M31 25h10m-5-5v10m28 5h9"/>';
  if (/cơ thể|sức khỏe|y tế|bệnh|bụng|đầu|tay|chân|mắt|miệng|chết/.test(clue)) return '<circle cx="49" cy="35" r="10"/><path d="M49 45v28m-19-13h38m-19 13L37 87m12-14 12 14M81 29v17m-8-8h16"/>';
  if (/học|chữ viết|kanji|nghiên cứu|sách|giấy|câu hỏi|đề bài|thi cử|trả lời|giải thích/.test(clue)) return '<path d="M20 39a21 21 0 0 1 27 0v43a21 21 0 0 0-27 0Zm58 0a21 21 0 0 0-27 0v43a21 21 0 0 1 27 0Z"/><path d="M29 51h10m-10 9h10m27-9h4m-4 9h4"/>';
  if (/ăn|thức ăn|thực phẩm|cơm|mùi vị|hương vị|ngọt|đắng|rau|thịt/.test(clue)) return '<path d="M20 55h58a29 29 0 0 1-58 0Zm9-9 5-9m12 9 5-9m12 9 5-9M38 85h23"/>';
  if (/mở|đóng|cửa|cổng/.test(clue)) return '<path d="M27 86V34a7 7 0 0 1 7-7h32a7 7 0 0 1 7 7v52ZM38 86V42h24v44M56 64h.1"/>';
  if (/đi|chạy|đến|rời|xe|giao thông|đường|ga|tàu|chuyến|khởi hành|di chuyển/.test(clue)) return '<path d="M22 77h56l-8-22H35l-13 22Zm11 0v8m35-8v8M36 65h31"/><circle cx="36" cy="80" r="5"/><circle cx="65" cy="80" r="5"/>';
  if (/nói|hỏi|giao tiếp|lời|ngôn ngữ|thuyết|trả lời/.test(clue)) return '<path d="M22 36h51a10 10 0 0 1 10 10v23a10 10 0 0 1-10 10H49L34 89V79h-2a10 10 0 0 1-10-10V46a10 10 0 0 1 10-10Z"/><path d="M38 56h29m-29 10h19"/>';
  if (/bán|mua|tiền|giá|cửa hàng|chợ|làm việc|nghề|công việc/.test(clue)) return '<path d="M25 45h48v40H25zM20 45l9-17h40l9 17M40 45v40m18-40v40M34 60h3m24 0h3"/>';
  if (/màu|đẹp|xấu|mạnh|yếu|nặng|nhẹ|to|dày|mỏng|cao|thấp|dài|ngắn/.test(clue)) return '<path d="m27 77 19-19 12 12 22-30M27 35h18M67 84h14M31 82h11"/><circle cx="46" cy="58" r="4"/>';
  return '<circle cx="49" cy="56" r="29"/><path d="M49 27v58M20 56h58M29 36l40 40m0-40L29 76"/>';
}

function vocabLinks(vocab) {
  if (!vocab.coreIds.length) return "";
  return `<span class="related-kanji">${vocab.coreIds.slice(0, 5).map(id => {
    const core = coreById.get(id);
    return core ? `<button type="button" class="kanji-chip" data-open-core="${core.id}" title="Mở chữ ${escapeHtml(core.kanji)}">${escapeHtml(core.kanji)}</button>` : "";
  }).join("")}</span>`;
}

function vocabRow(vocab, compact = false) {
  const lesson = getLesson(vocab.lesson);
  const known = isVocabKnown(vocab);
  return `<article class="vocab-row ${compact ? "compact" : ""} ${known ? "is-known" : ""}"><div class="vocab-word-block"><div class="vocab-word-title"><strong lang="ja">${escapeHtml(vocab.word)}</strong><button type="button" class="speak-button" data-speak="${escapeHtml(vocab.word)}" aria-label="Nghe ${escapeHtml(vocab.word)}">${icon("volume", 14)}</button></div><span lang="ja">${escapeHtml(vocab.reading)}</span></div><p class="vocab-meaning">${escapeHtml(vocab.meaning)}</p>${vocabLinks(vocab)}<span class="vocab-lesson-tag">B${String(vocab.lesson).padStart(2, "0")}</span><button type="button" class="known-toggle ${known ? "selected" : ""}" data-known-vocab="${vocab.id}" aria-label="${known ? "Bỏ đánh dấu đã thuộc" : "Đánh dấu đã thuộc"}">${known ? icon("check", 15) : icon("plus", 15)}</button></article>`;
}

function openVocabDialog(id) {
  const vocab = vocabById.get(id);
  const dialog = app.querySelector("#vocab-dialog");
  if (!vocab || !dialog) return;
  dialog.setAttribute("aria-labelledby", "vocab-dialog-title");
  dialog.classList.remove("hikari-kanji-art-dialog", "hikari-kanji-text-dialog");
  const linkedCore = vocab.coreIds.map(key => coreById.get(key)).filter(Boolean);
  const selfCore = linkedCore.find(core => core.kanji === vocab.word);
  const otherLinkedCore = linkedCore.filter(core => core.kanji !== vocab.word);
  const linkedCoreMarkup = otherLinkedCore.map(core => `<button type="button" class="kanji-chip hikari-dialog-core-chip" data-flashcard-kanji="${escapeHtml(core.kanji)}" data-kanji-context="vocab" aria-label="Xem thông tin chữ ${escapeHtml(core.kanji)} · ${escapeHtml(core.hanViet)}">${escapeHtml(core.kanji)} · ${escapeHtml(core.hanViet)}</button>`).join("");
  const hanVietMarkup = selfCore ? `<p class="hikari-dialog-hanviet"><span>ÂM HÁN–VIỆT</span><b>${escapeHtml(selfCore.hanViet)}</b></p>` : "";
  const linkedMarkup = otherLinkedCore.length ? `<div class="hikari-dialog-linked"><b>Kanji liên kết</b><div>${linkedCoreMarkup}</div></div>` : "";
  dialog.innerHTML = `<form method="dialog"><button class="hikari-dialog-close" aria-label="Đóng">×</button></form><span class="hikari-test-kicker">BÀI ${vocab.lesson} · TỪ VỰNG</span><div class="hikari-dialog-word-row"><h2 id="vocab-dialog-title" lang="ja">${escapeHtml(vocab.word)}</h2><button class="hikari-vocab-audio" type="button" data-speak="${escapeHtml(vocab.word)}" aria-label="Nghe ${escapeHtml(vocab.word)}">${icon("volume", 16)}</button></div><p class="hikari-dialog-reading" lang="ja">${escapeHtml(vocab.reading)}</p>${hanVietMarkup}<p class="hikari-dialog-meaning">${escapeHtml(vocab.meaning)}</p>${linkedMarkup}<button class="button ${isVocabKnown(vocab) ? "button-outline" : "button-primary"} hikari-dialog-known" type="button" data-known-vocab="${vocab.id}">${isVocabKnown(vocab) ? "Đã thuộc · bấm để ôn lại" : "Đánh dấu đã thuộc"}</button>`;
  dialog.showModal();
}

function openFlashcardKanjiDialog(character, context = "flashcard") {
  const dialog = app.querySelector("#vocab-dialog");
  if (!dialog) return;
  const alreadyOpen = dialog.open;
  const contextLabel = context === "vocab" ? "KANJI LIÊN KẾT TỪ VỰNG" : "CHỮ HÁN TRONG FLASHCARD";
  const core = coreByCharacter.get(character);
  const hanViet = core?.hanViet || flashcardKanjiByCharacter.get(character) || "Chưa có âm Hán Việt";
  const hasMemoryImage = Boolean(core?.hintImage);
  dialog.setAttribute("aria-labelledby", "flashcard-kanji-dialog-title");
  dialog.classList.toggle("hikari-kanji-art-dialog", hasMemoryImage);
  dialog.classList.toggle("hikari-kanji-text-dialog", !hasMemoryImage);
  const meaningMarkup = core?.meaning ? `<p class="flashcard-kanji-dialog-meaning">${escapeHtml(core.meaning)}</p>` : "";
  const readingsMarkup = core
    ? `<div class="flashcard-kanji-dialog-readings"><div><span>ÂM ON <small>音読み</small></span><b lang="ja">${escapeHtml(core.on || "—")}</b></div><div><span>ÂM KUN <small>訓読み</small></span><b lang="ja">${escapeHtml(core.kun || "—")}</b></div></div>`
    : "";
  const memoryMarkup = hasMemoryImage
    ? `<section class="flashcard-kanji-dialog-memory"><span class="section-kicker">HÌNH GỢI NHỚ</span>${kanjiArt(core, true)}<div class="flashcard-kanji-memory-note"><span class="section-kicker">MẸO GHI NHỚ</span><p>${escapeHtml(getMnemonic(core))}</p></div></section>`
    : "";
  dialog.innerHTML = `<form method="dialog"><button class="hikari-dialog-close" aria-label="Đóng">×</button></form><div class="flashcard-kanji-dialog-layout ${hasMemoryImage ? "has-memory-image" : "text-only"}"><section class="flashcard-kanji-dialog-info"><span class="hikari-test-kicker">${contextLabel}</span><div class="flashcard-kanji-dialog-summary"><span class="flashcard-kanji-dialog-glyph" lang="ja">${escapeHtml(character)}</span><span class="flashcard-kanji-dialog-label">ÂM HÁN–VIỆT</span><h2 id="flashcard-kanji-dialog-title">${escapeHtml(hanViet)}</h2>${meaningMarkup}</div>${readingsMarkup}</section>${memoryMarkup}</div>`;
  if (!alreadyOpen) dialog.showModal();
}

function speakJapanese(word) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    showToast("Trình duyệt này chưa hỗ trợ phát âm tự động");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "ja-JP";
  utterance.rate = 0.82;
  const japaneseVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith("ja"));
  if (japaneseVoice) utterance.voice = japaneseVoice;
  window.speechSynthesis.speak(utterance);
}

function filteredVocab(list, search = undefined, filter = undefined) {
  if (search === undefined) search = list === allVocab ? vocabSearch : "";
  if (filter === undefined) filter = list === allVocab ? vocabFilter : "all";
  const query = search.trim().toLocaleLowerCase("vi");
  return list.filter(item => {
    const known = isVocabKnown(item);
    if (filter === "unknown" && known) return false;
    if (filter === "known" && !known) return false;
    if (!query) return true;
    const text = `${item.word} ${item.reading} ${item.meaning} ${item.lesson}`.toLocaleLowerCase("vi");
    return text.includes(query);
  });
}

function renderVocabList(list, { compact = false, limit = 60, id = "vocab-results" } = {}) {
  const filtered = filteredVocab(list);
  const shown = filtered.slice(0, limit);
  const rowsMarkup = shown.length ? shown.map(item => vocabRow(item, compact)).join("") : `<div class="empty-state"><span>あ</span><b>Chưa tìm thấy từ nào</b><p>Thử chữ Kanji, cách đọc hoặc nghĩa tiếng Việt khác nhé.</p></div>`;
  return `<div class="vocab-table-wrap"><div class="vocab-table-head"><span>TỪ VỰNG / CÁCH ĐỌC</span><span>NGHĨA TIẾNG VIỆT</span><span>CHỮ LIÊN QUAN</span><span></span></div><div class="vocab-list" id="${id}">${rowsMarkup}</div></div>${filtered.length > limit ? `<button class="button button-outline load-more" type="button" data-action="load-more">Xem thêm ${Math.min(limit, filtered.length - limit)} từ <span>(${shown.length}/${filtered.length})</span></button>` : filtered.length > 0 ? `<p class="results-count">Đang hiển thị ${filtered.length} từ vựng</p>` : ""}`;
}

function renderVocabulary() {
  const filtered = filteredVocab(allVocab);
  return `<section class="page-intro"><div><span class="section-kicker">${allVocab.length} TỪ · NỐI VỚI KANJI CORE</span><h2>Mỗi chữ mở ra một từ mới</h2><p>Tìm cách đọc, nghĩa tiếng Việt, rồi chạm vào Kanji để quay về bài học.</p></div><div class="intro-count"><b>${progress.knownVocab.length}</b><span>từ đã<br/>ghi nhớ</span></div></section>
    <section class="panel vocabulary-panel"><div class="vocab-toolbar"><label class="search-field">${icon("search", 19)}<input id="vocab-search" type="search" autocomplete="off" placeholder="Tìm Kanji, cách đọc, nghĩa…" value="${escapeHtml(vocabSearch)}"/><kbd>/</kbd></label><div class="filter-pills" role="group" aria-label="Lọc từ vựng"><button type="button" data-vocab-filter="all" class="${vocabFilter === "all" ? "active" : ""}">Tất cả <span>${allVocab.length}</span></button><button type="button" data-vocab-filter="unknown" class="${vocabFilter === "unknown" ? "active" : ""}">Chưa thuộc</button><button type="button" data-vocab-filter="known" class="${vocabFilter === "known" ? "active" : ""}">Đã thuộc</button></div></div><div class="vocab-result-caption"><span id="vocab-result-count">${filtered.length} từ được tìm thấy</span><span>${icon("tune", 15)} Chạm vào một Kanji để xem bài học</span></div>${renderVocabList(allVocab, { limit: vocabLimit })}</section>`;
}

function relatedVocabFor(core) {
  return core.vocabIds.map(id => vocabById.get(id)).filter(Boolean);
}

function renderHikariVocabCard(item) {
  return `<article class="hikari-vocab-card ${isVocabKnown(item) ? "is-known" : ""}"><button class="hikari-vocab-open" type="button" data-vocab-open="${item.id}" aria-label="Xem từ ${escapeHtml(item.word)}"><span class="hikari-vocab-title"><b lang="ja">${escapeHtml(item.word)}</b><span lang="ja">${escapeHtml(item.reading)}</span></span><span class="hikari-vocab-meaning">${escapeHtml(item.meaning)}</span></button><button class="hikari-vocab-audio" type="button" data-speak="${escapeHtml(item.word)}" aria-label="Nghe ${escapeHtml(item.word)}">${icon("volume", 15)}</button></article>`;
}

function renderHikariVocabCards(items, scope, gridClass = "hikari-vocab-grid") {
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(totalPages, Math.max(1, Number(vocabCardPages.get(scope)) || 1));
  vocabCardPages.set(scope, currentPage);
  const shownItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const cards = shownItems.map(renderHikariVocabCard).join("");
  const pagination = items.length ? `<nav class="hikari-vocab-pagination" aria-label="Phân trang từ vựng"><button class="hikari-vocab-page-button" type="button" data-vocab-card-page="${escapeHtml(scope)}" data-vocab-card-page-step="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}><span aria-hidden="true">←</span><span>Trước</span></button><span class="hikari-vocab-page-indicator" aria-live="polite" aria-atomic="true">Trang ${currentPage} / ${totalPages}</span><button class="hikari-vocab-page-button" type="button" data-vocab-card-page="${escapeHtml(scope)}" data-vocab-card-page-step="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}><span>Sau</span><span aria-hidden="true">→</span></button></nav>` : "";
  return `<div class="${gridClass}">${cards}</div>${pagination}`;
}

function renderCoreDetail(core) {
  const related = relatedVocabFor(core);
  const known = isCoreKnown(core);
  const vocabCards = related.length
    ? renderHikariVocabCards(related, `core:${core.id}`, "hikari-detail-vocab-list")
    : `<p class="hikari-detail-empty-vocab">Chưa có từ liên quan.</p>`;
  const strokeSrc = core.media?.strokeSvg || "";
  const strokeCount = Number(core.strokeCount) || 0;
  return `<div class="hikari-kanji-detail-layout">
    <div class="hikari-detail-main">
      <section class="core-detail panel hikari-detail-overview" aria-labelledby="hikari-detail-kanji-title">
        <div class="core-detail-label"><span class="section-kicker">KANJI CORE · ${String(core.lesson).padStart(2, "0")}</span><span class="core-known-label ${known ? "known" : ""}">${known ? `${icon("check", 14)} Đã ghi nhớ` : "Cần ôn lại"}</span></div>
        <header class="hikari-detail-hero"><span class="hikari-detail-character" lang="ja">${escapeHtml(core.kanji)}</span><div class="hikari-detail-hero-copy"><span class="section-kicker">ÂM HÁN–VIỆT</span><h1 id="hikari-detail-kanji-title">${escapeHtml(core.hanViet)}</h1><p>${escapeHtml(core.meaning)}</p></div><div class="hikari-stroke-tools"><span class="section-kicker">THỨ TỰ NÉT</span><div class="kanji-stroke-mini" data-stroke-preview data-stroke-character="${escapeHtml(core.kanji)}" data-stroke-src="${escapeHtml(strokeSrc)}" data-stroke-count="${strokeCount}" role="group" aria-label="Thứ tự nét chữ ${escapeHtml(core.kanji)}"><div class="kanji-stroke-mini-canvas"><span lang="ja">${escapeHtml(core.kanji)}</span></div><button type="button" class="kanji-stroke-mini-replay" data-stroke-replay aria-label="Phát lại thứ tự nét" title="Phát lại thứ tự nét" disabled>${icon("reset", 16)}</button><span class="visually-hidden" data-stroke-status role="status" aria-live="polite">Đang tải thứ tự nét…</span></div><span class="hikari-stroke-count">${strokeCount} nét</span></div><div class="hikari-stroke-actions"><button class="button button-outline hikari-writing-button" type="button" data-stroke-practice data-character="${escapeHtml(core.kanji)}" data-stroke-src="${escapeHtml(strokeSrc)}" data-stroke-count="${strokeCount}" ${strokeSrc ? "" : "disabled"}>Luyện viết</button></div></header>
        <div class="hikari-detail-overview-grid">
          <div class="hikari-detail-reading-memory"><div class="reading-pairs"><div><span>ÂM ON <small>音読み</small></span><b lang="ja">${escapeHtml(core.on || "—")}</b></div><div><span>ÂM KUN <small>訓読み</small></span><b lang="ja">${escapeHtml(core.kun || "—")}</b></div></div>
            <div class="memory-note"><div class="memory-note-icon">${icon("spark", 18)}</div><div><span class="section-kicker">MẸO GHI NHỚ</span><p>${escapeHtml(getMnemonic(core))}</p></div></div>
            ${core.referenceUrl ? `<a class="source-reference" href="${escapeHtml(core.referenceUrl)}" target="_blank" rel="noopener noreferrer">Nguồn nghĩa & minh họa · Learn Japanese AZ ${icon("arrow", 14)}</a>` : ""}
            ${core.sourceWarning ? `<p class="source-warning">${escapeHtml(core.sourceWarning)}</p>` : ""}
          </div>
          <div class="hikari-detail-image-column"><span class="section-kicker">HÌNH GỢI NHỚ</span>${kanjiArt(core, true)}</div>
        </div>
        <button class="button ${known ? "button-outline" : "button-primary"} known-core-button" type="button" data-known-core="${core.id}">${known ? icon("check", 17) + " Đã thuộc · bấm để ôn lại" : "Tôi đã nhớ chữ này " + icon("arrow", 17)}</button>
      </section>
    </div>
    <aside class="hikari-detail-vocab-panel" aria-labelledby="hikari-detail-vocab-title">
      <header class="hikari-detail-vocab-header"><div><h2 id="hikari-detail-vocab-title">Kanji Vocab</h2><p>Từ vựng liên kết với chữ ${escapeHtml(core.kanji)}.</p></div><span class="hikari-detail-vocab-count">${related.length}</span></header>
      ${vocabCards}
    </aside>
  </div>`;
}

function renderLesson() {
  const lesson = getLesson(route.lesson);
  if (!lesson) return `<div class="empty-state"><b>Không tìm thấy bài học</b><button class="button button-green" data-nav="lessons">Về lộ trình</button></div>`;
  return `<div class="hikari-lesson-page">
    <button class="hikari-back-link" type="button" data-nav="lessons">← Về danh sách bài</button>
    <header class="hikari-lesson-heading"><h1>${escapeHtml(lesson.title)}</h1><p>Bài ${lesson.number} · ${lesson.core.length} chữ · ${lesson.vocab.length} từ vựng</p></header>
    <div class="hikari-kanji-split">
      <section class="hikari-hub-panel" aria-labelledby="hikari-core-title">
        <div class="hikari-panel-heading"><div><h2 id="hikari-core-title">Kanji Core</h2><p>Mặt chữ, cách đọc và kiến thức cốt lõi.</p></div><div class="hikari-panel-actions"><button class="button button-primary" type="button" data-flashcards="${lesson.number}" data-domain="core">Học Kanji Core</button><button class="button button-outline" type="button" data-test="${lesson.number}" data-domain="core">Kiểm tra Core</button></div></div>
        <div class="hikari-core-grid">${lesson.core.map(core => `<button type="button" class="hikari-kanji-tile ${isCoreKnown(core) ? "is-known" : ""}" data-open-core="${core.id}" aria-label="Mở chữ ${escapeHtml(core.kanji)} · ${escapeHtml(core.hanViet)}"><span class="hikari-tile-glyph" lang="ja">${escapeHtml(core.kanji)}</span><span class="hikari-tile-hanviet">${escapeHtml(core.hanViet)}</span><span class="hikari-tile-meaning">${escapeHtml(core.meaning)}</span>${isCoreKnown(core) ? `<span class="hikari-tile-check">${icon("check", 14)}</span>` : ""}</button>`).join("")}</div>
      </section>
      <section class="hikari-hub-panel hikari-vocab-panel" aria-labelledby="hikari-vocab-title">
        <div class="hikari-panel-heading hikari-vocab-heading"><div><h2 id="hikari-vocab-title">Kanji Vocab</h2><p>Từ vựng liên kết với các chữ trong bài.</p></div><div class="hikari-panel-actions"><button class="button button-primary" type="button" data-flashcards="${lesson.number}" data-domain="vocab">Vào học</button><button class="button button-outline" type="button" data-test="${lesson.number}" data-domain="vocab">Kiểm tra Vocab</button></div></div>
        ${renderHikariVocabCards(lesson.vocab, `lesson:${lesson.number}`)}
      </section>
    </div>
    <div class="hikari-lesson-pagination">${lesson.number > 1 ? `<button type="button" class="button button-outline" data-lesson="${lesson.number - 1}">← Bài trước</button>` : `<span></span>`}<button type="button" class="button button-outline" data-lesson="${lesson.number === 20 ? 1 : lesson.number + 1}">${lesson.number === 20 ? "Về bài đầu" : "Bài tiếp theo →"}</button></div>
  </div>`;
}

function renderKanjiDetail() {
  const core = coreById.get(route.coreId);
  if (!core) return `<div class="empty-state"><b>Không tìm thấy chữ Kanji</b><button class="button button-primary" type="button" data-nav="lessons">Về danh sách bài</button></div>`;
  const lesson = getLesson(core.lesson);
  const index = lesson?.core.findIndex(item => item.id === core.id) ?? -1;
  const previous = lesson?.core[index - 1];
  const next = lesson?.core[index + 1];
  const pageLink = (item, direction) => item
    ? `<button type="button" class="hikari-detail-pager-link" data-open-core="${item.id}" aria-label="${direction === "prev" ? "Chữ trước" : "Chữ sau"}: ${escapeHtml(item.kanji)} (${escapeHtml(item.hanViet)})"><span>${direction === "prev" ? "← Trước:" : "Sau:"}</span><b lang="ja">${escapeHtml(item.kanji)}</b><small>${escapeHtml(item.hanViet)}</small>${direction === "next" ? "→" : ""}</button>`
    : `<span class="hikari-detail-pager-disabled" aria-disabled="true">${direction === "prev" ? "← Chữ trước" : "Chữ sau →"}</span>`;
  return `<div class="hikari-kanji-detail-page"><nav class="hikari-detail-navigation" aria-label="Điều hướng Kanji"><button class="hikari-back-link" type="button" data-nav="lesson">← Về bài học</button><div class="hikari-detail-pager-group" role="group" aria-label="Chuyển chữ Kanji">${pageLink(previous, "prev")}${pageLink(next, "next")}</div></nav><div class="hikari-detail-context"><span>Bài ${core.lesson} · Kanji Core</span><span>${index + 1} / ${lesson?.core.length || 0}</span></div>${renderCoreDetail(core)}</div>`;
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function orderedQuizOptions(target, distractors, items) {
  const selectedIds = new Set([target.id, ...distractors.map(item => item.id)]);
  return items.filter(item => selectedIds.has(item.id));
}

function prepareLessonQuizQuestion(lesson) {
  const quiz = flashcardState.quiz;
  if (!quiz || quiz.index >= quiz.questions.length) return;
  const target = quiz.questions[quiz.index];
  const items = getStudyItems(lesson);
  const distractors = getRandomItems(items.filter(item => item.id !== target.id), Math.min(3, items.length - 1));
  quiz.question = {
    target,
    options: orderedQuizOptions(target, distractors, items),
    direction: flashcardState.domain === "vocab"
      ? (quiz.index % 2 === 0 ? "term-to-meaning" : "meaning-to-term")
      : (quiz.index % 2 === 0 ? "kanji-to-meaning" : "meaning-to-kanji"),
    selectedId: null,
    isCorrect: null
  };
}

function startLessonQuiz(lesson) {
  flashcardState.quiz = { questions: shuffled(getStudyItems(lesson)), index: 0, score: 0, question: null };
  prepareLessonQuizQuestion(lesson);
}

function startLessonMatch(lesson) {
  const allItems = getStudyItems(lesson);
  const items = getRandomItems(allItems, Math.min(5, allItems.length));
  flashcardState.match = { items, cards: shuffled(items.flatMap(item => [
    { id: item.id, kind: "term", text: studyTerm(item), reading: flashcardState.domain === "vocab" ? item.reading : "" },
    { id: item.id, kind: "meaning", text: studyMeaning(item) }
  ])), matched: [], selected: null, revealed: [], moves: 0, locked: false };
}

function renderLessonQuiz(lesson) {
  const quiz = flashcardState.quiz;
  const items = getStudyItems(lesson);
  const isVocab = flashcardState.domain === "vocab";
  if (!quiz || quiz.index >= quiz.questions.length) {
    const score = quiz?.score || 0;
    return `<section class="study-result-card"><div class="result-sun">${score === items.length ? "花" : "芽"}</div><span class="section-kicker">${isVocab ? "KIỂM TRA TỪ VỰNG" : "KIỂM TRA KANJI CORE"}</span><h2>${score} <small>/ ${items.length}</small></h2><p>câu trả lời đúng trong bài ${lesson.number}</p><div class="result-actions"><button class="button button-primary" type="button" data-study-mode="quiz">${icon("reset", 17)} Làm lại</button><button class="button button-outline" type="button" data-study-mode="flashcard">Về flashcard</button></div></section>`;
  }
  const question = quiz.question;
  const target = question.target;
  const prompt = isVocab
    ? question.direction === "term-to-meaning"
      ? `<span class="study-prompt-label">Chọn cách đọc và nghĩa đúng</span><strong class="study-quiz-glyph" lang="ja">${escapeHtml(target.word)}</strong>`
      : `<span class="study-prompt-label">Chọn chữ Kanji</span><div class="study-vocab-meaning"><span lang="ja">${escapeHtml(target.reading)}</span><strong class="study-quiz-meaning">${escapeHtml(studyMeaning(target))}</strong></div>`
    : question.direction === "kanji-to-meaning"
      ? `<span class="study-prompt-label">Chọn cách đọc và nghĩa đúng</span><strong class="study-quiz-glyph" lang="ja">${escapeHtml(target.kanji)}</strong>`
      : `<span class="study-prompt-label">Chọn chữ Kanji</span><div class="study-vocab-meaning"><span lang="ja">${escapeHtml(coreReadings(target))}</span><strong class="study-quiz-meaning">${escapeHtml(studyMeaning(target))}</strong></div>`;
  return `<section class="study-quiz-card"><div class="study-quiz-meta"><span>Câu ${quiz.index + 1} / ${quiz.questions.length}</span><span>Đúng: ${quiz.score}</span><button type="button" class="button button-outline study-quiz-shuffle" data-action="shuffle-study-quiz">${icon("repeat", 15)} Trộn câu hỏi</button></div><div class="quiz-progress"><i style="width:${percent(quiz.index, quiz.questions.length)}%"></i></div><div class="study-quiz-prompt">${prompt}</div><div class="study-quiz-options">${question.options.map(option => {
    const label = isVocab
      ? question.direction === "term-to-meaning" ? "" : option.word
      : question.direction === "kanji-to-meaning" ? "" : option.kanji;
    const showReadingMeaning = isVocab ? question.direction === "term-to-meaning" : question.direction === "kanji-to-meaning";
    const labelMarkup = showReadingMeaning ? (isVocab ? vocabMeaningOption(option) : coreMeaningOption(option)) : escapeHtml(label);
    const selected = question.selectedId === option.id;
    const correct = question.selectedId && option.id === target.id;
    return `<button type="button" class="study-quiz-option ${correct ? "correct" : selected ? "incorrect" : ""}" data-study-answer="${option.id}" ${question.selectedId ? "disabled" : ""}>${labelMarkup}</button>`;
  }).join("")}</div>${question.selectedId ? `<div class="answer-feedback ${question.isCorrect ? "good" : "try-again"}"><span>${question.isCorrect ? icon("check", 18) : icon("spark", 18)}</span><div><b>${question.isCorrect ? "Chính xác!" : "Mình cùng ghi nhớ nhé"}</b><small>${escapeHtml(isVocab ? `${target.word}（${target.reading}）` : target.kanji)} · ${escapeHtml(studyMeaning(target))}</small></div></div><button class="button button-primary next-question" type="button" data-action="next-study-question">${quiz.index === quiz.questions.length - 1 ? "Xem kết quả" : "Câu tiếp theo"} ${icon("arrow", 17)}</button>` : ""}</section>`;
}

function renderLessonMatch(lesson) {
  const match = flashcardState.match;
  const isVocab = flashcardState.domain === "vocab";
  if (!match) return "";
  if (match.matched.length === match.items.length) {
    return `<section class="study-result-card"><div class="result-sun">合</div><span class="section-kicker">ĐÃ GHÉP ĐỦ CẶP</span><h2>${match.moves}<small> lượt</small></h2><p>để tìm ra ${match.items.length} ${isVocab ? "từ và nghĩa" : "chữ và nghĩa"}</p><div class="result-actions"><button class="button button-primary" type="button" data-study-mode="matching">${icon("reset", 17)} Chơi lại</button><button class="button button-outline" type="button" data-study-mode="flashcard">Về flashcard</button></div></section>`;
  }
  return `<section class="study-match-card ${isVocab ? "vocab-match" : "core-match"}"><div class="study-match-meta"><div><span class="section-kicker">${isVocab ? "GHÉP TỪ VỚI NGHĨA" : "GHÉP KANJI VỚI NGHĨA"}</span><h2>Chạm hai thẻ để nối cặp</h2></div><span>${match.moves} lượt · ${match.matched.length}/${match.items.length} cặp</span></div><div class="study-match-grid">${match.cards.map(card => {
    const matched = match.matched.includes(card.id);
    const selected = match.selected?.id === card.id && match.selected?.kind === card.kind;
    const visible = matched || match.revealed.some(item => item.id === card.id && item.kind === card.kind);
    return `<button type="button" class="study-match-tile ${matched ? "matched" : ""} ${selected ? "selected" : ""} ${match.locked ? "locked" : ""}" data-match-choice="${card.id}" data-match-kind="${card.kind}" ${matched || match.locked ? "disabled" : ""}>${visible ? `<span ${card.kind === "term" ? 'lang="ja"' : ""}>${escapeHtml(card.text)}</span>${card.reading ? `<small lang="ja">${escapeHtml(card.reading)}</small>` : ""}` : `<span class="match-tile-back">${icon("cards", 20)}</span>`}</button>`;
  }).join("")}</div><div class="study-match-footer"><span>${match.items.length} ${isVocab ? "từ vựng" : "Kanji"} trong phiên này</span><button class="text-link" type="button" data-study-mode="matching">Bắt đầu lại ${icon("reset", 15)}</button></div></section>`;
}

function makeTestQuestion(target, items, domain, index) {
  const distractors = getRandomItems(items.filter(item => item.id !== target.id), Math.min(3, items.length - 1));
  return {
    target,
    options: orderedQuizOptions(target, distractors, items),
    direction: domain === "vocab"
      ? (index % 2 === 0 ? "term-to-meaning" : "meaning-to-term")
      : (index % 2 === 0 ? "kanji-to-meaning" : "meaning-to-kanji")
  };
}

function startKanjiTest(lesson, domain = "core") {
  const items = getStudyItems(lesson, domain);
  const questions = shuffled(items).slice(0, Math.min(15, items.length)).map((target, index) => makeTestQuestion(target, items, domain, index));
  testState = { started: true, submitted: false, questions, answers: {}, index: 0, lesson: lesson.number, domain };
  render();
}

function renderKanjiTest() {
  const lesson = getLesson(route.lesson);
  const domain = route.domain === "vocab" ? "vocab" : "core";
  const isVocab = domain === "vocab";
  if (!lesson) return `<div class="empty-state"><b>Không tìm thấy bài học</b><button class="button button-primary" type="button" data-nav="lessons">Về danh sách bài</button></div>`;
  const items = getStudyItems(lesson, domain);
  const total = Math.min(15, items.length);
  const required = Math.ceil(total * 0.8);
  if (!testState.started) return `<div class="hikari-test-page"><button class="hikari-back-link" type="button" data-nav="lesson">← Về bài học</button><section class="hikari-test-intro"><span class="hikari-test-kicker">KIỂM TRA ${isVocab ? "VOCAB" : "KANJI CORE"}</span><h1>Bài kiểm tra ${isVocab ? "Kanji Vocab" : "Kanji Core"}</h1><p>${total} câu hỏi · Cần đạt tối thiểu ${required}/${total} (${Math.round(required / Math.max(total, 1) * 100)}%)</p><ul><li>Trắc nghiệm kiểm tra nhận diện ${isVocab ? "từ và nghĩa" : "mặt chữ và ý nghĩa Hán tự"}.</li><li>Điểm số và chi tiết bài làm hiển thị sau khi nộp bài.</li><li>Không hiện kết quả đúng/sai trong lúc làm bài.</li></ul><button class="button button-primary hikari-test-start" type="button" data-test-start>${testState.started ? "Tiếp tục làm bài" : "Bắt đầu làm bài"}</button><small>Bài ${lesson.number} · ${escapeHtml(lesson.title)}</small></section></div>`;
  if (testState.submitted) {
    const correct = testState.questions.filter((question, index) => testState.answers[index] === question.target.id).length;
    const wrong = testState.questions.filter((question, index) => testState.answers[index] && testState.answers[index] !== question.target.id).length;
    const blank = total - correct - wrong;
    const scorePercent = Math.round(correct / Math.max(total, 1) * 100);
    const passed = correct >= required;
    const typeStats = new Map();
    const rows = testState.questions.map((question, index) => {
      const selectedId = testState.answers[index];
      const selected = items.find(item => item.id === selectedId);
      const status = !selectedId ? "blank" : selectedId === question.target.id ? "correct" : "wrong";
      const questionType = isVocab
        ? question.direction === "term-to-meaning" ? "Chọn cách đọc và nghĩa theo từ vựng" : "Chọn Kanji theo cách đọc và nghĩa"
        : question.direction === "kanji-to-meaning" ? "Chọn cách đọc và nghĩa theo chữ Hán" : "Chọn Kanji theo cách đọc và nghĩa";
      const stats = typeStats.get(questionType) || { correct: 0, total: 0 };
      stats.total += 1;
      if (status === "correct") stats.correct += 1;
      typeStats.set(questionType, stats);
      const prompt = isVocab
        ? question.direction === "term-to-meaning" ? question.target.word : `${question.target.reading} · ${studyMeaning(question.target)}`
        : question.direction === "kanji-to-meaning" ? question.target.kanji : `${coreReadings(question.target)} · ${studyMeaning(question.target)}`;
      const promptLang = isVocab
        ? question.direction === "term-to-meaning" ? "ja" : ""
        : question.direction === "kanji-to-meaning" ? "ja" : "";
      const correctAnswer = isVocab
        ? question.direction === "term-to-meaning" ? `${question.target.reading} · ${studyMeaning(question.target)}` : question.target.word
        : question.direction === "kanji-to-meaning" ? `${coreReadings(question.target)} · ${studyMeaning(question.target)}` : question.target.kanji;
      const selectedAnswer = !selected ? "Chưa trả lời" : isVocab
        ? question.direction === "term-to-meaning" ? `${selected.reading} · ${studyMeaning(selected)}` : selected.word
        : question.direction === "kanji-to-meaning" ? `${coreReadings(selected)} · ${studyMeaning(selected)}` : selected.kanji;
      return `<article class="hikari-review-item ${status}"><div class="hikari-review-header"><span class="hikari-question-type">Câu ${index + 1} · ${questionType}</span><b>${status === "correct" ? "✓ Đúng" : status === "wrong" ? "✕ Sai" : "– Chưa làm"}</b></div><strong class="hikari-review-prompt" lang="${promptLang}">${escapeHtml(prompt)}</strong><p>Bạn chọn: <b>${escapeHtml(selectedAnswer)}</b></p>${status !== "correct" ? `<p>Đáp án đúng: <b>${escapeHtml(correctAnswer)}</b></p>` : ""}</article>`;
    }).join("");
    const stats = [...typeStats].map(([label, value]) => {
      const percentScore = Math.round(value.correct / value.total * 100);
      return `<article class="hikari-test-type-stat"><div><b>${escapeHtml(label)}</b><span>${value.correct}/${value.total} (${percentScore}%)</span></div><div><i style="width:${percentScore}%"></i></div></article>`;
    }).join("");
    return `<div class="hikari-test-page hikari-test-results"><section class="hikari-test-result hikari-result-banner"><span class="hikari-test-kicker ${passed ? "passed" : "failed"}">${passed ? "✓ ĐẠT YÊU CẦU" : "✕ CHƯA ĐẠT"}</span><div class="hikari-result-score">${scorePercent}%</div><p>Yêu cầu đạt: ${required}/${total} câu (80%)</p><div class="hikari-score-pills"><div class="correct"><span>Đúng</span><b>${correct}</b></div><div class="wrong"><span>Sai</span><b>${wrong}</b></div><div class="blank"><span>Chưa làm</span><b>${blank}</b></div></div><div class="hikari-test-result-actions"><button class="button button-primary" type="button" data-test-start>Làm đề khác</button><button class="button button-outline" type="button" data-test-retry>Làm lại đề này</button><button class="hikari-test-exit" type="button" data-nav="lesson">Quay lại bài học</button></div></section><section class="hikari-test-results-section"><h2>Thống kê theo dạng câu hỏi</h2><div class="hikari-test-type-grid">${stats}</div></section><section class="hikari-test-results-section"><h2>Chi tiết bài làm</h2><div class="hikari-review-list">${rows}</div></section></div>`;
  }
  const question = testState.questions[testState.index];
  if (!question) return `<div class="empty-state"><b>Bài kiểm tra chưa có câu hỏi.</b></div>`;
  const prompt = isVocab
    ? question.direction === "term-to-meaning"
      ? `<span class="hikari-question-type">Chọn cách đọc và nghĩa theo từ vựng</span><strong class="hikari-question-glyph" lang="ja">${escapeHtml(question.target.word)}</strong>`
      : `<span class="hikari-question-type">Chọn chữ Kanji</span><div class="hikari-vocab-meaning"><span lang="ja">${escapeHtml(question.target.reading)}</span><strong class="hikari-question-meaning">${escapeHtml(studyMeaning(question.target))}</strong></div>`
    : question.direction === "kanji-to-meaning"
      ? `<span class="hikari-question-type">Chọn cách đọc và nghĩa theo chữ Hán</span><strong class="hikari-question-glyph" lang="ja">${escapeHtml(question.target.kanji)}</strong>`
      : `<span class="hikari-question-type">Chọn Kanji theo cách đọc và nghĩa</span><div class="hikari-vocab-meaning"><span lang="ja">${escapeHtml(coreReadings(question.target))}</span><strong class="hikari-question-meaning">${escapeHtml(studyMeaning(question.target))}</strong></div>`;
  const currentAnswer = testState.answers[testState.index];
  const answered = Object.keys(testState.answers).length;
  const percentDone = Math.round((testState.index + 1) / total * 100);
  const options = question.options.map((option, index) => {
    const label = isVocab
      ? question.direction === "term-to-meaning" ? "" : option.word
      : question.direction === "kanji-to-meaning" ? "" : option.kanji;
    const showReadingMeaning = isVocab ? question.direction === "term-to-meaning" : question.direction === "kanji-to-meaning";
    const labelMarkup = showReadingMeaning ? (isVocab ? vocabMeaningOption(option) : coreMeaningOption(option)) : escapeHtml(label);
    return `<button type="button" class="hikari-test-option ${currentAnswer === option.id ? "selected" : ""}" data-test-answer="${option.id}"><span>${index + 1}</span>${labelMarkup}</button>`;
  }).join("");
  return `<div class="hikari-test-page">
    <section class="hikari-test-status"><div class="hikari-test-status-row"><span class="hikari-test-domain">${isVocab ? "Vocab" : "Core"}</span><b>Câu ${testState.index + 1} / ${total}</b><div class="hikari-test-status-actions"><button class="button button-outline" type="button" data-test-shuffle>${icon("repeat", 15)} Trộn câu</button><button class="button button-outline" type="button" data-test-submit>Nộp bài</button><button class="hikari-test-exit" type="button" data-nav="lesson">× Thoát</button></div></div><div class="hikari-test-progress"><i style="width:${percentDone}%"></i></div></section>
    <nav class="hikari-question-palette" aria-label="Điều hướng câu hỏi"><div class="hikari-palette-heading"><b>Bảng câu hỏi</b><span>Đã trả lời: ${answered}/${total}</span></div><div class="hikari-question-grid">${testState.questions.map((_, index) => `<button type="button" class="${testState.index === index ? "current" : ""} ${testState.answers[index] ? "answered" : ""}" data-test-question="${index}" aria-current="${testState.index === index ? "step" : "false"}">${index + 1}</button>`).join("")}</div></nav>
    <section class="hikari-test-question"><div class="hikari-question-prompt">${prompt}</div><div class="hikari-test-options">${options}</div><div class="hikari-test-question-footer"><button class="button button-outline" type="button" data-test-prev ${testState.index === 0 ? "disabled" : ""}>← Câu trước</button><button class="button button-primary" type="button" data-test-next ${testState.index === total - 1 ? "disabled" : ""}>Câu sau →</button></div></section>
  </div>`;
}

function renderFlashcards() {
  const lesson = getLesson(route.lesson);
  if (!lesson) return `<div class="empty-state"><b>Không tìm thấy bài học</b><button class="button button-primary" data-nav="lessons">Về lộ trình</button></div>`;
  const domain = flashcardState.domain === "vocab" ? "vocab" : "core";
  const isVocab = domain === "vocab";
  const items = getFlashcardItems(lesson);
  if (!items.length) return `<div class="empty-state"><b>Bài này chưa có ${isVocab ? "từ vựng" : "Kanji Core"}.</b><button class="button button-outline" data-nav="lesson">Quay lại bài học</button></div>`;
  const modes = [
    ["flashcard", "Flashcard"],
    ["matching", "Ghép cặp"],
    ["quiz", "Trắc nghiệm"]
  ];
  const modeTabs = `<div class="study-mode-tabs" role="tablist" aria-label="Chế độ học ${isVocab ? "từ vựng" : "Kanji Core"}">${modes.map(([mode, label]) => `<button type="button" role="tab" aria-selected="${flashcardState.mode === mode}" class="${flashcardState.mode === mode ? "active" : ""}" data-study-mode="${mode}">${label}</button>`).join("")}</div>`;
  const knownCount = items.filter(item => isStudyKnown(item, domain)).length;
  const termPreview = studyTerm(items[0], domain);
  const head = `<div class="study-page-top"><button class="back-link" type="button" data-nav="lesson">${icon("back", 18)} Bài ${lesson.number}: ${escapeHtml(lesson.title)}</button><span class="lesson-progress-pill">${knownCount}/${items.length} đã nhớ</span></div><section class="study-page-intro"><div><span class="section-kicker">${isVocab ? "TỪ VỰNG" : "KANJI CORE"} · BÀI ${String(lesson.number).padStart(2, "0")}</span><h2>${isVocab ? "Ôn từ vựng theo bài" : "Ôn từng chữ một"}</h2><p>Flashcard, ghép cặp và trắc nghiệm chỉ dùng nội dung bài ${lesson.number}.</p></div><span class="study-page-glyph" lang="ja">${escapeHtml([...termPreview][0] || "漢")}</span></section>${modeTabs}`;
  if (flashcardState.mode === "quiz") return `${head}${renderLessonQuiz(lesson)}`;
  if (flashcardState.mode === "matching") return `${head}${renderLessonMatch(lesson)}`;

  const item = items[flashcardState.index] || items[0];
  const index = flashcardState.index;
  const progressPercent = Math.round(((index + 1) / items.length) * 100);
  const vocabKanjiFace = `<div class="vocab-study-front"><strong lang="ja">${escapeHtml(item.word)}</strong></div>`;
  const vocabKanjiParts = isVocab
    ? [...new Set(Array.from(item.word).filter(character => /\p{Script=Han}/u.test(character)))].map(character => ({
      character,
      hanViet: coreByCharacter.get(character)?.hanViet || flashcardKanjiByCharacter.get(character) || "Chưa có âm Hán Việt"
    }))
    : [];
  const vocabFormation = isVocab && vocabKanjiParts.length ? `<section class="vocab-study-core-formation" aria-label="Các chữ Hán trong từ vựng"><span class="vocab-study-core-title">CHỮ HÁN TRONG TỪ</span><div class="vocab-study-core-list">${vocabKanjiParts.map(part => `<button class="vocab-study-core-chip" type="button" data-flashcard-kanji="${escapeHtml(part.character)}" aria-label="Xem âm Hán Việt chữ ${escapeHtml(part.character)}: ${escapeHtml(part.hanViet)}"><b lang="ja">${escapeHtml(part.character)}</b><span>${escapeHtml(part.hanViet)}</span></button>`).join("")}</div></section>` : "";
  const vocabMeaningFace = `<div class="vocab-study-meaning-face"><span class="vocab-study-reading" lang="ja">${escapeHtml(item.reading)}</span><p>${escapeHtml(studyMeaning(item))}</p>${vocabFormation}</div>`;
  const vocabAudioButton = isVocab ? `<button class="flashcard-audio-button" type="button" data-speak="${escapeHtml(item.word)}" aria-label="Nghe ${escapeHtml(item.word)}">${icon("volume", 14)}</button>` : "";
  const coreKanjiFace = `<div class="flashcard-front-glyph" lang="ja">${escapeHtml(item.kanji)}</div>`;
  const coreMeaningFace = `<div class="flashcard-front-prompt"><span>Cách đọc & nghĩa</span><strong lang="ja">${escapeHtml(coreReadings(item))}</strong><p>${escapeHtml(studyMeaning(item))}</p></div>`;
  const front = isVocab
    ? flashcardState.direction === "term-to-meaning"
      ? vocabKanjiFace
      : vocabMeaningFace
    : flashcardState.direction === "kanji-to-meaning"
      ? coreKanjiFace
      : coreMeaningFace;
  const back = isVocab
    ? flashcardState.direction === "term-to-meaning" ? vocabMeaningFace : vocabKanjiFace
    : flashcardState.direction === "meaning-to-kanji" ? coreKanjiFace : `<div class="flashcard-back-content"><div class="flashcard-answer-heading"><b>${escapeHtml(item.hanViet)}</b><span class="answer-separator">·</span><span>${escapeHtml(studyMeaning(item))}</span></div>${kanjiArt(item, true)}<div class="flashcard-readings"><div><span>Âm On</span><b lang="ja">${escapeHtml(toHiragana(item.on || "—"))}</b></div><div><span>Âm Kun</span><b lang="ja">${escapeHtml(toHiragana(item.kun || "—"))}</b></div></div><div class="flashcard-memory-note"><span class="memory-note-icon">${icon("spark", 17)}</span><div><span class="section-kicker">MẸO HÌNH ẢNH</span><p>${escapeHtml(getMnemonic(item))}</p></div></div></div>`;
  const frontLabel = isVocab ? (flashcardState.direction === "term-to-meaning" ? `Từ ${item.word}, nhấn để xem cách đọc và nghĩa.` : `Cách đọc ${item.reading} và nghĩa ${studyMeaning(item)}, nhấn để xem chữ Kanji.`) : (flashcardState.direction === "kanji-to-meaning" ? `Chữ Hán ${item.kanji}. Nhấn để lật thẻ.` : `Cách đọc ${coreReadings(item)} và nghĩa ${studyMeaning(item)}, nhấn để xem chữ Hán.`);
  return `${head}<section class="hikari-study-card" aria-label="Flashcard ${isVocab ? "từ vựng" : "Kanji Core"}">
    <div class="study-progress-bar" role="progressbar" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100" aria-label="Tiến độ thẻ"><i style="width:${progressPercent}%"></i></div>
    <header class="study-card-header"><div class="study-direction-control" role="group" aria-label="Hướng học"><button type="button" class="${flashcardState.direction === (isVocab ? "term-to-meaning" : "kanji-to-meaning") ? "active" : ""}" data-study-direction="${isVocab ? "term-to-meaning" : "kanji-to-meaning"}" aria-pressed="${flashcardState.direction === (isVocab ? "term-to-meaning" : "kanji-to-meaning")}">${isVocab ? "Từ → Nghĩa" : "Chữ Hán → Nghĩa"}</button><button type="button" class="${flashcardState.direction === (isVocab ? "meaning-to-term" : "meaning-to-kanji") ? "active" : ""}" data-study-direction="${isVocab ? "meaning-to-term" : "meaning-to-kanji"}" aria-pressed="${flashcardState.direction === (isVocab ? "meaning-to-term" : "meaning-to-kanji")}">${isVocab ? "Nghĩa → Từ" : "Nghĩa → Chữ Hán"}</button></div><div class="study-card-counter"><span>Thẻ ${index + 1} / ${items.length}</span><span class="scope-badge">Bài ${lesson.number} · Lưu trên máy</span></div><div class="study-session-stats"><span class="stat-known">Đã thuộc: ${knownCount}</span><span class="stat-review">Chưa thuộc: ${flashcardState.review.size}</span></div></header>
    <div class="study-stage"><div class="study-stage-top"><span class="scope-badge">${String(lesson.number).padStart(2, "0")} · ${String(index + 1).padStart(2, "0")}</span><div class="study-stage-actions"><button class="button button-outline study-shuffle-button" type="button" data-action="shuffle-flashcards">${icon("repeat", 15)} Trộn thẻ</button><button class="study-flip-hint" type="button" data-action="flashcard-flip">${flashcardState.flipped ? "Nhấn để xem mặt trước" : "Nhấn để lật xem đáp án"}</button></div></div><div class="flashcard-frame"><div class="flashcard-face ${!flashcardState.flipped ? "active" : ""}" data-action="flashcard-flip" aria-hidden="${flashcardState.flipped}">${vocabAudioButton}${front}</div><div class="flashcard-face ${flashcardState.flipped ? "active" : ""}" data-action="flashcard-flip" aria-hidden="${!flashcardState.flipped}">${vocabAudioButton}${back}</div></div></div>
    <footer class="study-card-footer"><div class="study-card-nav"><button type="button" class="button button-outline" data-action="flashcard-prev" ${index === 0 ? "disabled" : ""}><kbd>←</kbd> Trước</button><button type="button" class="button button-primary" data-action="flashcard-flip"><kbd>Space</kbd> ${flashcardState.flipped ? "Mặt trước" : "Lật thẻ"}</button><button type="button" class="button button-outline" data-action="flashcard-next" ${index === items.length - 1 ? "disabled" : ""}>Tiếp <kbd>→</kbd></button></div><div class="study-card-feedback"><button type="button" class="button button-ghost review-action" data-action="flashcard-review"><kbd>X</kbd> Chưa thuộc</button><button type="button" class="button button-ghost mastered-action" data-action="flashcard-mastered"><kbd>Z</kbd> Đã thuộc</button>${index || knownCount ? `<button type="button" class="button button-ghost" data-action="flashcard-reset">Học lại từ đầu</button>` : ""}</div></footer>
  </section>`;
}

function markCurrentFlashcard(known) {
  const lesson = getLesson(route.lesson);
  const domain = flashcardState.domain;
  const items = getFlashcardItems(lesson);
  const item = items[flashcardState.index];
  if (!item) return;
  const knownBefore = isStudyKnown(item, domain);
  if (known) {
    if (!knownBefore) setKnown(domain, item.id);
    flashcardState.mastered.add(item.id);
    flashcardState.review.delete(item.id);
  } else {
    if (knownBefore) setKnown(domain, item.id);
    flashcardState.review.add(item.id);
    flashcardState.mastered.delete(item.id);
  }
  flashcardState.flipped = false;
  if (flashcardState.index < items.length - 1) flashcardState.index += 1;
  render();
}

function handleLessonMatchChoice(id, kind) {
  const match = flashcardState.match;
  if (!match || match.locked || match.matched.includes(id)) return;
  if (!match.selected) {
    match.selected = { id, kind };
    match.revealed = [{ id, kind }];
    render();
    return;
  }
  if (match.selected.kind === kind) {
    match.selected = { id, kind };
    match.revealed = [{ id, kind }];
    render();
    return;
  }
  match.moves += 1;
  if (match.selected.id === id) {
    match.matched.push(id);
    match.selected = null;
    match.revealed = [];
    render();
    return;
  }
  match.locked = true;
  const current = { id, kind };
  match.revealed = [match.selected, current];
  render();
  window.setTimeout(() => {
    if (flashcardState.match !== match) return;
    match.selected = null;
    match.revealed = [];
    match.locked = false;
    render();
  }, 750);
}

function renderReview() {
  const unknownCore = allCore.filter(core => !isCoreKnown(core)).length;
  const unknownVocab = allVocab.filter(item => !isVocabKnown(item)).length;
  const ready = unknownCore + unknownVocab;
  return `<section class="page-intro"><div><span class="section-kicker">ÔN NGẮN · NHỚ LÂU</span><h2>Góc ôn tập của bạn</h2><p>Chọn bài, rồi chọn riêng Kanji Core hoặc từ vựng để luyện.</p></div><div class="intro-count review-count"><b>${ready}</b><span>mục đang<br/>chờ ôn</span></div></section>
    <div class="review-summary-row"><div class="review-summary-card"><span class="review-summary-glyph">漢</span><div><b>${unknownCore}</b><span>Kanji chưa đánh dấu đã thuộc</span></div></div><div class="review-summary-card"><span class="review-summary-glyph vocab-glyph">語</span><div><b>${unknownVocab}</b><span>Từ vựng chưa đánh dấu đã thuộc</span></div></div></div>
    <section class="practice-lesson-grid">${lessons.map(lessonStudyCard).join("")}</section>
    <div class="privacy-note">${icon("check", 17)} Tiến độ chỉ lưu trên thiết bị này. Không cần tài khoản.</div>`;
}

function lessonStudyCard(lesson) {
  const knownCore = lesson.core.filter(isCoreKnown).length;
  const knownVocab = lesson.vocab.filter(isVocabKnown).length;
  return `<article class="practice-lesson-card"><div class="practice-lesson-top"><span class="lesson-number">${String(lesson.number).padStart(2, "0")}</span><span class="practice-lesson-glyph" lang="ja">${escapeHtml(lesson.core[0]?.kanji || "漢")}</span></div><span class="section-kicker">BÀI ${String(lesson.number).padStart(2, "0")}</span><h3>${escapeHtml(lesson.title)}</h3><div class="practice-lesson-progress"><span>${knownCore}/${lesson.core.length} Kanji Core</span><span>${knownVocab}/${lesson.vocab.length} từ</span></div><div class="practice-lesson-actions"><button class="button button-outline" type="button" data-flashcards="${lesson.number}" data-domain="core">Luyện Kanji Core ${icon("arrow", 15)}</button><button class="button button-outline" type="button" data-flashcards="${lesson.number}" data-domain="vocab">Luyện từ vựng ${icon("arrow", 15)}</button></div></article>`;
}

function renderPractice() {
  return `<section class="page-intro"><div><span class="section-kicker">FLASHCARD · GHÉP CẶP · TRẮC NGHIỆM</span><h2>Luyện theo từng bài</h2><p>Mỗi phiên chỉ lấy Kanji Core hoặc từ vựng của bài bạn chọn.</p></div><div class="intro-count game-count"><b>20</b><span>bài học<br/>riêng biệt</span></div></section>
    <section class="practice-lesson-grid">${lessons.map(lessonStudyCard).join("")}</section>
    <section class="panel game-tip"><div class="game-tip-icon">${icon("spark", 20)}</div><div><span class="section-kicker">NHỚ CHỦ ĐỘNG</span><p>Trong mỗi bài, đổi giữa flashcard, ghép cặp và trắc nghiệm để luyện lại đúng nhóm từ vừa học.</p></div><span class="game-tip-jp">まず<br/>考えて</span></section>`;
}

function getRandomItems(list, count) {
  return shuffled(list).slice(0, count);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function render() {
  if (!lessons.length) return;
  const page = {
    dashboard: renderDashboard,
    lessons: renderLessons,
    lesson: renderLesson,
    "kanji-detail": renderKanjiDetail,
    flashcards: renderFlashcards,
    test: renderKanjiTest,
    vocabulary: renderVocabulary,
    practice: renderPractice,
    review: renderReview
  }[route.view] || renderDashboard;
  app.className = "";
  app.innerHTML = renderShell(page());
  mountKanjiStrokePreviews(app);
}

function enterLesson(number) {
  navigate("lesson", { lesson: number });
}

app.addEventListener("click", event => {
  const target = event.target.closest("[data-action], button");
  if (!target) return;
  if (target.dataset.nav) {
    if (target.dataset.searchKanji) { vocabSearch = target.dataset.searchKanji; vocabFilter = "all"; }
    navigate(target.dataset.nav);
    return;
  }
  if (target.dataset.speak) { speakJapanese(target.dataset.speak); return; }
  if (target.hasAttribute("data-stroke-practice")) {
    openKanjiWritingPractice({
      character: target.dataset.character || "",
      source: target.dataset.strokeSrc || "",
      expectedStrokeCount: Number(target.dataset.strokeCount) || 0,
      trigger: target
    });
    return;
  }
  if (target.dataset.vocabCardPage !== undefined) {
    vocabCardPages.set(target.dataset.vocabCardPage, Number(target.dataset.vocabCardPageStep) || 1);
    render();
    return;
  }
  if (target.dataset.lesson) { enterLesson(Number(target.dataset.lesson)); return; }
  if (target.dataset.flashcards) { navigate("flashcards", { lesson: Number(target.dataset.flashcards), domain: target.dataset.domain || "core" }); return; }
  if (target.dataset.test) { navigate("test", { lesson: Number(target.dataset.test), domain: target.dataset.domain || "core" }); return; }
  if (target.dataset.testRetry !== undefined) { testState = { ...testState, submitted: false, answers: {}, index: 0 }; render(); return; }
  if (target.dataset.testStart !== undefined) { startKanjiTest(getLesson(route.lesson), route.domain); return; }
  if (target.hasAttribute("data-test-shuffle")) {
    const answeredCount = Object.keys(testState.answers).length;
    if (answeredCount && !window.confirm("Trộn lại câu hỏi sẽ xóa các câu trả lời hiện tại. Bạn muốn tiếp tục?")) return;
    startKanjiTest(getLesson(route.lesson), route.domain);
    return;
  }
  if (target.dataset.testAnswer) { testState.answers[testState.index] = target.dataset.testAnswer; render(); return; }
  if (target.dataset.testQuestion !== undefined) { testState.index = Number(target.dataset.testQuestion); render(); return; }
  if (target.hasAttribute("data-test-prev")) { testState.index = Math.max(0, testState.index - 1); render(); return; }
  if (target.hasAttribute("data-test-next")) { testState.index = Math.min(testState.questions.length - 1, testState.index + 1); render(); return; }
  if (target.hasAttribute("data-test-submit")) {
    const unanswered = testState.questions.length - Object.keys(testState.answers).length;
    if (unanswered && !window.confirm(`Còn ${unanswered} câu chưa trả lời. Bạn vẫn muốn nộp bài?`)) return;
    testState.submitted = true;
    const score = testState.questions.filter((question, index) => testState.answers[index] === question.target.id).length;
    const scoreKey = `${route.lesson}-${route.domain}`;
    progress.gamesPlayed += 1;
    progress.bestScores[scoreKey] = Math.max(Number(progress.bestScores[scoreKey]) || 0, score);
    recordStudy(); saveProgress(); render(); return;
  }
  if (target.dataset.vocabOpen) { openVocabDialog(target.dataset.vocabOpen); return; }
  if (target.dataset.flashcardKanji) { openFlashcardKanjiDialog(target.dataset.flashcardKanji, target.dataset.kanjiContext); return; }
  if (target.dataset.action === "close-vocab") { app.querySelector("#vocab-dialog")?.close(); return; }
  if (target.dataset.core) { selectedCoreId = target.dataset.core; render(); return; }
  if (target.dataset.openCore) {
    const core = coreById.get(target.dataset.openCore);
    if (core) navigate("kanji-detail", { lesson: core.lesson, coreId: core.id });
    return;
  }
  if (target.dataset.lessonTab) { lessonTab = target.dataset.lessonTab; lessonSearch = ""; render(); return; }
  if (target.dataset.vocabFilter) { vocabFilter = target.dataset.vocabFilter; vocabLimit = 72; render(); return; }
  if (target.dataset.knownCore) { setKnown("core", target.dataset.knownCore); render(); showToast("Đã cập nhật tiến độ Kanji"); return; }
  if (target.dataset.knownVocab) { setKnown("vocab", target.dataset.knownVocab); render(); showToast("Đã cập nhật từ vựng"); return; }
  if (target.dataset.studyMode) {
    const lesson = getLesson(route.lesson);
    if (!lesson) return;
    flashcardState.mode = target.dataset.studyMode;
    flashcardState.flipped = false;
    if (flashcardState.mode === "quiz") startLessonQuiz(lesson);
    else if (flashcardState.mode === "matching") startLessonMatch(lesson);
    render();
    return;
  }
  if (target.dataset.studyAnswer) {
    const quiz = flashcardState.quiz;
    if (!quiz?.question || quiz.question.selectedId) return;
    quiz.question.selectedId = target.dataset.studyAnswer;
    quiz.question.isCorrect = target.dataset.studyAnswer === quiz.question.target.id;
    if (quiz.question.isCorrect) quiz.score += 1;
    render();
    return;
  }
  if (target.dataset.matchChoice) {
    handleLessonMatchChoice(target.dataset.matchChoice, target.dataset.matchKind);
    return;
  }
  if (target.dataset.studyDirection) {
    flashcardState.direction = target.dataset.studyDirection;
    flashcardState.flipped = false;
    render();
    return;
  }
  if (target.dataset.action === "next-study-question") {
    const quiz = flashcardState.quiz;
    if (!quiz) return;
    quiz.index += 1;
    if (quiz.index < quiz.questions.length) prepareLessonQuizQuestion(getLesson(route.lesson));
    render();
    return;
  }
  if (target.dataset.action === "shuffle-flashcards") {
    const items = getStudyItems(getLesson(route.lesson));
    flashcardState.order = shuffled(items).map(item => item.id);
    flashcardState.index = 0;
    flashcardState.flipped = false;
    render();
    showToast("Đã trộn thứ tự flashcard");
    return;
  }
  if (target.dataset.action === "shuffle-study-quiz") {
    startLessonQuiz(getLesson(route.lesson));
    render();
    showToast("Đã trộn lại thứ tự câu hỏi");
    return;
  }
  if (target.dataset.action === "flashcard-flip") { flashcardState.flipped = !flashcardState.flipped; render(); return; }
  if (target.dataset.action === "flashcard-prev") { flashcardState.index = Math.max(0, flashcardState.index - 1); flashcardState.flipped = false; render(); return; }
  if (target.dataset.action === "flashcard-next") { flashcardState.index = Math.min(getFlashcardItems(getLesson(route.lesson)).length - 1, flashcardState.index + 1); flashcardState.flipped = false; render(); return; }
  if (target.dataset.action === "flashcard-review") { markCurrentFlashcard(false); return; }
  if (target.dataset.action === "flashcard-mastered") { markCurrentFlashcard(true); return; }
  if (target.dataset.action === "flashcard-reset") { flashcardState.index = 0; flashcardState.flipped = false; flashcardState.mastered.clear(); flashcardState.review.clear(); render(); return; }
  if (target.dataset.action === "load-more") { vocabLimit += 72; render(); return; }
  if (target.dataset.action === "toggle-menu") { app.classList.toggle("sidebar-open"); return; }
  if (target.dataset.action === "close-menu") { app.classList.remove("sidebar-open"); return; }
  if (target.dataset.action === "reset-progress") {
    if (window.confirm("Đặt lại toàn bộ tiến độ đã lưu trên thiết bị này?")) {
      progress = { knownCore: [], knownVocab: [], studyDays: [], lastStudyDate: "", streak: 0, lastLesson: 1, gamesPlayed: 0, bestScores: {} };
      saveProgress(); render(); showToast("Tiến độ đã được đặt lại");
    }
    return;
  }
});

app.addEventListener("input", event => {
  const input = event.target;
  if (input.id === "vocab-search") {
    vocabSearch = input.value;
    const list = document.querySelector("#vocab-results");
    const filtered = filteredVocab(allVocab);
    if (list) list.innerHTML = filtered.slice(0, vocabLimit).map(item => vocabRow(item)).join("") || `<div class="empty-state"><span>あ</span><b>Chưa tìm thấy từ nào</b><p>Thử một cách đọc hoặc nghĩa khác nhé.</p></div>`;
    const count = document.querySelector("#vocab-result-count");
    if (count) count.textContent = `${filtered.length} từ được tìm thấy`;
    const load = document.querySelector(".load-more");
    if (load) load.hidden = filtered.length <= vocabLimit;
    if (load && filtered.length > vocabLimit) load.innerHTML = `Xem thêm ${Math.min(72, filtered.length - vocabLimit)} từ <span>(${Math.min(vocabLimit, filtered.length)}/${filtered.length})</span>`;
  }
  if (input.id === "lesson-search") {
    lessonSearch = input.value;
    const lesson = getLesson(route.lesson);
    const results = document.querySelector("#lesson-vocab-results");
    if (lesson && results) results.innerHTML = filteredVocab(lesson.vocab, lessonSearch, "all").map(item => vocabRow(item, true)).join("") || `<div class="empty-state"><span>あ</span><b>Chưa tìm thấy từ nào</b></div>`;
  }
});

app.addEventListener("keydown", event => {
  if (event.key === "/" && route.view === "vocabulary" && document.activeElement?.tagName !== "INPUT") {
    event.preventDefault(); document.querySelector("#vocab-search")?.focus();
  }
});

window.addEventListener("keydown", event => {
  if (route.view !== "flashcards" || flashcardState.mode !== "flashcard") return;
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest("button, a, input, textarea, select, [contenteditable='true'], dialog, [role='dialog']"))) return;
  if (event.key === " " || event.code === "Space") {
    event.preventDefault(); flashcardState.flipped = !flashcardState.flipped; render();
  } else if (event.key === "ArrowRight") {
    event.preventDefault(); flashcardState.index = Math.min(getStudyItems(getLesson(route.lesson)).length - 1, flashcardState.index + 1); flashcardState.flipped = false; render();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault(); flashcardState.index = Math.max(0, flashcardState.index - 1); flashcardState.flipped = false; render();
  } else if (event.key.toLowerCase() === "x") {
    event.preventDefault(); markCurrentFlashcard(false);
  } else if (event.key.toLowerCase() === "z") {
    event.preventDefault(); markCurrentFlashcard(true);
  }
});

window.addEventListener("popstate", () => {
  const nextRoute = routeFromHash();
  if (nextRoute.view === "lesson" && (route.view !== "lesson" || route.lesson !== nextRoute.lesson)) lessonSearch = "";
  route = nextRoute;
  if (route.view === "kanji-detail") {
    const core = coreById.get(route.coreId);
    if (core) { route.lesson = core.lesson; selectedCoreId = core.id; }
  }
  if (route.view === "flashcards" && (route.lesson !== flashcardState.lesson || route.domain !== flashcardState.domain)) {
    flashcardState = { mode: "flashcard", domain: route.domain, lesson: route.lesson, index: 0, order: null, direction: route.domain === "vocab" ? "term-to-meaning" : "kanji-to-meaning", flipped: false, mastered: new Set(), review: new Set(), quiz: null, match: null };
  }
  if (route.view === "test" && (route.lesson !== testState.lesson || route.domain !== testState.domain)) testState = { started: false, submitted: false, questions: [], answers: {}, index: 0, lesson: route.lesson, domain: route.domain };
  render();
});

async function boot() {
  try {
    const [response, flashcardKanjiResponse] = await Promise.all([fetch(DATA_URL), fetch(FLASHCARD_KANJI_URL)]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!flashcardKanjiResponse.ok) throw new Error(`HTTP ${flashcardKanjiResponse.status}`);
    const [lessonData, flashcardKanjiData] = await Promise.all([response.json(), flashcardKanjiResponse.json()]);
    lessons = lessonData;
    flashcardKanjiByCharacter = new Map(Object.entries(flashcardKanjiData.characters || {}));
    allCore = lessons.flatMap(lesson => lesson.core);
    allVocab = lessons.flatMap(lesson => lesson.vocab);
    coreById = new Map(allCore.map(item => [item.id, item]));
    vocabById = new Map(allVocab.map(item => [item.id, item]));
    coreByCharacter = new Map();
    allCore.forEach(item => { if (!coreByCharacter.has(item.kanji)) coreByCharacter.set(item.kanji, item); });
    if (route.view === "kanji-detail") {
      const core = coreById.get(route.coreId);
      if (core) { route.lesson = core.lesson; selectedCoreId = core.id; }
    }
    if (route.view === "test") testState = { started: false, submitted: false, questions: [], answers: {}, index: 0, lesson: route.lesson, domain: route.domain };
    if (route.view === "flashcards") {
      flashcardState = { mode: "flashcard", domain: route.domain || "core", lesson: route.lesson, index: 0, order: null, direction: route.domain === "vocab" ? "term-to-meaning" : "kanji-to-meaning", flipped: false, mastered: new Set(), review: new Set(), quiz: null, match: null };
    }
    progress.knownCore = progress.knownCore.filter(id => coreById.has(id));
    progress.knownVocab = progress.knownVocab.filter(id => vocabById.has(id));
    render();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register(new URL("./sw.js", import.meta.url), { scope: new URL("./", import.meta.url).pathname }).catch(() => {});
    }
  } catch (error) {
    app.className = "load-error";
    app.innerHTML = `<div class="error-card"><span>漢</span><h1>Chưa mở được bộ dữ liệu</h1><p>${escapeHtml(error.message)}. Hãy mở website qua máy chủ tĩnh thay vì nhấn trực tiếp vào tệp HTML.</p><code>python3 -m http.server 8000</code></div>`;
  }
}

boot();

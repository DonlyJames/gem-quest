/* ============================================================
   Kingdom Restored — match-3 puzzle with a kingdom-restoration
   meta layer. Original game, original code/art (no third-party
   assets), inspired by the mobile match-3 + city-building genre.
   ============================================================ */

(() => {
  "use strict";

  window.addEventListener("error", (e) => {
    console.error("Kingdom Restored error:", e.error || e.message);
    const t = document.getElementById("toast");
    if (t) {
      t.textContent = "Error: " + (e.message || "see console");
      t.classList.add("show");
      t.style.background = "#7B2D3A";
    }
  });

  /* ---------- constants ---------- */
  const GRID = 8;
  const TYPE_NAMES = ["Crown", "Shield", "Gem", "Potion", "Scroll", "Coin"];
  const TYPE_COLORS = ["#E8CB6B", "#B4485C", "#5FB6D9", "#57B58B", "#D9CBA9", "#E0AE3A"];

  function tileIconSVG(type, extraClass) {
    const c = TYPE_COLORS[type];
    const shapes = [
      // 0 crown
      `<polygon points="4,17 4,9 8,13 12,6 16,13 20,9 20,17" fill="${c}"/><rect x="4" y="18" width="16" height="2.4" rx="1" fill="${c}"/>`,
      // 1 shield
      `<polygon points="12,2 20,6 20,13 12,22 4,13 4,6" fill="${c}"/>`,
      // 2 gem
      `<polygon points="12,2 20,9 12,22 4,9" fill="${c}"/>`,
      // 3 potion
      `<rect x="9.5" y="2" width="5" height="6" fill="${c}"/><polygon points="8,8 16,8 20.5,19 3.5,19" fill="${c}"/>`,
      // 4 scroll
      `<rect x="3" y="5" width="18" height="14" rx="7" fill="${c}"/><rect x="7" y="9" width="10" height="1.6" rx="0.8" fill="rgba(0,0,0,0.22)"/><rect x="7" y="13" width="7" height="1.6" rx="0.8" fill="rgba(0,0,0,0.22)"/>`,
      // 5 coin
      `<circle cx="12" cy="12" r="10" fill="${c}"/><circle cx="12" cy="12" r="5.5" fill="rgba(0,0,0,0.22)"/>`,
    ];
    return `<svg class="tile-icon ${extraClass || ""}" viewBox="0 0 24 24" aria-hidden="true">${shapes[type]}</svg>`;
  }

  /* simple building silhouettes, cycled + tinted per node */
  function buildingSVG(idx) {
    const templates = [
      // tower
      `<rect x="9" y="20" width="14" height="30" fill="var(--gold)"/><rect x="7" y="12" width="18" height="10" fill="var(--gold-light)"/><polygon points="16,2 25,12 7,12" fill="var(--burgundy-light)"/><rect x="13" y="34" width="6" height="16" fill="var(--navy-deep)"/>`,
      // hall
      `<rect x="4" y="24" width="40" height="26" fill="var(--gold)"/><polygon points="24,6 46,24 2,24" fill="var(--burgundy-light)"/><rect x="19" y="34" width="10" height="16" fill="var(--navy-deep)"/><rect x="8" y="30" width="6" height="6" fill="var(--navy-deep)"/><rect x="34" y="30" width="6" height="6" fill="var(--navy-deep)"/>`,
      // arch / bridge
      `<rect x="2" y="38" width="44" height="10" fill="var(--gold)"/><path d="M10 38 a14 14 0 0 1 28 0" fill="none" stroke="var(--burgundy-light)" stroke-width="6"/>`,
      // pavilion / tent
      `<polygon points="24,4 44,48 4,48" fill="var(--burgundy-light)"/><polygon points="24,4 34,48 14,48" fill="var(--gold)"/><rect x="18" y="34" width="12" height="14" fill="var(--navy-deep)"/>`,
    ];
    return `<svg viewBox="0 0 48 52" aria-hidden="true">${templates[idx % templates.length]}</svg>`;
  }

  const starSVG = (filled, cls) =>
    `<svg viewBox="0 0 24 24" class="${cls || ""} ${filled ? "filled" : ""}"><path d="M12 2l2.9 6.6L22 9.3l-5.2 4.7L18.2 21 12 17.3 5.8 21l1.4-7-5.2-4.7 7.1-.7z"/></svg>`;

  /* ---------- level design ---------- */
  const LEVEL_META = [
    ["Crumbled Gatehouse", 20, [[0, 14]]],
    ["The Old Well", 20, [[1, 14]]],
    ["Market Stalls", 22, [[2, 12], [4, 10]]],
    ["Stone Bridge", 22, [[3, 14]]],
    ["Village Chapel", 24, [[0, 10], [5, 12]]],
    ["Watchtower", 24, [[1, 12], [2, 12]]],
    ["Barracks Yard", 26, [[3, 10], [4, 10], [5, 10]]],
    ["Stable Row", 26, [[0, 16]]],
    ["Garden Terrace", 27, [[2, 14], [3, 14]]],
    ["Grand Library", 28, [[1, 10], [4, 14], [5, 10]]],
    ["Harbor Dock", 28, [[0, 12], [2, 12], [3, 12]]],
    ["Throne Room", 30, [[5, 16], [1, 12], [0, 12]]],
  ];
  const LEVELS = LEVEL_META.map(([name, moves, goals], i) => ({
    id: i,
    name,
    moveLimit: moves,
    goals: goals.map(([type, count]) => ({ type, count })),
    building: i,
  }));

  /* ---------- persistence ---------- */
  const SAVE_KEY = "kingdomRestored.progress.v1";
  function loadProgress() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { unlocked: 1, stars: {} };
  }
  function saveProgress(p) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(p));
    } catch (e) {}
  }
  let progress = loadProgress();

  function totalStars() {
    return Object.values(progress.stars).reduce((a, b) => a + b, 0);
  }

  /* tap helper: fires only on a genuine tap (little/no finger movement),
     so taps inside scrollable areas don't get lost as scroll gestures.
     Also binds a plain click as a fallback for any browser/setup where
     pointer events behave unexpectedly. */
  function addTapListener(el, handler) {
    if (!el) return;
    let sx = 0, sy = 0, firedAt = 0;
    const fire = (e) => {
      firedAt = Date.now();
      try {
        handler(e);
      } catch (err) {
        console.error(err);
        toast("Error: " + err.message);
      }
    };
    el.addEventListener("pointerdown", (e) => {
      sx = e.clientX;
      sy = e.clientY;
    });
    el.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 12) fire(e);
    });
    // fallback: if pointer events didn't fire it for some reason, plain click still will
    el.addEventListener("click", (e) => {
      if (Date.now() - firedAt > 300) fire(e);
    });
  }

  /* ---------- DOM refs ---------- */
  const $ = (id) => document.getElementById(id);
  const screens = {
    title: $("screen-title"),
    map: $("screen-map"),
    game: $("screen-game"),
  };
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._h);
    toast._h = setTimeout(() => t.classList.remove("show"), 1600);
  }

  /* ================= TITLE ================= */
  $("btn-play").addEventListener("click", () => {
    renderMap();
    showScreen("map");
  });
  $("btn-reset-progress").addEventListener("click", () => {
    if (confirm("Reset all kingdom progress? This can't be undone.")) {
      progress = { unlocked: 1, stars: {} };
      saveProgress(progress);
      toast("Progress reset");
    }
  });

  /* ================= KINGDOM MAP ================= */
  function nodePosition(i) {
    const yTop = 60;
    const ySpacing = 108;
    const y = yTop + (LEVELS.length - 1 - i) * ySpacing;
    const x = 50 + 26 * Math.sin(i * 0.85 + 0.3);
    return { x, y };
  }

  function renderMap() {
    $("star-total").textContent = totalStars();
    const restoredCount = LEVELS.filter((l) => (progress.stars[l.id] || 0) > 0).length;
    $("map-progress-pill").textContent = `${restoredCount} / ${LEVELS.length} restored`;

    const path = $("map-path");
    path.innerHTML = "";
    const totalHeight = 60 + (LEVELS.length - 1) * 108 + 140;
    path.style.minHeight = totalHeight + "px";
    document.getElementById("map-backdrop").setAttribute("height", totalHeight);
    document.getElementById("map-backdrop").setAttribute("viewBox", `0 0 400 ${totalHeight}`);

    LEVELS.forEach((lvl, i) => {
      const { x, y } = nodePosition(i);
      const stars = progress.stars[lvl.id] || 0;
      const playable = i < progress.unlocked;
      const isCurrent = i === progress.unlocked - 1 && stars === 0;

      const node = document.createElement("div");
      node.className = "map-node" + (playable ? "" : " locked") + (isCurrent ? " current" : "");
      node.style.left = x + "%";
      node.style.top = y + "px";
      node.innerHTML = `
        <button class="node-btn" ${playable ? "" : "disabled"} aria-label="${lvl.name}">
          ${playable ? i + 1 : `<svg viewBox="0 0 24 24"><path d="M6 10V8a6 6 0 0112 0v2h1a1 1 0 011 1v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9a1 1 0 011-1h1zm2 0h8V8a4 4 0 00-8 0v2z"/></svg>`}
        </button>
        <div class="node-stars">
          ${[0, 1, 2].map((s) => starSVG(s < stars, "")).join("")}
        </div>
      `;
      if (playable) {
        addTapListener(node.querySelector(".node-btn"), () => openLevelModal(lvl.id));
      }
      path.appendChild(node);

      // building slot, offset to alternating side
      const bx = x + (i % 2 === 0 ? 16 : -16);
      const slot = document.createElement("div");
      slot.className = "building-slot" + (stars > 0 ? " restored" : "");
      slot.style.left = bx + "%";
      slot.style.top = y - 46 + "px";
      slot.innerHTML = buildingSVG(lvl.building);
      path.appendChild(slot);
    });

    // scroll near current level
    requestAnimationFrame(() => {
      const idx = Math.max(0, progress.unlocked - 1);
      const { y } = nodePosition(idx);
      const scroller = $("map-scroll");
      scroller.scrollTop = Math.max(0, y - scroller.clientHeight * 0.55);
    });
  }

  /* ---- level intro modal ---- */
  let pendingLevelId = null;
  function openLevelModal(id) {
    pendingLevelId = id;
    const lvl = LEVELS[id];
    $("level-modal-eyebrow").textContent = `Level ${id + 1}`;
    $("level-modal-title").textContent = lvl.name;
    $("level-modal-moves").textContent = `${lvl.moveLimit} moves`;
    $("level-modal-goals").innerHTML = lvl.goals
      .map(
        (g) => `<div class="goal-chip">${tileIconSVG(g.type)}<span>${g.count}</span></div>`
      )
      .join("");
    $("modal-level").classList.add("active");
  }
  $("btn-cancel-level").addEventListener("click", () => $("modal-level").classList.remove("active"));
  $("btn-start-level").addEventListener("click", () => {
    $("modal-level").classList.remove("active");
    startLevel(pendingLevelId);
  });

  /* ================= GAME ENGINE ================= */
  let state = null; // current level runtime state
  const boardEl = $("board");

  function randType() {
    return Math.floor(Math.random() * TYPE_NAMES.length);
  }

  function makeBoardNoMatches() {
    const b = new Array(GRID * GRID).fill(0);
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        let t;
        let tries = 0;
        do {
          t = randType();
          tries++;
        } while (
          tries < 30 &&
          ((c >= 2 && b[idx(r, c - 1)] === t && b[idx(r, c - 2)] === t) ||
            (r >= 2 && b[idx(r - 1, c)] === t && b[idx(r - 2, c)] === t))
        );
        b[idx(r, c)] = t;
      }
    }
    return b;
  }
  function idx(r, c) {
    return r * GRID + c;
  }

  function startLevel(id) {
    const lvl = LEVELS[id];
    state = {
      levelId: id,
      board: makeBoardNoMatches(),
      movesLeft: lvl.moveLimit,
      moveLimit: lvl.moveLimit,
      goals: lvl.goals.map((g) => ({ ...g, remaining: g.count })),
      selected: null,
      busy: false,
      ended: false,
    };
    $("game-level-label").textContent = `Level ${id + 1} · ${lvl.name}`;
    renderGoals();
    renderMoves();
    renderProgressBar();
    buildBoardDOM();
    showScreen("game");
  }

  function renderGoals() {
    $("game-goals").innerHTML = state.goals
      .map(
        (g) =>
          `<div class="goal-chip ${g.remaining <= 0 ? "done" : ""}" data-type="${g.type}">${tileIconSVG(
            g.type
          )}<span>${Math.max(g.remaining, 0)}</span></div>`
      )
      .join("");
  }
  function renderMoves() {
    const pill = $("moves-left").parentElement;
    $("moves-left").textContent = state.movesLeft;
    pill.classList.toggle("low", state.movesLeft <= Math.max(3, Math.round(state.moveLimit * 0.15)));
  }
  function renderProgressBar() {
    const totalNeeded = state.goals.reduce((a, g) => a + g.count, 0);
    const totalDone = state.goals.reduce((a, g) => a + (g.count - Math.max(g.remaining, 0)), 0);
    $("progress-fill").style.width = totalNeeded ? `${(totalDone / totalNeeded) * 100}%` : "0%";
  }

  function buildBoardDOM() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = `repeat(${GRID}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${GRID}, 1fr)`;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = document.createElement("div");
        cell.className = "tile";
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.innerHTML = tileIconSVG(state.board[idx(r, c)]);
        attachTileEvents(cell);
        boardEl.appendChild(cell);
      }
    }
  }

  function cellAt(r, c) {
    return boardEl.children[idx(r, c)];
  }

  /* ---- input handling: tap-select + swipe ---- */
  function attachTileEvents(cell) {
    let startX = 0,
      startY = 0,
      startT = 0,
      moved = false;

    cell.addEventListener("pointerdown", (e) => {
      if (state.busy || state.ended) return;
      startX = e.clientX;
      startY = e.clientY;
      startT = Date.now();
      moved = false;
    });

    cell.addEventListener("pointerup", (e) => {
      if (state.busy || state.ended) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dist = Math.hypot(dx, dy);
      const r = +cell.dataset.r,
        c = +cell.dataset.c;

      if (dist > 22) {
        // swipe -> directional swap
        let tr = r,
          tc = c;
        if (Math.abs(dx) > Math.abs(dy)) {
          tc = c + (dx > 0 ? 1 : -1);
        } else {
          tr = r + (dy > 0 ? 1 : -1);
        }
        clearSelection();
        attemptSwap(r, c, tr, tc);
      } else {
        // tap -> select/swap/deselect
        handleTap(r, c);
      }
    });
  }

  function clearSelection() {
    if (state.selected) {
      const { r, c } = state.selected;
      cellAt(r, c)?.classList.remove("selected");
    }
    state.selected = null;
  }

  function handleTap(r, c) {
    if (!state.selected) {
      state.selected = { r, c };
      cellAt(r, c).classList.add("selected");
      return;
    }
    const { r: sr, c: sc } = state.selected;
    if (sr === r && sc === c) {
      clearSelection();
      return;
    }
    const isAdjacent = Math.abs(sr - r) + Math.abs(sc - c) === 1;
    clearSelection();
    if (isAdjacent) {
      attemptSwap(sr, sc, r, c);
    } else {
      state.selected = { r, c };
      cellAt(r, c).classList.add("selected");
    }
  }

  function inBounds(r, c) {
    return r >= 0 && r < GRID && c >= 0 && c < GRID;
  }

  function attemptSwap(r1, c1, r2, c2) {
    if (!inBounds(r2, c2) || !inBounds(r1, c1)) return;
    if (state.busy || state.ended) return;
    const i1 = idx(r1, c1),
      i2 = idx(r2, c2);
    swapVals(i1, i2);
    const matches = findMatches(state.board);
    if (matches.size === 0) {
      // invalid — swap back with a little shake
      swapVals(i1, i2);
      const c1el = cellAt(r1, c1),
        c2el = cellAt(r2, c2);
      [c1el, c2el].forEach((el) => {
        el.style.transition = "transform .1s ease";
        el.style.transform = "scale(0.9)";
        setTimeout(() => (el.style.transform = ""), 120);
      });
      return;
    }
    state.movesLeft--;
    state.busy = true;
    renderBoardDiff([i1, i2]);
    renderMoves();
    setTimeout(() => resolveMatches(), 120);
  }

  function swapVals(i1, i2) {
    const tmp = state.board[i1];
    state.board[i1] = state.board[i2];
    state.board[i2] = tmp;
  }

  function renderBoardDiff(indices) {
    indices.forEach((i) => {
      const r = Math.floor(i / GRID),
        c = i % GRID;
      const el = cellAt(r, c);
      el.innerHTML = tileIconSVG(state.board[i]);
    });
  }

  function findMatches(board) {
    const matched = new Set();
    // rows
    for (let r = 0; r < GRID; r++) {
      let runStart = 0;
      for (let c = 1; c <= GRID; c++) {
        const prev = board[idx(r, c - 1)];
        const cur = c < GRID ? board[idx(r, c)] : -1;
        if (cur !== prev) {
          if (c - runStart >= 3) {
            for (let k = runStart; k < c; k++) matched.add(idx(r, k));
          }
          runStart = c;
        }
      }
    }
    // cols
    for (let c = 0; c < GRID; c++) {
      let runStart = 0;
      for (let r = 1; r <= GRID; r++) {
        const prev = board[idx(r - 1, c)];
        const cur = r < GRID ? board[idx(r, c)] : -1;
        if (cur !== prev) {
          if (r - runStart >= 3) {
            for (let k = runStart; k < r; k++) matched.add(idx(k, c));
          }
          runStart = r;
        }
      }
    }
    return matched;
  }

  function resolveMatches() {
    const matched = findMatches(state.board);
    if (matched.size === 0) {
      state.busy = false;
      checkEndConditions();
      return;
    }

    // tally goal progress + animate removal
    const counts = {};
    matched.forEach((i) => {
      const t = state.board[i];
      counts[t] = (counts[t] || 0) + 1;
      const r = Math.floor(i / GRID),
        c = i % GRID;
      cellAt(r, c).classList.add("matched");
    });
    state.goals.forEach((g) => {
      if (counts[g.type]) g.remaining = Math.max(0, g.remaining - counts[g.type]);
    });
    renderGoals();
    renderProgressBar();

    setTimeout(() => {
      matched.forEach((i) => (state.board[i] = null));
      collapseAndRefill();
      buildBoardDOM();
      setTimeout(() => resolveMatches(), 260);
    }, 220);
  }

  function collapseAndRefill() {
    for (let c = 0; c < GRID; c++) {
      const colVals = [];
      for (let r = GRID - 1; r >= 0; r--) {
        const v = state.board[idx(r, c)];
        if (v !== null) colVals.push(v);
      }
      const missing = GRID - colVals.length;
      for (let k = 0; k < missing; k++) colVals.push(randType());
      for (let r = GRID - 1, k = 0; r >= 0; r--, k++) {
        state.board[idx(r, c)] = colVals[k];
      }
    }
  }

  function hasPossibleMove() {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ]) {
          const r2 = r + dr,
            c2 = c + dc;
          if (!inBounds(r2, c2)) continue;
          swapVals(idx(r, c), idx(r2, c2));
          const m = findMatches(state.board).size > 0;
          swapVals(idx(r, c), idx(r2, c2));
          if (m) return true;
        }
      }
    }
    return false;
  }

  function checkEndConditions() {
    if (state.ended) return;
    const goalsMet = state.goals.every((g) => g.remaining <= 0);
    if (goalsMet) {
      state.ended = true;
      endLevel(true);
      return;
    }
    if (state.movesLeft <= 0) {
      state.ended = true;
      endLevel(false);
      return;
    }
    if (!hasPossibleMove()) {
      state.board = makeBoardNoMatches();
      buildBoardDOM();
      toast("No moves left — board reshuffled");
    }
  }

  /* ---- end of level ---- */
  function endLevel(won) {
    const lvl = LEVELS[state.levelId];
    const modal = $("modal-result");
    const starsRow = $("stars-row");
    starsRow.querySelectorAll("svg").forEach((s) => s.classList.remove("filled", "pending"));

    if (won) {
      const frac = state.movesLeft / state.moveLimit;
      const stars = frac >= 0.4 ? 3 : frac >= 0.15 ? 2 : 1;
      const prevStars = progress.stars[lvl.id] || 0;
      progress.stars[lvl.id] = Math.max(prevStars, stars);
      if (lvl.id + 1 === progress.unlocked && progress.unlocked < LEVELS.length) {
        progress.unlocked = Math.max(progress.unlocked, lvl.id + 2);
      } else if (progress.unlocked < lvl.id + 2) {
        progress.unlocked = Math.min(LEVELS.length, lvl.id + 2);
      }
      saveProgress(progress);

      $("result-icon").textContent = "🏰";
      $("result-title").textContent = "Restored!";
      $("result-sub").textContent = `${lvl.name} rises again.`;
      const starEls = [...starsRow.querySelectorAll("svg")];
      starEls.forEach((el, i) => {
        setTimeout(() => {
          if (i < stars) el.classList.add("filled", "pending");
        }, i * 180);
      });
      $("btn-result-primary").textContent = "Back to Kingdom";
      $("btn-result-secondary").textContent = "Replay";
    } else {
      $("result-icon").textContent = "⛏️";
      $("result-title").textContent = "Out of moves";
      $("result-sub").textContent = `${lvl.name} still needs work. Try again?`;
      $("btn-result-primary").textContent = "Back to Kingdom";
      $("btn-result-secondary").textContent = "Retry";
    }
    modal.classList.add("active");
  }

  $("btn-result-primary").addEventListener("click", () => {
    $("modal-result").classList.remove("active");
    renderMap();
    showScreen("map");
  });
  $("btn-result-secondary").addEventListener("click", () => {
    $("modal-result").classList.remove("active");
    startLevel(state.levelId);
  });
  $("btn-quit-game").addEventListener("click", () => {
    renderMap();
    showScreen("map");
  });

  /* ---------- boot ---------- */
  showScreen("title");
})();

const state = {
  data: null,
  dirty: false,
  lastWorkbookModified: null,
  saves: [],
  activeSaveId: null,
  advantageMode: "auto",
};

const APP_VERSION = "v2026.06.22.2";

const fields = [
  ["number", "Number", "number"],
  ["missileNumber", "Missiles", "number"],
  ["salvoSize", "Salvo size", "number"],
  ["effectiveSalvo", "Eff. salvo", "number"],
  ["asmdCapability", "ASMD", "number"],
  ["neutralizeHits", "Neutralize", "number"],
];

const formatNumber = (value, digits = 1) => {
  const number = Number(value || 0);
  if (Math.abs(number - Math.round(number)) < 1e-9) return String(Math.round(number));
  return number.toLocaleString("en-US", { maximumFractionDigits: digits });
};

const formatPercent = (value) =>
  `${(Number(value || 0) * 100).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })}%`;

const byId = (id) => document.getElementById(id);

const getSalvoFactor = (mode) => ({ minimum: 1, optimum: 2, maximum: 3 })[mode] || 0;

function calculateForce(force) {
  const factor = getSalvoFactor(force.salvoMode);
  const rows = force.rows.map((row) => {
    const number = Number(row.number || 0);
    const effectiveSalvo = Number(row.effectiveSalvo || 0);
    const asmd = Number(row.asmdCapability || 0);
    const neutralize = Number(row.neutralizeHits || 0);
    return {
      ...row,
      salvoSize: factor,
      firePower: number * factor * effectiveSalvo,
      defensePower: number * asmd,
      stayingPower: number * neutralize,
    };
  });

  force.salvoFactor = factor;
  force.rows = rows;
  force.totals = {
    units: rows.reduce(
      (sum, row) => sum + (row.countInUnitTotal ? Number(row.number || 0) : 0),
      0,
    ),
    firePower: rows.reduce((sum, row) => sum + Number(row.firePower || 0), 0),
    defensePower: rows.reduce((sum, row) => sum + Number(row.defensePower || 0), 0),
    stayingPower: rows.reduce((sum, row) => sum + Number(row.stayingPower || 0), 0),
  };
}

function recalculate() {
  const { red, blue } = state.data.forces;
  calculateForce(red);
  calculateForce(blue);

  const blueDamageByRed = blue.totals.stayingPower
    ? (red.totals.firePower - blue.totals.defensePower) / blue.totals.stayingPower
    : 0;
  const redDamageByBlue = red.totals.stayingPower
    ? (blue.totals.firePower - red.totals.defensePower) / red.totals.stayingPower
    : 0;
  const advantage =
    Math.abs(blueDamageByRed - redDamageByBlue) < 1e-9
      ? "balanced"
      : blueDamageByRed > redDamageByBlue
        ? "red"
        : "blue";

  state.data.combat = { blueDamageByRed, redDamageByBlue, advantage };
}

function setText(id, value) {
  byId(id).textContent = value;
}

function renderCombat() {
  const { red, blue } = state.data.forces;
  const combat = state.data.combat;

  setText("redDamage", formatPercent(combat.redDamageByBlue));
  setText("blueDamage", formatPercent(combat.blueDamageByRed));
  setText("blueDamageByRedExact", Number(combat.blueDamageByRed || 0).toFixed(9));
  setText("redDamageByBlueExact", Number(combat.redDamageByBlue || 0).toFixed(9));

  setText("redUnits", formatNumber(red.totals.units));
  setText("redFire", formatNumber(red.totals.firePower));
  setText("redDefense", formatNumber(red.totals.defensePower));
  setText("redStaying", formatNumber(red.totals.stayingPower));

  setText("blueUnits", formatNumber(blue.totals.units));
  setText("blueFire", formatNumber(blue.totals.firePower));
  setText("blueDefense", formatNumber(blue.totals.defensePower));
  setText("blueStaying", formatNumber(blue.totals.stayingPower));

  const advantage = byId("advantageText");
  advantage.className = "advantage";
  const selectedAdvantage = state.advantageMode === "auto" ? combat.advantage : state.advantageMode;
  const advantageSelect = byId("advantageSelect");
  if (advantageSelect) advantageSelect.value = state.advantageMode;
  if (selectedAdvantage === "red") {
    advantage.textContent = "Current advantage: Red Force";
    advantage.classList.add("red");
  } else if (selectedAdvantage === "blue") {
    advantage.textContent = "Current advantage: Blue Force";
    advantage.classList.add("blue");
  } else {
    advantage.textContent = "Current advantage: Balanced";
  }
}

function renderEditors() {
  const grid = byId("editorGrid");
  grid.innerHTML = "";
  ["red", "blue"].forEach((key) => {
    const force = state.data.forces[key];
    const card = document.createElement("article");
    card.className = `editor-card ${key}`;
    card.innerHTML = `
      <div class="editor-toolbar">
        <h3>${force.label}</h3>
        <div class="toolbar-control">
          <label for="${key}-mode">Salvo size</label>
          <select id="${key}-mode" data-force="${key}" data-field="salvoMode">
            <option value="minimum">minimum</option>
            <option value="optimum">optimum</option>
            <option value="maximum">maximum</option>
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Unit</th>
              ${fields.map(([, label]) => `<th>${label}</th>`).join("")}
              <th>Fire</th>
              <th>Defense</th>
              <th>Staying</th>
            </tr>
          </thead>
          <tbody>
            ${force.rows.map((row, index) => renderRow(force.key, row, index)).join("")}
          </tbody>
        </table>
      </div>
    `;
    grid.appendChild(card);
    card.querySelector("select").value = force.salvoMode;
  });
}

function renderRow(forceKey, row, index) {
  return `
    <tr data-force="${forceKey}" data-index="${index}">
      <td><input class="unit-input" value="${escapeAttr(row.unit)}" data-field="unit" /></td>
      ${fields
        .map(([key, , type]) => {
          if (key === "salvoSize") {
            return `<td class="readonly" data-calc="salvoSize">${formatNumber(row.salvoSize)}</td>`;
          }
          const step = key === "number" || key === "missileNumber" ? "1" : "0.1";
          return `<td><input type="${type}" step="${step}" value="${row[key] ?? 0}" data-field="${key}" /></td>`;
        })
        .join("")}
      <td class="readonly" data-calc="firePower">${formatNumber(row.firePower)}</td>
      <td class="readonly" data-calc="defensePower">${formatNumber(row.defensePower)}</td>
      <td class="readonly" data-calc="stayingPower">${formatNumber(row.stayingPower)}</td>
    </tr>
  `;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function updateCalculatedCells() {
  document.querySelectorAll("tr[data-force]").forEach((tr) => {
    const force = state.data.forces[tr.dataset.force];
    const row = force.rows[Number(tr.dataset.index)];
    tr.querySelector('[data-calc="salvoSize"]').textContent = formatNumber(row.salvoSize);
    tr.querySelector('[data-calc="firePower"]').textContent = formatNumber(row.firePower);
    tr.querySelector('[data-calc="defensePower"]').textContent = formatNumber(row.defensePower);
    tr.querySelector('[data-calc="stayingPower"]').textContent = formatNumber(row.stayingPower);
  });
}

function renderRosters() {
  ["red", "blue"].forEach((key) => {
    const force = state.data.forces[key];
    const roster = byId(`${key}Roster`);
    const visibleRows = force.rows.filter((row) => row.unit || Number(row.number || 0));
    roster.innerHTML = visibleRows
      .map(
        (row) => `
          <div class="roster-item">
            <span>${escapeHtml(row.unit || `Row ${row.row}`)}</span>
            <strong class="count-pill">${formatNumber(row.number)}</strong>
          </div>
        `,
      )
      .join("");
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderAll() {
  recalculate();
  renderCombat();
  renderEditors();
  renderRosters();
  renderSavedScenarios();
  updateFileStatus();
}

function refreshAfterInput() {
  recalculate();
  updateCalculatedCells();
  renderCombat();
  renderRosters();
  updateFileStatus();
}

function prepareForceBaselines(force) {
  force.rows = force.rows.map((row) => ({
    ...row,
    baseMissileNumber: Number(row.baseMissileNumber ?? row.missileNumber ?? 0),
  }));
}

function prepareAllBaselines() {
  if (!state.data?.forces) return;
  prepareForceBaselines(state.data.forces.red);
  prepareForceBaselines(state.data.forces.blue);
}

function consumeMissilesForSalvo(force) {
  const factor = getSalvoFactor(force.salvoMode);
  force.rows = force.rows.map((row) => ({
    ...row,
    baseMissileNumber: Number(row.baseMissileNumber ?? row.missileNumber ?? 0),
    salvoSize: factor,
    missileNumber: Number(row.baseMissileNumber ?? row.missileNumber ?? 0) - factor,
  }));
}

function updateFileStatus() {
  const workbook = state.data?.workbook;
  if (!workbook) return;
  if (state.data?.staticMode) {
    byId("fileStatus").textContent = `Preview only · ${workbook.name}`;
    byId("saveButton").disabled = true;
    return;
  }
  const changed = state.dirty ? "Unsaved changes" : "Synced";
  byId("fileStatus").textContent = `${changed} · ${workbook.name}`;
  byId("saveButton").disabled = !state.dirty;
}

async function loadState({ silent = false } = {}) {
  try {
    const response = await fetch("/api/state");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Cannot load workbook");
    state.data = data;
    prepareAllBaselines();
    state.dirty = false;
    state.lastWorkbookModified = data.workbook.lastModified;
    renderAll();
    if (!silent) showToast("Loaded Excel data", "ok");
  } catch (error) {
    try {
      const response = await fetch("data.json");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cannot load static data");
      data.staticMode = true;
      state.data = data;
      prepareAllBaselines();
      state.dirty = false;
      state.lastWorkbookModified = data.workbook.lastModified;
      renderAll();
      if (!silent) showToast("Loaded static website preview", "ok");
    } catch {
      showToast(error.message, "error");
    }
  }
}

async function saveState() {
  if (state.data?.staticMode) {
    showToast("Static preview cannot save to Excel. Run the local server to save.", "error");
    return;
  }
  try {
    byId("saveButton").disabled = true;
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forces: state.data.forces }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Cannot save workbook");
    state.data = data;
    state.dirty = false;
    state.lastWorkbookModified = data.workbook.lastModified;
    renderAll();
    showToast("Saved to Excel and created a backup", "ok");
  } catch (error) {
    byId("saveButton").disabled = false;
    showToast(error.message, "error");
  }
}

function updateFileStatus() {
  const workbook = state.data?.workbook;
  if (!workbook) return;
  if (state.data?.staticMode) {
    const changed = state.dirty ? "Edited in browser" : "Ready to download";
    byId("fileStatus").textContent = `${changed} · ${workbook.name}`;
    byId("saveButton").disabled = false;
    return;
  }
  const changed = state.dirty ? "Unsaved changes" : "Synced";
  byId("fileStatus").textContent = `${changed} · ${workbook.name}`;
  byId("saveButton").disabled = !state.dirty;
}

async function saveState() {
  if (state.data?.staticMode) {
    await downloadStaticWorkbook();
    return;
  }
  try {
    byId("saveButton").disabled = true;
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forces: state.data.forces }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Cannot save workbook");
    state.data = data;
    state.dirty = false;
    state.lastWorkbookModified = data.workbook.lastModified;
    renderAll();
    showToast("Saved to Excel and created a backup", "ok");
  } catch (error) {
    byId("saveButton").disabled = false;
    showToast(error.message, "error");
  }
}

function writeCell(sheet, address, value) {
  const numericValue = Number(value);
  const isNumber = value !== "" && value !== null && Number.isFinite(numericValue);
  sheet[address] = isNumber ? { t: "n", v: numericValue } : { t: "s", v: String(value ?? "") };
}

function writeForceToWorkbook(workbook, force) {
  const sheet = workbook.Sheets[force.sheet];
  if (!sheet) throw new Error(`Missing worksheet: ${force.sheet}`);
  writeCell(sheet, "C2", force.salvoMode || "minimum");
  force.rows.forEach((row) => {
    const r = row.row;
    writeCell(sheet, `C${r}`, row.unit || "");
    writeCell(sheet, `D${r}`, row.number || 0);
    writeCell(sheet, `E${r}`, row.missileNumber || 0);
    writeCell(sheet, `G${r}`, row.effectiveSalvo || 0);
    writeCell(sheet, `I${r}`, row.asmdCapability || 0);
    writeCell(sheet, `J${r}`, row.neutralizeHits || 0);
  });
}

async function downloadStaticWorkbook() {
  try {
    if (!window.XLSX) {
      throw new Error("Excel writer is still loading. Please try again in a moment.");
    }
    byId("saveButton").disabled = true;
    recalculate();

    const sourceName = state.data.workbook.name || "salvo equation .xlsx";
    const response = await fetch(encodeURI(sourceName), { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot load the Excel template from GitHub Pages.");

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellFormula: true, cellStyles: true });
    writeForceToWorkbook(workbook, state.data.forces.red);
    writeForceToWorkbook(workbook, state.data.forces.blue);
    workbook.Workbook = workbook.Workbook || {};
    workbook.Workbook.CalcPr = { calcMode: "auto" };

    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true });
    const blob = new Blob([output], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    link.href = URL.createObjectURL(blob);
    link.download = `salvo-equation-edited-${stamp}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    state.dirty = false;
    updateFileStatus();
    showToast("Downloaded edited Excel file", "ok");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    updateFileStatus();
  }
}

function showToast(message, type = "ok") {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

const SAVE_STORAGE_KEY = "waroperation.savedScenarios.v1";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSavedScenarios() {
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedScenarios() {
  localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(state.saves));
}

function formatSaveDate(value) {
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function renderSavedScenarios() {
  const list = byId("savedList");
  if (!list) return;
  if (!state.saves.length) {
    list.innerHTML = `<p class="saved-empty">ยังไม่มีรายการบันทึก กด Save Snapshot เพื่อเก็บสถานะปัจจุบัน</p>`;
    return;
  }

  list.innerHTML = state.saves
    .map((save, index) => {
      const combat = save.snapshot?.combat || {};
      const active = save.id === state.activeSaveId ? " · showing" : "";
      return `
        <article class="saved-item" data-save-id="${escapeAttr(save.id)}">
          <div>
            <div class="saved-title">${escapeHtml(save.name)}${active}</div>
            <div class="saved-meta">
              ${formatSaveDate(save.createdAt)} · Blue ${formatPercent(combat.blueDamageByRed || 0)} / Red ${formatPercent(combat.redDamageByBlue || 0)}
            </div>
          </div>
          <div class="saved-actions">
            <button type="button" data-save-action="show">Show</button>
            <button type="button" data-save-action="excel">Excel</button>
            <button type="button" data-save-action="up" ${index === 0 ? "disabled" : ""}>Up</button>
            <button type="button" data-save-action="down" ${index === state.saves.length - 1 ? "disabled" : ""}>Down</button>
            <button type="button" class="danger" data-save-action="delete">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function saveScenarioSnapshot() {
  if (!state.data) return;
  recalculate();
  const input = byId("saveNameInput");
  const name = (input?.value || "").trim() || `Scenario ${state.saves.length + 1}`;
  const now = new Date().toISOString();
  const item = {
    id: `save-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    createdAt: now,
    snapshot: {
      forces: deepClone(state.data.forces),
      combat: deepClone(state.data.combat),
    },
  };

  state.saves.unshift(item);
  state.activeSaveId = item.id;
  persistSavedScenarios();
  renderSavedScenarios();
  if (input) input.value = "";
  showToast("Saved scenario snapshot", "ok");
}

function findSave(id) {
  return state.saves.find((save) => save.id === id);
}

function showSavedScenario(id) {
  const save = findSave(id);
  if (!save || !state.data) return;
  state.data.forces = deepClone(save.snapshot.forces);
  prepareAllBaselines();
  state.activeSaveId = id;
  state.dirty = true;
  renderAll();
  showToast(`Showing ${save.name}`, "ok");
}

function deleteSavedScenario(id) {
  state.saves = state.saves.filter((save) => save.id !== id);
  if (state.activeSaveId === id) state.activeSaveId = null;
  persistSavedScenarios();
  renderSavedScenarios();
  showToast("Deleted saved scenario", "ok");
}

function moveSavedScenario(id, direction) {
  const index = state.saves.findIndex((save) => save.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.saves.length) return;
  const [item] = state.saves.splice(index, 1);
  state.saves.splice(target, 0, item);
  persistSavedScenarios();
  renderSavedScenarios();
}

async function downloadSavedScenario(id) {
  const save = findSave(id);
  if (!save) return;
  await downloadStaticWorkbook(save.snapshot.forces, save.name);
}

function updateFileStatus() {
  const workbook = state.data?.workbook;
  if (!workbook) return;
  if (state.data?.staticMode) {
    const changed = state.dirty ? "Edited in browser" : "Ready to download";
    byId("fileStatus").textContent = `${changed} · ${workbook.name}`;
    byId("saveButton").disabled = false;
    return;
  }
  const changed = state.dirty ? "Unsaved changes" : "Synced";
  byId("fileStatus").textContent = `${changed} · ${workbook.name}`;
  byId("saveButton").disabled = !state.dirty;
}

async function saveState() {
  if (state.data?.staticMode) {
    await downloadStaticWorkbook(state.data.forces, "current");
    return;
  }
  try {
    byId("saveButton").disabled = true;
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forces: state.data.forces }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Cannot save workbook");
    state.data = data;
    state.dirty = false;
    state.lastWorkbookModified = data.workbook.lastModified;
    renderAll();
    showToast("Saved to Excel and created a backup", "ok");
  } catch (error) {
    byId("saveButton").disabled = false;
    showToast(error.message, "error");
  }
}

async function downloadStaticWorkbook(forces = state.data.forces, label = "edited") {
  try {
    if (!window.XLSX) {
      throw new Error("Excel writer is still loading. Please try again in a moment.");
    }
    byId("saveButton").disabled = true;

    const sourceName = state.data.workbook.name || "salvo equation .xlsx";
    const response = await fetch(encodeURI(sourceName), { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot load the Excel template from this page.");

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellFormula: true, cellStyles: true });
    writeForceToWorkbook(workbook, forces.red);
    writeForceToWorkbook(workbook, forces.blue);
    workbook.Workbook = workbook.Workbook || {};
    workbook.Workbook.CalcPr = { calcMode: "auto" };

    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true });
    const blob = new Blob([output], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeLabel = String(label || "edited").replace(/[^a-z0-9ก-๙_-]+/gi, "-").slice(0, 40);
    link.href = URL.createObjectURL(blob);
    link.download = `salvo-equation-${safeLabel}-${stamp}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    if (forces === state.data.forces) state.dirty = false;
    updateFileStatus();
    showToast("Downloaded Excel file", "ok");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    updateFileStatus();
  }
}

state.saves = loadSavedScenarios();

document.addEventListener("input", (event) => {
  const target = event.target;
  const rowEl = target.closest?.("tr[data-force]");
  if (!rowEl || !target.dataset.field) return;

  const force = state.data.forces[rowEl.dataset.force];
  const row = force.rows[Number(rowEl.dataset.index)];
  const field = target.dataset.field;
  if (field === "unit") {
    row[field] = target.value;
  } else {
    const value = Number(target.value || 0);
    row[field] = value;
    if (field === "missileNumber") {
      row.baseMissileNumber = value;
    }
  }
  state.dirty = true;
  refreshAfterInput();
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("select[data-field='salvoMode']")) {
    const force = state.data.forces[target.dataset.force];
    force.salvoMode = target.value;
    consumeMissilesForSalvo(force);
    state.dirty = true;
    renderAll();
    return;
  }
  if (target.id === "advantageSelect") {
    state.advantageMode = target.value;
    renderCombat();
  }
});

byId("saveButton").addEventListener("click", saveState);
byId("reloadButton").addEventListener("click", () => loadState());
setText("appVersion", APP_VERSION);
byId("saveSnapshotButton")?.addEventListener("click", saveScenarioSnapshot);
byId("savedList")?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-save-action]");
  const item = event.target.closest("[data-save-id]");
  if (!button || !item) return;
  const id = item.dataset.saveId;
  const action = button.dataset.saveAction;
  if (action === "show") showSavedScenario(id);
  if (action === "excel") downloadSavedScenario(id);
  if (action === "up") moveSavedScenario(id, -1);
  if (action === "down") moveSavedScenario(id, 1);
  if (action === "delete") deleteSavedScenario(id);
});

setInterval(async () => {
  if (state.dirty || !state.data) return;
  try {
    const response = await fetch("/api/state");
    const data = await response.json();
    if (!response.ok) return;
    if (data.workbook.lastModified !== state.lastWorkbookModified) {
      state.data = data;
      state.lastWorkbookModified = data.workbook.lastModified;
      renderAll();
      showToast("Reloaded changes from Excel", "ok");
    }
  } catch {
    // Keep the current screen usable if the workbook is temporarily unavailable.
  }
}, 5000);

loadState({ silent: true });

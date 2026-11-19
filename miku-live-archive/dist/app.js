const $ = (id) => document.getElementById(id),
  key = "miku-archive-v1";
let data = [],
  view = "all",
  editing = null;
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const series = [
  "魔法未来",
  "MIKU EXPO",
  "SNOW MIKU LIVE",
  "感谢祭 / MIKUPA",
  "未来有你",
  "LAWSON 50th",
  "宝可梦",
  "DECO*27",
  "其他正式 Live",
];
const eligible = (r) => r.bd === "有" && /已发行/.test(r.release);
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    $("save").textContent = "● 已保存到本机";
    notifyArchiveChanged();return true;
  } catch (e) {
    $("save").textContent = "保存失败，请导出备份";return false;
  }
}
function options() {
  for (let [id, vals, label] of [
    [
      "year",
      [...new Set(data.map((r) => r.year))].sort((a, b) => b - a),
      "全部年份",
    ],
    [
      "series",
      [...new Set([...series, ...data.map((r) => r.series)])],
      "全部系列",
    ],
  ]) {
    let old = $(id).value;
    $(id).innerHTML =
      `<option value="">${label}</option>` +
      vals.map((v) => `<option>${esc(v)}</option>`).join("");
    $(id).value = old;
  }
}
function renderCollection() {
  let confirmed = data.filter(eligible),
    owned = data.filter((r) => r.collected === "已收集");
  $("stats").innerHTML = [
    ["已收集的 Live", owned.length, "魔法未来 2013–2025 已录入"],
    [
      "确认 BD · 待补",
      confirmed.filter((r) => r.collected !== "已收集").length,
      "仅统计已发行且已确认的 BD",
    ],
    [
      "发行待核实",
      data.filter((r) => r.bd === "待核实").length,
      "不将未确认演出计入 BD 缺口",
    ],
    [
      "已标记缺失",
      data.filter((r) => r.missing).length,
      "手动标记 · 可在待补清单管理",
    ],
  ]
    .map(
      ([a, b, c]) =>
        `<div class="stat"><label>${a}</label><strong>${b}<span style="font-size:11px;color:#9bae9f;margin-left:7px">部</span></strong><small>${c}</small></div>`,
    )
    .join("");
  $("nav").innerHTML = [
    ["", "◫", "收藏总览"],
    ...series.map((s, i) => [s, i === 2 ? "❄" : "○", s]),
  ]
    .map(
      ([s, icon, label]) =>
        `<button data-series="${esc(s)}" class="${$("series").value === s ? "active" : ""}"><span>${icon}　${label}</span><small>${s ? data.filter((r) => r.series === s).length : data.length}</small></button>`,
    )
    .join("");
  $("nav")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          $("series").value = b.dataset.series;
          view = "all";
          render();
        }),
    );
  let active = $("series").value;
  $("crumb").textContent = active || "总览";
  $("title").innerHTML =
    active === "SNOW MIKU LIVE"
      ? "每一场雪，<br>都值得期待。"
      : "把每一场未来，<br>好好收藏。";
  $("snow-panel").hidden = active !== "SNOW MIKU LIVE";
  let q = $("search").value.trim().toLowerCase();
  let rows = data.filter(
    (r) =>
      (!active || r.series === active) &&
      (!$("year").value || r.year == $("year").value) &&
      (!$("bd").value || r.bd === $("bd").value) &&
      (!$("download").value || r.download === $("download").value) &&
      (!$("status").value ||
        ($("status").value === "标记缺失"
          ? r.missing
          : r.collected === $("status").value)) &&
      (!q || Object.values(r).join(" ").toLowerCase().includes(q)),
  );
  if (view === "gaps")
    rows = rows.filter(
      (r) => r.missing || (eligible(r) && r.collected !== "已收集"),
    );
  if (view === "verify") rows = rows.filter((r) => r.bd === "待核实");
  $("count").textContent = "完整 Live 优先 · 版本与下载状态独立管理";
  $("result").textContent = `${rows.length} 个项目`;
  $("lib-title").innerHTML =
    `${active || "我的收藏库"} <span>LIVE LIBRARY</span>`;
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("selected", b.dataset.view === view));
  if (view === "progress") {
    $("content").innerHTML =
      '<div class="progress-grid">' +
      [...new Set(rows.map((r) => r.series))]
        .map((s) => {
          let all = rows.filter((r) => r.series === s),
            a = all.filter(eligible),
            b = a.filter((r) => r.collected === "已收集");
          return `<div class="progress-card"><h3>${esc(s)}</h3><strong>${b.length} / ${a.length}</strong><p>已发行且确认有 BD · ${a.length ? Math.round((b.length / a.length) * 100) + "%" : "暂无确认发行"}</p><progress max="${a.length || 1}" value="${b.length}"></progress><p>${all.filter((r) => r.bd === "待核实").length} 项待核实 · ${all.filter((r) => r.missing).length} 项手动缺失</p></div>`;
        })
        .join("") +
      "</div>";
    return;
  }
  if (!rows.length) {
    $("content").innerHTML =
      '<div class="empty">暂无匹配项目。试试调整筛选，或添加新的演出。</div>';
    return;
  }
  $("content").innerHTML =
    `<table><thead><tr><th>年份</th><th>演出 / 发行版本</th><th>正式 BD</th><th>收藏状态</th><th>下载</th><th>缺失</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.year)}</td><td><strong>${esc(r.name)}</strong><small>${esc(r.series)} · ${esc(r.release)}</small></td><td><span class="badge ${r.bd === "有" ? "yes" : "unknown"}">${r.bd === "有" ? "BD 已确认" : esc(r.bd)}</span></td><td><button class="edit" data-edit="${esc(r.id)}">${r.collected === "已收集" ? "✓ " : ""}${esc(r.collected)}</button></td><td><span class="badge">${esc(r.download)}</span></td><td><input type="checkbox" aria-label="标记 ${esc(r.name)} 缺失" data-missing="${esc(r.id)}" ${r.missing ? "checked" : ""}></td><td><button class="edit" data-edit="${esc(r.id)}">编辑 ↗</button></td></tr>`).join("")}</tbody></table>`;
  $("content")
    .querySelectorAll("[data-edit]")
    .forEach((b) => (b.onclick = () => edit(b.dataset.edit)));
  $("content")
    .querySelectorAll("[data-missing]")
    .forEach(
      (b) =>
        (b.onchange = () => {
          changeMissingMark(b.dataset.missing,b.checked);
          render();
        }),
    );
}
const fields = [
  ["year", "年份"],
  ["series", "系列"],
  ["name", "演出名称"],
  ["date", "举办日期 / 日期范围"],
  ["media", "发行介质"],
  ["bd", "是否有正式 BD", ["待核实", "有", "无"]],
  ["release", "发行状态 / 日期"],
  ["collected", "是否已收集", ["待确认", "已收集", "未收集"]],
  ["download", "是否已下载", ["待确认", "已下载", "未下载"]],
  ["checked", "核实日期"],
  ["source", "官方 / 发行商来源 URL"],
  ["version", "版本差异"],
  ["notes", "资源备注 / 待补项目"],
];
function edit(id) {
  editing = id;
  let r = data.find((r) => r.id === id) || {
    year: new Date().getFullYear(),
    series: $("series").value || "其他正式 Live",
    bd: "待核实",
    collected: "待确认",
    download: "待确认",
    checked: "2026-11-16",
  };
  $("fields").innerHTML = fields
    .map(
      ([k, label, opts]) =>
        `<label class="${["name", "source", "version", "notes"].includes(k) ? "wide" : ""}">${label}${opts ? `<select name="${k}">${opts.map((v) => `<option ${r[k] === v ? "selected" : ""}>${v}</option>`).join("")}</select>` : ["notes", "version"].includes(k) ? `<textarea name="${k}">${esc(r[k] || "")}</textarea>` : `<input name="${k}" ${k === "year" ? 'type="number" min="2000" max="2100"' : k === "source" ? 'type="url"' : ""} ${["name", "series", "year"].includes(k) ? "required" : ""} value="${esc(r[k] || "")}">`}</label>`,
    )
    .join("");
  $("delete").hidden = !id;
  $("editor").showModal();
}
$("form").onsubmit = (e) => {
  e.preventDefault();
  let r = Object.fromEntries(new FormData(e.target));
  r.year = Number(r.year);
  if(!storeCollectionRecord(r,editing))return;
  options();
  render();
  $("editor").close();
};
$("delete").onclick = () => {
  if (confirm("删除此条收藏记录？")) {
    if(!removeCollectionRecord(editing))return;
    options();
    render();
    $("editor").close();
  }
};
$("close").onclick = () => $("editor").close();
$("add").onclick = () => edit(null);
for (let id of ["year", "series", "status", "bd", "download"])
  $(id).onchange = render;
$("search").oninput = render;
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      view = b.dataset.view;
      render();
    }),
);
$("snow").onclick = () => {
  $("series").value = "SNOW MIKU LIVE";
  view = "all";
  render();
  $("snow-panel").scrollIntoView({ behavior: "smooth", block: "center" });
};
$("export").onclick = async () => {
  try{
    const text=await exportArchiveJSON(),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='miku-archive-'+new Date().toISOString().slice(0,10)+'.json';a.click();
    recordBackupExport(JSON.parse(text),'browser');setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){alert('无法导出：'+error.message);}
};
$("import").onclick = () => $("file").click();
$("file").onchange = async e => {
  try {const file=e.target.files[0];if(file)previewBackup(JSON.parse(await file.text()));}
  catch(error){alert('无法导入：'+error.message);}
  finally {$("file").value='';}
};
function render() {
  const navTop=$('nav').scrollTop;
  if (atlasMode) renderAtlas();
  else renderCollection();
  $('nav').scrollTop=navTop;
  rememberBrowseState();
}
async function init() {
  try {
    let stored = localStorage.getItem(key);
    data = stored
      ? JSON.parse(stored)
      : await (await fetch("seed.json")).json();
    atlasCatalog = await loadCatalog();
    if(DEVELOPER_EDITION){
      try {await ArtworkMedia.init();} catch(error) {console.error(error);}
    }
    initAtlas();
    options();
    initSettings();
    render();
  } catch (e) {
    appLoadError=e;
    console.error(e);
    $("atlas-content").textContent = "图鉴加载失败，请刷新或检查资源文件。";
    $("content").textContent = "数据加载失败，请刷新页面或检查浏览器存储设置。";
  }
}
let appLoadError;
const appReady=init();

(function () {
  "use strict";

  var dock, currentPanel = "elements", selected = null, selectedFrame = null, picker = false;
  var undoStack = [], consoleRows = [], pageObservers = new WeakMap(), originals = new WeakMap();
  var SENSITIVE = /(authorization|cookie|set-cookie|password|passwd|token|secret|api[-_]?key|session)/i;

  function settings() { return window.NovaDeveloperOptions?.get?.() || { enabled: false }; }
  function activeTab() { return window._novaTab?.getActive?.() || null; }
  function activeFrame() { return activeTab()?.iframe || document.querySelector("#frame-container .tab-iframe.active"); }
  function safe(value) {
    var seen = new WeakSet();
    try { return JSON.stringify(value, function (key, item) { if (SENSITIVE.test(key)) return "[REDACTED]"; if (item && typeof item === "object") { if (seen.has(item)) return "[Circular]"; seen.add(item); } return item; }); }
    catch (_) { return String(value).replace(/(token|secret|password|cookie)(\s*[:=]\s*)\S+/gi, "$1$2[REDACTED]"); }
  }
  function frameDocument(frame) { try { return frame?.contentDocument || null; } catch (_) { return null; } }
  function notify(message) { window.toast?.(message); }
  function create(tag, className, text) { var el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; }

  function buildDock() {
    if (dock) return dock;
    dock = create("section", "nova-devtools-dock"); dock.id = "nova-browser-devtools"; dock.hidden = true;
    dock.innerHTML = '<header class="ndt-head"><div class="ndt-tabs" role="tablist"><button type="button" data-ndt-panel="elements" class="active">Elements</button><button type="button" data-ndt-panel="console">Console</button><button type="button" data-ndt-panel="network">Network</button><button type="button" data-ndt-panel="storage">Storage</button></div><div class="ndt-head-actions"><button type="button" id="ndt-picker" title="Select an element" aria-label="Select an element"><svg viewBox="0 0 24 24"><path d="m4 3 7 17 2-7 7-2Z"/><path d="m14 14 5 5"/></svg></button><button type="button" id="ndt-undo" title="Undo last page edit" aria-label="Undo last page edit"><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v2"/></svg></button><button type="button" id="ndt-close" title="Close developer tools" aria-label="Close developer tools">×</button></div></header><div class="ndt-body"><div class="ndt-panel active" data-ndt-view="elements"><div class="ndt-elements-tree" id="ndt-tree"></div><aside class="ndt-properties" id="ndt-properties"><div class="ndt-empty">Select an element from the page or DOM tree.</div></aside></div><div class="ndt-panel" data-ndt-view="console"><div class="ndt-console-tools"><button type="button" id="ndt-clear-console">Clear</button><span>Page messages are sanitized</span></div><div class="ndt-log" id="ndt-console-log"></div></div><div class="ndt-panel" data-ndt-view="network"><div class="ndt-console-tools"><button type="button" id="ndt-refresh-network">Refresh</button><span>Authorization and cookies are never shown</span></div><div class="ndt-network" id="ndt-network-log"></div></div><div class="ndt-panel" data-ndt-view="storage"><div class="ndt-console-tools"><button type="button" id="ndt-refresh-storage">Refresh</button><span>Storage for the current proxied page</span></div><div class="ndt-storage" id="ndt-storage-view"></div></div></div>';
    document.getElementById("page-browser")?.appendChild(dock);
    dock.querySelectorAll("[data-ndt-panel]").forEach(function (button) { button.addEventListener("click", function () { showPanel(button.dataset.ndtPanel); }); });
    dock.querySelector("#ndt-close").addEventListener("click", closeDock);
    dock.querySelector("#ndt-picker").addEventListener("click", togglePicker);
    dock.querySelector("#ndt-undo").addEventListener("click", undo);
    dock.querySelector("#ndt-clear-console").addEventListener("click", function () { consoleRows = []; renderConsole(); });
    dock.querySelector("#ndt-refresh-network").addEventListener("click", renderNetwork);
    dock.querySelector("#ndt-refresh-storage").addEventListener("click", renderStorage);
    return dock;
  }
  function showPanel(name) {
    currentPanel = name;
    dock.querySelectorAll("[data-ndt-panel]").forEach(function (button) { button.classList.toggle("active", button.dataset.ndtPanel === name); });
    dock.querySelectorAll("[data-ndt-view]").forEach(function (view) { view.classList.toggle("active", view.dataset.ndtView === name); });
    if (name === "elements") renderTree(); if (name === "console") renderConsole(); if (name === "network") renderNetwork(); if (name === "storage") renderStorage();
  }
  function openDock(panel) {
    var options = settings(); if (!options.enabled) { window.NovaDeveloperOptions?.open?.(); notify("Enable Developer Mode first"); return; }
    buildDock(); dock.hidden = false; document.getElementById("page-browser")?.classList.add("devtools-open");
    attachFrame(activeFrame()); showPanel(panel || currentPanel);
  }
  function closeDock() { if (!dock) return; picker = false; clearPicker(); dock.hidden = true; document.getElementById("page-browser")?.classList.remove("devtools-open"); }

  function elementLabel(el) {
    var out = el.tagName.toLowerCase(); if (el.id) out += "#" + el.id;
    if (el.classList.length) out += "." + Array.from(el.classList).slice(0, 3).join("."); return out;
  }
  function renderTree() {
    var tree = document.getElementById("ndt-tree"); if (!tree) return; tree.innerHTML = "";
    var doc = frameDocument(activeFrame()); if (!activeTab()?.url || !doc?.documentElement) { tree.appendChild(create("div", "ndt-empty", "Open a website to inspect its DOM.")); return; }
    function add(el, parent, depth) {
      if (!(el instanceof el.ownerDocument.defaultView.Element) || depth > 7) return;
      var row = create("button", "ndt-node" + (el === selected ? " selected" : "")); row.type = "button"; row.style.setProperty("--depth", depth); row.textContent = "<" + elementLabel(el) + ">";
      row.addEventListener("click", function () { selectElement(el); }); parent.appendChild(row);
      Array.from(el.children).slice(0, 80).forEach(function (child) { add(child, parent, depth + 1); });
    }
    add(doc.documentElement, tree, 0);
  }
  function selectorFor(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    var parts = []; while (el && el.nodeType === 1 && parts.length < 5) { var part = el.tagName.toLowerCase(); if (el.classList.length) part += "." + Array.from(el.classList).slice(0, 2).map(CSS.escape).join("."); var parent = el.parentElement; if (parent) { var peers = Array.from(parent.children).filter(function (node) { return node.tagName === el.tagName; }); if (peers.length > 1) part += ":nth-of-type(" + (peers.indexOf(el) + 1) + ")"; } parts.unshift(part); el = parent; } return parts.join(" > ");
  }
  function snapshot(el) { return { el: el, html: el.outerHTML, parent: el.parentNode, next: el.nextSibling }; }
  function remember(el) { undoStack.push(snapshot(el)); if (undoStack.length > 30) undoStack.shift(); }
  function undo() { var item = undoStack.pop(); if (!item?.parent) return notify("Nothing to undo"); var holder = item.el.ownerDocument.createElement("template"); holder.innerHTML = item.html; var restored = holder.content.firstElementChild; if (item.el.isConnected) item.el.replaceWith(restored); else item.parent.insertBefore(restored, item.next); selectElement(restored); notify("Page edit undone"); }
  function persist(type, value) {
    var options = settings(); if (!options.persistEdits || !selected) return;
    var tab = activeTab(); var key = "nova_inspector_" + btoa(unescape(encodeURIComponent(tab?.url || "page"))).replace(/=+$/, "");
    var rows; try { rows = JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) { rows = []; }
    rows.push({ selector: selectorFor(selected), type: type, value: value }); localStorage.setItem(key, JSON.stringify(rows.slice(-100)));
  }
  function selectElement(el) { selected = el; renderTree(); renderProperties(); try { el.scrollIntoView({ block: "center", inline: "nearest" }); flash(el); } catch (_) {} }
  function flash(el) { var old = el.style.outline; el.style.outline = "2px solid #8b8fff"; setTimeout(function () { if (el.isConnected) el.style.outline = old; }, 700); }
  function field(label, value, change, multiline) {
    var wrap = create("label", "ndt-field"); wrap.appendChild(create("span", "", label)); var input = create(multiline ? "textarea" : "input"); input.value = value || ""; input.addEventListener("input", function () { change(input.value); }); wrap.appendChild(input); return wrap;
  }
  function renderProperties() {
    var pane = document.getElementById("ndt-properties"); if (!pane) return; pane.innerHTML = "";
    if (!selected?.isConnected) { pane.appendChild(create("div", "ndt-empty", "Select an element from the page or DOM tree.")); return; }
    var heading = create("div", "ndt-selected-head"); heading.appendChild(create("strong", "", elementLabel(selected))); heading.appendChild(create("code", "", selectorFor(selected))); pane.appendChild(heading);
    pane.appendChild(field("Text", selected.textContent, function (value) { remember(selected); selected.textContent = value; persist("text", value); renderTree(); }, true));
    pane.appendChild(field("HTML", selected.innerHTML, function (value) { remember(selected); selected.innerHTML = value; persist("html", value); renderTree(); }, true));
    pane.appendChild(field("Classes", selected.className, function (value) { remember(selected); selected.className = value; persist("class", value); renderTree(); }));
    var attrs = create("div", "ndt-attributes"); attrs.appendChild(create("strong", "", "Attributes")); Array.from(selected.attributes).filter(function (attr) { return attr.name !== "class"; }).forEach(function (attr) { attrs.appendChild(field(attr.name, attr.value, function (value) { remember(selected); selected.setAttribute(attr.name, value); persist("attribute", { name: attr.name, value: value }); renderTree(); })); });
    var add = create("button", "ndt-small-btn", "Add attribute"); add.type = "button"; add.addEventListener("click", function () { var name = prompt("Attribute name"); if (!name || SENSITIVE.test(name)) return; var value = prompt("Attribute value") || ""; remember(selected); selected.setAttribute(name, value); renderProperties(); }); attrs.appendChild(add); pane.appendChild(attrs);
    var computed = selected.ownerDocument.defaultView.getComputedStyle(selected); var styles = create("div", "ndt-styles"); styles.appendChild(create("strong", "", "Live CSS")); ["color","background","font-size","display","position","width","height","margin","padding","border","opacity"].forEach(function (prop) { styles.appendChild(field(prop, selected.style.getPropertyValue(prop) || computed.getPropertyValue(prop), function (value) { remember(selected); selected.style.setProperty(prop, value); persist("style", { name: prop, value: value }); })); }); pane.appendChild(styles);
    var actions = create("div", "ndt-element-actions"); var hide = create("button", "ndt-small-btn", "Hide"); hide.type = "button"; hide.addEventListener("click", function () { remember(selected); selected.hidden = true; persist("hide", true); }); var remove = create("button", "ndt-small-btn danger", "Delete"); remove.type = "button"; remove.addEventListener("click", function () { remember(selected); selected.remove(); renderTree(); renderProperties(); }); actions.append(hide, remove); pane.appendChild(actions);
  }

  function pickerMove(event) { if (!picker) return; var el = event.target; if (el === selected) return; if (selected) selected.classList.remove("nova-inspector-hover"); selected = el; selected.classList.add("nova-inspector-hover"); }
  function pickerClick(event) { if (!picker) return; event.preventDefault(); event.stopPropagation(); var el = event.target; togglePicker(false); openDock("elements"); selectElement(el); }
  function clearPicker() { var doc = frameDocument(selectedFrame); try { doc?.removeEventListener("mousemove", pickerMove, true); doc?.removeEventListener("click", pickerClick, true); selected?.classList.remove("nova-inspector-hover"); } catch (_) {} document.getElementById("ndt-picker")?.classList.remove("active"); }
  function togglePicker(force) { var next = typeof force === "boolean" ? force : !picker; clearPicker(); picker = next; if (!picker) return; var frame = activeFrame(), doc = frameDocument(frame); if (!activeTab()?.url || !doc) { picker = false; return notify("Open a website before selecting an element"); } selectedFrame = frame; doc.addEventListener("mousemove", pickerMove, true); doc.addEventListener("click", pickerClick, true); document.getElementById("ndt-picker")?.classList.add("active"); notify("Select an element on the page"); }

  function renderConsole() { var log = document.getElementById("ndt-console-log"); if (!log) return; log.innerHTML = ""; if (!consoleRows.length) return log.appendChild(create("div", "ndt-empty", "No console messages captured yet.")); consoleRows.slice(-250).forEach(function (row) { var item = create("div", "ndt-log-row " + row.level); item.appendChild(create("span", "", row.level)); item.appendChild(create("code", "", row.message)); log.appendChild(item); }); log.scrollTop = log.scrollHeight; }
  function captureConsole(frame) {
    var win; try { win = frame.contentWindow; if (!win || originals.has(win)) return; } catch (_) { return; }
    var saved = {}; ["log","info","warn","error"].forEach(function (level) { var original = win.console[level]?.bind(win.console); saved[level] = original; win.console[level] = function () { var args = Array.from(arguments); consoleRows.push({ level: level, message: args.map(safe).join(" ") }); if (consoleRows.length > 500) consoleRows.shift(); if (currentPanel === "console") renderConsole(); return original?.apply(null, args); }; }); originals.set(win, saved);
    win.addEventListener("error", function (event) { consoleRows.push({ level: "error", message: safe(event.message) }); });
    win.addEventListener("unhandledrejection", function (event) { consoleRows.push({ level: "error", message: "Unhandled promise: " + safe(event.reason) }); });
  }
  async function renderNetwork() {
    var list = document.getElementById("ndt-network-log"); if (!list) return; list.innerHTML = "";
    var state = window.NovaProxyManager?.getState?.() || {}; var rows = Array.isArray(state.recentRequests) ? state.recentRequests : [];
    var table = create("table", "ndt-table"); table.innerHTML = "<thead><tr><th>Method</th><th>Resource</th><th>Status</th><th>Engine</th><th>Time</th></tr></thead>"; var body = create("tbody");
    rows.slice(-200).reverse().forEach(function (row) { var tr = create("tr"); [row.method || "GET", String(row.url || row.remote || "—").replace(/[?#].*$/, ""), row.status || "—", row.transport || state.currentTransport || "—", row.durationMs != null ? row.durationMs + "ms" : "—"].forEach(function (value) { tr.appendChild(create("td", "", safe(value).replace(/^"|"$/g, ""))); }); body.appendChild(tr); }); table.appendChild(body); list.appendChild(rows.length ? table : create("div", "ndt-empty", "No proxy requests recorded for this session."));
  }
  function renderStorage() {
    var view = document.getElementById("ndt-storage-view"); if (!view) return; view.innerHTML = ""; var win; try { win = activeFrame()?.contentWindow; } catch (_) {}
    if (!win) return view.appendChild(create("div", "ndt-empty", "Open a website to view its storage."));
    ["localStorage","sessionStorage"].forEach(function (kind) { var section = create("section", "ndt-storage-section"); section.appendChild(create("strong", "", kind)); var store; try { store = win[kind]; } catch (_) {} if (!store?.length) section.appendChild(create("div", "ndt-empty", "Empty")); else for (var i = 0; i < store.length; i++) { var key = store.key(i); if (SENSITIVE.test(key)) continue; var row = create("div", "ndt-storage-row"); row.appendChild(create("code", "", key)); row.appendChild(create("span", "", safe(store.getItem(key)))); section.appendChild(row); } view.appendChild(section); });
  }

  function applyPersisted(frame, url) {
    var options = settings(); if (!options.persistEdits) return; var doc = frameDocument(frame); if (!doc) return;
    var key = "nova_inspector_" + btoa(unescape(encodeURIComponent(url || "page"))).replace(/=+$/, ""); var rows; try { rows = JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) { return; }
    rows.forEach(function (row) { var el; try { el = doc.querySelector(row.selector); } catch (_) {} if (!el) return; if (row.type === "text") el.textContent = row.value; if (row.type === "html") el.innerHTML = row.value; if (row.type === "class") el.className = row.value; if (row.type === "attribute") el.setAttribute(row.value.name, row.value.value); if (row.type === "style") el.style.setProperty(row.value.name, row.value.value); if (row.type === "hide") el.hidden = true; });
  }
  function enforcePageOptions(frame) {
    var options = settings(); if (!options.enabled) return; var doc = frameDocument(frame), win; try { win = frame.contentWindow; } catch (_) {} if (!doc || !win) return;
    doc.documentElement.classList.add("nova-proxied-dev-page"); var style = doc.createElement("style"); style.textContent = ".nova-inspector-hover{outline:2px solid #8b8fff!important;outline-offset:2px!important;cursor:crosshair!important}"; doc.head?.appendChild(style);
    if (options.muteSites) doc.querySelectorAll("audio,video").forEach(function (media) { media.muted = true; });
    try { win.open = options.allowPopups ? win.open : function () { consoleRows.push({ level: "warn", message: "Popup blocked by Nova Developer Options" }); return null; }; } catch (_) {}
    if (options.userAgent !== "default") { var agents = { "chrome-desktop": "Mozilla/5.0 Chrome/127 Safari/537.36", "chrome-mobile": "Mozilla/5.0 (Linux; Android 14) Chrome/127 Mobile Safari/537.36", firefox: "Mozilla/5.0 Firefox/128", safari: "Mozilla/5.0 Version/17 Safari/605.1.15" }; var ua = options.userAgent === "custom" ? options.customUserAgent : agents[options.userAgent]; try { if (ua) Object.defineProperty(win.navigator, "userAgent", { configurable: true, get: function () { return ua; } }); } catch (_) {} }
    doc.addEventListener("click", function (event) { var link = event.target.closest?.("a[download],a[href]"); if (!link) return; var href = link.getAttribute("href") || ""; var looksDownload = link.hasAttribute("download") || /\.(zip|pdf|docx?|xlsx?|png|jpe?g|webp|mp[34]|wav|exe|dmg|apk)(?:[?#]|$)/i.test(href); if (looksDownload && !window.NovaDeveloperOptions?.mayDownload?.(event.isTrusted)) { event.preventDefault(); event.stopImmediatePropagation(); window.NovaDeveloperOptions?.showDownloadBlocked?.(); } }, true);
    if (options.disablePageJs) { doc.querySelectorAll("script").forEach(function (script) { script.remove(); }); var observer = new MutationObserver(function (mutations) { mutations.forEach(function (mutation) { mutation.addedNodes.forEach(function (node) { if (node.nodeType === 1 && (node.tagName === "SCRIPT" || node.querySelector?.("script"))) node.remove(); }); }); }); observer.observe(doc.documentElement, { childList: true, subtree: true }); pageObservers.set(frame, observer); }
    if (options.browserConsole) captureConsole(frame);
    frame.dataset.novaExperimentalWebsocket = options.experimentalWebSocket ? "on" : "off";
    frame.dataset.novaExperimentalMedia = options.experimentalMedia ? "on" : "off";
    applyPersisted(frame, activeTab()?.url || frame.src);
  }
  function attachFrame(frame) { if (!frame) return; selectedFrame = frame; try { enforcePageOptions(frame); } catch (_) {} }

  function syncAvailability() { var button = document.getElementById("browser-devtools-btn"), options = settings(); if (button) { button.hidden = !(options.enabled && (options.inspectElement || options.browserConsole || options.networkLog)); button.classList.toggle("active", !!dock && !dock.hidden); } if (!options.enabled) closeDock(); if (dock) { var elementTab = dock.querySelector('[data-ndt-panel="elements"]'), consoleTab = dock.querySelector('[data-ndt-panel="console"]'), networkTab = dock.querySelector('[data-ndt-panel="network"]'), storageTab = dock.querySelector('[data-ndt-panel="storage"]'); if (elementTab) elementTab.hidden = !options.inspectElement; if (storageTab) storageTab.hidden = !options.inspectElement; if (consoleTab) consoleTab.hidden = !options.browserConsole; if (networkTab) networkTab.hidden = !options.networkLog; if ((currentPanel === "elements" && !options.inspectElement) || (currentPanel === "console" && !options.browserConsole) || (currentPanel === "network" && !options.networkLog)) { var fallback = options.inspectElement ? "elements" : (options.browserConsole ? "console" : "network"); showPanel(fallback); } } try { if (options.verboseLogging) localStorage.setItem("nova_proxy_verbose", "1"); else localStorage.removeItem("nova_proxy_verbose"); } catch (_) {} window._novaTab?.list?.().forEach(function (tab) { attachFrame(tab.iframe); }); }
  document.getElementById("browser-devtools-btn")?.addEventListener("click", function () { if (dock && !dock.hidden) closeDock(); else openDock("elements"); syncAvailability(); });
  document.addEventListener("nova:browser-frame-load", function (event) { attachFrame(event.detail?.tab?.iframe); if (dock && !dock.hidden) showPanel(currentPanel); });
  document.addEventListener("nova:browser-tab-change", function () { selected = null; attachFrame(activeFrame()); if (dock && !dock.hidden) showPanel(currentPanel); });
  window.addEventListener("nova:developer-options", syncAvailability);
  window.addEventListener("nova:inspect-page", function () { openDock("elements"); togglePicker(true); });
  document.addEventListener("keydown", function (event) { if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "c") { var options = settings(); if (!options.enabled || !options.inspectElement) return; event.preventDefault(); openDock("elements"); togglePicker(true); } });
  window.NovaBrowserDevTools = Object.freeze({ open: openDock, close: closeDock, inspect: function () { openDock("elements"); togglePicker(true); } });
  buildDock(); syncAvailability();
})();

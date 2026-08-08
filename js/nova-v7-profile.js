(function () {
  "use strict";

  var fieldMap = {
    displayName: "displayName", bio: "bio", statusText: "statusText", avatarUrl: "avatarUrl",
    bannerUrl: "bannerUrl", pronouns: "pronouns", locationText: "locationText", websiteUrl: "websiteUrl",
    onlineVisibility: "onlineVisibility", activityVisibility: "activityVisibility"
  };
  var dirty = false;
  var cameraStream = null;

  function controls() { return document.querySelectorAll("[data-profile-field]"); }
  function byId(id) { return document.getElementById(id); }
  function status(text, bad) {
    var el = byId("nova-v7-profile-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-error", !!bad);
  }
  function saveButton() { return byId("nova-v7-profile-save"); }
  function currentName() {
    var field = document.querySelector('[data-profile-field="displayName"]');
    return (field && field.value.trim()) || (window.__novaV7User && (window.__novaV7User.displayName || window.__novaV7User.username)) || "Nova";
  }
  function updateBioCount() {
    var field = document.querySelector('[data-profile-field="bio"]');
    var count = byId("settings-bio-count");
    if (field && count) count.textContent = String(field.value.length);
  }
  function renderAvatar(value) {
    var preview = byId("settings-avatar-preview");
    var fallback = byId("settings-avatar-fallback");
    if (!preview) return;
    preview.querySelector("img")?.remove();
    if (fallback) {
      fallback.hidden = !!value;
      fallback.textContent = currentName().charAt(0).toUpperCase() || "N";
    }
    if (value) {
      var image = document.createElement("img");
      image.alt = "Profile image preview";
      image.src = value;
      image.onerror = function () {
        image.remove();
        if (fallback) fallback.hidden = false;
        status("Nova could not display that image.", true);
      };
      preview.appendChild(image);
    }
    preview.classList.remove("ready");
    void preview.offsetWidth;
    preview.classList.add("ready");
  }
  function setDirty(message) {
    if (!window.__novaV7User) return;
    dirty = true;
    var button = saveButton();
    if (button) { button.disabled = false; button.classList.remove("saved"); }
    status(message || "Unsaved profile changes");
  }
  function setProfileEnabled(enabled) {
    controls().forEach(function (el) { el.disabled = !enabled; });
    ["settings-avatar-upload", "settings-avatar-camera", "settings-avatar-remove"].forEach(function (id) {
      var el = byId(id); if (el) el.disabled = !enabled;
    });
    var button = saveButton();
    if (button) button.disabled = !enabled || !dirty;
  }
  function hydrate(profile) {
    controls().forEach(function (el) {
      var key = fieldMap[el.dataset.profileField];
      if (key) el.value = profile[key] || "";
    });
    renderAvatar(profile.avatarUrl || "");
    if (profile.onlineVisibility) {
      document.documentElement.setAttribute("data-online-visibility", profile.onlineVisibility);
      localStorage.setItem("nova_social_visibility", profile.onlineVisibility);
    }
    updateBioCount();
    dirty = false;
    var button = saveButton();
    if (button) { button.disabled = true; button.classList.remove("saved"); }
  }

  async function load() {
    if (!window.__novaV7User) {
      setProfileEnabled(false);
      renderAvatar("");
      status("Sign in to edit your shared Nova profile.");
      return;
    }
    setProfileEnabled(true);
    status("Loading your profile…");
    try {
      var data = await NovaAPI.getProfile();
      hydrate(data.profile || {});
      status("Profile synced with Nova.");
    } catch (error) {
      status(error.message || "Nova could not load your profile.", true);
    }
  }

  async function prepareImage(file) {
    if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Choose an image file");
    if (file.size > 15 * 1024 * 1024) throw new Error("That image is larger than 15 MB");
    var url = URL.createObjectURL(file);
    try {
      var image = await new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error("Nova could not read that image")); };
        img.src = url;
      });
      var sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      var sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
      var sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
      var canvas = document.createElement("canvas");
      var encoded = "";
      for (var size of [512, 420, 320, 256]) {
        canvas.width = size; canvas.height = size;
        var context = canvas.getContext("2d", { alpha: true });
        context.clearRect(0, 0, size, size);
        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        for (var quality of [.82, .7, .58, .46]) {
          encoded = canvas.toDataURL("image/webp", quality);
          if (encoded.length <= 120000) break;
        }
        if (encoded.length <= 120000) break;
      }
      if (!encoded || encoded.length > 120000) throw new Error("Nova could not make that image small enough");
      return encoded;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function acceptImage(file) {
    var editor = byId("settings-avatar-drop");
    if (editor) editor.classList.add("processing");
    status("Preparing your image…");
    try {
      var value = await prepareImage(file);
      var input = byId("settings-avatar-value");
      if (input) input.value = value;
      renderAvatar(value);
      setDirty("Image ready. Save your profile to publish it.");
    } catch (error) {
      status(error.message || "Nova could not prepare that image.", true);
    } finally {
      if (editor) editor.classList.remove("processing", "drag-active");
    }
  }

  function stopCamera() {
    if (cameraStream) cameraStream.getTracks().forEach(function (track) { track.stop(); });
    cameraStream = null;
    document.querySelector(".settings-camera-overlay")?.remove();
  }
  async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      byId("settings-avatar-camera-input")?.click();
      return;
    }
    stopCamera();
    var overlay = document.createElement("div");
    overlay.className = "social-camera-overlay settings-camera-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Take profile photo");
    overlay.innerHTML = '<div class="social-camera-panel"><div class="social-camera-header"><strong>Take profile photo</strong><button type="button" class="social-camera-close" aria-label="Close camera">&times;</button></div><div class="social-camera-preview"><video autoplay muted playsinline></video><div class="social-camera-loading">Starting camera…</div></div><div class="social-camera-actions"><button type="button" class="social-camera-cancel">Cancel</button><button type="button" class="social-camera-shutter" disabled><span></span>Capture</button></div></div>';
    document.body.appendChild(overlay);
    var video = overlay.querySelector("video");
    var shutter = overlay.querySelector(".social-camera-shutter");
    overlay.querySelector(".social-camera-close").onclick = stopCamera;
    overlay.querySelector(".social-camera-cancel").onclick = stopCamera;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: false });
      video.srcObject = cameraStream;
      await video.play();
      overlay.querySelector(".social-camera-loading").hidden = true;
      shutter.disabled = false;
    } catch (error) {
      stopCamera();
      status(error && error.name === "NotAllowedError" ? "Camera permission was not allowed." : "Camera is unavailable on this device.", true);
      return;
    }
    shutter.onclick = async function () {
      shutter.disabled = true;
      var canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720; canvas.height = video.videoHeight || 720;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/webp", .9); });
      stopCamera();
      if (blob) acceptImage(new File([blob], "nova-avatar.webp", { type: "image/webp" }));
    };
  }

  async function save() {
    if (!window.__novaV7User || !dirty) return;
    var payload = {};
    controls().forEach(function (el) {
      var key = fieldMap[el.dataset.profileField];
      if (key) payload[key] = el.value;
    });
    var button = saveButton();
    if (button) button.disabled = true;
    status("Saving profile to Nova…");
    try {
      var data = await NovaAPI.saveProfile(payload);
      var me = await NovaAPI.me();
      window.__novaV7User = me.user;
      NovaAPI.cacheUser(me.user);
      hydrate(data.profile || payload);
      if (button) {
        button.classList.add("saved");
        setTimeout(function () { button.classList.remove("saved"); }, 1600);
      }
      status("Profile saved. Social has been updated.");
      window.dispatchEvent(new CustomEvent("nova:profile-updated", { detail: data.profile }));
    } catch (error) {
      dirty = true;
      if (button) button.disabled = false;
      status(error.message || "Nova could not save your profile.", true);
    }
  }

  function bind() {
    var upload = byId("settings-avatar-upload");
    var camera = byId("settings-avatar-camera");
    var fileInput = byId("settings-avatar-file");
    var cameraInput = byId("settings-avatar-camera-input");
    var remove = byId("settings-avatar-remove");
    var editor = byId("settings-avatar-drop");
    if (upload) upload.addEventListener("click", function (event) { event.stopPropagation(); fileInput?.click(); });
    if (camera) camera.addEventListener("click", function (event) { event.stopPropagation(); openCamera(); });
    [fileInput, cameraInput].forEach(function (input) {
      input?.addEventListener("change", function () {
        var file = input.files && input.files[0]; input.value = ""; if (file) acceptImage(file);
      });
    });
    if (remove) remove.addEventListener("click", function (event) {
      event.stopPropagation();
      var input = byId("settings-avatar-value"); if (input) input.value = "";
      renderAvatar(""); setDirty("Image removed. Save your profile to publish it.");
    });
    if (editor) {
      editor.addEventListener("click", function (event) { if (!event.target.closest("button") && window.__novaV7User) fileInput?.click(); });
      editor.addEventListener("keydown", function (event) { if ((event.key === "Enter" || event.key === " ") && window.__novaV7User) { event.preventDefault(); fileInput?.click(); } });
      ["dragenter", "dragover"].forEach(function (type) { editor.addEventListener(type, function (event) { event.preventDefault(); if (window.__novaV7User) editor.classList.add("drag-active"); }); });
      ["dragleave", "dragend"].forEach(function (type) { editor.addEventListener(type, function () { editor.classList.remove("drag-active"); }); });
      editor.addEventListener("drop", function (event) {
        event.preventDefault(); editor.classList.remove("drag-active");
        if (!window.__novaV7User) return;
        var file = Array.from(event.dataTransfer && event.dataTransfer.files || []).find(function (item) { return String(item.type).startsWith("image/"); });
        if (file) acceptImage(file); else status("Drop an image file.", true);
      });
    }
    controls().forEach(function (el) {
      el.addEventListener("input", function () {
        if (el.dataset.profileField === "bio") updateBioCount();
        if (el.dataset.profileField === "displayName" && !byId("settings-avatar-value")?.value) renderAvatar("");
        setDirty();
      });
    });
    saveButton()?.addEventListener("click", save);
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") stopCamera(); });
  }

  document.addEventListener("DOMContentLoaded", function () { bind(); load(); });
  window.addEventListener("nova:session-changed", load);
  window.addEventListener("nova:profile-updated", function (event) { if (!dirty && event.detail) hydrate(event.detail); });
  window.NovaProfileTools = { prepareImage: prepareImage };
})();

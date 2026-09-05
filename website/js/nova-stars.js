(function () {
  "use strict";

  var canvas;
  var context;
  var width = 0;
  var height = 0;
  var stars = [];
  var frame = 0;
  var light = false;
  var moving = false;
  var density = .7;
  var intensity = .75;
  var mouse = { x: 0, y: 0 };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function settings() {
    try { return JSON.parse(localStorage.getItem("nova_control_center") || "{}"); }
    catch (error) { return {}; }
  }

  function targetCount(mode) {
    var base = mode === "quality" ? 180 : (mode === "fast" ? 52 : 118);
    return Math.round(base * density);
  }

  function Star(initial) { this.reset(initial); }

  Star.prototype.reset = function (initial) {
    this.x = Math.random() * width;
    this.y = initial ? Math.random() * height : -2;
    this.radius = .3 + Math.random() * 1.4;
    this.vx = .18 * (Math.random() - .5);
    this.vy = .18 + Math.random() * .30;
    this.alpha = .1 + Math.random() * .6;
    this.twinkleSpeed = .004 + Math.random() * .012;
    this.twinkleDirection = Math.random() > .5 ? 1 : -1;
    this.twinkle = Math.random() * Math.PI * 2;
    this.purple = Math.random() < .18;
    this.parallax = .3 + Math.random() * .7;
    this.currentOpacity = this.alpha;
    this.drawX = this.x;
    this.drawY = this.y;
  };

  Star.prototype.update = function () {
    this.twinkle += this.twinkleSpeed * this.twinkleDirection * Math.max(.18, intensity);
    this.currentOpacity = clamp(this.alpha + Math.sin(this.twinkle) * (.5 * this.alpha), 0, 1);
    this.x += this.vx * Math.max(.12, intensity);
    this.y += this.vy * Math.max(.12, intensity);
    var px = .25 * (mouse.x / Math.max(width, 1) - .5) * this.parallax;
    var py = .15 * (mouse.y / Math.max(height, 1) - .5) * this.parallax;
    this.drawX = this.x + px * width * .04;
    this.drawY = this.y + py * height * .04;
    if (this.y > height + 2) { this.reset(false); this.y = -2; }
    if (this.x < -2) this.x = width + 2;
    if (this.x > width + 2) this.x = -2;
  };

  Star.prototype.draw = function () {
    context.save();
    context.globalAlpha = this.currentOpacity;
    if (this.purple) {
      var glow = context.createRadialGradient(this.drawX, this.drawY, 0, this.drawX, this.drawY, 2.5 * this.radius);
      glow.addColorStop(0, "rgba(139,143,255,1)");
      glow.addColorStop(1, "rgba(139,143,255,0)");
      context.beginPath();
      context.arc(this.drawX, this.drawY, 2.5 * this.radius, 0, Math.PI * 2);
      context.fillStyle = glow;
    } else {
      context.beginPath();
      context.arc(this.drawX, this.drawY, this.radius, 0, Math.PI * 2);
      context.fillStyle = "#ffffff";
    }
    context.fill();
    context.restore();
  };

  function resize() {
    if (!canvas) return;
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    stars.forEach(function (star) {
      star.x = clamp(star.x, 0, width);
      star.y = clamp(star.y, 0, height);
    });
    sync(true);
  }

  function sync(forceDraw) {
    var current = settings();
    var mode = document.documentElement.getAttribute("data-performance-mode") || current.performanceMode || "balanced";
    density = clamp(Number(current.starDensity == null ? 70 : current.starDensity) / 100, 0, 1);
    intensity = clamp(Number(current.animationIntensity == null ? 75 : current.animationIntensity) / 100, 0, 1);
    light = document.documentElement.getAttribute("data-theme") === "light";
    var bgAnim = document.documentElement.getAttribute("data-bg-anim");
    moving = !light && intensity > 0 && bgAnim !== "off" && document.documentElement.getAttribute("data-reduce-motion") !== "on";
    var count = light ? 0 : targetCount(mode);
    while (stars.length < count) stars.push(new Star(true));
    if (stars.length > count) stars.length = count;
    if (forceDraw) restart();
  }

  function draw(update) {
    context.clearRect(0, 0, width, height);
    if (light || !stars.length) return;
    stars.forEach(function (star) {
      if (update) star.update();
      star.draw();
    });
  }

  function tick() {
    frame = 0;
    draw(true);
    if (moving) frame = requestAnimationFrame(tick);
  }

  function restart() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (moving) frame = requestAnimationFrame(tick);
    else draw(false);
  }

  function boot() {
    canvas = document.createElement("canvas");
    canvas.id = "nova-star-canvas";
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;display:block";
    document.body.insertBefore(canvas, document.body.firstChild);
    context = canvas.getContext("2d", { alpha: true });
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    mouse.x = width / 2;
    mouse.y = height / 2;
    sync(false);
    restart();
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", function (event) { mouse.x = event.clientX; mouse.y = event.clientY; });
  document.addEventListener("nova:settings-changed", function () { sync(true); });
  var observedRoot = document.documentElement;
  if (observedRoot && typeof MutationObserver !== "undefined") {
    new MutationObserver(function () { sync(true); }).observe(observedRoot, {
      attributes: true,
      attributeFilter: ["data-theme", "data-performance-mode", "data-bg-anim", "data-reduce-motion"]
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

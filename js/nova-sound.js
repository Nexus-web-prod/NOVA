(function () {
  "use strict";
  var audio = null;

  function enabled() {
    return document.documentElement.getAttribute("data-sound-effects") === "on";
  }

  function play(kind) {
    if (!enabled() || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      var Audio = window.AudioContext || window.webkitAudioContext;
      audio = audio || new Audio();
      if (audio.state === "suspended") audio.resume();
      var now = audio.currentTime;
      var oscillator = audio.createOscillator();
      var gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(kind === "back" ? 280 : 390, now);
      oscillator.frequency.exponentialRampToValueAtTime(kind === "back" ? 230 : 470, now + .045);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.018, now + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .065);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(now); oscillator.stop(now + .07);
    } catch (error) {}
  }

  document.addEventListener("pointerdown", function (event) {
    var button = event.target.closest && event.target.closest("button,[role=button]");
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
    play(button.classList.contains("nova-setup-back") ? "back" : "tap");
  }, true);

  window.NovaSound = { play: play, enabled: enabled };
})();

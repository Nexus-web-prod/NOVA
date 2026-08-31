(function () {
  "use strict";

  function resolved(value) {
    return Promise.resolve(value);
  }

  function getURLParam(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  window.PokiSDK = {
    init: function () { return resolved(); },
    initWithVideoHB: function () { return resolved(); },
    commercialBreak: function () { return resolved(); },
    rewardedBreak: function () { return resolved(false); },
    getLeaderboard: function () { return resolved(); },
    getSharableURL: function () { return resolved(window.location.href); },
    shareableURL: function () { return resolved(window.location.href); },
    getURLParam: getURLParam,
    isAdBlocked: function () { return false; },
    captureError: function () {},
    setDebug: function () {},
    customEvent: function () {},
    displayAd: function () {},
    destroyAd: function () {},
    disableProgrammatic: function () {},
    gameLoadingStart: function () {},
    gameLoadingFinished: function () {},
    gameLoadingProgress: function () {},
    gameInteractive: function () {},
    gameplayStart: function () {},
    gameplayStop: function () {},
    happyTime: function () {},
    logError: function () {},
    muteAd: function () {},
    roundStart: function () {},
    roundEnd: function () {},
    sendHighscore: function () {},
    setPlayerAge: function () {},
    togglePlayerAdvertisingConsent: function () {}
  };
})();

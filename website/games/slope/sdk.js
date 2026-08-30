// The original Y8 SDK is not required for Nova's local build. Unity still
// requests this file and calls its interstitial hook, so keep a harmless local
// implementation to prevent an unavailable ad service from stopping the game.
window.showNextAd = window.showNextAd || function () {};

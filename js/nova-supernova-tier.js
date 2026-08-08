/**
 * Nova Supernova tier — D1-backed Pro detection and free-tier speed limits.
 */
(function () {
  "use strict";

  var POLL_MS = 30000;
  var FREE_NAV_DELAY_MS = 1800;

  window._novaIsSupernovaUser = false;

  function getAccount() {
    try { return JSON.parse(localStorage.getItem("nova_account") || "null"); }
    catch (error) { return null; }
  }

  function accountLooksPro(account) {
    if (!account) return false;
    var roles = Array.isArray(account.roles) ? account.roles : [account.role];
    return !!(account.supernova || account.plan === "supernova" || account.tier === "supernova" || account.tier === "pro" ||
      roles.indexOf("admin") !== -1 || roles.indexOf("owner") !== -1);
  }

  function setProState(isPro) {
    var pro = !!isPro;
    window._novaIsSupernovaUser = pro;
    var account = getAccount();
    if (account) {
      var tier = pro ? "supernova" : "free";
      if (!!account.supernova !== pro || account.tier !== tier || account.plan !== tier) {
        account.supernova = pro;
        account.tier = tier;
        account.plan = tier;
        try { localStorage.setItem("nova_account", JSON.stringify(account)); } catch (error) {}
        document.dispatchEvent(new CustomEvent("nova:account-changed"));
      }
    }
    document.documentElement.classList.toggle("nova-tier-pro", pro);
    document.documentElement.classList.toggle("nova-tier-free", !pro);
  }

  function isPro() {
    return window._novaIsSupernovaUser || accountLooksPro(getAccount());
  }

  function getFreeNavDelay() {
    return isPro() ? 0 : FREE_NAV_DELAY_MS;
  }

  function applyFreeTierNavDelay() {
    var delay = getFreeNavDelay();
    return delay > 0 ? new Promise(function (resolve) { setTimeout(resolve, delay); }) : Promise.resolve();
  }

  async function syncFromServer() {
    var account = getAccount();
    if (!account || !account.username) {
      setProState(false);
      return;
    }
    if (!window.NovaAPI) {
      setProState(accountLooksPro(account));
      return;
    }
    try {
      var data = await window.NovaAPI.me();
      setProState(accountLooksPro(data.user));
    } catch (error) {
      setProState(accountLooksPro(account));
    }
  }

  function scheduleBoot() {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (window.NovaAPI) {
        clearInterval(timer);
        syncFromServer();
      } else if (attempts > 40) {
        clearInterval(timer);
      }
    }, 500);
  }

  setProState(accountLooksPro(getAccount()));
  scheduleBoot();
  setInterval(function () {
    if (!document.hidden) syncFromServer();
  }, POLL_MS);

  window.addEventListener("nova:session-changed", function (event) {
    setProState(accountLooksPro(event.detail && event.detail.user));
  });
  document.addEventListener("nova:account-changed", function () {
    setTimeout(syncFromServer, 200);
  });

  window.NovaSupernovaTier = {
    isPro: isPro,
    sync: syncFromServer,
    getFreeNavDelay: getFreeNavDelay,
    applyFreeTierNavDelay: applyFreeTierNavDelay,
    FREE_NAV_DELAY_MS: FREE_NAV_DELAY_MS
  };
})();

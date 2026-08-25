(function(){
  var CONTROL_KEY = 'nova_control_center';
  var BRAVE = { name: 'Brave', url: 'https://search.brave.com' };
  var DISCORD = { name: 'Discord', url: 'https://discord.com/app' };
  var DEFAULT_LINKS = [
    BRAVE,
    { name: 'YouTube', url: 'https://www.youtube.com' },
    { name: 'Twitch', url: 'https://www.twitch.tv' },
    { name: 'GitHub', url: 'https://github.com' }
  ];
  function sameDefault(list){
    if (!Array.isArray(list) || list.length !== 4) return false;
    return ['YouTube','Reddit','Twitch','GitHub'].every(function(name, i){
      return list[i] && list[i].name === name;
    });
  }
  try {
    var raw = localStorage.getItem('nova_bookmarks');
    if (!raw) {
      localStorage.setItem('nova_bookmarks', JSON.stringify(DEFAULT_LINKS));
    } else {
      var links = JSON.parse(raw);
      if (sameDefault(links)) {
        links = DEFAULT_LINKS.slice();
      } else if (Array.isArray(links)) {
        links = links.map(function(link){
          if (!link) return link;
          var name = String(link.name || '');
          var url = String(link.url || link.link || '');
          if (name === 'Reddit' && url === 'https://www.reddit.com') return BRAVE;
          if (name.toLowerCase() === 'startpage' || /https?:\/\/(?:www\.)?startpage\.com(?:\/|$)/i.test(url)) return BRAVE;
          if (/^discord(?:\s*-?\s*login)?$/i.test(name) || /^https?:\/\/(?:www\.)?discord\.com(?:\/login)?\/?$/i.test(url)) {
            return { name: name || 'Discord', url: 'https://discord.com/app' };
          }
          return link;
        });
      } else {
        links = DEFAULT_LINKS.slice();
      }

      // Canonicalize and de-duplicate migrated quick links. This repairs the
      // R8.17 migration that could turn Startpage into a second Brave entry.
      var seen = Object.create(null);
      var cleaned = [];
      var hasBrave = false;
      links.forEach(function(link){
        if (!link || typeof link !== 'object') return;
        var name = String(link.name || '').trim();
        var url = String(link.url || link.link || '').trim();
        var canonical = url;
        try {
          var u = new URL(url);
          var host = u.hostname.toLowerCase().replace(/^www\./, '');
          var path = u.pathname.replace(/\/+$/, '') || '/';
          canonical = u.protocol.toLowerCase() + '//' + host + path;
        } catch(e) {
          canonical = url.toLowerCase();
        }

        var isBrave = /^brave$/i.test(name) || /^https?:\/\/search\.brave\.com(?:\/|$)/i.test(url);
        if (isBrave) {
          if (hasBrave) return;
          hasBrave = true;
          link = { name: 'Brave', url: BRAVE.url };
          canonical = BRAVE.url;
        }

        // Treat Discord root/login/app as one quick-link destination so an
        // old Discord Login entry cannot duplicate the working Discord app link.
        if (/^discord(?:\s*-?\s*login)?$/i.test(name) || /^https?:\/\/(?:www\.)?discord\.com(?:\/app|\/login)?\/?$/i.test(url)) {
          canonical = DISCORD.url;
          link = { name: name || 'Discord', url: DISCORD.url };
        }

        var key = canonical.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        cleaned.push(link);
      });

      if (!hasBrave) cleaned.unshift(BRAVE);
      links = cleaned;
      localStorage.setItem('nova_bookmarks', JSON.stringify(links));
    }
  } catch(e) {}
  function readControls(){
    try { return JSON.parse(localStorage.getItem(CONTROL_KEY) || '{}'); }
    catch(e){ return {}; }
  }
  function data(name, value){ document.documentElement.setAttribute(name, value); }
  var s = readControls();
  data('card-size', s.cardSize || 'normal');
  data('ratings', s.showRatings === false ? 'off' : 'on');
  data('recents', s.showRecents === false ? 'off' : 'on');
  data('hide-unavailable', s.hideUnavailableApps ? 'on' : 'off');
  data('movie-size', s.movieCardSize || 'normal');
  data('bg-style', s.backgroundStyle || 'stars');
  data('performance-mode', s.batterySaver || s.performanceMode === 'fast' ? 'fast' : (s.performanceMode === 'quality' ? 'quality' : 'balanced'));
  data('bg-anim', s.backgroundAnimation ? 'on' : 'off');
  data('hover-zoom', s.hoverZoom ? 'on' : 'off');
  data('blur-level', s.blurLevel || 'off');
  data('island-enabled', 'on');
  data('island-close-button', s.islandCloseButton === true ? 'on' : 'off');
  data('island-pulse', s.islandPulse === false ? 'off' : 'on');
  data('island-pos', s.islandPosition || 'top-right');
  data('island-size', s.islandSize || 'normal');
  data('everyone-chat', s.everyoneChat === false ? 'off' : 'on');
  data('voice-presence', s.voicePresence === false ? 'off' : 'on');
  data('friend-requests', s.friendRequests || 'everyone');
  data('online-visibility', s.onlineVisibility || 'everyone');
  data('dm-notifications', s.dmNotifications === false ? 'off' : 'on');
  data('disable-activity', s.disableActivity ? 'on' : 'off');
  data('hide-play-count', s.hidePlayCount ? 'on' : 'off');
  data('hide-badges', s.hideBadges ? 'on' : 'off');
  data('high-contrast', s.highContrast ? 'on' : 'off');
  data('focus-outlines', s.focusOutlines === false ? 'off' : 'on');
  var textSize = s.textSize || 'medium';
  if (textSize === 'normal') textSize = 'medium';
  if (textSize === 'xl') textSize = 'large';
  if (!['small','medium','large'].includes(textSize)) textSize = 'medium';
  data('text-size', textSize);
  data('reduce-motion', s.reduceMotion ? 'on' : 'off');
})();

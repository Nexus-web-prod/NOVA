(function(){
  var CONTROL_KEY = 'nova_control_center';
  var STARTPAGE = { name: 'Startpage', url: 'https://www.startpage.com' };
  var DEFAULT_LINKS = [
    STARTPAGE,
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
        localStorage.setItem('nova_bookmarks', JSON.stringify(DEFAULT_LINKS));
      } else if (Array.isArray(links)) {
        var changed = false;
        links = links.map(function(link){
          if (link && link.name === 'Reddit' && link.url === 'https://www.reddit.com') {
            changed = true;
            return STARTPAGE;
          }
          return link;
        });
        if (changed) {
          var hasStart = false;
          var cleaned = [];
          links.forEach(function(link){
            if (!link) return;
            if (link.name === 'Startpage') {
              if (!hasStart) cleaned.unshift(STARTPAGE);
              hasStart = true;
            } else {
              cleaned.push(link);
            }
          });
          links = cleaned;
          if (!hasStart) links.unshift(STARTPAGE);
        }
        if (changed) localStorage.setItem('nova_bookmarks', JSON.stringify(links));
      }
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
  data('text-size', s.textSize || 'normal');
  data('reduce-motion', s.reduceMotion ? 'on' : 'off');
})();

(function(){
  var form = document.getElementById('nova-test-launch');
  var input = document.getElementById('nova-test-query');
  var toast = document.getElementById('test-toast');
  var toastTimer = null;

  function showToast(message){
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = setTimeout(function(){ toast.classList.remove('is-visible'); }, 3600);
  }

  form?.addEventListener('submit', function(event){
    event.preventDefault();
    var query = input.value.trim();
    if (!query) {
      showToast('Enter a search or destination to test the launch field.');
      input.focus();
      return;
    }
    showToast('Concept preview: Nova would launch “' + query.slice(0, 90) + '”.');
  });

  document.querySelectorAll('[data-destination]').forEach(function(link){
    link.addEventListener('click', function(){
      try { sessionStorage.setItem('nova_test_destination', link.dataset.destination || ''); } catch (error) {}
    });
  });
})();

(function () {
  var toggle = document.getElementById("nav-toggle");
  var menu = document.getElementById("site-nav-mobile");
  if (!toggle || !menu) return;
  toggle.addEventListener("click", function () {
    var open = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();

/**
 * app.js — navigation between views and app bootstrap.
 * Loads LAST: all tools must have registered themselves with
 * EC.registerRenderer() by the time this runs applyLang()/renderAll().
 */
(function(EC){
  "use strict";

  function goTo(view){
    document.querySelectorAll(".view").forEach(function(v){ v.classList.remove("active"); });
    document.getElementById("view-"+view).classList.add("active");
    document.querySelectorAll(".nav-item[data-nav]").forEach(function(n){
      n.classList.toggle("active", n.getAttribute("data-nav")===view);
    });
    window.scrollTo(0,0);
  }
  document.querySelectorAll("[data-nav]").forEach(function(el){
    el.addEventListener("click", function(){ goTo(el.getAttribute("data-nav")); });
  });

  document.querySelectorAll(".lang-btn").forEach(function(b){
    b.addEventListener("click", function(){ EC.applyLang(b.getAttribute("data-lang")); });
  });

  document.querySelectorAll(".theme-btn").forEach(function(b){
    b.addEventListener("click", function(){ EC.theme.apply(b.getAttribute("data-theme-mode")); });
  });

  EC.theme.init();
  EC.initInputValidation();
  goTo("home");
  EC.applyLang((navigator.language||"it").slice(0,2)==="en" ? "en" : "it");
  window.addEventListener("resize", EC.renderAll);

})(window.EC);

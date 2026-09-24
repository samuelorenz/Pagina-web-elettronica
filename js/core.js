/**
 * core.js — shared namespace: math/formatting helpers, storage, theme,
 * clipboard/toast, generic chart drawers and the render-registry.
 *
 * Every other script attaches itself to the single global `EC` object instead
 * of polluting `window` directly. Load this file FIRST.
 *
 * Adding a new tool later: push its render function onto EC.renderers (via
 * EC.registerRenderer) so it gets called automatically on language change /
 * window resize, without touching app.js. Reuse EC.charts.* for any SVG
 * chart and EC.fmt*() for unit formatting instead of writing new ones.
 */
(function(EC){
  "use strict";

  EC.svgNS = "http://www.w3.org/2000/svg";

  // ================= E24 series =================
  EC.E24 = [1.0,1.1,1.2,1.3,1.5,1.6,1.8,2.0,2.2,2.4,2.7,3.0,3.3,3.6,3.9,4.3,4.7,5.1,5.6,6.2,6.8,7.5,8.2,9.1];

  EC.nearestE24 = function(value){
    if(value<=0) return 0;
    var exponent = Math.floor(Math.log10(value));
    var base = value/Math.pow(10,exponent);
    var best = EC.E24[0], minDiff = Math.abs(base-best);
    for(var i=0;i<EC.E24.length;i++){
      var d = Math.abs(base-EC.E24[i]);
      if(d<minDiff){minDiff=d;best=EC.E24[i];}
    }
    return Math.round(best*Math.pow(10,exponent)*10)/10;
  };

  // ================= unit formatters (shared by every tool) =================
  EC.fmtHz = function(f){
    if(f>=1e6) return (f/1e6).toFixed(2)+" MHz";
    if(f>=1e3) return (f/1e3).toFixed(2)+" kHz";
    return f.toFixed(f<10?2:1)+" Hz";
  };
  EC.fmtV = function(v){
    var av = Math.abs(v);
    if(av>=1) return v.toFixed(3)+" V";
    return (v*1000).toFixed(1)+" mV";
  };
  EC.fmtR = function(r){
    if(r>=1e6) return (r/1e6).toFixed(2)+" MΩ";
    if(r>=1e3) return (r/1e3).toFixed(2)+" kΩ";
    return r.toFixed(1)+" Ω";
  };
  EC.fmtC = function(farads){ // input in farads
    if(farads>=1e-6) return (farads*1e6).toFixed(2)+" µF";
    if(farads>=1e-9) return (farads*1e9).toFixed(2)+" nF";
    return (farads*1e12).toFixed(1)+" pF";
  };
  EC.fmtL = function(henries){
    if(henries>=1) return henries.toFixed(3)+" H";
    if(henries>=1e-3) return (henries*1e3).toFixed(2)+" mH";
    return (henries*1e6).toFixed(1)+" µH";
  };
  EC.fmtI = function(amps){
    var a = Math.abs(amps);
    if(a>=1) return amps.toFixed(3)+" A";
    if(a>=1e-3) return (amps*1e3).toFixed(1)+" mA";
    return (amps*1e6).toFixed(1)+" µA";
  };
  EC.fmtP = function(watts){
    var a = Math.abs(watts);
    if(a>=1) return watts.toFixed(2)+" W";
    return (watts*1000).toFixed(1)+" mW";
  };

  // ================= status icons (good / warn / bad) =================
  EC.icons = {
    good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
    bad:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>'
  };
  EC.iconFor = function(status){
    return status==="good" ? EC.icons.good : status==="warn" ? EC.icons.warn : EC.icons.bad;
  };

  // ================= render registry =================
  EC.renderers = [];
  EC.registerRenderer = function(fn){ EC.renderers.push(fn); };
  EC.renderAll = function(){ EC.renderers.forEach(function(fn){ fn(); }); };

  // ================= persistent storage (per-browser, best-effort) =================
  EC.storage = {
    save: function(key, obj){
      try{ localStorage.setItem("elettrocalc:"+key, JSON.stringify(obj)); }catch(e){}
    },
    load: function(key, fallback){
      try{
        var raw = localStorage.getItem("elettrocalc:"+key);
        return raw ? JSON.parse(raw) : fallback;
      }catch(e){ return fallback; }
    }
  };

  // Persists a set of form elements (input/select) under `key`, restoring any
  // saved values immediately (call BEFORE first render). Returns the restored
  // object (or null) so a tool can also restore non-standard UI state (e.g. a
  // segmented control) that isn't a plain input/select.
  EC.bindPersistence = function(key, elements){
    var saved = EC.storage.load(key, null);
    if(saved){
      elements.forEach(function(el){
        if(!el || saved[el.id]===undefined) return;
        if(el.type==="checkbox") el.checked = saved[el.id];
        else el.value = saved[el.id];
      });
    }
    function save(){
      var data = {};
      elements.forEach(function(el){ if(el) data[el.id] = el.type==="checkbox"?el.checked:el.value; });
      EC.storage.save(key, data);
    }
    elements.forEach(function(el){
      if(!el) return;
      el.addEventListener("input", save);
      el.addEventListener("change", save);
    });
    return saved;
  };

  // ================= theme (auto / light / dark) =================
  EC.theme = {
    KEY: "theme",
    apply: function(mode){
      if(mode==="light") document.documentElement.setAttribute("data-theme","light");
      else if(mode==="dark") document.documentElement.setAttribute("data-theme","dark");
      else document.documentElement.removeAttribute("data-theme");
      EC.storage.save(EC.theme.KEY, mode);
      document.querySelectorAll(".theme-btn").forEach(function(b){
        b.classList.toggle("active", b.getAttribute("data-theme-mode")===mode);
      });
    },
    init: function(){
      EC.theme.apply(EC.storage.load(EC.theme.KEY, "auto"));
    }
  };

  // ================= toast + clipboard =================
  EC.toast = function(msg){
    var el = document.getElementById("ecToast");
    if(!el){
      el = document.createElement("div");
      el.id = "ecToast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(EC._toastTimer);
    EC._toastTimer = setTimeout(function(){ el.classList.remove("show"); }, 2200);
  };

  EC.copyText = function(text){
    function ok(){ EC.toast(EC.t("copied_toast")); }
    function fail(){
      try{
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        ok();
      }catch(e){ EC.toast(EC.t("copy_failed_toast")); }
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(ok, fail);
    } else {
      fail();
    }
  };

  // Wires a "copy summary" button: clicking it calls buildText() fresh
  // (so it always reflects the latest render) and copies the result.
  EC.bindCopyButton = function(buttonId, buildText){
    var btn = document.getElementById(buttonId);
    if(!btn) return;
    btn.addEventListener("click", function(){ EC.copyText(buildText()); });
  };

  // ================= lightweight input validation (visual only) =================
  // Delegated once on the whole document: any number input with a `min`
  // attribute gets a red outline while its value is empty, non-finite, or
  // below that minimum. Tools don't need to wire this individually.
  EC.initInputValidation = function(){
    function check(el){
      if(el.tagName!=="INPUT" || el.type!=="number") return;
      var v = parseFloat(el.value);
      var bad = el.value==="" || isNaN(v);
      if(!bad && el.min!=="") bad = v < parseFloat(el.min);
      if(!bad && el.max!=="") bad = v > parseFloat(el.max);
      el.classList.toggle("invalid", bad);
    }
    document.querySelectorAll('input[type="number"]').forEach(check);
    document.addEventListener("input", function(e){ check(e.target); });
  };

  // ================= generic SVG chart helpers =================
  // Shared geometry/layout for every 640x260 chart in the app.
  var CH = { W:640, H:260, pad:{left:44, right:16, top:14, bottom:30} };

  function gridAndAxis(svg, plotW, plotH, yTicks, yFmt, xTicks, xFmt, yPix, xPix){
    var pad = CH.pad;
    yTicks.forEach(function(val){
      var y = yPix(val);
      var line = document.createElementNS(EC.svgNS,"line");
      line.setAttribute("class","gridline");
      line.setAttribute("x1",pad.left); line.setAttribute("x2",CH.W-pad.right);
      line.setAttribute("y1",y); line.setAttribute("y2",y);
      svg.appendChild(line);
      var ty = document.createElementNS(EC.svgNS,"text");
      ty.setAttribute("x",pad.left-8); ty.setAttribute("y",y+3);
      ty.setAttribute("text-anchor","end");
      ty.textContent = yFmt(val);
      svg.appendChild(ty);
    });
    xTicks.forEach(function(val){
      var x = xPix(val);
      var tx = document.createElementNS(EC.svgNS,"text");
      tx.setAttribute("x",x); tx.setAttribute("y",CH.H-pad.bottom+18);
      tx.setAttribute("text-anchor","middle");
      tx.textContent = xFmt(val);
      svg.appendChild(tx);
    });
    var axis = document.createElementNS(EC.svgNS,"line");
    axis.setAttribute("class","axis");
    axis.setAttribute("x1",pad.left); axis.setAttribute("x2",CH.W-pad.right);
    axis.setAttribute("y1",CH.H-pad.bottom); axis.setAttribute("y2",CH.H-pad.bottom);
    svg.appendChild(axis);
  }

  function drawMarker(svg, x, cls, y0, y1){
    var line = document.createElementNS(EC.svgNS,"line");
    line.setAttribute("class", cls || "marker-line");
    line.setAttribute("x1",x); line.setAttribute("x2",x);
    line.setAttribute("y1",y0); line.setAttribute("y2",y1);
    svg.appendChild(line);
  }

  EC.charts = {};

  /**
   * XY line chart, linear or log X axis. Used for Bode-style responses
   * (log X, dB Y) and simple linear traces (waveforms, sweeps).
   * opts: { series:[{points:[[x,y],...], cls}], xMin,xMax,yMin,yMax,
   *         xLog:bool, xFmt,yFmt, xTicks,yTicks (arrays of values, optional),
   *         markers:[{x,cls}], hLines:[{y,cls}] }
   */
  EC.charts.xy = function(svgEl, opts){
    svgEl.innerHTML = "";
    var pad = CH.pad;
    var plotW = CH.W-pad.left-pad.right, plotH = CH.H-pad.top-pad.bottom;
    var xLog = !!opts.xLog;
    var xMin = opts.xMin, xMax = opts.xMax, yMin = opts.yMin, yMax = opts.yMax;
    var logMin = xLog ? Math.log10(xMin) : 0, logMax = xLog ? Math.log10(xMax) : 0;

    function xPix(x){
      var frac = xLog ? (Math.log10(x)-logMin)/(logMax-logMin) : (x-xMin)/(xMax-xMin);
      return pad.left + frac*plotW;
    }
    function yPix(y){ return pad.top + plotH - ((y-yMin)/(yMax-yMin))*plotH; }

    var yFmt = opts.yFmt || function(v){ return v.toFixed(0); };
    var xFmt = opts.xFmt || function(v){ return v.toFixed(0); };
    var yTicks = opts.yTicks || (function(){
      var arr=[]; for(var i=0;i<=5;i++) arr.push(yMin+(yMax-yMin)*(i/5)); return arr;
    })();
    var xTicks = opts.xTicks || (function(){
      if(xLog){
        var arr=[]; var d0=Math.floor(logMin), d1=Math.ceil(logMax);
        for(var d=d0; d<=d1; d++){ var f=Math.pow(10,d); if(f>=xMin && f<=xMax) arr.push(f); }
        return arr;
      }
      var arr2=[]; for(var i=0;i<=5;i++) arr2.push(xMin+(xMax-xMin)*(i/5)); return arr2;
    })();

    gridAndAxis(svgEl, plotW, plotH, yTicks, yFmt, xTicks, xFmt, yPix, xPix);

    (opts.hLines||[]).forEach(function(h){
      var y = yPix(h.y);
      var line = document.createElementNS(EC.svgNS,"line");
      line.setAttribute("class", h.cls || "threshold-line");
      line.setAttribute("x1",pad.left); line.setAttribute("x2",CH.W-pad.right);
      line.setAttribute("y1",y); line.setAttribute("y2",y);
      svgEl.appendChild(line);
    });

    (opts.series||[]).forEach(function(s){
      var d = "";
      s.points.forEach(function(pt,i){
        var cmd = i===0?"M":"L";
        var yy = Math.max(yMin, Math.min(yMax, pt[1]));
        d += cmd + xPix(pt[0]).toFixed(2) + "," + yPix(yy).toFixed(2) + " ";
      });
      var path = document.createElementNS(EC.svgNS,"path");
      path.setAttribute("class", s.cls || "margin-line");
      path.setAttribute("d", d);
      svgEl.appendChild(path);
    });

    (opts.markers||[]).forEach(function(m){
      drawMarker(svgEl, xPix(m.x), m.cls, pad.top, CH.H-pad.bottom);
    });

    if(opts.point){
      var c = document.createElementNS(EC.svgNS,"circle");
      c.setAttribute("class","op-point");
      c.setAttribute("cx", xPix(opts.point.x)); c.setAttribute("cy", yPix(opts.point.y)); c.setAttribute("r",5);
      svgEl.appendChild(c);
    }

    return { xPix:xPix, yPix:yPix, plotW:plotW, plotH:plotH };
  };

  /**
   * Histogram chart for Monte Carlo distributions.
   * opts: { hist:[counts...], lo, hi, lowB, highB (acceptance band), nominal, xFmt }
   */
  EC.charts.histogram = function(svgEl, opts){
    svgEl.innerHTML = "";
    var pad = CH.pad;
    var plotW = CH.W-pad.left-pad.right, plotH = CH.H-pad.top-pad.bottom;
    var hist = opts.hist, lo = opts.lo, hi = opts.hi;
    var binW = (hi-lo)/hist.length;
    var maxCount = Math.max.apply(null, hist) || 1;
    var xFmt = opts.xFmt || function(v){ return v.toFixed(2); };

    function xPix(v){ return pad.left + ((v-lo)/(hi-lo))*plotW; }
    function yPix(c){ return pad.top + plotH - (c/maxCount)*plotH; }

    var yTicks=[]; for(var i=0;i<=4;i++) yTicks.push((maxCount/4)*i);
    yTicks.forEach(function(val){
      var y = yPix(val);
      var line = document.createElementNS(EC.svgNS,"line");
      line.setAttribute("class","gridline");
      line.setAttribute("x1",pad.left); line.setAttribute("x2",CH.W-pad.right);
      line.setAttribute("y1",y); line.setAttribute("y2",y);
      svgEl.appendChild(line);
    });
    for(i=0;i<=4;i++){
      var xv = lo + (hi-lo)*(i/4);
      var x = xPix(xv);
      var tx = document.createElementNS(EC.svgNS,"text");
      tx.setAttribute("x",x); tx.setAttribute("y",CH.H-pad.bottom+18);
      tx.setAttribute("text-anchor","middle");
      tx.textContent = xFmt(xv);
      svgEl.appendChild(tx);
    }

    var barGap = 1;
    hist.forEach(function(count, idx){
      var x0 = xPix(lo + idx*binW);
      var x1 = xPix(lo + (idx+1)*binW);
      var yTop = yPix(count);
      var center = lo + (idx+0.5)*binW;
      var out = (opts.lowB!==undefined) && (center<opts.lowB || center>opts.highB);
      var rect = document.createElementNS(EC.svgNS,"rect");
      rect.setAttribute("class","hist-bar"+(out?" out":""));
      rect.setAttribute("x", x0+barGap/2); rect.setAttribute("y", yTop);
      rect.setAttribute("width", Math.max(0.5,x1-x0-barGap)); rect.setAttribute("height", Math.max(0,(CH.H-pad.bottom)-yTop));
      svgEl.appendChild(rect);
    });

    var axis = document.createElementNS(EC.svgNS,"line");
    axis.setAttribute("class","axis");
    axis.setAttribute("x1",pad.left); axis.setAttribute("x2",CH.W-pad.right);
    axis.setAttribute("y1",CH.H-pad.bottom); axis.setAttribute("y2",CH.H-pad.bottom);
    svgEl.appendChild(axis);

    if(opts.nominal!==undefined){
      drawMarker(svgEl, xPix(opts.nominal), "nominal-line", pad.top, CH.H-pad.bottom);
    }
  };

})(window.EC = window.EC || {});

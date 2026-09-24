/**
 * tool-rcfilter.js — First-order RC low-pass / high-pass: fc, response at a
 * given signal frequency, and a log-frequency Bode-style magnitude chart.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor;
  var iconGood = EC.icons.good;
  var fmtHz = EC.fmtHz;

  var rcType = "lp";

  function readInputs(){
    return {
      r: Math.max(0.01, parseFloat(document.getElementById("rcR").value) || 0),
      c: Math.max(1e-6, parseFloat(document.getElementById("rcC").value) || 0) * 1e-9,
      fsig: Math.max(0.001, parseFloat(document.getElementById("rcFsig").value) || 0)
    };
  }

  function magDb(f, fc, type){
    var ratio = f/fc;
    var mag = type==="hp" ? ratio/Math.sqrt(1+ratio*ratio) : 1/Math.sqrt(1+ratio*ratio);
    return 20*Math.log10(mag);
  }
  function phaseDeg(f, fc, type){
    var ratio = f/fc;
    return type==="hp" ? (90 - Math.atan(ratio)*180/Math.PI) : (-Math.atan(ratio)*180/Math.PI);
  }

  function fmtTau(sec){
    if(sec>=1) return sec.toFixed(3)+" s";
    if(sec>=1e-3) return (sec*1e3).toFixed(2)+" ms";
    if(sec>=1e-6) return (sec*1e6).toFixed(2)+" µs";
    return (sec*1e9).toFixed(1)+" ns";
  }

  function calculate(p){
    var fc = 1/(2*Math.PI*p.r*p.c);
    var tau = p.r*p.c;
    var dbAtSig = magDb(p.fsig, fc, rcType);
    var phaseAtSig = phaseDeg(p.fsig, fc, rcType);

    var sweep = [];
    var fMin = fc/1000, fMax = fc*1000;
    var steps = 100;
    var logMin = Math.log10(fMin), logMax = Math.log10(fMax);
    for(var i=0;i<=steps;i++){
      var f = Math.pow(10, logMin + (logMax-logMin)*(i/steps));
      sweep.push([f, magDb(f, fc, rcType)]);
    }

    return { fc:fc, tau:tau, dbAtSig:dbAtSig, phaseAtSig:phaseAtSig, sweep:sweep, fMin:fMin, fMax:fMax };
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("rc-out-fc").textContent = fmtHz(r.fc);
    document.getElementById("rc-out-tau").textContent = fmtTau(r.tau);
    document.getElementById("rc-out-atten").textContent = r.dbAtSig.toFixed(1) + " dB";
    document.getElementById("rc-out-phase").textContent = r.phaseAtSig.toFixed(0) + "°";

    var ratio = p.fsig/r.fc;
    var status = (ratio>=0.33 && ratio<=3) ? "warn" : "good";
    var pill = document.getElementById("rc-pill-atten");
    pill.className = "pill " + status;
    pill.innerHTML = iconFor(status) + (status==="warn"?t("rc_pill_near"):(ratio<0.33?t("rc_pill_pass"):t("rc_pill_stop")));

    var checks = [];
    if(ratio>=0.33 && ratio<=3){
      checks.push({status:"warn", key:"rc_check_near_fc"});
    } else if(ratio<0.33){
      checks.push({status:"info", key:"rc_check_passthrough", v:r.dbAtSig.toFixed(1)});
    } else {
      checks.push({status:"info", key:"rc_check_attenuated", v:r.dbAtSig.toFixed(1)});
    }

    var checksEl = document.getElementById("rcChecks");
    checksEl.innerHTML = "";
    checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      div.innerHTML = (c.status==="info"?iconGood:iconFor(c.status)) + "<span>" + fmt(c.key,{v:c.v}) + "</span>";
      checksEl.appendChild(div);
    });

    drawChart(r, p);
  }

  function drawChart(r, p){
    var dbVals = r.sweep.map(function(s){return s[1];});
    var maxDb = Math.max(3, Math.max.apply(null, dbVals));
    var minDb = Math.max(-80, Math.min.apply(null, dbVals));
    EC.charts.xy(document.getElementById("rcChartSvg"), {
      xLog:true, xMin:r.fMin, xMax:r.fMax, yMin:minDb, yMax:maxDb,
      xFmt:fmtHz, yFmt:function(v){ return v.toFixed(0)+"dB"; },
      series:[{ points:r.sweep, cls:"margin-line" }],
      markers:[{x:r.fc, cls:"marker-line"}, {x:p.fsig, cls:"threshold-line"}]
    });
  }

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_rc") + " (" + (rcType==="lp"?t("rc_type_lp"):t("rc_type_hp")) + ")",
      "R=" + p.r + " Ω, C=" + (p.c*1e9).toFixed(2) + " nF, f_segnale=" + p.fsig + " Hz",
      t("rc_stat_fc") + ": " + fmtHz(r.fc),
      t("rc_stat_atten") + ": " + r.dbAtSig.toFixed(1) + " dB",
      t("rc_stat_phase") + ": " + r.phaseAtSig.toFixed(0) + "°"
    ].join("\n");
  }

  document.getElementById("rcInputGrid").addEventListener("input", render);
  document.getElementById("rcTypeSeg").addEventListener("click", function(e){
    var btn = e.target.closest("button[data-type]");
    if(!btn) return;
    rcType = btn.getAttribute("data-type");
    document.querySelectorAll("#rcTypeSeg button").forEach(function(b){ b.classList.toggle("active", b===btn); });
    persistExtra();
    render();
  });

  var persistEls = ["rcR","rcC","rcFsig"].map(function(id){ return document.getElementById(id); });
  function persistExtra(){
    var data = EC.storage.load("rcfilter", {}) || {};
    data.type = rcType;
    persistEls.forEach(function(el){ data[el.id] = el.value; });
    EC.storage.save("rcfilter", data);
  }
  (function initPersistence(){
    var saved = EC.bindPersistence("rcfilter", persistEls);
    if(saved && saved.type){
      rcType = saved.type;
      document.querySelectorAll("#rcTypeSeg button").forEach(function(b){
        b.classList.toggle("active", b.getAttribute("data-type")===rcType);
      });
    }
    persistEls.forEach(function(el){ el.addEventListener("input", persistExtra); });
  })();

  EC.bindCopyButton("rcCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

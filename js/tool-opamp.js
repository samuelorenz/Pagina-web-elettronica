/**
 * tool-opamp.js — Inverting/non-inverting op-amp stage: gain, a simplified
 * output-offset error budget (Vos·noise-gain + Ib−·Rf, no bias-compensation
 * resistor assumed) and the -3dB bandwidth from GBW/noise-gain.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor;
  var fmtV = EC.fmtV, fmtHz = EC.fmtHz, fmtR = EC.fmtR;

  var opMode = "noninv";

  function readInputs(){
    return {
      r1: Math.max(1, parseFloat(document.getElementById("opR1").value) || 1),
      rf: Math.max(0, parseFloat(document.getElementById("opRf").value) || 0),
      vin: parseFloat(document.getElementById("opVin").value) || 0,
      vos: Math.max(0, parseFloat(document.getElementById("opVos").value) || 0) / 1000, // mV -> V
      ib: Math.max(0, parseFloat(document.getElementById("opIb").value) || 0) * 1e-9, // nA -> A
      gbw: Math.max(0.001, parseFloat(document.getElementById("opGbw").value) || 0) * 1e6, // MHz -> Hz
      bwReq: Math.max(0, parseFloat(document.getElementById("opBwReq").value) || 0)
    };
  }

  function calculate(p){
    var noiseGain = 1 + p.rf/p.r1;
    var signalGain = opMode==="noninv" ? noiseGain : -(p.rf/p.r1);
    var vout = p.vin*signalGain;
    var errVos = p.vos*noiseGain;
    var errIb = p.ib*p.rf;
    var totalErr = errVos+errIb;
    var f3db = p.gbw/noiseGain;
    var zin = opMode==="noninv" ? Infinity : p.r1;
    var errPct = vout!==0 ? Math.abs(totalErr/vout)*100 : (totalErr>0?Infinity:0);
    return { noiseGain:noiseGain, signalGain:signalGain, vout:vout, totalErr:totalErr, f3db:f3db, zin:zin, errPct:errPct };
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("op-out-gain").textContent = r.signalGain.toFixed(2) + " V/V";
    document.getElementById("op-out-vout").textContent = fmtV(r.vout);
    document.getElementById("op-out-err").textContent = fmtV(r.totalErr);
    document.getElementById("op-out-zin").textContent = isFinite(r.zin) ? fmtR(r.zin) : t("op_zin_high");
    document.getElementById("op-out-bw").textContent = fmtHz(r.f3db);

    var errStatus = r.errPct>=5 ? "bad" : (r.errPct>=1 ? "warn" : "good");
    var pillErr = document.getElementById("op-pill-err");
    pillErr.className = "pill " + errStatus;
    pillErr.innerHTML = iconFor(errStatus) + (errStatus==="bad"?t("op_pill_err_bad"):(errStatus==="warn"?t("op_pill_err_warn"):t("op_pill_err_ok")));

    var checks = [];
    if(r.errPct>=5){
      checks.push({status:"bad", key:"op_check_err_high", v:fmtV(r.totalErr)});
    } else {
      checks.push({status:"good", key:"op_check_err_ok", v:fmtV(r.totalErr)});
    }
    if(p.bwReq>0){
      if(r.f3db<p.bwReq){
        checks.push({status:"warn", key:"op_check_bw", v:fmtHz(r.f3db), req:fmtHz(p.bwReq)});
      } else {
        checks.push({status:"good", key:"op_check_bw_ok", v:fmtHz(r.f3db)});
      }
    }

    var checksEl = document.getElementById("opChecks");
    checksEl.innerHTML = "";
    checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      div.innerHTML = iconFor(c.status) + "<span>" + fmt(c.key,{v:c.v, req:c.req}) + "</span>";
      checksEl.appendChild(div);
    });

    drawChart(p, r);
  }

  function drawChart(p, r){
    var g0 = Math.abs(r.signalGain);
    var g0Db = 20*Math.log10(g0);
    var fMin = r.f3db/1000, fMax = Math.max(r.f3db*1000, p.gbw*2);
    var sweep = [];
    var steps = 100;
    var logMin = Math.log10(fMin), logMax = Math.log10(fMax);
    for(var i=0;i<=steps;i++){
      var f = Math.pow(10, logMin + (logMax-logMin)*(i/steps));
      var db = g0Db - 20*Math.log10(Math.sqrt(1+Math.pow(f/r.f3db,2)));
      sweep.push([f, db]);
    }
    var dbVals = sweep.map(function(s){return s[1];});
    var maxDb = Math.max(3, g0Db+2);
    var minDb = Math.min.apply(null, dbVals);

    var markers = [{x:r.f3db, cls:"marker-line"}];
    if(p.bwReq>0 && p.bwReq>=fMin && p.bwReq<=fMax) markers.push({x:p.bwReq, cls:"threshold-line"});

    EC.charts.xy(document.getElementById("opChartSvg"), {
      xLog:true, xMin:fMin, xMax:fMax, yMin:minDb, yMax:maxDb,
      xFmt:fmtHz, yFmt:function(v){ return v.toFixed(0)+"dB"; },
      series:[{ points:sweep, cls:"margin-line" }],
      markers:markers
    });
  }

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_opamp") + " (" + (opMode==="noninv"?t("op_mode_noninv"):t("op_mode_inv")) + ")",
      "R1=" + fmtR(p.r1) + ", Rf=" + fmtR(p.rf) + ", Vin=" + p.vin + " V, Vos=" + (p.vos*1000) + " mV, Ib=" + (p.ib*1e9) + " nA, GBW=" + (p.gbw/1e6) + " MHz",
      t("op_stat_gain") + ": " + r.signalGain.toFixed(2) + " V/V",
      t("op_stat_err") + ": " + fmtV(r.totalErr),
      t("op_stat_bw") + ": " + fmtHz(r.f3db)
    ].join("\n");
  }

  document.getElementById("opInputGrid").addEventListener("input", render);
  document.getElementById("opModeSeg").addEventListener("click", function(e){
    var btn = e.target.closest("button[data-mode]");
    if(!btn) return;
    opMode = btn.getAttribute("data-mode");
    document.querySelectorAll("#opModeSeg button").forEach(function(b){ b.classList.toggle("active", b===btn); });
    persistExtra();
    render();
  });

  var persistEls = ["opR1","opRf","opVin","opVos","opIb","opGbw","opBwReq"].map(function(id){ return document.getElementById(id); });
  function persistExtra(){
    var data = EC.storage.load("opamp", {}) || {};
    data.mode = opMode;
    persistEls.forEach(function(el){ data[el.id] = el.value; });
    EC.storage.save("opamp", data);
  }
  (function initPersistence(){
    var saved = EC.bindPersistence("opamp", persistEls);
    if(saved && saved.mode){
      opMode = saved.mode;
      document.querySelectorAll("#opModeSeg button").forEach(function(b){
        b.classList.toggle("active", b.getAttribute("data-mode")===opMode);
      });
    }
    persistEls.forEach(function(el){ el.addEventListener("input", persistExtra); });
  })();

  EC.bindCopyButton("opCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

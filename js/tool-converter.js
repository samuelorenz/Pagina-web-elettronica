/**
 * tool-converter.js — Buck/boost switching converter, ideal CCM model.
 * Computes duty cycle, inductor current ripple/peak, conduction mode (CCM/DCM)
 * and an approximate output voltage ripple, plus the inductor current waveform.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor;
  var fmtI = EC.fmtI, fmtV = EC.fmtV, fmtHz = EC.fmtHz;

  var convMode = "buck";

  function readInputs(){
    return {
      vin: Math.max(0.01, parseFloat(document.getElementById("convVin").value) || 0),
      vout: Math.max(0.01, parseFloat(document.getElementById("convVout").value) || 0),
      iout: Math.max(0.001, parseFloat(document.getElementById("convIout").value) || 0),
      fsw: Math.max(1, parseFloat(document.getElementById("convFsw").value) || 0) * 1e3,
      l: Math.max(0.01, parseFloat(document.getElementById("convL").value) || 0) * 1e-6,
      cout: Math.max(0.1, parseFloat(document.getElementById("convCout").value) || 0) * 1e-6,
      esr: Math.max(0, parseFloat(document.getElementById("convEsr").value) || 0) * 1e-3
    };
  }

  function calculate(p){
    var D, ilAvg, ripple, vripple;
    if(convMode==="buck"){
      D = Math.min(0.999, p.vout/p.vin);
      ilAvg = p.iout;
      ripple = (p.vin-p.vout)*D/(p.fsw*p.l);
      vripple = ripple*(1/(8*p.fsw*p.cout)) + ripple*p.esr;
    } else {
      D = Math.max(0.001, 1 - p.vin/p.vout);
      ilAvg = p.iout/(1-D);
      ripple = p.vin*D/(p.fsw*p.l);
      var ilPeakTmp = ilAvg + ripple/2;
      vripple = (p.iout*D)/(p.fsw*p.cout) + ilPeakTmp*p.esr;
    }
    var ilPeak = ilAvg + ripple/2;
    var ilMin = ilAvg - ripple/2;
    var isDcm = ilMin < 0;
    return { D:D, ilAvg:ilAvg, ripple:ripple, ilPeak:ilPeak, ilMin:ilMin, isDcm:isDcm, vripple:vripple };
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("conv-out-duty").textContent = (r.D*100).toFixed(1) + " %";
    document.getElementById("conv-out-ripple").textContent = fmtI(r.ripple);
    document.getElementById("conv-out-ipeak").textContent = fmtI(r.ilPeak);
    document.getElementById("conv-out-vripple").textContent = fmtV(r.vripple);

    var modeEl = document.getElementById("conv-out-mode");
    modeEl.textContent = r.isDcm ? t("conv_mode_dcm") : t("conv_mode_ccm");
    var status = r.isDcm ? "bad" : "good";
    var pill = document.getElementById("conv-pill-mode");
    pill.className = "pill " + status;
    pill.innerHTML = iconFor(status) + (r.isDcm?t("conv_pill_dcm"):t("conv_pill_ccm"));

    var checks = [];
    var dutyExtreme = r.D>0.9 || r.D<0.05;
    if(r.isDcm) checks.push({status:"warn", key:"conv_check_dcm"});
    if(dutyExtreme) checks.push({status:"warn", key:"conv_check_duty_extreme", v:(r.D*100).toFixed(0)});
    if(!r.isDcm && !dutyExtreme) checks.push({status:"good", key:"conv_check_ccm_ok"});

    var checksEl = document.getElementById("convChecks");
    checksEl.innerHTML = "";
    checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      div.innerHTML = iconFor(c.status) + "<span>" + fmt(c.key,{v:c.v}) + "</span>";
      checksEl.appendChild(div);
    });

    drawChart(p, r);
  }

  function drawChart(p, r){
    var T = 1/p.fsw;
    var ton = r.D*T;
    var pts = [
      [0, r.ilMin], [ton, r.ilPeak], [T, r.ilMin],
      [T+ton, r.ilPeak], [2*T, r.ilMin]
    ].map(function(pt){ return [pt[0]*1e6, pt[1]]; }); // seconds -> µs

    var yMin = Math.max(0, r.ilMin*0.9);
    if(r.ilMin<0) yMin = r.ilMin*1.1;
    var yMax = r.ilPeak*1.15;

    EC.charts.xy(document.getElementById("convChartSvg"), {
      xMin:0, xMax:2*T*1e6, yMin:yMin, yMax:yMax,
      xFmt:function(v){ return v.toFixed(1)+"µs"; }, yFmt:function(v){ return v.toFixed(2)+"A"; },
      series:[{ points:pts, cls:"margin-line" }],
      hLines: r.ilMin<0 ? [{ y:0, cls:"gridline" }] : []
    });
  }

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_converter") + " (" + (convMode==="buck"?t("conv_mode_buck"):t("conv_mode_boost")) + ")",
      "Vin=" + p.vin + " V, Vout=" + p.vout + " V, Iout=" + p.iout + " A, fsw=" + (p.fsw/1e3) + " kHz, L=" + (p.l*1e6) + " µH",
      t("conv_stat_duty") + ": " + (r.D*100).toFixed(1) + "%",
      t("conv_stat_ripple") + ": " + fmtI(r.ripple),
      t("conv_stat_mode") + ": " + (r.isDcm?t("conv_mode_dcm"):t("conv_mode_ccm")),
      t("conv_stat_vripple") + ": " + fmtV(r.vripple)
    ].join("\n");
  }

  document.getElementById("convInputGrid").addEventListener("input", render);
  document.getElementById("convModeSeg").addEventListener("click", function(e){
    var btn = e.target.closest("button[data-mode]");
    if(!btn) return;
    convMode = btn.getAttribute("data-mode");
    document.querySelectorAll("#convModeSeg button").forEach(function(b){ b.classList.toggle("active", b===btn); });
    persistExtra();
    render();
  });

  var persistEls = ["convVin","convVout","convIout","convFsw","convL","convCout","convEsr"].map(function(id){ return document.getElementById(id); });
  function persistExtra(){
    var data = EC.storage.load("converter", {}) || {};
    data.mode = convMode;
    persistEls.forEach(function(el){ data[el.id] = el.value; });
    EC.storage.save("converter", data);
  }
  (function initPersistence(){
    var saved = EC.bindPersistence("converter", persistEls);
    if(saved && saved.mode){
      convMode = saved.mode;
      document.querySelectorAll("#convModeSeg button").forEach(function(b){
        b.classList.toggle("active", b.getAttribute("data-mode")===convMode);
      });
    }
    persistEls.forEach(function(el){ el.addEventListener("input", persistExtra); });
  })();

  EC.bindCopyButton("convCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

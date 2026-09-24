/**
 * tool-thermo.js — Thermocouple Seebeck voltage + cold-junction + ADC chain.
 * Uses a LINEAR approximation of the Seebeck coefficient (clearly disclaimed in
 * the UI): good for a first-pass sanity check of gain/ADC sizing, not for
 * full-scale accuracy — use the NIST ITS-90 polynomials for that.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor;
  var iconGood = EC.icons.good;

  function readInputs(){
    return {
      seebeck: parseFloat(document.getElementById("thType").value) || 41, // µV/°C
      temp: parseFloat(document.getElementById("thTemp").value) || 0,
      tcj: parseFloat(document.getElementById("thTcj").value) || 0,
      tcjErr: Math.max(0, parseFloat(document.getElementById("thTcjErr").value) || 0),
      gain: Math.max(0.001, parseFloat(document.getElementById("thGain").value) || 1),
      vref: Math.max(0.01, parseFloat(document.getElementById("thVref").value) || 3.3),
      bits: parseInt(document.getElementById("thBits").value, 10) || 12
    };
  }

  function ampVoltage(seebeck, temp, tcj, gain){
    return (seebeck*1e-6) * (temp-tcj) * gain;
  }

  function calculate(p){
    var vtc = (p.seebeck*1e-6) * (p.temp - p.tcj);
    var vamp = ampVoltage(p.seebeck, p.temp, p.tcj, p.gain);
    var maxCode = Math.pow(2, p.bits) - 1;
    var codeRaw = (vamp/p.vref) * maxCode;
    var code = Math.max(0, Math.min(maxCode, Math.round(codeRaw)));
    var resolutionV = p.vref / Math.pow(2, p.bits);
    var voltPerDegree = (p.seebeck*1e-6) * p.gain;
    var resolutionC = voltPerDegree>0 ? resolutionV/voltPerDegree : Infinity;
    var saturatedHigh = vamp > p.vref;
    var saturatedNeg = vamp < 0;
    return { vtc:vtc, vamp:vamp, code:code, maxCode:maxCode, resolutionC:resolutionC, saturatedHigh:saturatedHigh, saturatedNeg:saturatedNeg };
  }

  function fmtUV(v){
    var av = Math.abs(v);
    if(av>=1) return v.toFixed(4)+" V";
    return (v*1000).toFixed(3)+" mV";
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("th-out-vtc").textContent = fmtUV(r.vtc);
    document.getElementById("th-out-vamp").textContent = fmtUV(r.vamp);
    document.getElementById("th-out-code").textContent = r.code + " / " + r.maxCode;
    document.getElementById("th-out-res").textContent = isFinite(r.resolutionC) ? r.resolutionC.toFixed(3) + " °C/LSB" : "—";
    document.getElementById("th-out-tcjerr").textContent = "±" + p.tcjErr.toFixed(1) + " °C";

    var status = (r.saturatedHigh || r.saturatedNeg) ? "bad" : (r.vamp < p.vref*0.05 ? "warn" : "good");
    var pill = document.getElementById("th-pill-vamp");
    pill.className = "pill " + status;
    pill.innerHTML = iconFor(status) + (status==="bad"?t("th_pill_sat"):(status==="warn"?t("th_pill_low"):t("th_pill_ok")));

    var checks = [];
    if(r.saturatedHigh) checks.push({status:"bad", key:"th_check_sat_high"});
    if(r.saturatedNeg) checks.push({status:"bad", key:"th_check_sat_neg"});
    if(isFinite(r.resolutionC) && r.resolutionC>1) checks.push({status:"warn", key:"th_check_res_coarse", v:r.resolutionC.toFixed(2)+" °C"});
    checks.push({status:"info", key:"th_check_tcjerr", v:p.tcjErr.toFixed(1)});

    var checksEl = document.getElementById("thChecks");
    checksEl.innerHTML = "";
    checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      div.innerHTML = (c.status==="info"?iconGood:iconFor(c.status)) + "<span>" + fmt(c.key,{v:c.v}) + "</span>";
      checksEl.appendChild(div);
    });

    drawChart(p, r);
  }

  function drawChart(p, r){
    var tLo = Math.min(p.tcj, p.temp) - 50, tHi = Math.max(p.tcj, p.temp) + 100;
    var vLo = ampVoltage(p.seebeck, tLo, p.tcj, p.gain);
    var vHi = ampVoltage(p.seebeck, tHi, p.tcj, p.gain);
    var yMin = Math.min(0, vLo, vHi, r.vamp) - 0.2;
    var yMax = Math.max(p.vref, vHi, vLo, r.vamp) * 1.1;
    EC.charts.xy(document.getElementById("thChartSvg"), {
      xMin:tLo, xMax:tHi, yMin:yMin, yMax:yMax,
      xFmt:function(v){ return v.toFixed(0)+"°C"; }, yFmt:function(v){ return v.toFixed(1)+"V"; },
      series:[{ points:[[tLo,vLo],[tHi,vHi]], cls:"margin-line" }],
      hLines:[{ y:p.vref, cls:"threshold-line" }],
      point:{ x:p.temp, y:r.vamp }
    });
  }

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_thermo"),
      "Seebeck=" + p.seebeck + " µV/°C, T=" + p.temp + " °C, Tcj=" + p.tcj + " °C, gain=" + p.gain + ", Vref=" + p.vref + " V, " + p.bits + " bit",
      t("th_stat_vamp") + ": " + fmtUV(r.vamp),
      t("th_stat_code") + ": " + r.code + "/" + r.maxCode,
      t("th_stat_res") + ": " + (isFinite(r.resolutionC)?r.resolutionC.toFixed(3)+" °C/LSB":"—")
    ].join("\n");
  }

  document.getElementById("thInputGrid").addEventListener("input", render);
  document.getElementById("thInputGrid").addEventListener("change", render);

  EC.bindPersistence("thermo", ["thType","thTemp","thTcj","thTcjErr","thGain","thVref","thBits"].map(function(id){ return document.getElementById(id); }));
  EC.bindCopyButton("thCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

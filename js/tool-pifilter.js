/**
 * tool-pifilter.js — LC pi filter (C1 - L - C2) ripple attenuation / frequency response.
 * The L-C2 stage is solved exactly with complex-number two-port math (loaded by RL);
 * C1's ripple is estimated with the classic capacitor-input approximation Vpp ≈ Idc/(f·C1).
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor;
  var iconGood = EC.icons.good;
  var fmtHz = EC.fmtHz;

  // ---- minimal complex-number helpers, local to this tool ----
  function cAdd(a,b){ return [a[0]+b[0], a[1]+b[1]]; }
  function cMul(a,b){ return [a[0]*b[0]-a[1]*b[1], a[0]*b[1]+a[1]*b[0]]; }
  function cDiv(a,b){ var d=b[0]*b[0]+b[1]*b[1]; return [(a[0]*b[0]+a[1]*b[1])/d, (a[1]*b[0]-a[0]*b[1])/d]; }
  function cAbs(a){ return Math.sqrt(a[0]*a[0]+a[1]*a[1]); }
  function cPar(a,b){ return cDiv(cMul(a,b), cAdd(a,b)); } // parallel impedance

  function readInputs(){
    return {
      c1: Math.max(1e-6, parseFloat(document.getElementById("pfC1").value) || 0) * 1e-6,
      l: Math.max(1e-9, parseFloat(document.getElementById("pfL").value) || 0) * 1e-3,
      c2: Math.max(1e-6, parseFloat(document.getElementById("pfC2").value) || 0) * 1e-6,
      rl: Math.max(0.01, parseFloat(document.getElementById("pfRL").value) || 0),
      idc: Math.max(0, parseFloat(document.getElementById("pfIdc").value) || 0),
      f: Math.max(0.01, parseFloat(document.getElementById("pfFripple").value) || 0)
    };
  }

  // magnitude of H(f) = Zc2||RL / (ZL + Zc2||RL), for the L-C2 stage loaded by RL
  function transferMag(f, l, c2, rl){
    var w = 2*Math.PI*f;
    var zl = [0, w*l];
    var zc2 = [0, -1/(w*c2)];
    var zpar = cPar(zc2, [rl,0]);
    var h = cDiv(zpar, cAdd(zl, zpar));
    return cAbs(h);
  }

  function calculate(p){
    var f0 = 1/(2*Math.PI*Math.sqrt(p.l*p.c2));
    var vC1pp = p.idc/(p.f*p.c1); // approx ripple across C1 (peak-to-peak)
    var hAtF = transferMag(p.f, p.l, p.c2, p.rl);
    var attenDb = -20*Math.log10(hAtF);
    var vOutPp = vC1pp*hAtF;

    var sweep = [];
    var fMin = Math.min(f0/50, p.f/10, 1);
    var fMax = Math.max(f0*50, p.f*10, 1000);
    var steps = 100;
    var logMin = Math.log10(fMin), logMax = Math.log10(fMax);
    for(var i=0;i<=steps;i++){
      var lf = logMin + (logMax-logMin)*(i/steps);
      var f = Math.pow(10, lf);
      var h = transferMag(f, p.l, p.c2, p.rl);
      sweep.push([f, 20*Math.log10(h)]);
    }

    return { f0:f0, vC1pp:vC1pp, hAtF:hAtF, attenDb:attenDb, vOutPp:vOutPp, sweep:sweep, fMin:fMin, fMax:fMax };
  }

  function fmtVpp(v){
    if(v>=1) return v.toFixed(3)+" Vpp";
    return (v*1000).toFixed(1)+" mVpp";
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("pf-out-vc1").textContent = fmtVpp(r.vC1pp);
    document.getElementById("pf-out-f0").textContent = fmtHz(r.f0);
    var attenFactorTxt = r.hAtF>1 ? (t("pf_gain_label")+" ×"+r.hAtF.toFixed(1)) : ("×"+(1/r.hAtF).toFixed(1));
    document.getElementById("pf-out-atten").textContent = r.attenDb.toFixed(1) + " dB (" + attenFactorTxt + ")";
    document.getElementById("pf-out-vripple").textContent = fmtVpp(r.vOutPp);

    var ratio = p.f/r.f0;
    var attenStatus = ratio<1.5 ? "bad" : (r.attenDb<20 ? "warn" : "good");
    var pillAtten = document.getElementById("pf-pill-atten");
    pillAtten.className = "pill " + attenStatus;
    pillAtten.innerHTML = iconFor(attenStatus) + (attenStatus==="bad"?t("pf_pill_atten_bad"):(attenStatus==="warn"?t("pf_pill_atten_warn"):t("pf_pill_atten_good")));

    var checks = [];
    if(ratio<1.5){
      checks.push({status:"bad", key:"pf_check_resonance", fr:p.f.toFixed(1), f0:r.f0.toFixed(1)});
    } else if(r.attenDb<20){
      checks.push({status:"warn", key:"pf_check_weak", v:r.attenDb.toFixed(1)});
    } else {
      checks.push({status:"good", key:"pf_check_good", v:r.attenDb.toFixed(1), f:(1/r.hAtF).toFixed(0)});
    }
    if(p.idc>0){
      checks.push({status:"info", key:"pf_check_inductor", v:p.idc.toFixed(2)});
    }
    if(r.vC1pp > 0.5){ // flag visibly high ripple on C1 (heuristic threshold)
      checks.push({status:"warn", key:"pf_check_c1_ripple", v:fmtVpp(r.vC1pp)});
    }

    var checksEl = document.getElementById("pfChecks");
    checksEl.innerHTML = "";
    checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      var vals = {}; if(c.v!==undefined) vals.v=c.v; if(c.fr!==undefined) vals.fr=c.fr; if(c.f0!==undefined) vals.f0=c.f0; if(c.f!==undefined) vals.f=c.f;
      div.innerHTML = (c.status==="info"?iconGood:iconFor(c.status)) + "<span>" + fmt(c.key,vals) + "</span>";
      checksEl.appendChild(div);
    });

    drawChart(r, p);
  }

  function drawChart(r, p){
    var dbVals = r.sweep.map(function(s){return s[1];});
    var maxDb = Math.max(5, Math.max.apply(null, dbVals));
    var minDb = Math.max(-120, Math.min(-5, Math.min.apply(null, dbVals)));
    EC.charts.xy(document.getElementById("pfChartSvg"), {
      xLog:true, xMin:r.fMin, xMax:r.fMax, yMin:minDb, yMax:maxDb,
      xFmt:fmtHz, yFmt:function(v){ return v.toFixed(0)+"dB"; },
      series:[{ points:r.sweep, cls:"margin-line" }],
      markers:[{x:r.f0, cls:"marker-line"}, {x:p.f, cls:"threshold-line"}]
    });
  }

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_pifilter"),
      "C1=" + (p.c1*1e6).toFixed(0) + " µF, L=" + (p.l*1e3).toFixed(2) + " mH, C2=" + (p.c2*1e6).toFixed(0) + " µF, RL=" + p.rl.toFixed(1) + " Ω, f_ripple=" + p.f + " Hz",
      t("pf_stat_f0") + ": " + fmtHz(r.f0),
      t("pf_stat_atten") + ": " + r.attenDb.toFixed(1) + " dB",
      t("pf_stat_vout") + ": " + fmtVpp(r.vOutPp)
    ].join("\n");
  }

  document.getElementById("pfInputGrid").addEventListener("input", render);

  EC.bindPersistence("pifilter", ["pfC1","pfL","pfC2","pfRL","pfIdc","pfFripple"].map(function(id){ return document.getElementById(id); }));
  EC.bindCopyButton("pfCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

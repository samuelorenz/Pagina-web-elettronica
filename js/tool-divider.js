/**
 * tool-divider.js — Resistive voltage divider with Monte Carlo tolerance analysis.
 * Samples R1/R2 within their declared tolerance (uniform or normal) to estimate
 * the real statistical spread of Vout, plus a linear sensitivity breakdown.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor, nearestE24 = EC.nearestE24;
  var iconGood = EC.icons.good;
  var fmtV = EC.fmtV, fmtR = EC.fmtR;

  var dvDist = "uniform";

  function readInputs(){
    return {
      vin: parseFloat(document.getElementById("dvVin").value) || 0,
      r1: parseFloat(document.getElementById("dvR1").value) || 0.0001,
      r2: parseFloat(document.getElementById("dvR2").value) || 0.0001,
      tol: Math.max(0, parseFloat(document.getElementById("dvTol").value) || 0),
      rl: Math.max(0, parseFloat(document.getElementById("dvRL").value) || 0),
      ytol: Math.max(0.01, parseFloat(document.getElementById("dvYieldTol").value) || 5),
      samples: parseInt(document.getElementById("dvSamples").value,10) || 5000
    };
  }

  function vout(vin, r1, r2, rl){
    var r2eff = rl>0 ? (r2*rl)/(r2+rl) : r2;
    return vin * r2eff/(r1+r2eff);
  }

  // Box-Muller, clipped to +-3 sigma to represent a "normal within tolerance" model
  function randNormalClipped(){
    var u1 = Math.random()||1e-9, u2 = Math.random();
    var z = Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
    if(z>3) z=3; if(z<-3) z=-3;
    return z/3; // normalized to +-1 at 3 sigma
  }
  function randDelta(){
    return dvDist==="normal" ? randNormalClipped() : (Math.random()*2-1);
  }

  function calculate(p){
    var tolF = p.tol/100;
    var nominal = vout(p.vin, p.r1, p.r2, p.rl);

    var n = p.samples;
    var outs = new Array(n);
    var minV = Infinity, maxV = -Infinity, sum=0;
    for(var i=0;i<n;i++){
      var r1s = p.r1*(1+randDelta()*tolF);
      var r2s = p.r2*(1+randDelta()*tolF);
      var v = vout(p.vin, r1s, r2s, p.rl);
      outs[i]=v;
      if(v<minV) minV=v;
      if(v>maxV) maxV=v;
      sum+=v;
    }
    var mean = sum/n;
    var variance=0;
    for(i=0;i<n;i++){ variance += Math.pow(outs[i]-mean,2); }
    variance/=n;
    var std = Math.sqrt(variance);

    var sorted = outs.slice().sort(function(a,b){return a-b;});
    var p5 = sorted[Math.floor(0.05*n)];
    var p95 = sorted[Math.min(n-1,Math.floor(0.95*n))];

    // worst-case analytic bounds (monotonic in R1, R2)
    var wcMin = vout(p.vin, p.r1*(1+tolF), p.r2*(1-tolF), p.rl);
    var wcMax = vout(p.vin, p.r1*(1-tolF), p.r2*(1+tolF), p.rl);

    // yield: share of samples within +-ytol% of nominal
    var lowB = nominal*(1-p.ytol/100), highB = nominal*(1+p.ytol/100);
    var within=0;
    for(i=0;i<n;i++){ if(outs[i]>=lowB && outs[i]<=highB) within++; }
    var yieldPct = (within/n)*100;

    // sensitivity contribution (linear variance decomposition via finite differences)
    var eps=0.001;
    var dV_dR1 = (vout(p.vin,p.r1*(1+eps),p.r2,p.rl) - vout(p.vin,p.r1*(1-eps),p.r2,p.rl))/(2*eps*p.r1);
    var dV_dR2 = (vout(p.vin,p.r1,p.r2*(1+eps),p.rl) - vout(p.vin,p.r1,p.r2*(1-eps),p.rl))/(2*eps*p.r2);
    var sigmaR1 = p.r1*tolF/(dvDist==="normal"?3:Math.sqrt(3));
    var sigmaR2 = p.r2*tolF/(dvDist==="normal"?3:Math.sqrt(3));
    var c1 = Math.pow(dV_dR1*sigmaR1,2), c2 = Math.pow(dV_dR2*sigmaR2,2);
    var cSum = c1+c2 || 1;
    var pctR1 = c1/cSum*100, pctR2 = c2/cSum*100;

    // histogram
    var bins = 24;
    var histLo = Math.min(minV, nominal), histHi = Math.max(maxV, nominal);
    if(histHi-histLo < 1e-9){ histHi = histLo+1e-6; }
    var binW = (histHi-histLo)/bins;
    var hist = new Array(bins).fill(0);
    for(i=0;i<n;i++){
      var bi = Math.min(bins-1, Math.floor((outs[i]-histLo)/binW));
      hist[bi]++;
    }

    var current = p.vin/(p.r1+(p.rl>0?(p.r2*p.rl)/(p.r2+p.rl):p.r2));
    var pR1 = current*current*p.r1;
    var iR2 = p.vin - current*p.r1;
    var pR2 = (iR2*iR2)/p.r2;

    var e24r1 = nearestE24(p.r1);
    var e24r2 = nearestE24(p.r2);

    return {
      nominal:nominal, mean:mean, std:std, p5:p5, p95:p95, wcMin:wcMin, wcMax:wcMax,
      yieldPct:yieldPct, pctR1:pctR1, pctR2:pctR2, hist:hist, histLo:histLo, histHi:histHi, binW:binW,
      current:current, pR1:pR1, pR2:pR2, e24r1:e24r1, e24r2:e24r2, tolF:tolF
    };
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("dv-out-nominal").textContent = fmtV(r.nominal);
    document.getElementById("dv-out-mean").textContent = fmtV(r.mean);
    document.getElementById("dv-out-std").textContent = "σ = " + fmtV(r.std);
    document.getElementById("dv-out-range").textContent = fmtV(r.p5) + " … " + fmtV(r.p95);
    document.getElementById("dv-out-wc").textContent = fmtV(r.wcMin) + " … " + fmtV(r.wcMax);
    document.getElementById("dv-out-power").textContent = (r.pR1*1000).toFixed(1) + " / " + (r.pR2*1000).toFixed(1) + " mW";
    document.getElementById("dv-out-e24").textContent = fmtR(r.e24r1) + " / " + fmtR(r.e24r2);
    document.getElementById("dv-out-current").textContent = (r.current*1000).toFixed(3) + " mA";

    var yieldEl = document.getElementById("dv-out-yield");
    yieldEl.textContent = r.yieldPct.toFixed(1) + "%";
    var yStatus = r.yieldPct>99 ? "good" : (r.yieldPct>95 ? "warn" : "bad");
    var pillYield = document.getElementById("dv-pill-yield");
    pillYield.className = "pill " + yStatus;
    pillYield.innerHTML = iconFor(yStatus) + (yStatus==="good"?t("dv_pill_yield_great"):(yStatus==="warn"?t("dv_pill_yield_ok"):t("dv_pill_yield_bad")));

    // contribution bars
    var contribEl = document.getElementById("dvContrib");
    contribEl.innerHTML = "";
    [["R1", r.pctR1], ["R2", r.pctR2]].forEach(function(item){
      var row = document.createElement("div");
      row.className = "contrib-row";
      row.innerHTML = '<span class="nm">'+item[0]+'</span><span class="track"><span class="fill" style="width:'+item[1].toFixed(1)+'%"></span></span><span class="pct">'+item[1].toFixed(1)+'%</span>';
      contribEl.appendChild(row);
    });

    // checks
    var checks = [];
    if(p.rl>0){
      var unloaded = vout(p.vin, p.r1, p.r2, 0);
      var loadingErr = unloaded>0 ? Math.abs(unloaded-r.nominal)/unloaded*100 : 0;
      if(loadingErr>2){
        checks.push({status: loadingErr>10?"bad":"warn", key:"dv_check_loading", v:loadingErr.toFixed(1)});
      }
    }
    if(r.pR1>0.25 || r.pR2>0.25){
      checks.push({status:"warn", key:"dv_check_power", v:Math.round(Math.max(r.pR1,r.pR2)*1000)});
    }
    var spreadPct = r.nominal>0 ? ((r.p95-r.p5)/2/r.nominal*100) : 0;
    if(spreadPct>p.ytol){
      checks.push({status:"warn", key:"dv_check_spread", v:spreadPct.toFixed(1)});
    }
    if(r.yieldPct<95){
      checks.push({status:"bad", key:"dv_check_yield_bad", v:r.yieldPct.toFixed(1)});
    } else {
      checks.push({status:"good", key:"dv_check_yield_ok", v:r.yieldPct.toFixed(1)});
    }
    if(Math.abs(r.e24r1-p.r1)/p.r1>0.02 || Math.abs(r.e24r2-p.r2)/p.r2>0.02){
      checks.push({status:"info", key:"dv_check_e24", v:null, r1:fmtR(r.e24r1), r2:fmtR(r.e24r2)});
    }

    var checksEl = document.getElementById("dvChecks");
    checksEl.innerHTML = "";
    checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      var msg = c.r1 ? fmt(c.key,{r1:c.r1,r2:c.r2}) : fmt(c.key,{v:c.v});
      div.innerHTML = (c.status==="info"?iconGood:iconFor(c.status)) + "<span>" + msg + "</span>";
      checksEl.appendChild(div);
    });

    drawChart(r, p);
  }

  function drawChart(r, p){
    var lowB = r.nominal*(1-p.ytol/100), highB = r.nominal*(1+p.ytol/100);
    EC.charts.histogram(document.getElementById("dvChartSvg"), {
      hist: r.hist, lo: r.histLo, hi: r.histHi,
      lowB: lowB, highB: highB, nominal: r.nominal, xFmt: fmtV
    });
  }

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_divider"),
      "Vin=" + p.vin + " V, R1=" + fmtR(p.r1) + ", R2=" + fmtR(p.r2) + ", tol=±" + p.tol + "%, RL=" + (p.rl>0?fmtR(p.rl):"—"),
      t("dv_stat_nominal") + ": " + fmtV(r.nominal),
      t("dv_stat_range") + ": " + fmtV(r.p5) + " … " + fmtV(r.p95),
      t("dv_stat_wc") + ": " + fmtV(r.wcMin) + " … " + fmtV(r.wcMax),
      t("dv_stat_yield") + ": " + r.yieldPct.toFixed(1) + "%"
    ].join("\n");
  }

  document.getElementById("dvInputGrid").addEventListener("input", render);
  document.getElementById("dvSamples").addEventListener("change", render);
  document.getElementById("dvDistSeg").addEventListener("click", function(e){
    var btn = e.target.closest("button[data-dist]");
    if(!btn) return;
    dvDist = btn.getAttribute("data-dist");
    document.querySelectorAll("#dvDistSeg button").forEach(function(b){ b.classList.toggle("active", b===btn); });
    persistExtra();
    render();
  });

  // ---- persistence (inputs handled generically; the segmented "dist" control
  // is custom UI, so it's saved/restored alongside the standard fields) ----
  var persistEls = ["dvVin","dvR1","dvR2","dvTol","dvRL","dvYieldTol","dvSamples"].map(function(id){ return document.getElementById(id); });
  function persistExtra(){
    var data = EC.storage.load("divider", {}) || {};
    data.dist = dvDist;
    persistEls.forEach(function(el){ data[el.id] = el.value; });
    EC.storage.save("divider", data);
  }
  (function initPersistence(){
    var saved = EC.bindPersistence("divider", persistEls);
    if(saved && saved.dist){
      dvDist = saved.dist;
      document.querySelectorAll("#dvDistSeg button").forEach(function(b){
        b.classList.toggle("active", b.getAttribute("data-dist")===dvDist);
      });
    }
    persistEls.forEach(function(el){ el.addEventListener("input", persistExtra); el.addEventListener("change", persistExtra); });
  })();

  EC.bindCopyButton("dvCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

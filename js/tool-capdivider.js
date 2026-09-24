/**
 * tool-capdivider.js — AC capacitive divider (two series caps) with Monte Carlo
 * tolerance analysis. Unlike the resistive divider, tolerances here are often
 * ASYMMETRIC (ceramic dielectrics like Z5U/Y5V: -20%/+80%), and the ratio is
 * frequency-independent: Vout = Vin·C1/(C1+C2+Cload) — note it grows with C1,
 * the opposite of a resistive divider.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor;
  var iconGood = EC.icons.good;
  var fmtV = EC.fmtV;

  var cdDist = "uniform";

  function readInputs(){
    return {
      vin: parseFloat(document.getElementById("cdVin").value) || 0,
      c1: parseFloat(document.getElementById("cdC1").value) || 0.0001,
      c2: parseFloat(document.getElementById("cdC2").value) || 0.0001,
      tolMinus: Math.max(0, parseFloat(document.getElementById("cdTolMinus").value) || 0),
      tolPlus: Math.max(0, parseFloat(document.getElementById("cdTolPlus").value) || 0),
      cload: Math.max(0, parseFloat(document.getElementById("cdCload").value) || 0) / 1000, // pF -> nF
      ytol: Math.max(0.01, parseFloat(document.getElementById("cdYieldTol").value) || 5),
      samples: parseInt(document.getElementById("cdSamples").value,10) || 5000
    };
  }

  function vout(vin, c1, c2, cload){
    return vin * c1/(c1+c2+cload);
  }

  function randNormalClipped(){
    var u1 = Math.random()||1e-9, u2 = Math.random();
    var z = Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
    if(z>3) z=3; if(z<-3) z=-3;
    return z/3;
  }
  function randUnit(){
    return cdDist==="normal" ? randNormalClipped() : (Math.random()*2-1);
  }
  // Asymmetric tolerance sample: a unit deviate in [-1,1] scaled by tolMinus
  // below zero and tolPlus above zero (ceramic dielectrics are rarely symmetric).
  function sampleFraction(tolMinus, tolPlus){
    var u = randUnit();
    return u<0 ? u*(tolMinus/100) : u*(tolPlus/100);
  }

  function calculate(p){
    var nominal = vout(p.vin, p.c1, p.c2, p.cload);
    var n = p.samples;
    var outs = new Array(n);
    var minV = Infinity, maxV = -Infinity, sum=0;
    for(var i=0;i<n;i++){
      var c1s = p.c1*(1+sampleFraction(p.tolMinus,p.tolPlus));
      var c2s = p.c2*(1+sampleFraction(p.tolMinus,p.tolPlus));
      var v = vout(p.vin, c1s, c2s, p.cload);
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

    // worst-case: max Vout at C1 max & C2 min; min Vout at C1 min & C2 max
    var wcMax = vout(p.vin, p.c1*(1+p.tolPlus/100), p.c2*(1-p.tolMinus/100), p.cload);
    var wcMin = vout(p.vin, p.c1*(1-p.tolMinus/100), p.c2*(1+p.tolPlus/100), p.cload);

    var lowB = nominal*(1-p.ytol/100), highB = nominal*(1+p.ytol/100);
    var within=0;
    for(i=0;i<n;i++){ if(outs[i]>=lowB && outs[i]<=highB) within++; }
    var yieldPct = (within/n)*100;

    // sensitivity contribution (approximate: uses average tolerance for sigma,
    // since the asymmetric distribution has no single "±" figure)
    var eps=0.001;
    var dV_dC1 = (vout(p.vin,p.c1*(1+eps),p.c2,p.cload) - vout(p.vin,p.c1*(1-eps),p.c2,p.cload))/(2*eps*p.c1);
    var dV_dC2 = (vout(p.vin,p.c1,p.c2*(1+eps),p.cload) - vout(p.vin,p.c1,p.c2*(1-eps),p.cload))/(2*eps*p.c2);
    var avgTol = (p.tolMinus+p.tolPlus)/200;
    var norm = cdDist==="normal" ? 3 : Math.sqrt(3);
    var sigmaC1 = p.c1*avgTol/norm, sigmaC2 = p.c2*avgTol/norm;
    var ca = Math.pow(dV_dC1*sigmaC1,2), cb = Math.pow(dV_dC2*sigmaC2,2);
    var cSum = ca+cb || 1;

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

    return {
      nominal:nominal, mean:mean, std:std, p5:p5, p95:p95, wcMin:wcMin, wcMax:wcMax,
      yieldPct:yieldPct, pctC1:ca/cSum*100, pctC2:cb/cSum*100,
      hist:hist, histLo:histLo, histHi:histHi
    };
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("cd-out-nominal").textContent = fmtV(r.nominal);
    document.getElementById("cd-out-mean").textContent = fmtV(r.mean);
    document.getElementById("cd-out-std").textContent = "σ = " + fmtV(r.std);
    document.getElementById("cd-out-range").textContent = fmtV(r.p5) + " … " + fmtV(r.p95);
    document.getElementById("cd-out-wc").textContent = fmtV(r.wcMin) + " … " + fmtV(r.wcMax);

    var yieldEl = document.getElementById("cd-out-yield");
    yieldEl.textContent = r.yieldPct.toFixed(1) + "%";
    var yStatus = r.yieldPct>99 ? "good" : (r.yieldPct>95 ? "warn" : "bad");
    var pillYield = document.getElementById("cd-pill-yield");
    pillYield.className = "pill " + yStatus;
    pillYield.innerHTML = iconFor(yStatus) + (yStatus==="good"?t("dv_pill_yield_great"):(yStatus==="warn"?t("dv_pill_yield_ok"):t("dv_pill_yield_bad")));

    var contribEl = document.getElementById("cdContrib");
    contribEl.innerHTML = "";
    [["C1", r.pctC1], ["C2", r.pctC2]].forEach(function(item){
      var row = document.createElement("div");
      row.className = "contrib-row";
      row.innerHTML = '<span class="nm">'+item[0]+'</span><span class="track"><span class="fill" style="width:'+item[1].toFixed(1)+'%"></span></span><span class="pct">'+item[1].toFixed(1)+'%</span>';
      contribEl.appendChild(row);
    });

    var checks = [];
    if(p.cload>0){
      var unloaded = vout(p.vin, p.c1, p.c2, 0);
      var loadingErr = unloaded>0 ? Math.abs(unloaded-r.nominal)/unloaded*100 : 0;
      if(loadingErr>2){
        checks.push({status: loadingErr>10?"bad":"warn", key:"cd_check_loading", v:loadingErr.toFixed(1)});
      }
    }
    var spreadPct = r.nominal>0 ? ((r.p95-r.p5)/2/r.nominal*100) : 0;
    if(spreadPct>p.ytol){
      checks.push({status:"warn", key:"cd_check_spread", v:spreadPct.toFixed(1)});
    }
    if(r.yieldPct<95){
      checks.push({status:"bad", key:"cd_check_yield_bad", v:r.yieldPct.toFixed(1)});
    } else {
      checks.push({status:"good", key:"cd_check_yield_ok", v:r.yieldPct.toFixed(1)});
    }

    var checksEl = document.getElementById("cdChecks");
    checksEl.innerHTML = "";
    checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      div.innerHTML = iconFor(c.status) + "<span>" + fmt(c.key,{v:c.v}) + "</span>";
      checksEl.appendChild(div);
    });

    var lowB = r.nominal*(1-p.ytol/100), highB = r.nominal*(1+p.ytol/100);
    EC.charts.histogram(document.getElementById("cdChartSvg"), {
      hist:r.hist, lo:r.histLo, hi:r.histHi, lowB:lowB, highB:highB, nominal:r.nominal, xFmt:fmtV
    });
  }

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_capdivider"),
      "Vin=" + p.vin + " V, C1=" + p.c1 + " nF, C2=" + p.c2 + " nF, tol=-" + p.tolMinus + "%/+" + p.tolPlus + "%, Cload=" + (p.cload*1000).toFixed(0) + " pF",
      t("dv_stat_nominal") + ": " + fmtV(r.nominal),
      t("dv_stat_range") + ": " + fmtV(r.p5) + " … " + fmtV(r.p95),
      t("dv_stat_yield") + ": " + r.yieldPct.toFixed(1) + "%"
    ].join("\n");
  }

  document.getElementById("cdInputGrid").addEventListener("input", render);
  document.getElementById("cdSamples").addEventListener("change", render);
  document.getElementById("cdDistSeg").addEventListener("click", function(e){
    var btn = e.target.closest("button[data-dist]");
    if(!btn) return;
    cdDist = btn.getAttribute("data-dist");
    document.querySelectorAll("#cdDistSeg button").forEach(function(b){ b.classList.toggle("active", b===btn); });
    persistExtra();
    render();
  });
  document.getElementById("cdPreset").addEventListener("change", function(e){
    var v = e.target.value;
    if(!v) return;
    var parts = v.split(",");
    document.getElementById("cdTolMinus").value = parts[0];
    document.getElementById("cdTolPlus").value = parts[1];
    persistExtra();
    render();
  });

  var persistEls = ["cdVin","cdC1","cdC2","cdTolMinus","cdTolPlus","cdCload","cdYieldTol","cdSamples","cdPreset"].map(function(id){ return document.getElementById(id); });
  function persistExtra(){
    var data = EC.storage.load("capdivider", {}) || {};
    data.dist = cdDist;
    persistEls.forEach(function(el){ data[el.id] = el.value; });
    EC.storage.save("capdivider", data);
  }
  (function initPersistence(){
    var saved = EC.bindPersistence("capdivider", persistEls);
    if(saved && saved.dist){
      cdDist = saved.dist;
      document.querySelectorAll("#cdDistSeg button").forEach(function(b){
        b.classList.toggle("active", b.getAttribute("data-dist")===cdDist);
      });
    }
    persistEls.forEach(function(el){ el.addEventListener("input", persistExtra); el.addEventListener("change", persistExtra); });
  })();

  EC.bindCopyButton("cdCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

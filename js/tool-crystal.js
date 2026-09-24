/**
 * tool-crystal.js — Crystal oscillator load-capacitance / gain-margin / drive-level tool.
 * Formulas per ST AN2867. Self-contained: reads #freq/#esr/#c1/... and writes #out-*.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor, svgNS = EC.svgNS, nearestE24 = EC.nearestE24;

  function calculate(p){
    var cl = (p.c1*p.c2)/(p.c1+p.c2) + p.cstray;
    var fHz = p.freq*1e6;
    var c0F = p.c0*1e-12, clF = cl*1e-12, cstrayF = p.cstray*1e-12;

    var gmcritAV = 4*p.esr*Math.pow(2*Math.PI*fHz,2)*Math.pow(c0F+clF,2);
    var gmcritmAV = gmcritAV*1000;
    var gainMargin = gmcritmAV>0 ? p.gm/gmcritmAV : 0;

    var ctotF = p.c1*1e-12 + cstrayF/2;
    var dlW = p.esr*Math.pow(Math.PI*fHz*ctotF*p.vpp,2)/2;
    var dlUW = dlW*1e6;

    var suggestedBom = nearestE24(p.c1);

    var stability = [];
    for(var x=1;x<=30;x++){
      var csTest = x*0.5;
      var clTestF = ((p.c1*p.c2)/(p.c1+p.c2)+csTest)*1e-12;
      var gmCritTest = 4*p.esr*Math.pow(2*Math.PI*fHz,2)*Math.pow(c0F+clTestF,2)*1000;
      var gmMarginTest = gmCritTest>0 ? p.gm/gmCritTest : 0;
      stability.push([csTest, gmMarginTest]);
    }

    var suggestedRs = 0;
    if(dlUW>100){
      suggestedRs = p.esr*(dlUW/100-1);
    }

    var checks = [];
    if(gainMargin<5){
      checks.push({status:"bad", key:"check_margin_bad", v:gainMargin.toFixed(1)});
    } else if(gainMargin<20){
      checks.push({status:"good", key:"check_margin_safe", v:gainMargin.toFixed(1)});
    } else {
      checks.push({status:"good", key:"check_margin_great", v:gainMargin.toFixed(1)});
    }

    if(dlUW>500){
      checks.push({status:"bad", key:"check_drive_bad", v:dlUW.toFixed(1)});
      checks.push({status:"warn", key:"check_rs", v:Math.round(suggestedRs)});
    } else if(dlUW>100){
      checks.push({status:"warn", key:"check_drive_warn", v:dlUW.toFixed(1)});
      checks.push({status:"warn", key:"check_rs", v:Math.round(suggestedRs)});
    } else {
      checks.push({status:"good", key:"check_drive_safe", v:dlUW.toFixed(1)});
    }

    if(Math.abs(p.c1-p.c2) > Math.max(p.c1,p.c2)*0.2){
      checks.push({status:"warn", key:"check_unbalanced"});
    }

    if(cl<5 || cl>25){
      checks.push({status:"warn", key:"check_cl_unusual", v:cl.toFixed(1)});
    }

    if(p.c0/cl > 0.5){
      checks.push({status:"warn", key:"check_shunt_ratio", v:(p.c0/cl).toFixed(2)});
    }

    return {
      cl:cl, gmcrit:gmcritmAV, gainMargin:gainMargin, drive:dlUW,
      bom:suggestedBom, rs:suggestedRs, stability:stability, checks:checks
    };
  }

  function readInputs(){
    return {
      freq: parseFloat(document.getElementById("freq").value) || 0,
      esr: parseFloat(document.getElementById("esr").value) || 0,
      c1: parseFloat(document.getElementById("c1").value) || 0.0001,
      c2: parseFloat(document.getElementById("c2").value) || 0.0001,
      cstray: parseFloat(document.getElementById("cstray").value) || 0,
      c0: parseFloat(document.getElementById("c0").value) || 0.0001,
      gm: parseFloat(document.getElementById("gm").value) || 0,
      vpp: parseFloat(document.getElementById("vpp").value) || 0
    };
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("out-cl").textContent = r.cl.toFixed(2) + " pF";
    document.getElementById("out-gmcrit").textContent = r.gmcrit.toFixed(3) + " mA/V";
    document.getElementById("out-margin").textContent = r.gainMargin.toFixed(1) + "×";
    document.getElementById("out-drive").textContent = r.drive.toFixed(1) + " µW";
    document.getElementById("out-bom").textContent = r.bom + " pF";
    document.getElementById("out-rs").textContent = r.rs>0 ? "~" + Math.round(r.rs) + " Ω" : t("rs_none");

    var marginStatus = r.gainMargin<5 ? "bad" : "good";
    var pillMargin = document.getElementById("pill-margin");
    pillMargin.className = "pill " + marginStatus;
    pillMargin.innerHTML = iconFor(marginStatus) + (marginStatus==="bad"?t("pill_margin_bad"):(r.gainMargin<20?t("pill_margin_safe"):t("pill_margin_great")));

    var driveStatus = r.drive>500 ? "bad" : (r.drive>100 ? "warn" : "good");
    var pillDrive = document.getElementById("pill-drive");
    pillDrive.className = "pill " + driveStatus;
    pillDrive.innerHTML = iconFor(driveStatus) + (driveStatus==="bad"?t("pill_drive_bad"):(driveStatus==="warn"?t("pill_drive_warn"):t("pill_drive_safe")));

    var checksEl = document.getElementById("checks");
    checksEl.innerHTML = "";
    r.checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      div.innerHTML = iconFor(c.status) + "<span>" + fmt(c.key,{v:c.v}) + "</span>";
      checksEl.appendChild(div);
    });

    drawChart(r.stability, p.cstray, r.gainMargin);
  }

  // ---- chart ----
  var chartPad = {left:44, right:16, top:14, bottom:30};
  var chartW = 640, chartH = 260;

  function drawChart(data, currentCs, currentMargin){
    var svg = document.getElementById("chartSvg");
    svg.innerHTML = "";

    var maxMargin = 5;
    data.forEach(function(d){ if(d[1]>maxMargin) maxMargin = d[1]; });
    maxMargin = Math.max(maxMargin, currentMargin, 5) * 1.15;
    var maxCs = 15;

    var plotW = chartW - chartPad.left - chartPad.right;
    var plotH = chartH - chartPad.top - chartPad.bottom;

    function xPix(cs){ return chartPad.left + (cs/maxCs)*plotW; }
    function yPix(m){ return chartPad.top + plotH - (m/maxMargin)*plotH; }

    // gridlines + y ticks
    var yTickCount = 5;
    for(var i=0;i<=yTickCount;i++){
      var val = (maxMargin/yTickCount)*i;
      var y = yPix(val);
      var line = document.createElementNS(svgNS,"line");
      line.setAttribute("class","gridline");
      line.setAttribute("x1", chartPad.left); line.setAttribute("x2", chartW-chartPad.right);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      var ytxt = document.createElementNS(svgNS,"text");
      ytxt.setAttribute("x", chartPad.left-8); ytxt.setAttribute("y", y+3);
      ytxt.setAttribute("text-anchor","end");
      ytxt.textContent = val.toFixed(0) + "×";
      svg.appendChild(ytxt);
    }

    // x ticks
    var xTicks = [0,3,6,9,12,15];
    xTicks.forEach(function(cs){
      var x = xPix(cs);
      var xtxt = document.createElementNS(svgNS,"text");
      xtxt.setAttribute("x", x); xtxt.setAttribute("y", chartH-chartPad.bottom+18);
      xtxt.setAttribute("text-anchor","middle");
      xtxt.textContent = cs + " pF";
      svg.appendChild(xtxt);
    });

    // axis line
    var axis = document.createElementNS(svgNS,"line");
    axis.setAttribute("class","axis");
    axis.setAttribute("x1", chartPad.left); axis.setAttribute("x2", chartW-chartPad.right);
    axis.setAttribute("y1", chartH-chartPad.bottom); axis.setAttribute("y2", chartH-chartPad.bottom);
    svg.appendChild(axis);

    // threshold line at margin = 5
    var thY = yPix(5);
    var th = document.createElementNS(svgNS,"line");
    th.setAttribute("class","threshold-line");
    th.setAttribute("x1", chartPad.left); th.setAttribute("x2", chartW-chartPad.right);
    th.setAttribute("y1", thY); th.setAttribute("y2", thY);
    svg.appendChild(th);

    // margin curve path
    var d = "";
    data.forEach(function(pt,i){
      var cmd = i===0 ? "M" : "L";
      d += cmd + xPix(pt[0]).toFixed(2) + "," + yPix(pt[1]).toFixed(2) + " ";
    });
    var path = document.createElementNS(svgNS,"path");
    path.setAttribute("class","margin-line");
    path.setAttribute("d", d);
    svg.appendChild(path);

    // operating point
    var opX = xPix(Math.min(Math.max(currentCs,0),maxCs));
    var opY = yPix(currentMargin);
    var opCircle = document.createElementNS(svgNS,"circle");
    opCircle.setAttribute("class","op-point");
    opCircle.setAttribute("cx", opX); opCircle.setAttribute("cy", opY); opCircle.setAttribute("r", 5);
    svg.appendChild(opCircle);

    // hover layer
    var hoverLine = document.createElementNS(svgNS,"line");
    hoverLine.setAttribute("class","axis");
    hoverLine.setAttribute("y1", chartPad.top); hoverLine.setAttribute("y2", chartH-chartPad.bottom);
    hoverLine.setAttribute("stroke-dasharray","3 3");
    hoverLine.setAttribute("opacity","0");
    svg.appendChild(hoverLine);

    var hoverDot = document.createElementNS(svgNS,"circle");
    hoverDot.setAttribute("r","4");
    hoverDot.setAttribute("fill","var(--accent)");
    hoverDot.setAttribute("opacity","0");
    svg.appendChild(hoverDot);

    var tooltip = document.getElementById("chartTooltip");
    var wrap = document.getElementById("chartWrap");

    svg.onmousemove = function(evt){
      var rect = svg.getBoundingClientRect();
      var scaleX = chartW/rect.width;
      var mx = (evt.clientX-rect.left)*scaleX;
      var cs = ((mx-chartPad.left)/plotW)*maxCs;
      if(cs<0 || cs>maxCs){ hoverLine.setAttribute("opacity","0"); hoverDot.setAttribute("opacity","0"); tooltip.style.opacity=0; return; }
      var nearest = data[0], minDiff = Infinity;
      data.forEach(function(pt){ var diff=Math.abs(pt[0]-cs); if(diff<minDiff){minDiff=diff;nearest=pt;} });
      var hx = xPix(nearest[0]), hy = yPix(nearest[1]);
      hoverLine.setAttribute("x1", hx); hoverLine.setAttribute("x2", hx); hoverLine.setAttribute("opacity","1");
      hoverDot.setAttribute("cx", hx); hoverDot.setAttribute("cy", hy); hoverDot.setAttribute("opacity","1");
      var wrapRect = wrap.getBoundingClientRect();
      var pxRatio = wrapRect.width/chartW;
      tooltip.style.left = (hx*pxRatio) + "px";
      tooltip.style.top = (hy*pxRatio) + "px";
      tooltip.textContent = "Cs " + nearest[0].toFixed(1) + " pF · " + nearest[1].toFixed(1) + "×";
      tooltip.style.opacity = 1;
    };
    svg.onmouseleave = function(){
      hoverLine.setAttribute("opacity","0"); hoverDot.setAttribute("opacity","0"); tooltip.style.opacity=0;
    };
  }

  // ---- presets ----
  function setVal(id, val){ document.getElementById(id).value = val; }

  document.getElementById("mcuPreset").addEventListener("change", function(e){
    var v = e.target.value;
    if(v==="f1f4"){ setVal("gm",25); setVal("vpp",3.3); }
    else if(v==="l4h7"){ setVal("gm",10); setVal("vpp",3.3); }
    else if(v==="u5"){ setVal("gm",5); setVal("vpp",1.8); }
    render();
  });
  document.getElementById("xtalPreset").addEventListener("change", function(e){
    var v = e.target.value;
    var map = {"8":80, "16":50, "25":40, "32":30};
    if(map[v]!==undefined){ setVal("freq", parseFloat(v)); setVal("esr", map[v]); }
    render();
  });

  document.getElementById("inputGrid").addEventListener("input", render);

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_crystal"),
      "f=" + p.freq + " MHz, ESR=" + p.esr + " Ω, C1=" + p.c1 + " pF, C2=" + p.c2 + " pF, C0=" + p.c0 + " pF, gm=" + p.gm + " mA/V, Vpp=" + p.vpp + " V",
      t("stat_cl").replace(/<[^>]+>/g,"") + ": " + r.cl.toFixed(2) + " pF",
      t("stat_margin") + ": " + r.gainMargin.toFixed(1) + "×",
      t("stat_drive") + ": " + r.drive.toFixed(1) + " µW"
    ].join("\n");
  }

  var persistIds = ["freq","esr","c1","c2","cstray","c0","gm","vpp","mcuPreset","xtalPreset"];
  EC.bindPersistence("crystal", persistIds.map(function(id){ return document.getElementById(id); }));
  EC.bindCopyButton("crystalCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

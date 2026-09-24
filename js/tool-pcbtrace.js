/**
 * tool-pcbtrace.js — Minimum PCB trace width from current + temperature rise,
 * using the classic empirical IPC-2221 formula: I = k·ΔT^0.44·A^0.725
 * (k=0.048 external layers, 0.024 internal). Also estimates trace resistance,
 * voltage drop and dissipated power for a given length.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor;
  var fmtV = EC.fmtV, fmtP = EC.fmtP, fmtI = EC.fmtI;

  var MILS_PER_OZ = 1.378; // copper thickness, mils per oz/ft²
  var RHO_CU = 1.68e-8; // Ω·m at ~20°C

  function readInputs(){
    return {
      i: Math.max(0.001, parseFloat(document.getElementById("pcbI").value) || 0),
      dT: Math.max(1, parseFloat(document.getElementById("pcbDeltaT").value) || 0),
      layer: document.getElementById("pcbLayer").value,
      weight: parseFloat(document.getElementById("pcbWeight").value) || 1,
      length: Math.max(0, parseFloat(document.getElementById("pcbLength").value) || 0)
    };
  }

  function widthMm(i, dT, layer, weightOz){
    var k = layer==="ext" ? 0.048 : 0.024;
    var areaMils2 = Math.pow(i/(k*Math.pow(dT,0.44)), 1/0.725);
    var thicknessMils = weightOz*MILS_PER_OZ;
    var wMils = areaMils2/thicknessMils;
    return wMils*0.0254; // mils -> mm
  }

  function calculate(p){
    var wMm = widthMm(p.i, p.dT, p.layer, p.weight);
    var thicknessM = p.weight*MILS_PER_OZ*25.4e-6;
    var widthM = wMm*1e-3;
    var lengthM = p.length*1e-3;
    var resistance = (widthM>0 && thicknessM>0) ? RHO_CU*lengthM/(widthM*thicknessM) : 0;
    var vdrop = p.i*resistance;
    var pdiss = p.i*p.i*resistance;
    return { wMm:wMm, resistance:resistance, vdrop:vdrop, pdiss:pdiss };
  }

  function fmtOhm(r){
    if(r>=1) return r.toFixed(3)+" Ω";
    return (r*1000).toFixed(1)+" mΩ";
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("pcb-out-width").textContent = r.wMm.toFixed(2) + " mm (" + (r.wMm/0.0254).toFixed(1) + " mil)";
    document.getElementById("pcb-out-res").textContent = fmtOhm(r.resistance);
    document.getElementById("pcb-out-vdrop").textContent = fmtV(r.vdrop);
    document.getElementById("pcb-out-pdiss").textContent = fmtP(r.pdiss);

    var status = r.vdrop>0.2 ? "bad" : (r.vdrop>0.05 ? "warn" : "good");
    var pill = document.getElementById("pcb-pill-vdrop");
    pill.className = "pill " + status;
    pill.innerHTML = iconFor(status) + (status==="bad"?t("pcb_pill_bad"):(status==="warn"?t("pcb_pill_warn"):t("pcb_pill_ok")));

    var checks = [];
    if(r.wMm<0.15){
      checks.push({status:"warn", key:"pcb_check_narrow", v:r.wMm.toFixed(2)});
    }
    if(r.vdrop>0.05){
      checks.push({status: r.vdrop>0.2?"bad":"warn", key:"pcb_check_vdrop_high", v:fmtV(r.vdrop)});
    } else {
      checks.push({status:"good", key:"pcb_check_vdrop_ok", v:fmtV(r.vdrop)});
    }

    var checksEl = document.getElementById("pcbChecks");
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
    var iMax = Math.max(p.i*3, 1);
    var pts = [];
    var steps = 40;
    for(var k=0;k<=steps;k++){
      var i = (iMax/steps)*k || 0.001;
      pts.push([i, widthMm(i, p.dT, p.layer, p.weight)]);
    }
    var yMax = Math.max.apply(null, pts.map(function(pt){return pt[1];})) * 1.1;
    EC.charts.xy(document.getElementById("pcbChartSvg"), {
      xMin:0, xMax:iMax, yMin:0, yMax:yMax,
      xFmt:function(v){ return fmtI(v); }, yFmt:function(v){ return v.toFixed(2)+"mm"; },
      series:[{ points:pts, cls:"margin-line" }],
      point:{ x:p.i, y:r.wMm }
    });
  }

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_pcbtrace"),
      "I=" + p.i + " A, ΔT=" + p.dT + " °C, strato=" + p.layer + ", rame=" + p.weight + " oz, lunghezza=" + p.length + " mm",
      t("pcb_stat_width") + ": " + r.wMm.toFixed(2) + " mm",
      t("pcb_stat_vdrop") + ": " + fmtV(r.vdrop),
      t("pcb_stat_pdiss") + ": " + fmtP(r.pdiss)
    ].join("\n");
  }

  document.getElementById("pcbInputGrid").addEventListener("input", render);
  document.getElementById("pcbInputGrid").addEventListener("change", render);

  EC.bindPersistence("pcbtrace", ["pcbI","pcbDeltaT","pcbLayer","pcbWeight","pcbLength"].map(function(id){ return document.getElementById(id); }));
  EC.bindCopyButton("pcbCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

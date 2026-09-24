/**
 * tool-ldo.js — Linear regulator (LDO) power dissipation and static thermal model.
 * Tj = Tambient + Pdiss·θJA. θJA presets are indicative textbook values — real
 * boards depend heavily on copper pour / thermal vias, always check the datasheet.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor;
  var fmtP = EC.fmtP, fmtI = EC.fmtI;

  function readInputs(){
    return {
      vin: parseFloat(document.getElementById("ldoVin").value) || 0,
      vout: parseFloat(document.getElementById("ldoVout").value) || 0,
      iout: Math.max(0, parseFloat(document.getElementById("ldoIout").value) || 0),
      iq: Math.max(0, parseFloat(document.getElementById("ldoIq").value) || 0) / 1000, // mA -> A
      theta: Math.max(0.01, parseFloat(document.getElementById("ldoThetaJA").value) || 1),
      tamb: parseFloat(document.getElementById("ldoTamb").value) || 25,
      tjmax: parseFloat(document.getElementById("ldoTjmax").value) || 125,
      margin: Math.max(0, parseFloat(document.getElementById("ldoMargin").value) || 0)
    };
  }

  function pdissAt(p, iout){
    return (p.vin-p.vout)*iout + p.vin*p.iq;
  }
  function tjAt(p, iout){
    return p.tamb + pdissAt(p, iout)*p.theta;
  }

  function calculate(p){
    var pdiss = pdissAt(p, p.iout);
    var tj = tjAt(p, p.iout);
    var pout = p.vout*p.iout;
    var pin = p.vin*p.iout + p.vin*p.iq;
    var eff = pin>0 ? (pout/pin)*100 : 0;

    var targetTj = p.tjmax - p.margin;
    var pdissMax = (targetTj - p.tamb)/p.theta;
    var drop = p.vin-p.vout;
    var imax = drop>0 ? (pdissMax - p.vin*p.iq)/drop : NaN;

    return { pdiss:pdiss, tj:tj, eff:eff, imax:imax, targetTj:targetTj };
  }

  function render(){
    var p = readInputs();
    var r = calculate(p);

    document.getElementById("ldo-out-pdiss").textContent = fmtP(r.pdiss);
    document.getElementById("ldo-out-tj").textContent = r.tj.toFixed(1) + " °C";
    document.getElementById("ldo-out-eff").textContent = r.eff.toFixed(1) + " %";
    document.getElementById("ldo-out-imax").textContent = (isFinite(r.imax) && r.imax>0) ? fmtI(r.imax) : "—";

    var status = r.tj>p.tjmax ? "bad" : (r.tj>r.targetTj ? "warn" : "good");
    var pill = document.getElementById("ldo-pill-tj");
    pill.className = "pill " + status;
    pill.innerHTML = iconFor(status) + (status==="bad"?t("ldo_pill_bad"):(status==="warn"?t("ldo_pill_warn"):t("ldo_pill_ok")));

    var checks = [];
    if(r.tj>p.tjmax){
      checks.push({status:"bad", key:"ldo_check_over_tjmax", v:r.tj.toFixed(1)});
    } else if(r.tj>r.targetTj){
      checks.push({status:"warn", key:"ldo_check_low_margin", v:r.tj.toFixed(1), m:p.margin});
    } else {
      checks.push({status:"good", key:"ldo_check_ok", v:r.tj.toFixed(1), t:p.tjmax});
    }

    var checksEl = document.getElementById("ldoChecks");
    checksEl.innerHTML = "";
    checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      div.innerHTML = iconFor(c.status) + "<span>" + fmt(c.key,{v:c.v, m:c.m, t:c.t}) + "</span>";
      checksEl.appendChild(div);
    });

    drawChart(p, r);
  }

  function drawChart(p, r){
    var iMax = Math.max(p.iout*2, isFinite(r.imax)?r.imax*1.2:p.iout*2, 0.01);
    var points = [];
    var steps = 40;
    for(var i=0;i<=steps;i++){
      var iout = iMax*(i/steps);
      points.push([iout, tjAt(p, iout)]);
    }
    var yMax = Math.max(p.tjmax*1.1, r.tj*1.1);
    EC.charts.xy(document.getElementById("ldoChartSvg"), {
      xMin:0, xMax:iMax, yMin:p.tamb-5, yMax:yMax,
      xFmt:function(v){ return fmtI(v); }, yFmt:function(v){ return v.toFixed(0)+"°C"; },
      series:[{ points:points, cls:"margin-line" }],
      hLines:[{ y:p.tjmax, cls:"threshold-line" }],
      point:{ x:p.iout, y:r.tj }
    });
  }

  function buildSummary(){
    var p = readInputs();
    var r = calculate(p);
    return [
      "ElettroCalc — " + t("nav_ldo"),
      "Vin=" + p.vin + " V, Vout=" + p.vout + " V, Iout=" + p.iout + " A, θJA=" + p.theta + " °C/W, Tamb=" + p.tamb + " °C",
      t("ldo_stat_pdiss") + ": " + fmtP(r.pdiss),
      t("ldo_stat_tj") + ": " + r.tj.toFixed(1) + " °C",
      t("ldo_stat_imax") + ": " + ((isFinite(r.imax)&&r.imax>0)?fmtI(r.imax):"—")
    ].join("\n");
  }

  document.getElementById("ldoInputGrid").addEventListener("input", render);
  document.getElementById("ldoPreset").addEventListener("change", function(e){
    if(!e.target.value) return;
    document.getElementById("ldoThetaJA").value = e.target.value;
    render();
  });

  EC.bindPersistence("ldo", ["ldoVin","ldoVout","ldoIout","ldoIq","ldoThetaJA","ldoTamb","ldoTjmax","ldoMargin","ldoPreset"].map(function(id){ return document.getElementById(id); }));
  EC.bindCopyButton("ldoCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

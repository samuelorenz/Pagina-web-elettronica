/**
 * tool-kmap.js — Karnaugh map editor: click-to-cycle grid (0/1/X), exact
 * Quine-McCluskey + Petrick minimization (js/qm.js), a colored group overlay
 * on the map, and a generated 2-level AND-OR logic-gate schematic — both the
 * minimized circuit and the unoptimized canonical one, for comparison.
 */
(function(EC){
  "use strict";
  var t = EC.t, fmt = EC.fmt, iconFor = EC.iconFor, svgNS = EC.svgNS;
  var iconGood = EC.icons.good;
  var qm = EC.qm;

  var GROUP_COLORS = ["var(--group1)","var(--group2)","var(--group3)","var(--group4)","var(--group5)","var(--group6)","var(--group7)","var(--group8)"];

  var numVars = 4;
  var state = new Array(16).fill(0); // 0 | 1 | 'X', indexed by minterm

  function readVarNames(){
    var raw = document.getElementById("kmVarNames").value.split(",").map(function(s){ return s.trim(); }).filter(Boolean);
    var fallback = ["A","B","C","D","E","F"];
    var names = [];
    for(var i=0;i<numVars;i++) names.push(raw[i] || fallback[i]);
    return names;
  }

  // ---- Gray-code K-map grid geometry ----
  function grayCode(bits){
    if(bits===1) return ["0","1"];
    return ["00","01","11","10"]; // bits===2
  }
  function axisSplit(n){
    if(n===2) return { rowVars:[0], colVars:[1] };
    if(n===3) return { rowVars:[0], colVars:[1,2] };
    return { rowVars:[0,1], colVars:[2,3] };
  }

  function cycleVal(v){ return v===0 ? 1 : (v===1 ? "X" : 0); }

  function renderGrid(minimized){
    var names = readVarNames();
    var split = axisSplit(numVars);
    var rowGray = grayCode(split.rowVars.length);
    var colGray = grayCode(split.colVars.length);
    var rowLabel = split.rowVars.map(function(i){ return names[i]; }).join("");
    var colLabel = split.colVars.map(function(i){ return names[i]; }).join("");

    // which chosen minimized term(s) cover each minterm -> group colors
    var coverage = {};
    if(minimized && minimized.terms){
      minimized.terms.forEach(function(term, idx){
        for(var m=0;m<Math.pow(2,numVars);m++){
          if(qm.termCoversMinterm(term.bits, m, numVars)){
            (coverage[m] = coverage[m]||[]).push(idx % GROUP_COLORS.length);
          }
        }
      });
    }

    var html = '<table class="kmap"><tr><td class="corner-label">' + rowLabel + '\\' + colLabel + '</td>';
    colGray.forEach(function(cg){ html += "<th>"+cg+"</th>"; });
    html += "</tr>";
    rowGray.forEach(function(rg){
      html += "<tr><th>"+rg+"</th>";
      colGray.forEach(function(cg){
        var bits = rg+cg;
        var m = parseInt(bits,2);
        var v = state[m];
        var cls = "kmap-cell" + (v==="X" ? " state-x" : "");
        var shadow = "";
        if(coverage[m]){
          shadow = ' style="box-shadow:' + coverage[m].map(function(ci,ring){
            return "inset 0 0 0 " + (2+ring*3) + "px " + GROUP_COLORS[ci];
          }).join(",") + '"';
        }
        html += '<td class="'+cls+'" data-m="'+m+'"'+shadow+'><span class="mindex">'+m+'</span>'+v+'</td>';
      });
      html += "</tr>";
    });
    html += "</table>";
    document.getElementById("kmGridWrap").innerHTML = html;

    // legend
    var legendEl = document.getElementById("kmLegend");
    if(minimized && minimized.terms && minimized.terms.length){
      legendEl.innerHTML = minimized.terms.map(function(term, idx){
        return '<span><i class="group-swatch" style="background:'+GROUP_COLORS[idx%GROUP_COLORS.length]+'"></i>'+termToPlainText([term], names)+'</span>';
      }).join("");
    } else {
      legendEl.innerHTML = "";
    }
  }

  document.getElementById("kmGridWrap").addEventListener("click", function(e){
    var cell = e.target.closest(".kmap-cell");
    if(!cell) return;
    var m = parseInt(cell.getAttribute("data-m"),10);
    state[m] = cycleVal(state[m]);
    syncQuickInputsFromState();
    persist();
    render();
  });

  function syncQuickInputsFromState(){
    var ones=[], dcs=[];
    for(var m=0;m<Math.pow(2,numVars);m++){
      if(state[m]===1) ones.push(m);
      else if(state[m]==="X") dcs.push(m);
    }
    document.getElementById("kmMintermsInput").value = ones.join(",");
    document.getElementById("kmDontcaresInput").value = dcs.join(",");
  }

  // ---- expression formatting ----
  function termToHTML(terms, names){
    if(terms.length===0) return "0";
    if(terms.length===1 && qm.countLiterals(terms[0].bits)===0) return "1";
    return terms.map(function(term){
      var s = "";
      for(var i=0;i<term.bits.length;i++){
        if(term.bits[i]==="1") s += names[i];
        else if(term.bits[i]==="0") s += '<span style="text-decoration:overline">'+names[i]+'</span>';
      }
      return s;
    }).join(" + ");
  }
  function termToPlainText(terms, names){
    if(terms.length===0) return "0";
    if(terms.length===1 && qm.countLiterals(terms[0].bits)===0) return "1";
    return terms.map(function(term){
      var s = "";
      for(var i=0;i<term.bits.length;i++){
        if(term.bits[i]==="1") s += names[i];
        else if(term.bits[i]==="0") s += names[i]+"'";
      }
      return s;
    }).join(" + ");
  }

  // ================= logic gate schematic =================
  function svgEl(svg, tag, attrs){
    var e = document.createElementNS(svgNS, tag);
    Object.keys(attrs).forEach(function(k){ e.setAttribute(k, attrs[k]); });
    svg.appendChild(e);
    return e;
  }
  function wire(svg, pts){
    var d = pts.map(function(p,i){ return (i===0?"M":"L")+p[0]+","+p[1]; }).join(" ");
    svgEl(svg,"path",{ d:d, class:"gate-wire" });
  }
  function dot(svg,x,y){ svgEl(svg,"circle",{ cx:x, cy:y, r:2.6, class:"gate-dot" }); }

  function notGate(svg, x, y){
    var gx = x+16, w=24, h=16;
    dot(svg, x, y);
    wire(svg, [[x,y],[gx,y]]);
    svgEl(svg,"path",{ d:"M "+gx+","+(y-h/2)+" L "+gx+","+(y+h/2)+" L "+(gx+w)+","+y+" Z", class:"gate-shape" });
    var bubbleX = gx+w+4;
    svgEl(svg,"circle",{ cx:bubbleX, cy:y, r:4, class:"gate-bubble" });
    return { outX:bubbleX+4, outY:y };
  }
  function andGate(svg, x, yTop, yBot){
    var flat = 26, r = (yBot-yTop)/2, cy = (yTop+yBot)/2, midX = x+flat;
    svgEl(svg,"path",{ d:"M "+x+","+yTop+" L "+midX+","+yTop+" A "+r+","+r+" 0 1 1 "+midX+","+yBot+" L "+x+","+yBot+" Z", class:"gate-shape" });
    return { outX: midX+r, outY: cy };
  }
  function orGate(svg, x, yTop, yBot){
    var w=70, midY=(yTop+yBot)/2, back=w*0.18, tipX=x+w;
    var d = "M "+x+","+yTop+" Q "+(x+w*0.55)+","+yTop+" "+tipX+","+midY+
            " Q "+(x+w*0.55)+","+yBot+" "+x+","+yBot+
            " Q "+(x+back)+","+midY+" "+x+","+yTop+" Z";
    svgEl(svg,"path",{ d:d, class:"gate-shape" });
    return { outX:tipX, outY:midY, inX:x+back*0.7 };
  }

  function buildGateSVG(svg, terms, names){
    svg.innerHTML = "";
    var isZero = terms.length===0;
    var isOne = terms.length===1 && qm.countLiterals(terms[0].bits)===0;

    if(isZero || isOne){
      svg.setAttribute("viewBox","0 0 260 90");
      var txt = svgEl(svg,"text",{ x:20, y:50, class:"gate-const" });
      txt.textContent = "F = " + (isOne ? "1" : "0");
      return;
    }

    var termData = terms.map(function(term){
      var lits = [];
      for(var i=0;i<numVars;i++){
        if(term.bits[i]!=="-") lits.push({ varIndex:i, neg: term.bits[i]==="0" });
      }
      return { literals: lits };
    });

    var usedTrue = new Array(numVars).fill(false), usedComp = new Array(numVars).fill(false);
    termData.forEach(function(td){
      td.literals.forEach(function(l){ if(l.neg) usedComp[l.varIndex]=true; else usedTrue[l.varIndex]=true; });
    });
    var usedVars = [];
    for(var v=0; v<numVars; v++){ if(usedTrue[v]||usedComp[v]) usedVars.push(v); }

    var slotW = 90, leftMargin = 24, busTop = 60, notY = 92, gateGapY = 22;
    var varX = {};
    usedVars.forEach(function(v,p){
      var base = leftMargin + p*slotW;
      varX[v] = { trueX: base+18, compX: base+70 };
    });

    var gateColX = leftMargin + usedVars.length*slotW + 30;

    var cursorY = busTop;
    termData.forEach(function(td){
      var L = td.literals.length;
      var h = L>=2 ? Math.max(40, L*18) : 30;
      td.topY = cursorY; td.bottomY = cursorY+h; td.centerY = (td.topY+td.bottomY)/2;
      cursorY = td.bottomY + gateGapY;
    });
    var busBottom = cursorY - gateGapY;
    var maxH = Math.max.apply(null, termData.map(function(td){ return td.bottomY-td.topY; }));

    var andFlat = 26;
    var andOutX = gateColX + andFlat + maxH/2;
    var orGapX = 70;
    var orX = andOutX + orGapX;
    var orW = 70;
    var outX = orX + orW + 60;
    var totalHeight = busBottom + 30;
    var totalWidth = outX + 40;
    svg.setAttribute("viewBox", "0 0 "+totalWidth+" "+totalHeight);

    usedVars.forEach(function(v){
      var tx = varX[v].trueX;
      var lbl = svgEl(svg,"text",{ x:tx, y:22, "text-anchor":"middle", class:"gate-label" });
      lbl.textContent = names[v];
      wire(svg, [[tx,30],[tx,busTop]]);
      var trueBottom = usedTrue[v] ? busBottom : notY;
      wire(svg, [[tx,busTop],[tx,trueBottom]]);
      if(usedComp[v]){
        var nres = notGate(svg, tx, notY);
        wire(svg, [[nres.outX,nres.outY],[varX[v].compX,notY]]);
        wire(svg, [[varX[v].compX,notY],[varX[v].compX,busBottom]]);
      }
    });

    termData.forEach(function(td){
      var L = td.literals.length;
      if(L>=2){
        var g = andGate(svg, gateColX, td.topY, td.bottomY);
        td.literals.forEach(function(lit, idx){
          var py = td.topY + (td.bottomY-td.topY)*((idx+1)/(L+1));
          var busX = lit.neg ? varX[lit.varIndex].compX : varX[lit.varIndex].trueX;
          dot(svg, busX, py);
          wire(svg, [[busX,py],[gateColX,py]]);
        });
        if(g.outX < andOutX) wire(svg, [[g.outX,g.outY],[andOutX,g.outY]]);
        td.outX = andOutX; td.outY = g.outY;
      } else {
        var lit = td.literals[0];
        var busX = lit.neg ? varX[lit.varIndex].compX : varX[lit.varIndex].trueX;
        dot(svg, busX, td.centerY);
        wire(svg, [[busX,td.centerY],[andOutX,td.centerY]]);
        td.outX = andOutX; td.outY = td.centerY;
      }
    });

    var finalX, finalY;
    if(termData.length===1){
      finalX = termData[0].outX; finalY = termData[0].outY;
    } else {
      var orH = Math.max(termData.length*26, 40);
      var orTop = (busTop+busBottom)/2 - orH/2, orBot = orTop+orH;
      var orRes = orGate(svg, orX, orTop, orBot);
      termData.forEach(function(td, idx){
        var inY = orTop + orH*((idx+1)/(termData.length+1));
        var midX = andOutX + orGapX/2;
        wire(svg, [[td.outX,td.outY],[midX,td.outY],[midX,inY],[orRes.inX,inY]]);
      });
      finalX = orRes.outX; finalY = orRes.outY;
    }
    wire(svg, [[finalX,finalY],[outX-20,finalY]]);
    dot(svg, outX-20, finalY);
    var flbl = svgEl(svg,"text",{ x:outX-12, y:finalY+4, class:"gate-label" });
    flbl.textContent = "F";
  }

  // ================= main render =================
  function gateCountOf(terms){
    var and = terms.filter(function(term){ return qm.countLiterals(term.bits)>=2; }).length;
    var or = terms.length>1 ? 1 : 0;
    var notVars = new Set();
    terms.forEach(function(term){
      for(var i=0;i<term.bits.length;i++){ if(term.bits[i]==="0") notVars.add(i); }
    });
    return and+or+notVars.size;
  }

  function render(){
    var names = readVarNames();
    var full = Math.pow(2,numVars);
    var ones=[], dcs=[];
    for(var m=0;m<full;m++){
      if(state[m]===1) ones.push(m);
      else if(state[m]==="X") dcs.push(m);
    }

    var minimized = qm.minimize(numVars, ones, dcs);
    var canonicalTerms = ones.map(function(m){ return { bits: qm.toBits(m,numVars), cover:new Set([m]) }; });
    if(ones.length===full) canonicalTerms = minimized.terms; // tautology: canonical form collapses too

    renderGrid(minimized);

    document.getElementById("km-out-min").innerHTML = termToHTML(minimized.terms, names);
    document.getElementById("km-out-canonical").innerHTML = termToHTML(canonicalTerms, names);

    var literalsMin = minimized.terms.reduce(function(s,term){ return s+qm.countLiterals(term.bits); },0);
    var literalsCanon = canonicalTerms.reduce(function(s,term){ return s+qm.countLiterals(term.bits); },0);
    document.getElementById("km-out-terms").textContent = canonicalTerms.length + " → " + minimized.terms.length;
    document.getElementById("km-out-literals").textContent = literalsCanon + " → " + literalsMin;

    var gatesUnopt = gateCountOf(canonicalTerms);
    var gatesOpt = gateCountOf(minimized.terms);
    document.getElementById("km-out-gates").textContent = gatesUnopt + " → " + gatesOpt;
    var pillGates = document.getElementById("km-pill-gates");
    var pct = gatesUnopt>0 ? Math.round((1-gatesOpt/gatesUnopt)*100) : 0;
    var pillStatus = (gatesUnopt===0 || pct>0) ? "good" : "warn";
    pillGates.className = "pill " + pillStatus;
    pillGates.innerHTML = iconFor(pillStatus) + (pct>0 ? ("-"+pct+"%") : "=");

    // checks
    var checks = [];
    if(ones.length===0){
      checks.push({status:"info", key:"km_check_const_zero"});
    } else if(ones.length===full){
      checks.push({status:"info", key:"km_check_const_one"});
    } else {
      if(minimized.essentialIdx.size>0){
        checks.push({status:"info", key:"km_check_essential", v:minimized.essentialIdx.size, t:minimized.terms.length});
      }
      if(dcs.length>0){
        checks.push({status:"info", key:"km_check_dontcares", v:dcs.length});
      }
      if(pct>0){
        checks.push({status:"good", key:"km_check_reduction", before:gatesUnopt, after:gatesOpt, pct:pct});
      } else {
        checks.push({status:"good", key:"km_check_no_reduction"});
      }
    }
    var checksEl = document.getElementById("kmChecks");
    checksEl.innerHTML = "";
    checks.forEach(function(c){
      var div = document.createElement("div");
      div.className = "check " + c.status;
      div.innerHTML = (c.status==="info"?iconGood:iconFor(c.status)) + "<span>" + fmt(c.key,{v:c.v,t:c.t,before:c.before,after:c.after,pct:c.pct}) + "</span>";
      checksEl.appendChild(div);
    });

    buildGateSVG(document.getElementById("kmGatesOpt"), minimized.terms, names);
    buildGateSVG(document.getElementById("kmGatesUnopt"), canonicalTerms, names);
  }

  function buildSummary(){
    var names = readVarNames();
    var full = Math.pow(2,numVars);
    var ones=[], dcs=[];
    for(var m=0;m<full;m++){
      if(state[m]===1) ones.push(m);
      else if(state[m]==="X") dcs.push(m);
    }
    var minimized = qm.minimize(numVars, ones, dcs);
    return [
      "ElettroCalc — " + t("nav_kmap"),
      "Variabili: " + names.join(",") + " | Mintermini: " + ones.join(",") + (dcs.length?(" | Don't care: "+dcs.join(",")):""),
      "F = " + termToPlainText(minimized.terms, names)
    ].join("\n");
  }

  // ================= wiring =================
  function persist(){
    EC.storage.save("kmap", { numVars:numVars, varNames:document.getElementById("kmVarNames").value, state:state.join(",") });
  }

  document.getElementById("kmNumVars").addEventListener("change", function(e){
    numVars = parseInt(e.target.value,10);
    state = new Array(Math.pow(2,numVars)).fill(0);
    syncQuickInputsFromState();
    persist();
    render();
  });
  document.getElementById("kmVarNames").addEventListener("input", function(){ persist(); render(); });

  document.getElementById("kmApplyBtn").addEventListener("click", function(){
    var full = Math.pow(2,numVars);
    state = new Array(full).fill(0);
    function parseList(str){
      return str.split(",").map(function(s){ return parseInt(s.trim(),10); })
                .filter(function(n){ return !isNaN(n) && n>=0 && n<full; });
    }
    parseList(document.getElementById("kmMintermsInput").value).forEach(function(m){ state[m]=1; });
    parseList(document.getElementById("kmDontcaresInput").value).forEach(function(m){ state[m]="X"; });
    persist();
    render();
  });
  document.getElementById("kmClearBtn").addEventListener("click", function(){
    state = new Array(Math.pow(2,numVars)).fill(0);
    document.getElementById("kmMintermsInput").value = "";
    document.getElementById("kmDontcaresInput").value = "";
    persist();
    render();
  });

  (function initPersistence(){
    var saved = EC.storage.load("kmap", null);
    if(saved){
      numVars = saved.numVars || 4;
      document.getElementById("kmNumVars").value = numVars;
      if(saved.varNames) document.getElementById("kmVarNames").value = saved.varNames;
      var full = Math.pow(2,numVars);
      var arr = (saved.state||"").split(",");
      state = new Array(full).fill(0);
      for(var i=0;i<full;i++){
        var v = arr[i];
        if(v==="1") state[i]=1;
        else if(v==="X") state[i]="X";
      }
    } else {
      // a friendly non-trivial default so the tool shows something meaningful on first visit
      state = new Array(16).fill(0);
      [1,3,7,11,15].forEach(function(m){ state[m]=1; });
      [0,2].forEach(function(m){ state[m]="X"; });
    }
    syncQuickInputsFromState();
  })();

  EC.bindCopyButton("kmCopyBtn", buildSummary);

  EC.registerRenderer(render);

})(window.EC);

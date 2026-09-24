/**
 * qm.js — Quine-McCluskey minimization + Petrick's method for an exact
 * minimal sum-of-products cover. Pure logic, no DOM: used by tool-kmap.js
 * and independently unit-testable under Node (see bottom of file).
 *
 * EC.qm.minimize(numVars, ones, dontcares) -> {
 *   terms: [{bits, cover:Set}],   // the chosen minimal-cover implicants
 *   primeImplicants: [{bits, cover:Set}],
 *   essentialIdx: Set<int>,       // indices into primeImplicants
 *   chosenIdx: Set<int>
 * }
 * `bits` is a string of length numVars over {'0','1','-'}, MSB first
 * (bit 0 of the string = the first variable, e.g. A).
 */
(function(EC){
  "use strict";

  function toBits(m, numVars){
    var s = m.toString(2);
    while(s.length<numVars) s = "0"+s;
    return s;
  }

  function countOnes(bits){ return (bits.match(/1/g)||[]).length; }
  function countLiterals(bits){ return (bits.match(/[01]/g)||[]).length; }

  // Combines two same-length bit-strings if they differ in exactly one
  // position (and that position isn't already a dash in either) -> returns
  // the combined string with '-' there, or null if not combinable.
  function combine(a, b){
    var diffPos = -1;
    for(var i=0;i<a.length;i++){
      if(a[i]!==b[i]){
        if(diffPos!==-1) return null;
        diffPos = i;
      }
    }
    if(diffPos===-1) return null;
    var arr = a.split(""); arr[diffPos] = "-";
    return arr.join("");
  }

  function findPrimeImplicants(terms){
    var groups = {};
    terms.forEach(function(term){
      var c = countOnes(term.bits);
      (groups[c] = groups[c]||[]).push(term);
    });

    var primeImplicants = [];
    var current = groups;

    while(true){
      var keys = Object.keys(current).map(Number).sort(function(a,b){ return a-b; });
      if(keys.length===0) break;

      var used = {};
      var seenNext = {};
      var next = {};

      for(var ki=0; ki<keys.length; ki++){
        var k = keys[ki];
        if(current[k+1]===undefined) continue;
        var g1 = current[k], g2 = current[k+1];
        for(var i=0;i<g1.length;i++){
          for(var j=0;j<g2.length;j++){
            var combined = combine(g1[i].bits, g2[j].bits);
            if(combined===null) continue;
            used[g1[i].bits] = true;
            used[g2[j].bits] = true;
            if(!seenNext[combined]){
              var cover = new Set(g1[i].cover);
              g2[j].cover.forEach(function(v){ cover.add(v); });
              seenNext[combined] = { bits:combined, cover:cover };
              var cnt = countOnes(combined);
              (next[cnt] = next[cnt]||[]).push(seenNext[combined]);
            } else {
              g2[j].cover.forEach(function(v){ seenNext[combined].cover.add(v); });
              g1[i].cover.forEach(function(v){ seenNext[combined].cover.add(v); });
            }
          }
        }
      }

      keys.forEach(function(k){
        current[k].forEach(function(term){
          if(!used[term.bits]) primeImplicants.push(term);
        });
      });

      if(Object.keys(next).length===0) break;
      current = next;
    }

    // de-duplicate by bit pattern (can arise via different merge paths)
    var seenPI = {}, dedup = [];
    primeImplicants.forEach(function(pi){
      if(!seenPI[pi.bits]){ seenPI[pi.bits]=true; dedup.push(pi); }
    });
    return dedup;
  }

  function buildCoverage(primeImplicants, ones){
    var table = {};
    ones.forEach(function(m){ table[m] = []; });
    primeImplicants.forEach(function(pi, idx){
      pi.cover.forEach(function(m){
        if(table[m]!==undefined) table[m].push(idx);
      });
    });
    return table;
  }

  function selectEssential(table, primeImplicants){
    var chosen = new Set();
    var covered = new Set();
    Object.keys(table).forEach(function(m){
      if(table[m].length===1) chosen.add(table[m][0]);
    });
    chosen.forEach(function(idx){
      primeImplicants[idx].cover.forEach(function(m){ covered.add(m); });
    });
    return { chosen:chosen, covered:covered };
  }

  function isSubset(small, big){
    var bigSet = new Set(big);
    for(var i=0;i<small.length;i++){ if(!bigSet.has(small[i])) return false; }
    return true;
  }

  // Removes any set that is a strict superset of another set present (keeps
  // only the minimal/irredundant product terms) — this is what keeps
  // Petrick's expansion from exploding in size.
  function absorb(sets){
    var arr = sets.map(function(s){ return Array.from(s).sort(function(a,b){return a-b;}); });
    var uniq = {};
    arr.forEach(function(a){ uniq[a.join(",")] = a; });
    var list = Object.keys(uniq).map(function(k){ return uniq[k]; });
    var result = [];
    for(var i=0;i<list.length;i++){
      var isSuper = false;
      for(var j=0;j<list.length;j++){
        if(i===j) continue;
        if(list[j].length<list[i].length && isSubset(list[j], list[i])){ isSuper = true; break; }
      }
      if(!isSuper) result.push(new Set(list[i]));
    }
    return result;
  }

  // Exact minimal cover for whatever minterms the essential PIs left
  // uncovered, via Petrick's method (P.O.S. -> S.O.P. expansion with
  // absorption at every step to keep the term count bounded).
  function petrick(table, ones, covered, primeImplicants){
    var remaining = ones.filter(function(m){ return !covered.has(m); });
    if(remaining.length===0) return [];

    var clauses = remaining.map(function(m){ return table[m]; });
    var productTerms = clauses[0].map(function(pi){ return new Set([pi]); });

    for(var i=1;i<clauses.length;i++){
      var newTerms = [];
      productTerms.forEach(function(pt){
        clauses[i].forEach(function(pi){
          var merged = new Set(pt);
          merged.add(pi);
          newTerms.push(merged);
        });
      });
      productTerms = absorb(newTerms);
    }

    var best = null, bestScore = Infinity;
    productTerms.forEach(function(pt){
      var litCount = 0;
      pt.forEach(function(idx){ litCount += countLiterals(primeImplicants[idx].bits); });
      var score = pt.size*1000 + litCount;
      if(score<bestScore){ best = pt; bestScore = score; }
    });
    return best ? Array.from(best) : [];
  }

  EC.qm = {};

  EC.qm.toBits = toBits;
  EC.qm.countLiterals = countLiterals;

  EC.qm.minimize = function(numVars, ones, dontcares){
    if(ones.length===0){
      return { terms:[], primeImplicants:[], essentialIdx:new Set(), chosenIdx:new Set(), constant:0 };
    }
    var full = Math.pow(2, numVars);
    if(ones.length===full){
      return { terms:[{ bits:new Array(numVars).fill("-").join(""), cover:new Set(ones) }],
               primeImplicants:[], essentialIdx:new Set(), chosenIdx:new Set(), constant:1 };
    }

    var seen = {}, allTerms = [];
    ones.concat(dontcares).forEach(function(m){
      var b = toBits(m, numVars);
      if(!seen[b]){ seen[b]=true; allTerms.push({ bits:b, cover:new Set([m]) }); }
    });

    var primeImplicants = findPrimeImplicants(allTerms);
    var table = buildCoverage(primeImplicants, ones);
    var ess = selectEssential(table, primeImplicants);
    var extra = petrick(table, ones, ess.covered, primeImplicants);

    var chosenSet = new Set(ess.chosen);
    extra.forEach(function(idx){ chosenSet.add(idx); });

    var terms = Array.from(chosenSet).map(function(idx){ return primeImplicants[idx]; });
    return { terms:terms, primeImplicants:primeImplicants, essentialIdx:ess.chosen, chosenIdx:chosenSet };
  };

  // Evaluates a set of implicant terms (as produced above) against a given
  // minterm index — used both by the UI's K-map group overlay and by the
  // self-tests below to verify boolean equivalence.
  EC.qm.termCoversMinterm = function(bits, m, numVars){
    var mb = toBits(m, numVars);
    for(var i=0;i<bits.length;i++){
      if(bits[i]!=="-" && bits[i]!==mb[i]) return false;
    }
    return true;
  };

})(typeof window!=="undefined" ? (window.EC = window.EC || {}) : (module.exports = {}));

if(typeof module!=="undefined" && module.exports.qm){
  module.exports = module.exports.qm;
}

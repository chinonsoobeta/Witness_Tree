#!/usr/bin/env python3
"""Check the province span aggregate against every exact anchor we already hold.

Anchors (all must hold to the cell):
  1. 1984-2022 union and known-1984 forest equal the cumulative province run.
  2. Every one-year span equals its annual row in data/phase2-province-series.json
     (loss and from-year forest).
  3. 2020-2022 equals the admitted 13-row aggregate for the four provinces
     (loss hectares and the percent's implied denominator).
  4. Internal: union <= summed loss, union <= known, known + unknown bookkeeping,
     summed loss equals the prefix sum of annual loss.
Also reports the federal-riding rollup's differences, for the record.
"""
import json
import sys

REPO = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/wt/premises"
spans = json.load(open(sys.argv[1]))
series = json.load(open(f"{REPO}/data/phase2-province-series.json"))
rollup = json.load(open(f"{REPO}/data/phase3-interval-province-rollup.json"))
CELL = 0.09
ADMITTED = {  # lib/explore/map-style.ts EXPLORE_PRODUCTION_LAYER rows (admitted 2020-2022)
    "24": (680273.64, 0.9745108171576637),
    "35": (714701.7, 1.4436948894155726),
    "48": (748863.72, 2.8132686710314085),
}
CODE = {"59": "BC", "48": "AB", "35": "ON", "24": "QC"}

order = [(o["fromYear"], o["toYear"]) for o in spans["intervalOrder"]]
idx = {w: i for i, w in enumerate(order)}
ser = {p["code"]: p for p in series["provinces"]}
roll = {g["province"]: g for g in rollup["provinces"]}
failures, report = [], {}


def cells_to_ha(c):
    return round(c * CELL, 2)


def check(cond, msg):
    if not cond:
        failures.append(msg)
    return cond


# Pull the BC admitted row too, from the map-style source text.
src = open(f"{REPO}/lib/explore/map-style.ts").read()
import re
m = re.search(r'id: "59",.*?observedLossHectares: ([0-9.]+),\s*observedLossPercent: ([0-9.e-]+)', src, re.S)
if m:
    ADMITTED["59"] = (float(m.group(1)), float(m.group(2)))

for p in spans["boundariesSummed"]:
    bid, code = p["boundaryId"], CODE[p["boundaryId"]]
    s = ser[code]
    r = {}
    # 1. cumulative
    i = idx[(1984, 2022)]
    u = cells_to_ha(p["intervalUnionLossCells"][i])
    k = cells_to_ha(p["forestKnownCells"][0])
    r["union1984to2022"] = u
    check(u == s["cumulative"]["observedLossHectares"], f"{code} 1984-2022 union {u} != {s['cumulative']['observedLossHectares']}")
    check(k == s["cumulative"]["known1984ForestHectares"], f"{code} known 1984 {k} != {s['cumulative']['known1984ForestHectares']}")
    # 2. annual rows
    rows = {(x["fromYear"], x["toYear"]): x for x in s["intervals"]}
    bad = 0
    for a in range(1984, 2022):
        j = idx[(a, a + 1)]
        ul = cells_to_ha(p["intervalUnionLossCells"][j])
        al = cells_to_ha(p["annualLossCells"][a - 1984])
        kf = cells_to_ha(p["forestKnownCells"][a - 1984])
        row = rows[(a, a + 1)]
        ok = (ul == row["observedLossHectares"] and al == row["observedLossHectares"]
              and kf == row["knownForestedHectares"])
        if not ok:
            bad += 1
            failures.append(f"{code} {a}-{a+1}: union {ul} annual {al} known {kf} vs row {row['observedLossHectares']} / {row['knownForestedHectares']}")
    r["annualRowsMatched"] = 38 - bad
    # 3. admitted 2020-2022
    j = idx[(2020, 2022)]
    u2 = cells_to_ha(p["intervalUnionLossCells"][j])
    r["union2020to2022"] = u2
    if bid in ADMITTED:
        ha, pct = ADMITTED[bid]
        check(u2 == ha, f"{code} 2020-2022 union {u2} != admitted {ha}")
        known2020 = p["forestKnownCells"][2020 - 1984]
        implied = p["intervalUnionLossCells"][j] / known2020 * 100
        check(abs(implied - pct) < 1e-9, f"{code} 2020-2022 percent {implied} != admitted {pct}")
        r["admitted2020to2022"] = ha
    # 4. internal
    prefix = [0]
    for v in p["annualLossCells"]:
        prefix.append(prefix[-1] + v)
    for n, (a, b) in enumerate(order):
        ia, ib = a - 1984, b - 1984
        un, kn, sm = p["intervalUnionLossCells"][n], p["intervalKnownCells"][n], p["intervalSummedLossCells"][n]
        check(sm == prefix[ib] - prefix[ia], f"{code} {a}-{b} summed != prefix")
        check(un <= sm, f"{code} {a}-{b} union > summed")
        check(un <= kn <= p["forestKnownCells"][ia], f"{code} {a}-{b} union/known bound")
    # rollup comparison, informational
    g = roll[code]
    r["federalRollupDiff1984to2022Ha"] = round(cells_to_ha(g["intervalUnionLossCells"][i]) - u, 2)
    r["cells"] = p["cells"]
    r["unmappedCells"] = p["unmappedCells"]
    r["unmappedSharePercent"] = round(p["unmappedCells"] / p["cells"] * 100, 5)
    r["pieces"] = p["pieces"]
    report[code] = r

print(json.dumps({"provinces": report, "failures": failures[:40], "failureCount": len(failures),
                  "allAnchorsHold": not failures}, indent=1))
sys.exit(1 if failures else 0)

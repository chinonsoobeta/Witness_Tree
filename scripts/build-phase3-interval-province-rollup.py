"""Roll federal riding interval results up to provinces.

The crashed framework runner tried to re-read the rasters per province and
died on trajectory cardinality. It never needed to. Federal districts are
disjoint and they partition Canada, and every field this record carries is
a count of cells. A count over a disjoint union is the sum of the counts,
so the province answer is exact and costs zero raster reads.

distinctTrajectories is the one field that is not additive: two districts
can exhibit the same trajectory, so summing would double count and taking
a max would understate. It is emitted as null with the reason attached
rather than fabricated.
"""
import json, sys, hashlib

if len(sys.argv) != 3:
    sys.exit("usage: build-phase3-interval-province-rollup.py <federal-ridings.json> <output.json>")
SRC, OUT = sys.argv[1], sys.argv[2]

# Statistics Canada standard geographic classification: the first two digits
# of a federal district id are the province or territory.
PROV = {
    "10": "NL", "11": "PE", "12": "NS", "13": "NB", "24": "QC", "35": "ON",
    "46": "MB", "47": "SK", "48": "AB", "59": "BC", "60": "YT", "61": "NT",
    "62": "NU",
}

SUM_SCALAR = ["cells", "unmappedCells"]
SUM_VECTOR = [
    "forestKnownCells", "forestUnknownCells",
    "annualKnownCells", "annualLossCells", "annualUnknownCells",
    "annualOutsideForestCells",
    "intervalKnownCells", "intervalUnionLossCells",
    "intervalUnknownCells", "intervalSummedLossCells",
]
EXPECT_LEN = {
    "forestKnownCells": 39, "forestUnknownCells": 39,
    "annualKnownCells": 38, "annualLossCells": 38, "annualUnknownCells": 38,
    "annualOutsideForestCells": 38,
    "intervalKnownCells": 741, "intervalUnionLossCells": 741,
    "intervalUnknownCells": 741, "intervalSummedLossCells": 741,
}

src = json.load(open(SRC))
districts = src["districts"]
if len(districts) != 343:
    sys.exit(f"expected 343 federal districts, found {len(districts)}")

seen_ids = set()
groups = {}
for d in districts:
    bid = str(d["boundaryId"])
    if bid in seen_ids:
        sys.exit(f"duplicate district id {bid}: the zones would not be disjoint")
    seen_ids.add(bid)
    code = bid[:2]
    if code not in PROV:
        sys.exit(f"district {bid} has no known province prefix")
    for k, n in EXPECT_LEN.items():
        if len(d[k]) != n:
            sys.exit(f"district {bid} field {k} has {len(d[k])} entries, expected {n}")
    g = groups.setdefault(PROV[code], {
        "province": PROV[code], "districtCount": 0, "districtIds": [],
        **{k: 0 for k in SUM_SCALAR},
        **{k: [0] * EXPECT_LEN[k] for k in SUM_VECTOR},
    })
    g["districtCount"] += 1
    g["districtIds"].append(bid)
    for k in SUM_SCALAR:
        g[k] += d[k]
    for k in SUM_VECTOR:
        acc = g[k]
        for i, v in enumerate(d[k]):
            acc[i] += v

for g in groups.values():
    g["districtIds"].sort()
    # Not additive over a disjoint union, and not recoverable from these
    # inputs. Null is the honest answer; a number here would be invented.
    g["distinctTrajectories"] = None
    g["distinctTrajectoriesUnknownReason"] = (
        "Trajectory cardinality is not additive across districts, because two "
        "districts can exhibit the same trajectory. It cannot be derived from "
        "per-district counts and is not measured here."
    )

# Totals must reconcile exactly against the source, or the rollup is wrong.
for k in SUM_SCALAR:
    a = sum(g[k] for g in groups.values())
    b = sum(d[k] for d in districts)
    if a != b:
        sys.exit(f"rollup does not reconcile on {k}: {a} != {b}")
for k in SUM_VECTOR:
    for i in range(EXPECT_LEN[k]):
        a = sum(g[k][i] for g in groups.values())
        b = sum(d[k][i] for d in districts)
        if a != b:
            sys.exit(f"rollup does not reconcile on {k}[{i}]: {a} != {b}")

carry = ["schema", "boundaryEdition", "methodVersion", "codeVersion",
         "productionClaim", "admissionStatus", "cellHectares", "firstYear",
         "lastYear", "forestYears", "lossPairs", "intervalOrder",
         "intervalCount", "unionTerm", "summedTerm", "summedPercentAllowed",
         "netChangeIncluded", "unknownPolicy"]
out = {k: src[k] for k in carry}
out["schema"] = "witness-tree/phase3-interval-province-rollup/1"
out["jurisdiction"] = "CA"
out["derivation"] = {
    "kind": "exact-rollup",
    "from": "phase3-interval-riding-zonal-v1/federal-ridings-2023.json",
    "fromSha256": hashlib.sha256(open(SRC, "rb").read()).hexdigest(),
    "rasterReads": 0,
    "why": (
        "Federal districts are disjoint and partition Canada, and every summed "
        "field is a count of cells, so the province total is the sum of the "
        "district counts with no approximation."
    ),
    "notSummable": ["distinctTrajectories"],
    # No timestamp. The output is a pure function of the bound input, so it is
    # byte-reproducible and a checker can rebuild it and compare. A wall-clock
    # field would break that for nothing: git already records when.
}
out["provinces"] = [groups[k] for k in sorted(groups)]

with open(OUT, "w") as fh:
    json.dump(out, fh, indent=2)
    fh.write("\n")

print(f"provinces: {len(out['provinces'])}")
for g in out["provinces"]:
    print(f"  {g['province']}  districts={g['districtCount']:3d}  cells={g['cells']:,}  unmapped={g['unmappedCells']:,}")
print(f"reconciled on {len(SUM_SCALAR)} scalar and {len(SUM_VECTOR)} vector fields")

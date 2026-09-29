#!/usr/bin/env python3
"""Phase 4: number a province's normalized records and export what the matcher
reads: rec = the GeoPackage fid, a year index for the rasterizer, and compact
per-record arrays (event year as uint16, kind as uint8 with its name list).
Records without a geometry are removed first, since they cannot be matched."""
import json, sqlite3, sys
import numpy as np

gpkg, out = sys.argv[1], sys.argv[2]
# Writes go through GDAL: the GeoPackage's R-tree triggers call spatial SQL
# functions that only GDAL registers. Reads use sqlite directly.
from osgeo import gdal, ogr
gdal.UseExceptions()
ds = ogr.Open(gpkg, update=1)
dropped = ds.ExecuteSQL("SELECT COUNT(*) FROM records WHERE geom IS NULL").GetNextFeature().GetField(0)
ds.ExecuteSQL("DELETE FROM records WHERE geom IS NULL")
if ds.GetLayer("records").GetLayerDefn().GetFieldIndex("rec") < 0:
    ds.ExecuteSQL("ALTER TABLE records ADD COLUMN rec INTEGER")
ds.ExecuteSQL("UPDATE records SET rec = fid")
ds.ExecuteSQL("CREATE INDEX IF NOT EXISTS records_year ON records(year)")
ds = None
db = sqlite3.connect(f"file:{gpkg}?mode=ro", uri=True)
rows = db.execute("SELECT rec, year, kind, src FROM records ORDER BY rec").fetchall()
max_rec = rows[-1][0]
kinds = sorted({r[2] for r in rows})
year = np.zeros(max_rec + 1, dtype="<u2")
kind = np.zeros(max_rec + 1, dtype="u1")
for rec, y, k, _ in rows:
    year[rec] = y
    kind[rec] = kinds.index(k)
year.tofile(f"{out}/record-year.u16")
kind.tofile(f"{out}/record-kind.u8")
json.dump(kinds, open(f"{out}/record-kinds.json", "w"))
by_src = {}
for _, y, k, s in rows:
    by_src.setdefault(s, {"records": 0, "kinds": {}, "firstYear": 9999, "lastYear": 0})
    e = by_src[s]; e["records"] += 1; e["kinds"][k] = e["kinds"].get(k, 0) + 1
    e["firstYear"] = min(e["firstYear"], y); e["lastYear"] = max(e["lastYear"], y)
json.dump({"records": len(rows), "maxRec": max_rec, "droppedWithoutGeometry": dropped, "sources": by_src}, open(f"{out}/records-summary.json", "w"), indent=1)
print(json.dumps({"records": len(rows), "dropped": dropped, "sources": by_src}))

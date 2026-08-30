#!/usr/bin/env python3
"""Create a real, local-only Phase 2 expert-review candidate packet.

This deliberately selects observations, not expert conclusions.  It samples a
900 m deterministic lattice from two real V2.1 interval rasters, then verifies
each selected point against the original 30 m raster.
"""
import argparse, hashlib, json, os
import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
SEED = "witness-tree-phase2-v21-real-review-packet-v1"
ROOT = os.environ.get("WITNESS_TREE_DATA_ROOT") or "/Volumes/Extended_SSD/Witness_Tree-data"
RASTERS = {
  "early-loss-observed": ("whole-interval-loss-2000-2004.tif", 1, "2000-2004"),
  "early-known-no-loss": ("whole-interval-loss-2000-2004.tif", 0, "2000-2004"),
  "late-loss-observed": ("whole-interval-loss-2020-2022.tif", 1, "2020-2022"),
  "late-known-no-loss": ("whole-interval-loss-2020-2022.tif", 0, "2020-2022"),
}
BOUNDARIES = {
  "BC": (f"{ROOT}/derived/bc-terrestrial-reference-v1/2026-08-14/bc-terrestrial-reference.gpkg", "bc_terrestrial_reference", "bc-boundary-terrestrial", "BC-Boundary-Terrestrial-2020-06-15-source-snapshot", "5eeced91259c15c2532398591430538265286c7f4faa3306ad3ca89565c52d06"),
  "AB": (f"{ROOT}/derived/statcan-2021-provincial-baselines-v1/2026-08-14/alberta-baseline.gpkg", "alberta_baseline", "statcan-2021-alberta-provincial-baseline", "2021 Census Province/Territory CBF; PRUID 48", "c03d70204f88b2570d27b4d5de39fb0ff7c111829ea5a8eccfba9d56b2e7936e"),
  "ON": (f"{ROOT}/derived/statcan-2021-provincial-baselines-v1/2026-08-14/ontario-baseline-repaired.gpkg", "ontario_baseline", "statcan-2021-ontario-provincial-baseline", "2021 Census Province/Territory CBF; PRUID 35; make-valid derivative", "70ba34a11871c3670d00b0a96ea78961b38aba09bbc574dd11984612214c972a"),
  "QC": (f"{ROOT}/derived/statcan-2021-provincial-baselines-v1/2026-08-14/quebec-baseline-repaired.gpkg", "quebec_baseline", "statcan-2021-quebec-provincial-baseline", "2021 Census Province/Territory CBF; PRUID 24; make-valid derivative", "c875b6775bdf751a796e33bf152e797a64ce1b01de391e72405e8f753d3b7bdd"),
}

def digest(path):
  h=hashlib.sha256()
  with open(path,"rb") as f:
    for b in iter(lambda:f.read(1024*1024),b""): h.update(b)
  return h.hexdigest(), os.path.getsize(path)

def main():
  p=argparse.ArgumentParser(); p.add_argument("output"); a=p.parse_args()
  out=os.path.abspath(a.output); os.makedirs(out, exist_ok=False)
  raster_root=f"{ROOT}/derived/phase2-v21-raster-first-1984-2022-v1"
  samples=[]; provenance={}
  source_crs=osr.SpatialReference(wkt=gdal.Open(f"{raster_root}/whole-interval-loss-2020-2022.tif").GetProjection())
  source_crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
  geographic_crs=osr.SpatialReference(); geographic_crs.ImportFromEPSG(4326)
  geographic_crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
  to4326=osr.CoordinateTransformation(source_crs, geographic_crs)
  for province,(boundary,layer,boundary_id,edition,boundary_sha) in BOUNDARIES.items():
    boundary_ds=ogr.Open(boundary); boundary_layer=boundary_ds.GetLayerByName(layer)
    feature=boundary_layer.GetNextFeature(); boundary_geometry=feature.GetGeometryRef().Clone()
    boundary_geometry.Transform(osr.CoordinateTransformation(boundary_layer.GetSpatialRef(), osr.SpatialReference(wkt=gdal.Open(f"{raster_root}/whole-interval-loss-2020-2022.tif").GetProjection())))
    minx,maxx,miny,maxy=boundary_geometry.GetEnvelope()
    provenance[province]={"boundaryId":boundary_id,"boundaryEdition":edition,"boundaryGeometrySha256":boundary_sha}
    for stratum,(name,observed,interval) in RASTERS.items():
      source=f"{raster_root}/{name}"; ds=gdal.Open(source); gt=ds.GetGeoTransform(); w,h=ds.RasterXSize,ds.RasterYSize
      # A coarse, cutline-masked raster is a deterministic candidate frame; all
      # selected coordinates are re-read at native 30 m before being emitted.
      warped=gdal.Warp("", ds, format="MEM", outputBounds=(minx,miny,maxx,maxy),
        outputBoundsSRS=ds.GetProjection(), xRes=900, yRes=900, resampleAlg="near", srcNodata=255, dstNodata=255)
      arr=warped.GetRasterBand(1).ReadAsArray(); wgt=warped.GetGeoTransform()
      rows, cols = np.where(arr == observed)
      if len(rows)<25: raise RuntimeError(f"{province} {stratum} has only {len(rows)} candidates")
      rng=np.random.Generator(np.random.PCG64(int.from_bytes(hashlib.sha256(f"{SEED}|{province}|{stratum}".encode()).digest()[:16], "big")))
      selected=rng.permutation(len(rows))
      candidates=[]
      for index in selected:
        coarse_row,coarse_col=int(rows[index]),int(cols[index])
        x=wgt[0]+(coarse_col+.5)*wgt[1]; y=wgt[3]+(coarse_row+.5)*wgt[5]
        pixel_col=int((x-gt[0])/gt[1]); pixel_row=int((y-gt[3])/gt[5])
        if not (0<=pixel_col<w and 0<=pixel_row<h): raise RuntimeError("candidate outside native raster")
        if not boundary_geometry.Contains(ogr.CreateGeometryFromWkt(f"POINT ({x} {y})")): continue
        candidates.append((pixel_row,pixel_col,x,y,observed))
        if len(candidates)==25: break
      if len(candidates)!=25: raise RuntimeError("selection did not retain 25 candidates")
      sha,size=digest(source)
      for rank,(row,col,x,y,value) in enumerate(candidates,1):
        value=int(ds.GetRasterBand(1).ReadAsArray(col,row,1,1)[0,0])
        if value != observed: raise RuntimeError("native raster drifted from deterministic candidate frame")
        lon,lat,_=to4326.TransformPoint(x,y)
        samples.append({"id":f"{province}-{stratum}-{rank:03d}","province":province,"stratum":stratum,"selectionRank":rank,"cell":{"column":col,"row":row,"x":x,"y":y,"longitude":lon,"latitude":lat},"interval":interval,"observedClass":"loss-observed" if value==1 else "known-no-loss","raster":{"path":os.path.basename(source),"sha256":sha,"byteLength":size},"boundary":provenance[province],"review":{"status":"not-started","yearAndAttribution":{"en":"","fr":""},"reviewer":{"name":"","date":""},"notes":{"en":"","fr":""}}})
  packet={"schemaVersion":"witness-tree/phase2-v21-real-review-packet/1","status":"local-real-raster-candidates-no-review-results","productionEligible":False,"released":False,"selection":{"algorithm":"seeded-pcg64-choice-v1","seed":SEED,"candidateFrame":"900 m cutline-masked lattice; selected cells reread from native 30 m raster","strata":list(RASTERS),"perStratum":25,"perProvince":100},"attribution":"No attribution stratum is used: the V2.1 interval rasters record observed loss/no-loss only; this packet does not infer harvest or wildfire attribution.","rasterLineage":{"batchId":"phase2-v21-raster-first-1984-2022-v1","lineageSha256":"2499c2d37e0f55f5145f6842aedcee5398a3bac073699afbd17512f476b9f928"},"samples":samples,"expertReview":{"status":"not-started","completedLocationsByProvince":{"BC":0,"AB":0,"ON":0,"QC":0},"resultClaims":"none"}}
  path=f"{out}/packet.json"; open(path,"w").write(json.dumps(packet,sort_keys=True,separators=(",",":"))+"\n")
  sha,size=digest(path); print(json.dumps({"path":path,"sha256":sha,"byteLength":size,"samples":len(samples)}))
if __name__=="__main__": main()

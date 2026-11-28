"""R4 整合：从已打包的高清街面页（client/public/city/facades/hs*.webp）读出逐铺的店面开口 → 铺位清单（接口 I-1 的数据）。

高清烘焙（landsd_3d_hires_bake.py）把每间铺的开口（辅助图 G）与店铺种子（辅助图 A，无损）写在页里，客户端着色器按
「楼的 key × 店铺种子」的哈希决定这间铺亮不亮、什么色温；路面的铺面溢光（render/streets/frontage-field.ts）要在同一间铺门前
打光，所以要知道每间铺在墙上的位置。本脚本只读已发布的页与清单（不联网、不需要烘焙缓存），逐个街面段（kind 0）的每一片：
1. 取片在辅助图里的区域（半分辨率：页里 (x, y) 的颜色纹素对应辅助图 (x / 2, y / 2)，在页图的第 page 行以下、左半）；
2. 逐列：开口（G > 127）且有种子（A > 0）的像素里最多的种子 = 这一列的铺；连续同种子的列（隔 ≤ 1 列也算连着）= 一个铺位；
3. 铺位 → [part, ring, edge, s0 cm, s1 cm, 种子, 开口顶高程 dm, 开口底高程 dm, 覆盖率 %]（s 为沿这条边的米数 × 100）；
   宽不到 0.6 m 的不要；同一面墙相邻两片里同一种子、相隔 ≤ 0.3 m 的合并。
输出 data-raw/landsd/landsd-3dvm-hires-bays.json.gz（gzip -9、mtime 0，逐字节可复现）并更新 sources.json 的条目；
清单里记下全部页的 sha256 摘要（pagesDigest），管线（citymap stages/hires.ts）只在摘要与高清清单一致时接上铺位。

用法（Python 3.11+、numpy、Pillow）：
    python -B -I central/citymap/fetch/landsd_3d_hires_bays.py            # 重新烘焙高清页（--finalize-only）之后必须重跑
    python -B -I central/citymap/fetch/landsd_3d_hires_bays.py --check    # 只比较，不写
"""

import argparse
import gzip
import hashlib
import io
import json
import pathlib
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / "citymap" / "data-raw" / "landsd"
PAGES_DIR = ROOT / "client" / "public" / "city" / "facades"
HIRES_FILE = "landsd-3dvm-hires.json.gz"
OUT_FILE = "landsd-3dvm-hires-bays.json.gz"
HEAD = 8
PIECE = 7
#: 开口 / 种子的阈值、最窄铺位（m）、同一种子跨片合并的最大间隙（m）
OPEN_MIN = 128
MIN_W_M = 0.6
MERGE_GAP_M = 0.3


def pages_digest(pages: list[dict]) -> str:
    """全部页文件（名 + sha256，按清单顺序）的组合摘要，与 citymap stages/hires.ts 的 hiresPagesDigest 相同。"""
    text = "\n".join(f"{p['file']} {p['sha256']}" for p in pages)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_aux(path: pathlib.Path, page: int) -> np.ndarray:
    """页图 → 辅助图（page/2 × page/2 × 4，uint8）。"""
    with Image.open(path) as im:
        im.load()
        a = np.asarray(im.convert("RGBA"))
    if a.shape[0] != page * 3 // 2 or a.shape[1] != page:
        raise SystemExit(f"{path.name}: 尺寸 {a.shape[1]}×{a.shape[0]} 不是 {page}×{page * 3 // 2}")
    return a[page:, : page // 2]


def piece_bays(aux: np.ndarray, sec: tuple, pc: tuple, density_q: int) -> list[tuple[float, float, int, float, float, float]]:
    """一片里的铺位：[(s0 m, s1 m, 种子, 开口顶 z m, 开口底 z m, 覆盖率)]。"""
    _, _, _, _, dq, z_top, _, _ = sec
    d = dq / density_q
    _, x, y, c0, r0, w, h = pc
    ax0, ax1 = x // 2, (x + w + 1) // 2
    ay0, ay1 = y // 2, (y + h + 1) // 2
    blk = aux[ay0:ay1, ax0:ax1]
    if blk.size == 0:
        return []
    g = blk[..., 1]
    s = blk[..., 3]
    m = (g >= OPEN_MIN) & (s > 0)
    ncol = m.shape[1]
    col_seed = np.zeros(ncol, np.int32)
    for j in range(ncol):
        v = s[m[:, j], j]
        if v.size:
            vals, cnt = np.unique(v, return_counts=True)
            col_seed[j] = int(vals[np.argmax(cnt)])
    out = []
    j = 0
    while j < ncol:
        sd = col_seed[j]
        if sd == 0:
            j += 1
            continue
        k = j
        while k + 1 < ncol and (col_seed[k + 1] == sd or (col_seed[k + 1] == 0 and k + 2 < ncol and col_seed[k + 2] == sd)):
            k += 1
        sub = m[:, j:k + 1] & (s[:, j:k + 1] == sd)
        rows = np.nonzero(sub.any(1))[0]
        # 辅助图列 a 覆盖颜色列 X ∈ [2a, 2a + 2)；段内列 c = c0 + X − x
        cs0 = max(c0, c0 + 2 * (ax0 + j) - x)
        cs1 = min(c0 + w, c0 + 2 * (ax0 + k + 1) - x)
        rt = r0 + 2 * (ay0 + int(rows[0])) - y
        rb = r0 + 2 * (ay0 + int(rows[-1]) + 1) - y
        rt = max(r0, rt)
        rb = min(r0 + h, rb)
        if cs1 > cs0 and rb > rt:
            out.append((cs0 / d, cs1 / d, int(sd), z_top / 10 - rt / d, z_top / 10 - rb / d, float(sub.mean())))
        j = k + 1
    return out


def extract(doc: dict, pages_dir: pathlib.Path) -> dict:
    page = doc["params"]["page"]
    density_q = doc["params"]["densityQ"]
    street = doc["streetPages"]
    # 逐页收集要读的片，按页读一次图
    jobs: dict[int, list[tuple[str, tuple, tuple]]] = {}
    for bid in sorted(doc["buildings"]):
        for rec in doc["buildings"][bid]["f"]:
            sec = tuple(rec[:HEAD])
            if sec[3] != 0:
                continue
            n = sec[7]
            for k in range(n):
                pc = tuple(rec[HEAD + PIECE * k: HEAD + PIECE * (k + 1)])
                if pc[0] >= street:
                    continue
                jobs.setdefault(pc[0], []).append((bid, sec, pc))
    raw: dict[str, dict[tuple, list]] = {}
    for pg in sorted(jobs):
        aux = load_aux(pages_dir / doc["pages"][pg]["file"], page)
        for bid, sec, pc in jobs[pg]:
            face = (sec[0], sec[1], sec[2])
            for b in piece_bays(aux, sec, pc, density_q):
                raw.setdefault(bid, {}).setdefault(face, []).append(b)
    buildings: dict[str, list[list[int]]] = {}
    nbays = 0
    for bid in sorted(raw):
        rows: list[list[int]] = []
        for face in sorted(raw[bid]):
            bays = sorted(raw[bid][face])
            merged: list[list[float]] = []
            for s0, s1, sd, zt, zb, cov in bays:
                last = merged[-1] if merged else None
                if last and last[2] == sd and s0 - last[1] <= MERGE_GAP_M:
                    wl = last[1] - last[0]
                    wn = s1 - s0
                    last[5] = (last[5] * wl + cov * wn) / max(wl + wn, 1e-6)
                    last[1] = max(last[1], s1)
                    last[3] = max(last[3], zt)
                    last[4] = min(last[4], zb)
                else:
                    merged.append([s0, s1, sd, zt, zb, cov])
            for s0, s1, sd, zt, zb, cov in merged:
                if s1 - s0 < MIN_W_M:
                    continue
                rows.append([face[0], face[1], face[2], int(round(s0 * 100)), int(round(s1 * 100)), sd,
                             int(round(zt * 10)), int(round(zb * 10)), int(round(cov * 100))])
        if rows:
            buildings[bid] = rows
            nbays += len(rows)
    return {
        "format": "central-3dvm-hires-bays",
        "version": 1,
        "source": HIRES_FILE,
        "pagesDigest": pages_digest(doc["pages"]),
        "record": "per building: [part, ring, edge, s0 cm, s1 cm, shop seed (aux A), opening top z dm, opening bottom z dm, "
                  "cover %]; s = metres along the face edge from its start vertex (same face key as the hi-res record f); "
                  "one row per lit-able shop bay detected in the street pages (aux G >= 128 with seed > 0)",
        "params": {"openMin": OPEN_MIN, "minWidthM": MIN_W_M, "mergeGapM": MERGE_GAP_M},
        "buildings": buildings,
        "stats": {"buildings": len(buildings), "bays": nbays},
    }



def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只比较 data-raw 里的文件，不写")
    ap.add_argument("--pages-dir", default=str(PAGES_DIR))
    ap.add_argument("--raw-dir", default=str(RAW))
    args = ap.parse_args()
    raw_dir = pathlib.Path(args.raw_dir)
    doc = json.loads(gzip.decompress((raw_dir / HIRES_FILE).read_bytes()))
    if doc.get("format") != "central-3dvm-hires":
        raise SystemExit(f"{HIRES_FILE}: 格式不符")
    pages_dir = pathlib.Path(args.pages_dir)
    for p in doc["pages"]:
        data = (pages_dir / p["file"]).read_bytes()
        if len(data) != p["bytes"] or hashlib.sha256(data).hexdigest() != p["sha256"]:
            raise SystemExit(f"{p['file']} 与 {HIRES_FILE} 不符（sha256 / 字节数）：先重新烘焙或拉取 LFS")
    out = extract(doc, pages_dir)
    text = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    data = gzip.compress(text.encode("utf-8"), 9, mtime=0)
    target = raw_dir / OUT_FILE
    if args.check:
        same = target.exists() and target.read_bytes() == data
        print(f"{OUT_FILE}: {'一致' if same else '不一致'}（{out['stats']}）")
        return 0 if same else 1
    target.write_bytes(data)
    hires_entry = next((f for f in json.loads((raw_dir / "sources.json").read_text(encoding="utf-8"))["files"]
                        if f["file"] == HIRES_FILE), None)
    if hires_entry is None:
        raise SystemExit(f"sources.json 里没有 {HIRES_FILE}")
    entry = {k: hires_entry[k] for k in ("layer", "datasetId", "url", "query", "release", "crs", "licenses", "attribution", "fetched")
             if k in hires_entry}
    entry = {
        "file": OUT_FILE,
        **entry,
        "layer": "landsd/3dvm-individualised-hires-bays",
        "format": "gzip JSON (written by landsd_3d_hires_bays.py from the packed hi-res street pages): per building the shop bays "
                  "(face, extent along the wall, shop seed, opening height) that the night shader lights, for the pavement light pools",
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        "rows": out["stats"]["buildings"],
        "derivedFrom": [{"file": HIRES_FILE, "sha256": hires_entry["sha256"], "pagesDigest": out["pagesDigest"]}],
    }
    path = raw_dir / "sources.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    files = [f for f in manifest["files"] if f["file"] != OUT_FILE]
    at = next((i + 1 for i, f in enumerate(files) if f["file"] == HIRES_FILE), len(files))
    files.insert(at, entry)
    manifest["files"] = files
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{OUT_FILE} gzip {len(data)} B；{out['stats']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
Mesh processing utilities (extracted from original app.py)
"""

import json
from pathlib import Path
from typing import List, Tuple, Optional

import numpy as np
import nibabel as nib
from skimage import measure
import open3d as o3d


def get_system_for_subobject(obj_name_original: str) -> str:
    name = obj_name_original.lower()
    if "brain" in name or "spinal cord" in name or "mandibular canal" in name:
        return "nervous"
    if "lung" in name or "trachea" in name:
        return "respiratory"
    heart_keywords = [
        "heart", "myocardium", "atrium", "ventricle", "atrial_appendage",
        "heartchambers_highres"
    ]
    for kw in heart_keywords:
        if kw in name:
            return "heart_cardiovascular"
    artery_keywords = [
        "artery", "aorta", "carotid", "subclavian", "brachiocephalic_trunk",
        "pulmonary_artery", "iliac_artery", "common_carotid"
    ]
    for kw in artery_keywords:
        if kw in name:
            return "arteries_cardiovascular"
    vein_keywords = [
        "vein", "vena", "portal_vein", "splenic_vein", "brachiocephalic_vein",
        "inferior_vena_cava", "superior_vena_cava", "iliac_vena"
    ]
    for kw in vein_keywords:
        if kw in name:
            return "veins_cardiovascular"
    digestive_keywords = [
        "stomach", "liver", "colon", "small intestine", "duodenum",
        "esophagus", "oesophagus", "pancreas", "small bowel", "spleen"
    ]
    for kw in digestive_keywords:
        if kw in name:
            return "digestive"
    skeletal_keywords = [
        "bone", "rib", "vertebra", "scapula", "femur", "clavicle", "humerus",
        "iliac", "sacrum", "sternum", "mandible", "costal cartilages",
        "left hip", "right hip"
    ]
    for kw in skeletal_keywords:
        if kw in name:
            return "skeletal"
    muscular_keywords = ["muscle", "gluteus", "trapezius", "temporalis","levator",
        "scalene","pterygoid","digastric","levator","constrictor","sterno","thyrohyoid"]
    for kw in muscular_keywords:
        if kw in name:
            return "muscular"
    urinary_keywords = ["kidney", "bladder", "ureter"]
    for kw in urinary_keywords:
        if kw in name:
            return "urinary"
    if "prostate" in name:
        return "reproductive"
    endocrine_keywords = ["gland", "thyroid"]
    for kw in endocrine_keywords:
        if kw in name:
            return "endocrine"
    return "other"


def get_color_for_subobject(obj_name_original: str) -> Tuple[int, int, int]:
    name = obj_name_original.lower()
    specific = {
        "brachiocephalic artery": (255, 0, 0),
        "brachiocephalic trunk": (255, 0, 0),
        "pulmonary artery": (70, 230, 120),
        "common iliac artery": (255, 0, 0),
        "vertebral artery": (255, 30, 30),
        "portal vein": (200, 50, 245),
        "splenic vein": (200, 50, 245),
        "portal_vein_and_splenic_vein": (200, 50, 245),
        "skin": (240, 205, 185),
        "pulmonary veins": (4, 220, 250),
        "blood vessel": (220, 180, 255),
        "atrium_left": (250, 120, 100),
        "left atrium": (250, 120, 100),
        "atrium_right": (245, 115, 70),
        "right atrium": (245, 115, 70),
        "atrium": (248, 118, 85),
        "ventricle_left": (200, 90, 70),
        "left ventricle": (200, 90, 70),
        "ventricle_right": (192, 44, 0),
        "right ventricle": (192, 44, 0),
        "myocardium": (200, 90, 70),
        "heartchambers_highres": (200, 90, 70),
        "gland": (238, 130, 25),
        "brain": (255, 180, 184),
        "cyst": (70, 230, 120),
        "gingiva": (255, 182, 193),
        "sinus": (25, 60, 255),
        "perforator": (255, 100, 50),
        "circumflex": (255, 100, 50),
        "colon": (200, 125, 140),
        "costal cartilages": (255, 255, 255),
        "sternum": (238, 206, 179),
        "heart": (200, 90, 70),
        "tongue": (255, 67, 129),
        "lung": (255, 182, 193),
        "liver": (150, 10, 10),
        "kidney": (139, 69, 19),
        "small bowel": (255, 192, 203),
        "pulmonary venous system": (4, 220, 250),
        "pudendal vein": (0, 255, 240),
        "penile veins": (220, 180, 255),
        "deep dorsal": (255, 0, 60),
        "cavernosus": (255, 164, 240),
        "spongiosus": (90, 255, 71),
        "obturator": (0, 255, 0),
        "vesical": (0, 127, 255),
        "sacral": (0, 180, 255),
        "spinal cord": (255, 255, 0),
        "santorini": (255, 255, 0),
        "prostate": (195, 0, 200),
        "thyroid": (255, 0, 217),
        "urinary bladder": (255, 255, 0),
        "arterial canal": (255, 255, 0),
        "ovaric": (255, 255, 0),
        "bladder": (0, 255, 0),
    }
    for k, v in specific.items():
        if k in name:
            return v
    bone_keywords = [
        "vertebra", "rib", "scapula", "femur", "clavicle", "humerus",
        "hip", "iliac", "sacrum", "bone", "mandible","cranium","skull"
    ]
    for kw in bone_keywords:
        if kw in name:
            return (238, 206, 179)
    if "trachea" in name:
        return (255, 255, 255)
    if ("vein" in name) or ("vena" in name):
        return (0, 100, 255)
    if ("artery" in name) or ("aorta" in name) or ("carotid" in name) or ("subclavian artery" in name):
        return (255, 0, 60)
    gut_keywords = ["oesophagus", "esophagus", "stomach", "duodenum", "small intestine"]
    for kw in gut_keywords:
        if kw in name:
            return (255, 192, 203)
    if "pancreas" in name or "spinal chord" in name:
        return (255, 255, 0)
    if "spleen" in name:
        return (210, 30, 160)
    muscle_keywords = ["muscle", "gluteus"]
    for kw in muscle_keywords:
        if kw in name:
            return (183, 86, 27)
    return (200, 200, 200)


def clean_mesh(mesh: o3d.geometry.TriangleMesh):
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_duplicated_vertices()
    mesh.remove_non_manifold_edges()
    mesh.remove_unreferenced_vertices()
    mesh.compute_vertex_normals()


def mask_to_mesh(nii_path: Path, level: float = 0.5) -> Optional[o3d.geometry.TriangleMesh]:
    try:
        img = nib.load(str(nii_path))
        data = img.get_fdata()
        if data.max() <= 0:
            return None
        spacing = img.header.get_zooms()[:3]
        verts, faces, normals, values = measure.marching_cubes(data, level=level, spacing=spacing)
        if len(verts) == 0 or len(faces) == 0:
            return None
        mesh = o3d.geometry.TriangleMesh(
            o3d.utility.Vector3dVector(verts),
            o3d.utility.Vector3iVector(faces.astype(np.int32, copy=False))
        )
        clean_mesh(mesh)
        return mesh
    except Exception as e:
        print(f"[mask_to_mesh] error for {nii_path}: {e}")
        return None


def export_obj_with_submeshes(meshes: List[o3d.geometry.TriangleMesh], names: List[str], out_dir: Path) -> Tuple[Path, Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    obj_path = out_dir / "Result.obj"
    mtl_name = "materials.mtl"
    mtl_path = out_dir / mtl_name
    json_path = out_dir / "Result.json"

    systems_data = {}

    with open(obj_path, 'w', encoding='utf-8') as f_obj:
        f_obj.write(f"mtllib {mtl_name}\n")
        v_offset = 0
        for mesh, name in zip(meshes, names):
            real_name = name
            system_name = get_system_for_subobject(real_name)
            label = f"{system_name}__{real_name}"

            f_obj.write(f"o {label}\n")
            f_obj.write(f"g {label}\n")
            f_obj.write(f"usemtl {label}\n")

            vs = np.asarray(mesh.vertices)
            for vx, vy, vz in vs:
                f_obj.write(f"v {vx} {vy} {vz}\n")
            
            fs = np.asarray(mesh.triangles)
            for tri in fs:
                i1 = int(tri[0]) + 1 + v_offset
                i2 = int(tri[1]) + 1 + v_offset
                i3 = int(tri[2]) + 1 + v_offset
                f_obj.write(f"f {i1} {i2} {i3}\n")
            v_offset += vs.shape[0]

            color = get_color_for_subobject(real_name)
            systems_data.setdefault(system_name, []).append({
                "object_name": real_name,
                "color": list(color)
            })

    with open(mtl_path, 'w', encoding='utf-8') as f_mtl:
        for name in names:
            real_name = name
            system_name = get_system_for_subobject(real_name)
            label = f"{system_name}__{real_name}"
            r, g, b = get_color_for_subobject(real_name)
            rf, gf, bf = r/255.0, g/255.0, b/255.0
            f_mtl.write(f"newmtl {label}\n")
            f_mtl.write("Ka 0.0 0.0 0.0\n")
            f_mtl.write(f"Kd {rf:.3f} {gf:.3f} {bf:.3f}\n")
            f_mtl.write("Ks 0.0 0.0 0.0\n")
            f_mtl.write("illum 2\n")
            f_mtl.write("d 1.0\n")
            f_mtl.write("Ns 0.0\n\n")

    with open(json_path, 'w', encoding='utf-8') as f_json:
        json.dump(systems_data, f_json, indent=2)

    return obj_path, mtl_path, json_path

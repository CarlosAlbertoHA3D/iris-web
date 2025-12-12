#!/usr/bin/env python3
"""
Mesh processing utilities (optimized for SageMaker Serverless)
Uses trimesh instead of open3d for smaller image size
"""

import json
from pathlib import Path
from typing import List, Tuple, Optional

import numpy as np
import nibabel as nib
from skimage import measure
import trimesh


def get_system_for_subobject(obj_name_original: str) -> str:
    name = obj_name_original.lower()
    if "brain" in name or "spinal cord" in name or "spinal_cord" in name or "mandibular canal" in name:
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
        "esophagus", "oesophagus", "pancreas", "small bowel", "small_bowel", "spleen"
    ]
    for kw in digestive_keywords:
        if kw in name:
            return "digestive"
    skeletal_keywords = [
        "vertebra", "rib", "scapula", "femur", "clavicle", "clavicula", "humerus",
        "hip", "iliac", "sacrum", "bone", "mandible", "cranium", "skull",
        "costal_cartilages", "costal cartilages"
    ]
    for kw in skeletal_keywords:
        if kw in name:
            return "skeletal"
    muscular_keywords = ["muscle", "gluteus", "psoas", "autochthon"]
    for kw in muscular_keywords:
        if kw in name:
            return "muscular"
    urinary_keywords = ["kidney", "urinary bladder", "bladder", "ureter"]
    for kw in urinary_keywords:
        if kw in name:
            return "urinary"
    reproductive_keywords = ["prostate", "uterus", "ovary", "testis"]
    for kw in reproductive_keywords:
        if kw in name:
            return "reproductive"
    endocrine_keywords = ["thyroid", "adrenal", "pituitary"]
    for kw in endocrine_keywords:
        if kw in name:
            return "endocrine"
    return "other"


def get_color_for_subobject(obj_name_original: str) -> Tuple[int, int, int]:
    name = obj_name_original.lower()
    
    # ===== DENTAL STRUCTURES - Unique colors per tooth =====
    # FDI notation: 1x=upper right, 2x=upper left, 3x=lower left, 4x=lower right
    # x1=central incisor, x2=lateral incisor, x3=canine, x4-x5=premolars, x6-x8=molars
    
    dental_colors = {
        # Upper Right (1x) - Blue spectrum
        "upper_right_central_incisor": (0, 120, 255),      # Bright blue
        "upper_right_lateral_incisor": (0, 180, 255),      # Sky blue
        "upper_right_canine": (0, 220, 200),               # Cyan
        "upper_right_first_premolar": (0, 200, 150),       # Teal
        "upper_right_second_premolar": (0, 180, 120),      # Sea green
        "upper_right_first_molar": (0, 160, 100),          # Green-teal
        "upper_right_second_molar": (0, 140, 80),          # Dark teal
        "upper_right_third_molar": (0, 120, 60),           # Forest teal
        
        # Upper Left (2x) - Green spectrum
        "upper_left_central_incisor": (50, 205, 50),       # Lime green
        "upper_left_lateral_incisor": (34, 180, 34),       # Forest green
        "upper_left_canine": (0, 200, 100),                # Spring green
        "upper_left_first_premolar": (60, 179, 113),       # Medium sea green
        "upper_left_second_premolar": (46, 139, 87),       # Sea green
        "upper_left_first_molar": (32, 178, 170),          # Light sea green
        "upper_left_second_molar": (0, 139, 139),          # Dark cyan
        "upper_left_third_molar": (0, 128, 128),           # Teal
        
        # Lower Left (3x) - Yellow/Orange spectrum
        "lower_left_central_incisor": (255, 215, 0),       # Gold
        "lower_left_lateral_incisor": (255, 193, 37),      # Goldenrod
        "lower_left_canine": (255, 165, 0),                # Orange
        "lower_left_first_premolar": (255, 140, 0),        # Dark orange
        "lower_left_second_premolar": (255, 127, 80),      # Coral
        "lower_left_first_molar": (255, 99, 71),           # Tomato
        "lower_left_second_molar": (250, 128, 114),        # Salmon
        "lower_left_third_molar": (233, 150, 122),         # Dark salmon
        
        # Lower Right (4x) - Purple/Pink spectrum
        "lower_right_central_incisor": (186, 85, 211),     # Medium orchid
        "lower_right_lateral_incisor": (147, 112, 219),    # Medium purple
        "lower_right_canine": (138, 43, 226),              # Blue violet
        "lower_right_first_premolar": (153, 50, 204),      # Dark orchid
        "lower_right_second_premolar": (148, 0, 211),      # Dark violet
        "lower_right_first_molar": (199, 21, 133),         # Medium violet red
        "lower_right_second_molar": (219, 112, 147),       # Pale violet red
        "lower_right_third_molar": (255, 20, 147),         # Deep pink
        
        # Pulp chambers - Red tones (darker/brighter than teeth)
        "pulp": (220, 20, 60),                             # Crimson for all pulp
        
        # Crown
        "crown": (255, 248, 220),                          # Cornsilk (ivory/cream)
        
        # Anatomical structures
        "maxillary_sinus": (135, 206, 250),                # Light sky blue
        "inferior_alveolar_canal": (255, 215, 0),          # Gold/yellow for nerves
        "mandibular_canal": (255, 200, 0),                 # Similar gold
    }
    
    # Check for specific dental structures first
    for key, color in dental_colors.items():
        if key in name:
            return color
    
    # Check for pulp (any tooth pulp)
    if "pulp" in name:
        return (220, 20, 60)  # Crimson
    
    # Check for sinus
    if "sinus" in name:
        return (135, 206, 250)  # Light sky blue
    
    # Check for canal (nerve)
    if "canal" in name:
        return (255, 215, 0)  # Gold
    
    # ===== Original specific mappings =====
    specific = {
        "heartchambers_highres": (200, 90, 70),
        "gland": (238, 130, 25),
        "brain": (255, 180, 184),
        "cyst": (70, 230, 120),
        "gingiva": (255, 182, 193),
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


def smooth_mesh(mesh: trimesh.Trimesh, iterations: int = 10):
    """
    Smooth mesh to remove cubic/blocky appearance from segmentation
    Uses trimesh's Laplacian smoothing which is much faster than manual iteration
    """
    try:
        # Use trimesh's built-in smoothing
        # filter_laplacian returns the mesh, but modifies in place if specified?
        # Checking docs: trimesh.smoothing.filter_laplacian(mesh, lamb=0.5, iterations=10)
        trimesh.smoothing.filter_laplacian(mesh, lamb=0.5, iterations=iterations)
        
        # Recalculate normals after smoothing
        mesh.fix_normals()
        print(f"[smooth_mesh] Applied {iterations} iterations of Laplacian smoothing")
    except Exception as e:
        print(f"[smooth_mesh] warning: {e}, falling back to simple smoothing")
        try:
             # Fallback if filter_laplacian is not available in this version
             trimesh.smoothing.filter_humphrey(mesh)
        except:
             pass


def decimate_mesh(mesh: trimesh.Trimesh, target_percent: float = 0.5):
    """
    Reduce mesh complexity by removing triangles
    Makes meshes lighter for web viewing
    """
    try:
        target_faces = max(100, int(len(mesh.faces) * target_percent))
        if len(mesh.faces) > target_faces:
            # Use trimesh simplification
            # Note: face_count is the standard argument name for newer trimesh/open3d bindings
            try:
                simplified = mesh.simplify_quadric_decimation(face_count=target_faces)
            except TypeError:
                # Fallback for older versions or direct open3d calls
                simplified = mesh.simplify_quadric_decimation(target_faces)
                
            print(f"[decimate_mesh] Reduced from {len(mesh.faces)} to {len(simplified.faces)} faces")
            return simplified
        return mesh
    except Exception as e:
        print(f"[decimate_mesh] warning: {e}")
        return mesh


def clean_mesh(mesh: trimesh.Trimesh, smooth: bool = True, decimate: bool = True):
    """Clean and optimize mesh using trimesh functions"""
    try:
        # Remove degenerate faces
        mesh.remove_degenerate_faces()
        # Remove duplicate faces
        mesh.remove_duplicate_faces()
        # Merge vertices that are very close
        mesh.merge_vertices()
        # Remove unreferenced vertices
        mesh.remove_unreferenced_vertices()
        
        # Apply smoothing to remove blocky appearance
        if smooth:
            # Increased iterations for smoother look (optimized filter)
            smooth_mesh(mesh, iterations=15)
        
        # Optionally reduce polygon count for web performance
        # Aggressive decimation to reduce file size (target 20% of original faces)
        if decimate and len(mesh.faces) > 1000:
            mesh = decimate_mesh(mesh, target_percent=0.20)
        
        # Fix normals
        mesh.fix_normals()
        
        return mesh
    except Exception as e:
        print(f"[clean_mesh] warning: {e}")
        return mesh


def mask_to_mesh(nii_path: Path, level: float = 0.5, smooth: bool = True) -> Optional[trimesh.Trimesh]:
    """
    Convert NIFTI mask to trimesh mesh using marching cubes
    
    Args:
        nii_path: Path to NIFTI file
        level: Isosurface level for marching cubes
        smooth: Apply smoothing to remove blocky appearance
    """
    try:
        img = nib.load(str(nii_path))
        data = img.get_fdata()
        if data.max() <= 0:
            return None
        
        spacing = img.header.get_zooms()[:3]
        
        # Generate mesh in voxel space (scaled by spacing)
        # This matches how the frontend displays the volume (array index * spacing)
        verts, faces, normals, values = measure.marching_cubes(data, level=level, spacing=spacing)
        if len(verts) == 0 or len(faces) == 0:
            return None
        
        # Create trimesh object - vertices are already in spacing-scaled coordinates
        # which matches the frontend volume rendering coordinate system
        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
        
        # Clean and optimize mesh (with smoothing and decimation)
        mesh = clean_mesh(mesh, smooth=smooth, decimate=True)
        
        return mesh
    except Exception as e:
        print(f"[mask_to_mesh] error for {nii_path}: {e}")
        return None


def export_obj_with_submeshes(meshes: List[trimesh.Trimesh], names: List[str], out_dir: Path, label_map: dict = None) -> Tuple[Path, Path, Path]:
    """Export meshes to OBJ + MTL + JSON with system grouping, centered at origin"""
    out_dir.mkdir(parents=True, exist_ok=True)
    obj_path = out_dir / "Result.obj"
    mtl_name = "materials.mtl"
    mtl_path = out_dir / mtl_name
    json_path = out_dir / "Result.json"

    systems_data = {}
    
    # Calculate global bounding box center to center the model
    all_vertices = []
    for mesh in meshes:
        all_vertices.append(mesh.vertices)
    
    if all_vertices:
        combined_verts = np.vstack(all_vertices)
        global_center = (combined_verts.min(axis=0) + combined_verts.max(axis=0)) / 2.0
        print(f"[export] Centering model: original center at {global_center}")
    else:
        global_center = np.array([0.0, 0.0, 0.0])

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

            # Write vertices (centered)
            vs = mesh.vertices - global_center  # Center the model
            for vx, vy, vz in vs:
                f_obj.write(f"v {vx} {vy} {vz}\n")
            
            # Write faces
            fs = mesh.faces
            for tri in fs:
                i1 = int(tri[0]) + 1 + v_offset
                i2 = int(tri[1]) + 1 + v_offset
                i3 = int(tri[2]) + 1 + v_offset
                f_obj.write(f"f {i1} {i2} {i3}\n")
            v_offset += vs.shape[0]

            color = get_color_for_subobject(real_name)
            entry = {
                "object_name": real_name,
                "color": list(color)
            }
            if label_map and real_name in label_map:
                entry["label_id"] = label_map[real_name]
                
            systems_data.setdefault(system_name, []).append(entry)

    # Write MTL file
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

    # Write JSON metadata
    with open(json_path, 'w', encoding='utf-8') as f_json:
        json.dump(systems_data, f_json, indent=2)

    return obj_path, mtl_path, json_path

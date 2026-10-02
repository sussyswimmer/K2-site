"""Debrief 1 · step 4 — Blender finishing: decimate, bake, materials, empties, GLB export.

  blender -b -P assets-src/scripts/04_blender_scene.py

Reads the FreeCAD exports + the numpy albedo, writes assets-src/blender/K2_Scene.blend
(compressed, textures external in assets-src/blender/tex/) and plain (uncompressed)
GLBs in assets-src/blender/*.glb — 05_optimize.mjs compresses those into public/models/.

Frame: Blender works Z-up in the shared local frame (+X east, +Y north, +Z elevation,
metres, origin = K2 DEM summit). The glTF exporter converts to Y-up, so in three.js
x = east, y = elevation, z = south and the summit sits at (0, 8571, 0) in DEM mode.
"""
import json
import math
import os
import time
from pathlib import Path

import bmesh
import bpy
import numpy as np

ROOT = Path(os.environ.get("K2_ROOT", "/home/user/K2-site"))
EXP = ROOT / "assets-src/freecad/exports"
BL = ROOT / "assets-src/blender"
TEX = BL / "tex"
META = json.loads((ROOT / "assets-src/data/terrain_meta.json").read_text())
WAY = json.loads((ROOT / "assets-src/data/route_waypoints.json").read_text())
G = META["grid"]
X0, Y0, SIZE = G["x0"], G["y0"], G["size"]

TARGET_TRIS = 150_000
TARGET_TRIS_LO = 60_000
BAKE = os.environ.get("K2_BAKE", "1") == "1"


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def hex_rgba(h, a=1.0):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in ("K2_Terrain", "K2_Routes", "K2_Props", "K2_Cameras", "K2_Hotspots", "K2_Bake"):
        bpy.context.scene.collection.children.link(bpy.data.collections.new(c))


def coll(name):
    return bpy.data.collections[name]


def move_to(obj, cname):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll(cname).objects.link(obj)


def import_obj(path, name, cname):
    bpy.ops.wm.obj_import(filepath=str(path), forward_axis="Y", up_axis="Z")
    objs = list(bpy.context.selected_objects)
    if len(objs) > 1:
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active or objs[0]
    o.name = o.data.name = name
    move_to(o, cname)
    return o


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def planar_uv(o):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    n = len(me.loops)
    vidx = np.empty(n, dtype=np.int32)
    me.loops.foreach_get("vertex_index", vidx)
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    uv = np.column_stack([(co[vidx, 0] - X0) / SIZE, (co[vidx, 1] - Y0) / SIZE]).astype(np.float32)
    me.uv_layers[0].data.foreach_set("uv", uv.ravel())


def decimate(o, target):
    t = time.time()
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new("Planar", "DECIMATE")
    m.decimate_type = "DISSOLVE"
    m.angle_limit = math.radians(0.6)  # only truly flat glacier floors
    bpy.ops.object.modifier_apply(modifier=m.name)
    tr = o.modifiers.new("Tri", "TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=tr.name)
    after_planar = tri_count(o)
    m = o.modifiers.new("Collapse", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = min(1.0, target / after_planar)
    m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    log(f"decimate {o.name}: planar → {after_planar:,} tris, collapse → {tri_count(o):,} tris ({time.time() - t:.0f}s)")


def image(name, size, non_color, path=None):
    if path and Path(path).exists():
        img = bpy.data.images.load(str(path), check_existing=True)
        img.name = name
    else:
        img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return img


def gltf_output_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g:
        return g
    g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.interface.new_socket("Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def terrain_material(name, albedo, normal, ao):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    t_alb = nt.nodes.new("ShaderNodeTexImage"); t_alb.image = albedo; t_alb.name = "Albedo"
    nt.links.new(t_alb.outputs["Color"], bsdf.inputs["Base Color"])
    t_nrm = nt.nodes.new("ShaderNodeTexImage"); t_nrm.image = normal; t_nrm.name = "Normal"
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(t_nrm.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    t_ao = nt.nodes.new("ShaderNodeTexImage"); t_ao.image = ao; t_ao.name = "AO"
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t_ao.outputs["Color"], sep.inputs["Color"])
    grp = nt.nodes.new("ShaderNodeGroup"); grp.node_tree = gltf_output_group()
    nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    for i, n in enumerate((t_alb, t_nrm, t_ao)):
        n.location = (-700, 300 - 300 * i)
    return mat


def reference_procedural_material():
    """Height + slope classification as Blender nodes — kept for reference/tweaking.
    The shipped albedo is computed in numpy (02_dem_to_mesh.py) with the same rules."""
    mat = bpy.data.materials.new("Terrain_Procedural_Reference")
    mat.use_fake_user = True
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    nsep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], nsep.inputs["Vector"])
    # snow: height > 5,500 m and slope < 40° (normal.z > cos 40° = 0.766)
    h = nt.nodes.new("ShaderNodeMapRange")
    h.inputs["From Min"].default_value, h.inputs["From Max"].default_value = 5300, 5700
    nt.links.new(sep.outputs["Z"], h.inputs["Value"])
    s = nt.nodes.new("ShaderNodeMapRange")
    s.inputs["From Min"].default_value, s.inputs["From Max"].default_value = 0.72, 0.80
    nt.links.new(nsep.outputs["Z"], s.inputs["Value"])
    snow = nt.nodes.new("ShaderNodeMath"); snow.operation = "MULTIPLY"
    nt.links.new(h.outputs["Result"], snow.inputs[0]); nt.links.new(s.outputs["Result"], snow.inputs[1])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs[6].default_value = hex_rgba("#3a312b")
    mix.inputs[7].default_value = hex_rgba("#f1f5f9")
    nt.links.new(snow.outputs["Value"], mix.inputs["Factor"])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    return mat


def flat_material(name, color, emissive=0.0, rough=0.6, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hex_rgba(color)
    b.inputs["Roughness"].default_value = rough
    if emissive:
        b.inputs["Emission Color"].default_value = hex_rgba(color)
        b.inputs["Emission Strength"].default_value = emissive
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    return mat


def shade(o, smooth=True):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    (bpy.ops.object.shade_smooth if smooth else bpy.ops.object.shade_flat)()


def assign(o, mat):
    o.data.materials.clear()
    o.data.materials.append(mat)


def empty(name, loc, cname, parent=None, size=200.0, display="PLAIN_AXES"):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = display
    e.empty_display_size = size
    coll(cname).objects.link(e)
    if parent is not None:
        e.parent = parent
        e.location = (loc[0] - parent.location[0], loc[1] - parent.location[1], loc[2] - parent.location[2])
    else:
        e.location = loc
    return e


def bake(kind, low, image_node_name, high=None, **kw):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = kw.get("samples", 1)
    sc.cycles.use_denoising = False  # this Blender build has no OIDN; with it on, bakes come out empty
    b = sc.render.bake
    b.margin = 16
    b.target = "IMAGE_TEXTURES"
    b.use_selected_to_active = high is not None
    if high is not None:
        b.cage_extrusion = kw.get("cage", 80.0)
        b.max_ray_distance = kw.get("max_ray", 240.0)
    b.normal_space = "TANGENT"
    bpy.ops.object.select_all(action="DESELECT")
    if high is not None:
        high.hide_render = False
        high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    nt = low.active_material.node_tree
    target = nt.nodes[image_node_name]
    for n in nt.nodes:
        n.select = False
    target.select = True
    nt.nodes.active = target
    # Unhook the normal map while baking so the target image isn't also an input.
    bsdf = nt.nodes["Principled BSDF"]
    unhooked = [(l.from_socket, l.to_socket) for l in nt.links if l.to_node == bsdf and l.to_socket.name == "Normal"]
    for l in [l for l in nt.links if l.to_node == bsdf and l.to_socket.name == "Normal"]:
        nt.links.remove(l)
    t = time.time()
    bpy.ops.object.bake(type=kind)
    for a, b2 in unhooked:
        nt.links.new(a, b2)
    px = np.array(target.image.pixels[:], dtype=np.float32).reshape(-1, 4)[:, :3]
    log(f"bake {kind} on {low.name}: {time.time() - t:.0f}s, pixel min {px.min(0).round(3)} max {px.max(0).round(3)}")
    if float(px.max() - px.min()) < 1e-3:
        raise RuntimeError(f"bake {kind} produced a flat image")


def export(path, objs, edges=False):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_yup=True,
        export_apply=True, export_extras=True, export_cameras=False, export_lights=False,
        use_mesh_edges=edges, export_draco_mesh_compression_enable=False,
        export_image_format="AUTO", export_texcoords=True, export_normals=True,
        export_tangents=False, export_materials="EXPORT",
    )
    log(f"exported {path.name} ({path.stat().st_size / 1e6:.2f} MB)")


def main():
    TEX.mkdir(parents=True, exist_ok=True)
    reset()
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0

    # --- terrain: high (bake source) + decimated web mesh ---------------------------
    hi = import_obj(EXP / "terrain_1024.obj", "Terrain_HI_1024", "K2_Bake")
    log(f"imported {hi.name}: {tri_count(hi):,} tris")
    lo = hi.copy(); lo.data = hi.data.copy(); lo.name = lo.data.name = "Terrain"
    coll("K2_Terrain").objects.link(lo)
    decimate(lo, TARGET_TRIS)
    planar_uv(lo)
    shade(lo)

    lo2 = import_obj(EXP / "terrain.obj", "Terrain_Lo", "K2_Terrain")
    decimate(lo2, TARGET_TRIS_LO)
    planar_uv(lo2)
    shade(lo2)

    albedo = image("terrain_albedo", 2048, False, TEX / "terrain_albedo.png")
    n_hi = image("terrain_normal", 2048, True, None if BAKE else TEX / "terrain_normal.png")
    n_lo = image("terrain_normal_lo", 1024, True, None if BAKE else TEX / "terrain_normal_lo.png")
    ao = image("terrain_ao", 2048, True, None if BAKE else TEX / "terrain_ao.png")
    assign(lo, terrain_material("Terrain", albedo, n_hi, ao))
    assign(lo2, terrain_material("Terrain_Lo", albedo, n_lo, ao))
    reference_procedural_material()

    if BAKE:
        bake("NORMAL", lo, "Normal", high=hi)
        n_hi.filepath_raw = str(TEX / "terrain_normal.png"); n_hi.file_format = "PNG"; n_hi.save()
        bake("NORMAL", lo2, "Normal", high=hi)
        n_lo.filepath_raw = str(TEX / "terrain_normal_lo.png"); n_lo.file_format = "PNG"; n_lo.save()
        # AO from the web mesh itself (high mesh hidden so coincident surfaces don't occlude).
        hi.hide_render = True
        lo2.hide_render = True
        sc.world = sc.world or bpy.data.worlds.new("World")
        sc.world.light_settings.distance = 900.0
        bake("AO", lo, "AO", samples=32)
        ao.filepath_raw = str(TEX / "terrain_ao.png"); ao.file_format = "PNG"; ao.save()
        lo2.hide_render = False
    for img in (albedo, n_hi, n_lo, ao):  # external files (save_as_mainfile makes them relative)
        img.filepath = str(TEX / f"{img.name}.png")
        img.source = "FILE"
        img.reload()

    # --- routes, props -------------------------------------------------------------------
    m_abr = flat_material("Route_Abruzzi", "#F2A541", emissive=3.0, rough=0.4)
    m_ces = flat_material("Route_Cesen", "#5CE1E6", emissive=3.0, rough=0.4)
    r_abr = import_obj(EXP / "route_abruzzi.obj", "Route_Abruzzi", "K2_Routes"); assign(r_abr, m_abr)
    r_ces = import_obj(EXP / "route_cesen.obj", "Route_Cesen", "K2_Routes"); assign(r_ces, m_ces)
    camps = import_obj(EXP / "camps.obj", "Camps", "K2_Props"); assign(camps, flat_material("Tent", "#E4572E", rough=0.7))
    flag = import_obj(EXP / "summit_flag.obj", "Summit_Flag", "K2_Props"); assign(flag, flat_material("Flag", "#F2A541", emissive=1.0))
    contours = import_obj(EXP / "contours.obj", "Contours", "K2_Props"); assign(contours, flat_material("Contour", "#BFE3FF", emissive=1.5))
    plinth = import_obj(EXP / "plinth.obj", "Plinth", "K2_Props"); assign(plinth, flat_material("Plinth", "#16202c", rough=0.95))
    slab = import_obj(EXP / "section_slab.obj", "Section_Slab", "K2_Props"); assign(slab, flat_material("Section", "#2b3d55", emissive=0.4, rough=0.8))
    for o in (camps, flag, slab, r_abr, r_ces):
        shade(o, smooth=o not in (camps, slab))

    # --- camera waypoints + hotspot anchors -------------------------------------------------
    cam_objs = []
    for cam in WAY["cameras"]:
        c = empty(cam["name"], cam["pos"], "K2_Cameras", size=300, display="CONE")
        l = empty(cam["look_name"], cam["look"], "K2_Cameras", parent=c, size=150, display="SPHERE")
        c["k2_role"] = "camera"; l["k2_role"] = "look"
        cam_objs += [c, l]
    hs_objs = []
    points = []
    for key in ("abruzzi", "cesen"):
        points += WAY["routes"][key]["camps"]
    points += WAY["places"] + WAY["peaks"]
    seen = set()
    for p in points:
        if p["id"] in seen:
            continue
        seen.add(p["id"])
        e = empty(f"HS_{p['id'].replace('-', '_')}", (p["x"], p["y"], p["z_dem"] + 30), "K2_Hotspots", size=80, display="SPHERE")
        e["k2_id"] = p["id"]; e["k2_name"] = p["name"]; e["k2_kind"] = p["kind"]
        if p.get("elev_cited_m"):
            e["k2_elev_cited_m"] = p["elev_cited_m"]
        hs_objs.append(e)

    # --- save + export ---------------------------------------------------------------------------
    # The 2M-tri bake source stays out of the .blend (it's regenerable from
    # assets-src/freecad/exports/terrain_1024.obj) so the file fits in git.
    hi_mesh = hi.data
    bpy.data.objects.remove(hi, do_unlink=True)
    bpy.data.meshes.remove(hi_mesh)
    blend = BL / "K2_Scene.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True, relative_remap=True)
    log(f"saved {blend.name} ({blend.stat().st_size / 1e6:.1f} MB)")

    tmp = BL / "tmp"
    tmp.mkdir(exist_ok=True)
    export(tmp / "k2_terrain.glb", [lo] + cam_objs + hs_objs)
    export(tmp / "k2_terrain_lo.glb", [lo2] + cam_objs + hs_objs)
    export(tmp / "route_abruzzi.glb", [r_abr])
    export(tmp / "route_cesen.glb", [r_ces])
    export(tmp / "camps.glb", [camps, flag])
    export(tmp / "contours.glb", [contours], edges=True)
    export(tmp / "plinth.glb", [plinth], edges=True)
    export(tmp / "section_slab.glb", [slab])

    cams_out = [{"name": c["name"], "look_name": c["look_name"],
                 "pos_yup": [c["pos"][0], c["pos"][2], -c["pos"][1]],
                 "look_yup": [c["look"][0], c["look"][2], -c["look"][1]]} for c in WAY["cameras"]]
    (ROOT / "public/models/cameras.json").write_text(json.dumps({
        "frame": "three.js Y-up metres: x east, y elevation, z south; origin = K2 DEM summit",
        "cameras": cams_out}, indent=1))
    log("done")


main()

"""Debrief 1 · step 4b — Cycles renders of each object + the story cameras (headless).

  blender -b assets-src/blender/K2_Scene.blend -P assets-src/scripts/04b_blender_renders.py

Stand-in for the FreeCAD `get_view` screenshots (no GUI in the cloud container).
Writes PNGs to assets-src/renders/d1/.
"""
import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(os.environ.get("K2_ROOT", "/home/user/K2-site"))
OUT = ROOT / "assets-src/renders/d1"
OUT.mkdir(parents=True, exist_ok=True)
WAY = json.loads((ROOT / "assets-src/data/route_waypoints.json").read_text())
ONLY = os.environ.get("K2_ONLY", "")
RES = (960, 540)


def setup():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = int(os.environ.get("K2_SAMPLES", "24"))
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX" if "AgX" in [v.identifier for v in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(22)
    sky.sun_rotation = math.radians(115)  # sun in the east-south-east: morning light
    sky.altitude = 4500
    sky.air_density = 0.6
    sky.dust_density = 0.4
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.35
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    sun = bpy.data.objects.get("Sun_Render")
    if not sun:
        ld = bpy.data.lights.new("Sun_Render", "SUN")
        ld.energy = 4.0
        ld.angle = math.radians(0.6)
        sun = bpy.data.objects.new("Sun_Render", ld)
        sc.collection.objects.link(sun)
    # point the lamp along the sky's sun direction
    el, az = sky.sun_elevation, sky.sun_rotation
    d = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    sun.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    cam = bpy.data.objects.get("Render_Cam")
    if not cam:
        cd = bpy.data.cameras.new("Render_Cam")
        cam = bpy.data.objects.new("Render_Cam", cd)
        sc.collection.objects.link(cam)
    cam.data.clip_start = 5
    cam.data.clip_end = 250_000
    sc.camera = cam
    return cam


def edges_to_tubes(name, radius):
    """Loose edges don't render in Cycles — convert line objects to bevelled curves."""
    o = bpy.data.objects[name]
    c = o.copy(); c.data = o.data.copy(); c.name = name + "_render"
    o.users_collection[0].objects.link(c)
    bpy.ops.object.select_all(action="DESELECT")
    c.select_set(True)
    bpy.context.view_layer.objects.active = c
    bpy.ops.object.convert(target="CURVE")
    c.data.bevel_depth = radius
    c.data.bevel_resolution = 1
    c.data.materials.clear()
    c.data.materials.append(o.active_material)
    o.hide_render = True
    return c


def plinth_side_lines(radius):
    """Copy of the Plinth with only its loose edges (the 500 m side contours), as tubes."""
    import bmesh
    o = bpy.data.objects["Plinth"]
    c = o.copy(); c.data = o.data.copy(); c.name = "PlinthLines_render"
    o.users_collection[0].objects.link(c)
    bm = bmesh.new(); bm.from_mesh(c.data)
    bmesh.ops.delete(bm, geom=list(bm.faces), context="FACES")
    bm.to_mesh(c.data); bm.free()
    bpy.ops.object.select_all(action="DESELECT")
    c.select_set(True)
    bpy.context.view_layer.objects.active = c
    bpy.ops.object.convert(target="CURVE")
    c.data.bevel_depth = radius
    c.data.materials.clear()
    c.data.materials.append(bpy.data.materials["Contour"])


def show(names):
    keep = set(names)
    for o in bpy.data.objects:
        if o.type in ("MESH", "CURVE"):
            o.hide_render = o.name not in keep


def shoot(cam, name, pos, look, lens=35.0, objs=None):
    if ONLY and ONLY not in name:
        return
    if objs is not None:
        show(objs)
    cam.location = pos
    cam.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    bpy.context.scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name, flush=True)


def main():
    cam = setup()
    hi = bpy.data.objects.get("Terrain_HI_1024")
    if hi:
        hi.hide_render = True
    edges_to_tubes("Contours", 9.0)
    plinth_side_lines(28.0)
    terrain = ["Terrain"]
    routes = ["Route_Abruzzi", "Route_Cesen"]
    s = (0.0, 0.0, 8571.0)

    shoot(cam, "01_terrain", (-24000, -36000, 17000), (0, -6000, 5200), 30, terrain)
    shoot(cam, "02_plinth", (38000, -52000, 6500), (0, -6000, 4800), 30, terrain + ["Plinth", "PlinthLines_render"])
    shoot(cam, "03_contours", (-9000, -16000, 13500), (0, -2500, 6000), 35, terrain + ["Contours_render"])
    shoot(cam, "04_routes", (5200, -5200, 7300), (700, -1100, 6900), 35, terrain + routes + ["Camps", "Summit_Flag"])
    shoot(cam, "05_camps", (-2600, -8400, 6500), (700, -4200, 5100), 45, terrain + routes + ["Camps"])
    shoot(cam, "06_summit_flag", (-260, -330, 8640), (0, 0, 8580), 50, terrain + ["Summit_Flag"])
    shoot(cam, "07_section_slab", (-9000, -9000, 9500), (0, 0, 6500), 30, ["Section_Slab", "Plinth", "PlinthLines_render"])
    # Concordia, eye height, telephoto — compare with the classic photo from Concordia.
    conc = next(p for p in WAY["places"] if p["id"] == "concordia")
    shoot(cam, "08_concordia_view", (conc["x"], conc["y"], conc["z_dem"] + 2), (0, -1200, 7350), 85, terrain)
    for c in WAY["cameras"]:
        shoot(cam, f"cam_{c['name']}", c["pos"], c["look"], 24, terrain + routes + ["Camps", "Summit_Flag"])


main()

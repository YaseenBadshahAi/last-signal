/* LAST SIGNAL — Tactical rifle model.
   Rifle geometry adapted from the user's first-person weapon system,
   rebuilt here as a world-space (third-person) attachment. */
window.LSRifle = (function () {

  function buildTacticalRifle(THREE) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x303638, roughness: 0.38, metalness: 0.78 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x151a1c, roughness: 0.58, metalness: 0.55 });
    const polymer = new THREE.MeshStandardMaterial({ color: 0x343c32, roughness: 0.9, metalness: 0.05 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x526c62, roughness: 0.2, metalness: 0.35 });

    function box(parent, name, size, material, position) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
      mesh.name = name;
      mesh.position.set(position[0], position[1], position[2]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    function cylinder(parent, name, rTop, rBottom, length, material, position, rotation) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, length, 12), material);
      mesh.name = name;
      mesh.position.set(position[0], position[1], position[2]);
      if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    }

    // Rifle points forward along local -Z (rotated to +Z when mounted on the soldier).
    const rifle = new THREE.Group();
    rifle.name = "TacticalRifle";
    box(rifle, "Receiver", [0.105, 0.12, 0.32], metal, [0, 0, -0.05]);
    box(rifle, "UpperReceiver", [0.09, 0.045, 0.31], darkMetal, [0, 0.075, -0.055]);
    box(rifle, "Handguard", [0.09, 0.095, 0.32], polymer, [0, 0.005, -0.35]);
    cylinder(rifle, "Barrel", 0.018, 0.023, 0.34, metal, [0, 0.015, -0.65], [Math.PI / 2, 0, 0]);
    cylinder(rifle, "Muzzle", 0.027, 0.027, 0.07, darkMetal, [0, 0.015, -0.84], [Math.PI / 2, 0, 0]);
    box(rifle, "Stock", [0.085, 0.10, 0.28], polymer, [0, -0.005, 0.25]);
    box(rifle, "StockPad", [0.09, 0.11, 0.045], darkMetal, [0, -0.005, 0.405]);

    const magazine = new THREE.Group();
    magazine.name = "Magazine";
    magazine.position.set(0, -0.12, -0.08);
    rifle.add(magazine);
    box(magazine, "MagazineBody", [0.07, 0.19, 0.105], darkMetal, [0, -0.035, 0]);
    box(magazine, "MagazineBase", [0.075, 0.025, 0.11], polymer, [0, -0.14, 0]);

    box(rifle, "PistolGrip", [0.055, 0.14, 0.075], polymer, [0, -0.12, 0.055]);
    box(rifle, "TriggerGuard", [0.07, 0.055, 0.065], darkMetal, [0, -0.065, -0.005]);
    box(rifle, "TopRail", [0.055, 0.025, 0.38], darkMetal, [0, 0.11, -0.19]);
    box(rifle, "RearSight", [0.045, 0.045, 0.045], metal, [0, 0.15, 0.015]);

    const optic = new THREE.Group();
    optic.name = "Optic";
    optic.position.set(0, 0.17, -0.17);
    rifle.add(optic);
    cylinder(optic, "OpticTube", 0.043, 0.043, 0.10, darkMetal, [0, 0, 0], [Math.PI / 2, 0, 0]);
    box(optic, "OpticLens", [0.06, 0.01, 0.06], glass, [0, 0, -0.053]);

    for (let i = 0; i < 5; i++) {
      box(rifle, "RailSlot_" + i, [0.105, 0.018, 0.025], darkMetal, [0, 0.065, -0.25 - i * 0.055]);
    }

    // Muzzle flash (cone + light), hidden until fired.
    const flash = new THREE.Group();
    flash.name = "MuzzleFlash";
    flash.position.set(0, 0.015, -0.89);
    rifle.add(flash);
    const flashMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.085, 0.24, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb52e, transparent: true, opacity: 0.95, depthWrite: false })
    );
    flashMesh.rotation.x = -Math.PI / 2;
    flashMesh.visible = false;
    flash.add(flashMesh);
    const flashLight = new THREE.PointLight(0xff9b35, 0, 6, 2);
    flash.add(flashLight);
    const muzzle = new THREE.Object3D();
    muzzle.position.copy(flash.position);
    flash.add(muzzle);

    return { group: rifle, muzzle, flash, flashMesh, flashLight, magazine };
  }

  return { buildTacticalRifle };
})();

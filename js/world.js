/* LAST SIGNAL — world assembly: realistic island + cinematic atmosphere + POIs.
   Exposes the same game API as before: groundHeight, colliders, shootables,
   solids, lootSpots, pois, islandRadius, update(dt). */
window.LSWorld = (function () {
  const C = window.LS_CONFIG.world;

  // Points of interest, laid out for the 180m island.
  const POIS = [
    { name: 'GREYHAVEN', x: 37, z: 25 },
    { name: 'NORTHLINE', x: -74, z: -37 },
    { name: 'CEDAR RIDGE', x: 25, z: -87 },
    { name: 'BREAKWATER', x: 108, z: 59 },
    { name: 'SIGNAL STATION', x: -37, z: 93 },
    { name: 'OLD QUARRY', x: -93, z: 65 },
  ];

  function build(scene, renderer) {
    const island = window.LSIsland.createRealisticIsland(THREE, scene, POIS);
    const atmosphere = window.LSAtmosphere.createCinematicAtmosphere(THREE, scene, renderer);
    const groundHeight = island.terrainHeight;

    const colliders = [];
    const shootables = [island.terrain];
    const solids = [];
    const lootSpots = [];

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a3, roughness: 0.9 });
    const wallMat2 = new THREE.MeshStandardMaterial({ color: 0x8a7a63, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4d5152, roughness: 0.85 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x7a5238, roughness: 0.95 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2b2f31, roughness: 1 });

    function addBuilding(x, z, w, h, d, mat) {
      const y = groundHeight(x, z);
      if (y < 2.6) return null; // keep buildings out of the surf
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || wallMat);
      m.position.set(x, y + h / 2 - 0.15, z);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m); shootables.push(m); solids.push(m);
      const hw = w / 2, hd = d / 2;
      colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.5, d + 0.7), roofMat);
      roof.position.set(x, y + h + 0.1, z);
      roof.castShadow = true;
      scene.add(roof);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), doorMat);
      door.position.set(x, y + 1.25, z + hd + 0.03);
      scene.add(door);
      lootSpots.push({ x: x + hw + 3, z: z + hd + 2 }, { x: x - hw - 3, z: z - hd - 2 });
      return m;
    }

    // Greyhaven Town
    addBuilding(32, 20, 9, 5, 8); addBuilding(42, 27, 8, 4.5, 7, wallMat2);
    addBuilding(31, 32, 10, 5.5, 8); addBuilding(43, 17, 7, 4, 9, wallMat2);
    addBuilding(37, 38, 8, 4.5, 8);
    // Northline Industrial
    addBuilding(-69, -32, 22, 8, 12, rustMat); addBuilding(-82, -42, 16, 7, 10);
    addBuilding(-67, -46, 6, 3, 12, rustMat); addBuilding(-78, -28, 6, 3, 12, rustMat);
    // Cedar Ridge cabin
    addBuilding(22, -84, 8, 4.5, 7, wallMat2);
    // Breakwater Port
    addBuilding(104, 55, 12, 5, 8); addBuilding(113, 63, 8, 4, 10, wallMat2);
    (function lighthouse() {
      const x = 121, z = 73, y = groundHeight(x, z);
      if (y < 2.6) return;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 22, 10),
        new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8 }));
      t.position.set(x, y + 11, z); t.castShadow = true;
      scene.add(t); shootables.push(t); solids.push(t);
      colliders.push({ minX: x - 3, maxX: x + 3, minZ: z - 3, maxZ: z + 3 });
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 10),
        new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0xffd34d, emissiveIntensity: 0.7 }));
      lamp.position.set(x, y + 23, z); scene.add(lamp);
      lootSpots.push({ x: x - 7, z: z + 4 });
    })();
    // Signal Station
    addBuilding(-35, 89, 10, 5, 9); addBuilding(-43, 97, 8, 4.5, 8, wallMat2);
    (function antenna() {
      const x = -30, z = 99, y = groundHeight(x, z);
      if (y < 2.6) return;
      const a = new THREE.Mesh(new THREE.BoxGeometry(1.2, 34, 1.2), rustMat);
      a.position.set(x, y + 17, z); a.castShadow = true;
      scene.add(a); shootables.push(a);
      colliders.push({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 });
      lootSpots.push({ x: x + 5, z: z - 4 });
    })();
    // Old Quarry
    addBuilding(-88, 61, 14, 4, 10, rustMat); addBuilding(-99, 70, 10, 3.5, 8);

    // Supply crates (cover + loot)
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x6e5b3e, roughness: 0.95 });
    for (let i = 0; i < C.crateCount; i++) {
      const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 110;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = groundHeight(x, z);
      if (h < 2.6) continue;
      const s = 1.1 + Math.random() * 0.9;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      m.position.set(x, h + s / 2, z);
      m.rotation.y = Math.random() * Math.PI;
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m); shootables.push(m); solids.push(m);
      colliders.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2 });
      if (Math.random() < 0.5) lootSpots.push({ x: x + 2.2, z: z + 1.5 });
    }

    // Wild loot spots
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 110;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (groundHeight(x, z) > 2.6) lootSpots.push({ x, z });
    }

    function update(dt) {
      island.update(dt);
      atmosphere.update(dt);
    }

    return {
      groundHeight, colliders, shootables, solids, lootSpots,
      pois: POIS, islandRadius: island.settings.islandRadius,
      waterLevel: island.settings.waterLevel, update, atmosphere,
    };
  }

  function resolveCollisions(pos, radius, colliders) {
    let pushed = false;
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = c.minX - radius; else if (m === pr) pos.x = c.maxX + radius;
          else if (m === pt) pos.z = c.minZ - radius; else pos.z = c.maxZ + radius;
        }
        pushed = true;
      }
    }
    return pushed;
  }

  return { build, resolveCollisions, POIS };
})();

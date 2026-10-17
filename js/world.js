/* LAST SIGNAL — island, terrain, buildings, vegetation. All procedural. */
window.LSWorld = (function () {
  const C = window.LS_CONFIG.world;

  // --- Terrain height field (shared by physics, AI, placement) ---
  function groundHeight(x, z) {
    const d = Math.hypot(x, z);
    const R = C.islandRadius;
    let h = 24 * Math.exp(-(d * d) / (2 * 150 * 150));                    // central highland
    h += 6 * Math.sin(x * 0.021) * Math.cos(z * 0.024);                   // rolling variation
    h += 3 * Math.sin(x * 0.052 + 1.7) * Math.sin(z * 0.044 + 0.6);       // detail
    h += 7 * Math.exp(-((x + 130) * (x + 130) + (z - 90) * (z - 90)) / (2 * 70 * 70)); // west ridge
    const falloff = Math.max(0, 1 - Math.pow(Math.min(d / (R + 60), 1), 3));
    return (h - 4.5) * falloff - 1.6;
  }

  const POIS = [
    { name: 'GREYHAVEN', x: 60, z: 40 },
    { name: 'NORTHLINE', x: -120, z: -60 },
    { name: 'CEDAR RIDGE', x: 40, z: -140 },
    { name: 'BREAKWATER', x: 175, z: 95 },
    { name: 'SIGNAL STATION', x: -60, z: 150 },
    { name: 'OLD QUARRY', x: -150, z: 105 },
  ];

  function build(scene) {
    const colliders = [];   // {minX,maxX,minZ,maxZ}
    const shootables = [];  // meshes for hitscan (incl. terrain)
    const solids = [];      // meshes for camera collision (buildings/crates only)
    const lootSpots = [];

    // --- Lights & atmosphere ---
    scene.background = new THREE.Color(0x87a6c4);
    scene.fog = new THREE.Fog(0x87a6c4, 120, 620);

    const hemi = new THREE.HemisphereLight(0xbfd6e8, 0x4a5a44, 0.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe3b3, 1.05);
    sun.position.set(180, 220, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
    sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
    sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0006;
    scene.add(sun);

    // --- Terrain ---
    const SEG = 110, SIZE = C.terrainSize;
    const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    tg.rotateX(-Math.PI / 2);
    const pos = tg.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(0xcbb37f), cGrass = new THREE.Color(0x5d7d46),
          cGrassD = new THREE.Color(0x44603a), cRock = new THREE.Color(0x7d7a72),
          tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = groundHeight(x, z);
      pos.setY(i, h);
      if (h < 1.2) tmp.copy(cSand);
      else if (h > 16) tmp.copy(cRock);
      else tmp.copy(cGrass).lerp(cGrassD, Math.random() * 0.7);
      // slope-based rock
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tg.computeVertexNormals();
    const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    scene.add(terrain);
    shootables.push(terrain);

    // --- Water ---
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshStandardMaterial({ color: 0x1d4e6b, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.92 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = C.waterLevel;
    scene.add(water);

    // --- Buildings ---
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a3, roughness: 0.9 });
    const wallMat2 = new THREE.MeshStandardMaterial({ color: 0x8a7a63, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4d5152, roughness: 0.85 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x7a5238, roughness: 0.95 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2b2f31, roughness: 1 });

    function addBuilding(x, z, w, h, d, mat) {
      const y = groundHeight(x, z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || wallMat);
      m.position.set(x, y + h / 2 - 0.15, z);
      m.castShadow = true; m.receiveShadow = true;
      m.rotation.y = (Math.abs(x * 13 + z * 7) % 10) * 0.02; // slight variety
      scene.add(m); shootables.push(m); solids.push(m);
      const hw = w / 2, hd = d / 2;
      colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
      // roof trim
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.5, d + 0.7), roofMat);
      roof.position.set(x, y + h + 0.1, z);
      roof.castShadow = true;
      scene.add(roof);
      // door hint
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), doorMat);
      door.position.set(x, y + 1.25, z + hd + 0.03);
      scene.add(door);
      lootSpots.push({ x: x + hw + 3, z: z + hd + 2 }, { x: x - hw - 3, z: z - hd - 2 });
      return m;
    }

    // Greyhaven Town — houses
    addBuilding(52, 32, 9, 5, 8); addBuilding(68, 44, 8, 4.5, 7, wallMat2);
    addBuilding(50, 52, 10, 5.5, 8); addBuilding(70, 28, 7, 4, 9, wallMat2);
    addBuilding(60, 62, 8, 4.5, 8);
    // Northline Industrial — warehouses + containers
    addBuilding(-112, -52, 22, 8, 12, rustMat); addBuilding(-132, -68, 16, 7, 10);
    addBuilding(-108, -74, 6, 3, 12, rustMat); addBuilding(-126, -46, 6, 3, 12, rustMat);
    // Cedar Ridge — ranger cabin
    addBuilding(36, -136, 8, 4.5, 7, wallMat2);
    // Breakwater Port — sheds + lighthouse
    addBuilding(168, 88, 12, 5, 8); addBuilding(182, 102, 8, 4, 10, wallMat2);
    (function lighthouse() {
      const x = 196, z = 118, y = groundHeight(x, z);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 22, 10),
        new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8 }));
      t.position.set(x, y + 11, z); t.castShadow = true;
      scene.add(t); shootables.push(t);
      colliders.push({ minX: x - 3, maxX: x + 3, minZ: z - 3, maxZ: z + 3 });
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 10),
        new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0xffd34d, emissiveIntensity: 0.7 }));
      lamp.position.set(x, y + 23, z); scene.add(lamp);
      lootSpots.push({ x: x - 7, z: z + 4 });
    })();
    // Signal Station — comms facility
    addBuilding(-56, 144, 10, 5, 9); addBuilding(-70, 156, 8, 4.5, 8, wallMat2);
    (function antenna() {
      const x = -48, z = 160, y = groundHeight(x, z);
      const a = new THREE.Mesh(new THREE.BoxGeometry(1.2, 34, 1.2), rustMat);
      a.position.set(x, y + 17, z); a.castShadow = true;
      scene.add(a); shootables.push(a);
      colliders.push({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 });
      lootSpots.push({ x: x + 5, z: z - 4 });
    })();
    // Old Quarry — terraces
    addBuilding(-142, 98, 14, 4, 10, rustMat); addBuilding(-160, 112, 10, 3.5, 8);

    // --- Crates (cover + loot) ---
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x6e5b3e, roughness: 0.95 });
    for (let i = 0; i < C.crateCount; i++) {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 210;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = groundHeight(x, z);
      if (h < 1.5) continue;
      const s = 1.1 + Math.random() * 0.9;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      m.position.set(x, h + s / 2, z);
      m.rotation.y = Math.random() * Math.PI;
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m); shootables.push(m); solids.push(m);
      colliders.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2 });
      if (Math.random() < 0.5) lootSpots.push({ x: x + 2.2, z: z + 1.5 });
    }

    // --- Trees (instanced) ---
    function nearPOI(x, z, pad) {
      for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < pad) return true;
      return false;
    }
    const trunkG = new THREE.CylinderGeometry(0.35, 0.55, 3.2, 6);
    const canG = new THREE.ConeGeometry(2.6, 6.5, 8);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5b422c, roughness: 1 });
    const canM = new THREE.MeshStandardMaterial({ color: 0x3e5c33, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkG, trunkM, C.treeCount);
    const cans = new THREE.InstancedMesh(canG, canM, C.treeCount);
    trunks.castShadow = cans.castShadow = true;
    const dummy = new THREE.Object3D();
    let placed = 0, guard = 0;
    while (placed < C.treeCount && guard++ < 4000) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 240;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = groundHeight(x, z);
      if (h < 2 || h > 20 || nearPOI(x, z, 22)) continue;
      const s = 0.8 + Math.random() * 0.9;
      dummy.position.set(x, h + 1.6 * s, z); dummy.scale.setScalar(s);
      dummy.rotation.y = Math.random() * Math.PI; dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      dummy.position.set(x, h + (3.2 + 3.2) * s * 0.92, z); dummy.updateMatrix();
      cans.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    trunks.count = cans.count = placed;
    scene.add(trunks); scene.add(cans);

    // --- Rocks (instanced) ---
    const rockG = new THREE.DodecahedronGeometry(1.6, 0);
    const rockM = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: 1 });
    const rocks = new THREE.InstancedMesh(rockG, rockM, C.rockCount);
    rocks.castShadow = true;
    placed = 0; guard = 0;
    while (placed < C.rockCount && guard++ < 2000) {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 220;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = groundHeight(x, z);
      if (h < 1.2 || nearPOI(x, z, 14)) continue;
      const s = 0.7 + Math.random() * 1.6;
      dummy.position.set(x, h + 0.6 * s, z); dummy.scale.set(s, s * 0.75, s);
      dummy.rotation.set(Math.random(), Math.random() * 3, Math.random());
      dummy.updateMatrix();
      rocks.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    rocks.count = placed;
    scene.add(rocks);

    // extra loot spots in the wild
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 190;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (groundHeight(x, z) > 1.5 && !nearPOI(x, z, 10)) lootSpots.push({ x, z });
    }

    return { groundHeight, colliders, shootables, solids, lootSpots, pois: POIS, islandRadius: C.islandRadius };
  }

  // Circle vs AABB push-out. Mutates pos (THREE.Vector3). Returns true if pushed.
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
          // inside: push along smallest penetration axis
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

  return { build, groundHeight, resolveCollisions, POIS };
})();

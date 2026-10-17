/* LAST SIGNAL — Realistic Island Environment (Vesper Island).
   Adapted from the user's module: seeded terrain, ocean, instanced forest/rocks/grass. */
window.LSIsland = (function () {

  function createRealisticIsland(THREE, scene, poiList) {
    const environment = new THREE.Group();
    environment.name = "VesperIsland";
    scene.add(environment);

    const SETTINGS = {
      islandRadius: 180,
      terrainSegments: 180,
      treeCount: 220,
      rockCount: 130,
      grassCount: 1800,
      waterLevel: 2
    };

    // ---------- LIGHTING (base; cinematic atmosphere overrides) ----------
    const ambient = new THREE.HemisphereLight(0xc8dce8, 0x454536, 1.0);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffe1b5, 1.2);
    sun.position.set(-90, 140, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
    sun.shadow.bias = -0.00015;
    scene.add(sun);

    // ---------- MATERIALS ----------
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x49372a, roughness: 1 });
    const leafMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x304b32, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x3c6038, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x526d3d, roughness: 1 })
    ];
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x555952, roughness: 0.96 });

    // ---------- SEEDED RANDOMNESS ----------
    let seed = 83721;
    function random() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    function nearPOI(x, z, pad) {
      for (const p of poiList) if (Math.hypot(x - p.x, z - p.z) < pad) return true;
      return false;
    }

    // ---------- TERRAIN HEIGHT ----------
    function terrainHeight(x, z) {
      const radius = Math.sqrt(x * x + z * z);
      const R = SETTINGS.islandRadius;
      if (radius >= R) return SETTINGS.waterLevel - 2;
      const edge = Math.max(0, Math.min(1, 1 - radius / R));
      const beach = Math.max(0, Math.min(1, (radius - 140) / 25));
      const hills =
        Math.sin(x * 0.035) * 5 +
        Math.cos(z * 0.028) * 7 +
        Math.sin((x + z) * 0.055) * 3 +
        Math.cos((x - z) * 0.018) * 5;
      const centralMountain = 30 * Math.exp(-(x * x + z * z) / 3500);
      const secondaryHill = 13 * Math.exp(-((x - 55) * (x - 55) + (z + 35) * (z + 35)) / 1200);
      const noise = hills * edge;
      const inlandHeight = 5 + centralMountain + secondaryHill + noise;
      const shoreline = SETTINGS.waterLevel + 1.5;
      const height = shoreline + edge * (inlandHeight - shoreline);
      return radius > 140 ? shoreline + (height - shoreline) * (1 - beach * 0.75) : height;
    }

    // ---------- TERRAIN MESH ----------
    const R = SETTINGS.islandRadius, N = SETTINGS.terrainSegments;
    const vertices = [], indices = [], colors = [];
    const color = new THREE.Color();
    for (let iz = 0; iz <= N; iz++) {
      for (let ix = 0; ix <= N; ix++) {
        const x = (ix / N - 0.5) * 2 * R;
        const z = (iz / N - 0.5) * 2 * R;
        const radius = Math.sqrt(x * x + z * z);
        const y = terrainHeight(x, z);
        vertices.push(x, y, z);
        if (radius > 145) color.set(0xc2b184);
        else if (y > 25) color.set(0x666a58);
        else color.set(0x49643a);
        const variation = 0.94 + random() * 0.12;
        color.multiplyScalar(variation);
        colors.push(color.r, color.g, color.b);
        if (ix < N && iz < N) {
          const a = iz * (N + 1) + ix, b = a + 1, c = a + N + 1, d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const terrainGeometry = new THREE.BufferGeometry();
    terrainGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    terrainGeometry.setIndex(indices);
    terrainGeometry.computeVertexNormals();
    const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0
    }));
    terrain.name = "IslandTerrain";
    terrain.receiveShadow = true;
    environment.add(terrain);

    // ---------- OCEAN ----------
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x285c70, roughness: 0.24, metalness: 0.12,
        transparent: true, opacity: 0.94
      })
    );
    water.name = "Ocean";
    water.rotation.x = -Math.PI / 2;
    water.position.y = SETTINGS.waterLevel;
    water.receiveShadow = true;
    environment.add(water);

    // ---------- ROCKS (instanced) ----------
    const dummy = new THREE.Object3D();
    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    const rocks = new THREE.InstancedMesh(rockGeo, rockMaterial, SETTINGS.rockCount);
    rocks.castShadow = true; rocks.receiveShadow = true;
    let ri = 0;
    for (let i = 0; i < SETTINGS.rockCount && ri < SETTINGS.rockCount; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 95 + random() * 80;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      if (nearPOI(x, z, 14)) continue;
      const y = terrainHeight(x, z);
      const size = 0.5 + random() * 2.6;
      dummy.position.set(x, y + size * 0.25, z);
      dummy.scale.set(size * (0.7 + random()), size * (0.5 + random() * 0.7), size * (0.7 + random()));
      dummy.rotation.set(random(), random() * 3, random());
      dummy.updateMatrix();
      rocks.setMatrixAt(ri++, dummy.matrix);
    }
    rocks.count = ri;
    environment.add(rocks);

    // ---------- FOREST (instanced: 1 trunk + 3 layers x 3 leaf materials) ----------
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 3.5, 7);
    const canopyGeo = new THREE.ConeGeometry(2.5, 6, 8);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMaterial, SETTINGS.treeCount);
    const canopies = [];
    for (let m = 0; m < 3; m++) {
      canopies[m] = [];
      for (let l = 0; l < 3; l++) {
        const im = new THREE.InstancedMesh(canopyGeo, leafMaterials[m], SETTINGS.treeCount);
        im.castShadow = true;
        canopies[m][l] = im; canopies[m][l].userData.count = 0;
        environment.add(im);
      }
    }
    trunks.castShadow = true;
    let ti = 0;
    for (let i = 0; i < SETTINGS.treeCount; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 25 + Math.sqrt(random()) * 125;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      if (Math.sqrt(x * x + z * z) > 150 || nearPOI(x, z, 20)) continue;
      const y = terrainHeight(x, z);
      if (y < SETTINGS.waterLevel + 3) continue;
      const scale = 0.7 + random() * 1.1;
      const m = Math.floor(random() * 3);
      dummy.rotation.set(0, random() * Math.PI * 2, 0);
      dummy.position.set(x, y + 1.5 * scale, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(ti, dummy.matrix);
      for (let l = 0; l < 3; l++) {
        dummy.position.set(x, y + (3.1 + l * 1.35) * scale, z);
        dummy.scale.set(scale * (1 - l * 0.13), scale * 0.85, scale * (1 - l * 0.13));
        dummy.updateMatrix();
        const cm = canopies[m][l];
        cm.setMatrixAt(cm.userData.count++, dummy.matrix);
      }
      ti++;
    }
    trunks.count = ti;
    for (let m = 0; m < 3; m++) for (let l = 0; l < 3; l++) canopies[m][l].count = canopies[m][l].userData.count;
    environment.add(trunks);

    // ---------- GRASS (instanced) ----------
    const grassGeo = new THREE.ConeGeometry(0.12, 0.8, 3);
    grassGeo.translate(0, 0.4, 0);
    const grass = new THREE.InstancedMesh(grassGeo,
      new THREE.MeshStandardMaterial({ color: 0x526b3b, roughness: 1 }), SETTINGS.grassCount);
    let gi = 0;
    for (let i = 0; i < SETTINGS.grassCount * 3 && gi < SETTINGS.grassCount; i++) {
      const x = (random() - 0.5) * R * 1.65, z = (random() - 0.5) * R * 1.65;
      if (Math.sqrt(x * x + z * z) > 135) continue;
      const y = terrainHeight(x, z);
      if (y < SETTINGS.waterLevel + 3) continue;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.25);
      dummy.scale.setScalar(0.4 + random() * 0.9);
      dummy.updateMatrix();
      grass.setMatrixAt(gi++, dummy.matrix);
    }
    grass.count = gi;
    grass.instanceMatrix.needsUpdate = true;
    environment.add(grass);

    // ---------- ANIMATION ----------
    let elapsed = 0;
    function update(deltaTime) {
      elapsed += deltaTime;
      water.position.y = SETTINGS.waterLevel + Math.sin(elapsed * 0.65) * 0.08;
      water.rotation.z = Math.sin(elapsed * 0.12) * 0.002;
    }

    return { group: environment, terrain, water, update, terrainHeight, settings: SETTINGS };
  }

  return { createRealisticIsland };
})();

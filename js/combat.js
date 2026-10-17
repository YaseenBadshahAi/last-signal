/* LAST SIGNAL — hitscan combat, tracers, muzzle flash, loot pickups */
window.COMBAT = (function () {
  const C = window.LS_CONFIG;
  let scene, world;
  const tracers = [];
  let flashLight = null, flashT = 0;
  const pickups = [];
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

  function init(scn, wld) {
    scene = scn; world = wld;
    flashLight = new THREE.PointLight(0xffc36b, 0, 18);
    scene.add(flashLight);
  }

  function muzzleWorld(actor) {
    actor.rig.parts.muzzle.getWorldPosition(_v1);
    return _v1;
  }

  function spawnTracer(from, to, color) {
    const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(g, m);
    scene.add(line);
    tracers.push({ line, life: C.fx.tracerLife });
  }

  function flash(pos) {
    flashLight.position.copy(pos);
    flashLight.intensity = 3.2;
    flashT = 0.06;
  }

  function actorMeshes(actors) {
    const arr = [];
    for (const a of actors) {
      if (!a.alive) continue;
      arr.push(a.rig.hitbox, a.rig.headBox);
    }
    return arr;
  }

  // ---------------- player shooting ----------------
  function playerShoot(player, camera, actors) {
    const w = player.weapon;
    if (!player.alive || player.fireCd > 0 || player.reloading > 0 || player.healing > 0) return;
    if (w.mag <= 0) { SFX.reload(); player.startReload(); return; }
    w.mag--; player.fireCd = w.fireInterval;
    player.shots++;
    SFX.shoot(w.id);

    const rc = new THREE.Raycaster();
    rc.setFromCamera({ x: 0, y: 0 }, camera);
    // spread
    const spread = player.aiming ? w.aimSpread : w.spread;
    rc.ray.direction.x += (Math.random() - 0.5) * spread * 2;
    rc.ray.direction.y += (Math.random() - 0.5) * spread * 2;
    rc.ray.direction.z += (Math.random() - 0.5) * spread * 2;
    rc.ray.direction.normalize();
    rc.far = w.range;

    const targets = world.shootables.concat(actorMeshes(actors));
    const hits = rc.intersectObjects(targets, false);
    const from = muzzleWorld(player).clone();
    let end;
    if (hits.length) {
      const h = hits[0];
      end = h.point.clone();
      const ud = h.object.userData;
      if (ud.actor && ud.actor.alive && !ud.dead) {
        const a = ud.actor;
        const fall = h.distance > w.range * 0.6 ? 0.65 : 1;
        const dmg = w.damage * fall * (ud.isHead ? w.headMult : 1);
        player.dmgDealt += dmg; player.hits++;
        a.takeDamage(dmg, player);
        window.UI.hitmarker(!a.alive);
        SFX.hit();
      } else {
        // impact dust puff
        spawnTracer(from, end, 0x999999);
      }
    } else {
      end = rc.ray.origin.clone().addScaledVector(rc.ray.direction, w.range);
    }
    spawnTracer(from, end, w.tracer);
    flash(from);
    player.pitch += w.kick * (player.aiming ? 0.6 : 1);
  }

  // ---------------- bot shooting ----------------
  function botShoot(bot, target, dist) {
    if (!bot.alive || !target.alive) return;
    const from = muzzleWorld(bot).clone();
    const tSpeed = Math.hypot(target.vel.x, target.vel.z);
    const chance = Math.max(0.07, Math.min(0.55, 0.5 - dist * 0.007 - tSpeed * 0.015));
    const dmg = C.bots.damage[0] + Math.random() * (C.bots.damage[1] - C.bots.damage[0]);
    _v2.set(target.pos.x, target.pos.y + 1.3, target.pos.z);
    if (Math.random() < chance) {
      spawnTracer(from, _v2.clone(), 0xff9a5c);
      target.takeDamage(dmg, bot);
    } else {
      _v3.set(_v2.x + (Math.random() - 0.5) * 4, _v2.y + (Math.random() - 0.5) * 2.5, _v2.z + (Math.random() - 0.5) * 4);
      spawnTracer(from, _v3.clone(), 0xff9a5c);
    }
    flash(from);
    if (target === window.GAME.player) SFX.enemyShoot(dist);
  }

  // ---------------- loot pickups ----------------
  const PICKUP_STYLE = {
    rifle:  { color: 0x67e8f9, label: 'RIFLE', geo: () => new THREE.BoxGeometry(0.9, 0.25, 0.25) },
    medkit: { color: 0x7ef0a8, label: 'MEDKIT', geo: () => new THREE.BoxGeometry(0.5, 0.35, 0.5) },
    ammo:   { color: 0xffd34d, label: 'AMMO', geo: () => new THREE.BoxGeometry(0.4, 0.3, 0.55) },
  };

  function spawnPickup(type, x, z) {
    const st = PICKUP_STYLE[type];
    const y = world.groundHeight(x, z);
    const grp = new THREE.Group();
    const box = new THREE.Mesh(st.geo(), new THREE.MeshStandardMaterial({
      color: st.color, emissive: st.color, emissiveIntensity: 0.45, roughness: 0.4 }));
    box.position.y = 0.8; box.castShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 24),
      new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    grp.add(box); grp.add(ring);
    grp.position.set(x, y, z);
    grp.userData = { type, label: st.label, box, baseY: y, phase: Math.random() * 6 };
    scene.add(grp);
    pickups.push(grp);
    return grp;
  }

  function clearPickups() {
    for (const p of pickups) scene.remove(p);
    pickups.length = 0;
  }

  function nearestPickup(player, maxD) {
    let best = null, bd = maxD;
    for (const p of pickups) {
      const d = Math.hypot(p.position.x - player.pos.x, p.position.z - player.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function applyPickup(player, p) {
    const type = p.userData.type;
    if (type === 'rifle') {
      if (player.weapons.length > 1) return 'already have';
      const w = Object.assign({}, C.weapons.rifle);
      w.mag = w.magSize; w.reserve = 60;
      player.weapons.push(w);
    } else if (type === 'medkit') {
      player.medkits++;
    } else if (type === 'ammo') {
      const w = player.weapons[player.cur];
      w.reserve += 30;
    }
    scene.remove(p);
    pickups.splice(pickups.indexOf(p), 1);
    SFX.pickup();
    return type;
  }

  function scatterLoot() {
    clearPickups();
    const spots = world.lootSpots.slice();
    // shuffle
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    let i = 0;
    const take = n => spots.slice(i, i += n);
    take(C.loot.rifleSpawns).forEach(s => spawnPickup('rifle', s.x, s.z));
    take(C.loot.medkitSpawns).forEach(s => spawnPickup('medkit', s.x, s.z));
    take(C.loot.ammoSpawns).forEach(s => spawnPickup('ammo', s.x, s.z));
  }

  function update(dt, time) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / C.fx.tracerLife) * 0.95;
      if (t.life <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose(); t.line.material.dispose();
        tracers.splice(i, 1);
      }
    }
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) flashLight.intensity = 0;
    }
    for (const p of pickups) {
      p.userData.box.rotation.y += dt * 1.6;
      p.position.y = p.userData.baseY + Math.sin(time * 2 + p.userData.phase) * 0.12 + 0.1;
    }
  }

  return { init, playerShoot, botShoot, spawnPickup, clearPickups, nearestPickup, applyPickup, scatterLoot, update, pickups };
})();

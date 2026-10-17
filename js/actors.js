/* LAST SIGNAL — player & AI actors. Procedural low-poly humanoids, no assets. */
(function () {
  const C = window.LS_CONFIG;

  // Wraps the realistic tactical soldier into a game rig:
  // { group, parts:{muzzle}, hitbox, headBox, mats }.
  // The model's own updateAnimation drives the walk cycle; animateRig()
  // below calls it while preserving the actor's terrain height
  // (the model's bob writes position.y absolutely).
  function buildSoldierRig(accent) {
    const g = window.createSoldier(THREE, accent);
    const ud = g.userData;

    // Swap the soldier's simple rifle for the detailed tactical rifle.
    // The tactical model points along -Z; flip it to the soldier's +Z forward.
    ud.rifle.visible = false;
    const tac = window.LSRifle.buildTacticalRifle(THREE);
    tac.group.position.set(0.10, 1.40, 0.38);
    tac.group.rotation.set(-0.08, Math.PI, -0.06);
    g.add(tac.group);

    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 1.0),
      new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = 1.0; g.add(hitbox);
    const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshBasicMaterial({ visible: false }));
    headBox.position.y = 1.98; g.add(headBox);

    const mats = new Set();
    g.traverse(o => {
      if (o.isMesh) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => { if (m && m.emissive) mats.add(m); });
      }
    });
    return {
      group: g,
      parts: {
        muzzle: tac.muzzle, flashMesh: tac.flashMesh, flashLight: tac.flashLight,
        rifle: tac.group, magazine: tac.magazine,
        rifleBase: { x: 0.10, y: 1.40, z: 0.38 },
      },
      hitbox, headBox, mats: Array.from(mats),
      recoil: 0, flashT: 0,
    };
  }

  function animateRig(rig, dt, moving, sprinting) {
    const baseY = rig.group.position.y;
    rig.group.userData.updateAnimation(dt, moving, sprinting);
    rig.group.position.y = baseY + rig.group.position.y;
  }

  // Rifle feel: recoil kick, muzzle flash decay, reload dip.
  // reloadT01: 0..1 progress of reload, or -1 when not reloading.
  function updateWeaponPose(rig, dt, reloadT01) {
    rig.recoil = Math.max(0, rig.recoil - dt * 5);
    rig.flashT = Math.max(0, rig.flashT - dt);
    const rp = rig.parts, rb = rp.rifleBase;
    rp.rifle.position.z = rb.z + rig.recoil * 0.13;
    let dip = 0;
    if (reloadT01 >= 0) dip = Math.sin(reloadT01 * Math.PI);
    rp.rifle.position.y = rb.y - dip * 0.16;
    rp.rifle.rotation.x = -0.08 + dip * 0.35;
    rp.flashMesh.visible = rig.flashT > 0;
    rp.flashLight.intensity = rig.flashT > 0 ? 6 : 0;
  }

  const _ctarget = new THREE.Vector3(), _cdesired = new THREE.Vector3(),
        _cdir = new THREE.Vector3(), _crc = new THREE.Raycaster();

  // ---------------- PLAYER ----------------
  class Player {
    constructor(scene, world) {
      this.world = world;
      this.rig = buildSoldierRig(0x2e8f9e); // cyan-accented helmet & plate carrier
      scene.add(this.rig.group);
      this.pos = this.rig.group.position;
      this.vel = new THREE.Vector3();
      this.yaw = 0; this.pitch = -0.08;
      this.hp = C.player.hp; this.maxHp = C.player.hp;
      this.alive = true;
      this.radius = C.player.radius;
      this.grounded = true;
      this.weapons = [Object.assign({}, C.weapons.pistol)];
      this.weapons[0].mag = this.weapons[0].magSize;
      this.weapons[0].reserve = this.weapons[0].reserveStart;
      this.cur = 0;
      this.medkits = 0;
      this.reloading = 0; this.healing = 0;
      this.fireCd = 0;
      this.aiming = false;
      this.kills = 0; this.dmgDealt = 0; this.shots = 0; this.hits = 0;
      this.spawnTime = 0;
      // spawn on the southern beach
      this.pos.set(15, 0, 125);
      this.pos.y = world.groundHeight(this.pos.x, this.pos.z);
      this.rig.hitbox.userData.actor = this;
      this.rig.headBox.userData.actor = this;
      this.rig.headBox.userData.isHead = true;
    }
    get weapon() { return this.weapons[this.cur]; }
    speed2D() { return Math.hypot(this.vel.x, this.vel.z); }

    update(dt, input, cam) {
      if (!this.alive) return;
      const P = C.player;
      // look
      const sens = this.aiming ? C.camera.aimSens : C.camera.sens;
      this.yaw -= input.mdx * sens;
      this.pitch -= input.mdy * sens;
      this.pitch = Math.max(C.camera.pitchMin, Math.min(C.camera.pitchMax, this.pitch));
      input.mdx = 0; input.mdy = 0;

      // move: wish direction from input rotated by yaw
      // forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))
      let ix = 0, iz = 0;
      if (input.keys.w) iz -= 1; if (input.keys.s) iz += 1;
      if (input.keys.a) ix -= 1; if (input.keys.d) ix += 1;
      const sprint = input.keys.shift && iz < 0 && !this.aiming;
      const maxSp = this.aiming ? P.aimSpeed : (sprint ? P.sprintSpeed : P.walkSpeed);
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const dirX = cy * ix + sy * iz;
      const dirZ = -sy * ix + cy * iz;
      const dl = Math.hypot(dirX, dirZ);
      const hasInput = dl > 0.01;
      if (hasInput && this.reloading <= 0 && this.healing <= 0) {
        const tvx = (dirX / dl) * maxSp, tvz = (dirZ / dl) * maxSp;
        const k = Math.min(1, P.accel * dt / maxSp * 3);
        this.vel.x += (tvx - this.vel.x) * Math.min(1, k);
        this.vel.z += (tvz - this.vel.z) * Math.min(1, k);
      } else {
        const f = Math.max(0, 1 - P.friction * dt / Math.max(this.speed2D(), 1));
        this.vel.x *= f; this.vel.z *= f;
        if (this.speed2D() < 0.05) { this.vel.x = 0; this.vel.z = 0; }
      }

      // jump / gravity
      const gh = this.world.groundHeight(this.pos.x, this.pos.z);
      if (this.grounded && input.keys.space) {
        this.vel.y = P.jumpVel; this.grounded = false; input.keys.space = false;
      }
      this.vel.y -= P.gravity * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vel.y * dt;

      window.LSWorld.resolveCollisions(this.pos, this.radius, this.world.colliders);
      // keep out of deep water (ocean surface at y=2)
      if (this.world.groundHeight(this.pos.x, this.pos.z) < 0.8) {
        this.pos.x -= this.vel.x * dt; this.pos.z -= this.vel.z * dt;
        this.vel.x *= -0.2; this.vel.z *= -0.2;
      }
      const g2 = this.world.groundHeight(this.pos.x, this.pos.z);
      if (this.pos.y <= g2) { this.pos.y = g2; this.vel.y = 0; this.grounded = true; }
      else if (this.pos.y > g2 + 0.05) this.grounded = false;

      // timers
      this.fireCd = Math.max(0, this.fireCd - dt);
      if (this.reloading > 0) {
        this.reloading -= dt;
        if (this.reloading <= 0) {
          const w = this.weapon;
          const need = w.magSize - w.mag, take = Math.min(need, w.reserve);
          w.mag += take; w.reserve -= take;
        }
      }
      if (this.healing > 0) {
        this.healing -= dt;
        if (this.healing <= 0) this.hp = Math.min(this.maxHp, this.hp + C.loot.medkitHeal);
      }

      // pose
      this.rig.group.rotation.y = this.yaw + Math.PI;
      const sp = this.speed2D();
      animateRig(this.rig, dt, sp > 0.6, sp > 9);
      const w = this.weapon;
      updateWeaponPose(this.rig, dt,
        this.reloading > 0 ? 1 - this.reloading / w.reloadTime : -1);

      // third-person over-shoulder camera
      const dist = this.aiming ? C.camera.aimDist : C.camera.dist;
      const cp = Math.cos(this.pitch), snp = Math.sin(this.pitch);
      const sy2 = Math.sin(this.yaw), cy2 = Math.cos(this.yaw);
      const sh = C.camera.shoulder * (this.aiming ? 0.55 : 1);
      _ctarget.set(this.pos.x, this.pos.y + 2.0, this.pos.z);
      // behind = +(sin yaw, cos yaw); right = (cos yaw, -sin yaw)
      _cdesired.set(
        _ctarget.x + sy2 * cp * dist + cy2 * sh,
        _ctarget.y - snp * dist + 0.5,
        _ctarget.z + cy2 * cp * dist - sy2 * sh
      );
      if (_cdesired.y < this.pos.y + 0.5) _cdesired.y = this.pos.y + 0.5;
      _cdir.copy(_cdesired).sub(_ctarget);
      const clen = _cdir.length();
      _cdir.normalize();
      _crc.set(_ctarget, _cdir);
      _crc.far = clen;
      const chits = _crc.intersectObjects(this.world.solids, false);
      const finalLen = chits.length ? Math.max(0.9, chits[0].distance - 0.35) : clen;
      cam.position.copy(_ctarget).addScaledVector(_cdir, finalLen);
      // look toward aim point
      const aimD = 40;
      cam.lookAt(
        this.pos.x - sy2 * cp * aimD,
        this.pos.y + 2.0 + snp * aimD,
        this.pos.z - cy2 * cp * aimD
      );
    }

    takeDamage(dmg) {
      if (!this.alive) return;
      this.hp -= dmg;
      SFX.hurt();
      window.UI.damageFlash();
      if (this.hp <= 0) { this.hp = 0; this.alive = false; this.die(); }
    }
    die() {
      this.rig.group.rotation.x = -Math.PI / 2;
      this.rig.group.position.y = this.world.groundHeight(this.pos.x, this.pos.z) + 0.4;
    }
    heal() {
      if (this.medkits > 0 && this.hp < this.maxHp && this.healing <= 0 && this.reloading <= 0) {
        this.medkits--; this.healing = C.loot.healTime; SFX.heal();
      }
    }
    startReload() {
      const w = this.weapon;
      if (this.reloading <= 0 && w.mag < w.magSize && w.reserve > 0) {
        this.reloading = w.reloadTime; SFX.reload();
      }
    }
  }

  // ---------------- BOT ----------------
  const BOT_NAMES = ['Vex', 'Mara', 'Koda', 'Rook', 'Sable', 'Juno', 'Pip', 'Ash'];

  class Bot {
    constructor(scene, world, idx, actors) {
      this.world = world; this.actors = actors;
      this.name = BOT_NAMES[idx % BOT_NAMES.length];
      this.rig = buildSoldierRig();
      scene.add(this.rig.group);
      this.pos = this.rig.group.position;
      this.vel = new THREE.Vector3();
      const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 80;
      this.pos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      this.pos.y = world.groundHeight(this.pos.x, this.pos.z);
      this.hp = C.bots.hp; this.alive = true;
      this.yaw = Math.random() * Math.PI * 2;
      this.state = 'wander';
      this.target = null;           // actor being engaged
      this.wanderTarget = new THREE.Vector3(this.pos.x, 0, this.pos.z);
      this.percT = Math.random() * 0.3;
      this.shootT = 1 + Math.random() * 2;
      this.burstLeft = 0;
      this.strafeDir = 1; this.strafeT = 0;
      this.flashT = 0;
      this.weapon = { damage: 10, range: C.bots.engageRange };
      this.rig.hitbox.userData.actor = this;
      this.rig.headBox.userData.actor = this;
      this.rig.headBox.userData.isHead = true;
      this.deadT = 0;
    }

    hasLOS(other) {
      const a = new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z);
      const b = new THREE.Vector3(other.pos.x, other.pos.y + 1.4, other.pos.z);
      const dir = b.clone().sub(a); const dist = dir.length(); dir.normalize();
      const rc = new THREE.Raycaster(a, dir, 0, dist);
      const hits = rc.intersectObjects(this.world.shootables, false);
      return hits.length === 0;
    }

    nearestEnemy() {
      let best = null, bd = C.bots.sightRange;
      for (const o of this.actors) {
        if (o === this || !o.alive) continue;
        const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
        if (d < bd) { bd = d; best = o; }
      }
      return best ? { actor: best, dist: bd } : null;
    }

    takeDamage(dmg, fromPlayer) {
      if (!this.alive) return;
      this.hp -= dmg; this.flashT = window.LS_CONFIG.fx.hitFlashTime;
      // getting shot reveals attacker
      if (fromPlayer && fromPlayer.alive && (!this.target || Math.random() < 0.6)) {
        this.target = fromPlayer; this.state = 'engage';
      }
      if (this.hp <= 0) {
        this.hp = 0; this.alive = false; this.state = 'dead'; this.deadT = 0;
        this.rig.group.rotation.x = -Math.PI / 2;
        this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z) + 0.4;
        this.rig.hitbox.visible = false; // keep mesh but disable raycast via flag
        this.rig.hitbox.userData.dead = true;
        this.rig.headBox.userData.dead = true;
        if (fromPlayer === window.GAME.player) {
          window.GAME.player.kills++;
          window.UI.killfeed('YOU', '⌖', this.name);
          SFX.kill();
        } else if (fromPlayer === 'zone') {
          window.UI.killfeed('SIGNAL COLLAPSE', '⌖', this.name);
        } else if (fromPlayer && fromPlayer !== this) {
          window.UI.killfeed(fromPlayer.name || '???', '⌖', this.name);
        }
        window.UI.updateAlive();
        // drop loot
        window.GAME.spawnLootDrop(this.pos.x, this.pos.z);
      }
    }

    update(dt, zone) {
      if (!this.alive) { this.deadT += dt; return; }
      const B = C.bots;
      this.flashT = Math.max(0, this.flashT - dt);

      // perception tick
      this.percT -= dt;
      if (this.percT <= 0) {
        this.percT = 0.3;
        const seen = this.nearestEnemy();
        if (seen && this.hasLOS(seen.actor)) {
          this.target = seen.actor; this.state = 'engage';
        } else if (this.state === 'engage' && (!this.target || !this.target.alive)) {
          this.target = null; this.state = 'wander';
        }
      }

      // zone pressure: head to safety when outside
      const zc = zone.center, zr = zone.radius;
      const dz = Math.hypot(this.pos.x - zc.x, this.pos.z - zc.y);
      let mx = 0, mz = 0, wantSpeed = B.speed * 0.55;

      if (this.state === 'engage' && this.target && this.target.alive) {
        const t = this.target;
        const dx = t.pos.x - this.pos.x, dzz = t.pos.z - this.pos.z;
        const d = Math.hypot(dx, dzz) || 1;
        this.yaw = Math.atan2(-dx, -dzz); // face target (model front = local +z)
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 1 + Math.random() * 1.5; this.strafeDir *= -1; }
        // keep ideal range 14–30
        let adv = 0;
        if (d > 30) adv = 1; else if (d < 12) adv = -1;
        const px = -dzz / d * this.strafeDir, pz = dx / d * this.strafeDir;
        mx = (dx / d) * adv * 0.7 + px * 0.7;
        mz = (dzz / d) * adv * 0.7 + pz * 0.7;
        wantSpeed = B.speed;
        // shooting
        this.shootT -= dt;
        if (this.shootT <= 0 && d < B.engageRange) {
          if (this.burstLeft <= 0) {
            this.burstLeft = B.burstSize[0] + Math.floor(Math.random() * (B.burstSize[1] - B.burstSize[0]));
            this.shootT = B.reactionTime[0] + Math.random() * (B.reactionTime[1] - B.reactionTime[0]);
          } else {
            this.burstLeft--;
            this.shootT = 0.16 + Math.random() * 0.1;
            window.COMBAT.botShoot(this, t, d);
          }
        }
        if (d > B.engageRange * 1.4) { this.target = null; this.state = 'wander'; }
      } else {
        // wander / rotate to zone
        if (dz > zr * 0.9) {
          this.wanderTarget.set(zc.x + (Math.random() - 0.5) * zr, 0, zc.y + (Math.random() - 0.5) * zr);
          wantSpeed = B.speed;
        } else if (this.pos.distanceTo(this.wanderTarget) < 6 || Math.random() < 0.002) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * B.wanderRadius;
          this.wanderTarget.set(
            Math.max(-140, Math.min(140, this.pos.x + Math.cos(a) * r)), 0,
            Math.max(-140, Math.min(140, this.pos.z + Math.sin(a) * r)));
        }
        const dx = this.wanderTarget.x - this.pos.x, dzz = this.wanderTarget.z - this.pos.z;
        const d = Math.hypot(dx, dzz) || 1;
        mx = dx / d; mz = dzz / d;
        this.yaw = Math.atan2(-mx, -mz);
      }

      // integrate
      const ml = Math.hypot(mx, mz) || 1;
      const k = Math.min(1, 8 * dt);
      this.vel.x += ((mx / ml) * wantSpeed - this.vel.x) * k;
      this.vel.z += ((mz / ml) * wantSpeed - this.vel.z) * k;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      window.LSWorld.resolveCollisions(this.pos, 0.55, this.world.colliders);
      if (this.world.groundHeight(this.pos.x, this.pos.z) < 0.8) {
        this.pos.x -= this.vel.x * dt * 2; this.pos.z -= this.vel.z * dt * 2;
      }
      this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);

      // pose
      this.rig.group.rotation.y = this.yaw + Math.PI;
      this.rig.group.rotation.x = 0;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      animateRig(this.rig, dt, sp > 0.8, false);
      updateWeaponPose(this.rig, dt, -1);
      // hit flash
      const f = this.flashT > 0;
      for (const m of this.rig.mats) m.emissive.setRGB(f ? 0.55 : 0, f ? 0.14 : 0, f ? 0.11 : 0);
    }
  }

  window.LSPlayer = Player;
  window.LSBot = Bot;
})();

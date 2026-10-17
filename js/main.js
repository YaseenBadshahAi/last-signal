/* LAST SIGNAL — game state, input, main loop */
window.GAME = (function () {
  const C = window.LS_CONFIG;
  let renderer, scene, camera, world, player, bots, zone;
  let actors = [];
  let state = 'menu';
  let clock, elapsed = 0, mmT = 0;
  let pendingPickup = null;

  const input = { keys: {}, mdx: 0, mdy: 0, firing: false };

  function aliveActors() { return actors.filter(a => a.alive); }

  // ---------------- setup ----------------
  async function init() {
    // Load the rigged soldier first (actors need the model bytes)
    window.LSRig = window.LSRig || {};
    const menuEl = document.getElementById('menu');
    const loadingEl = document.createElement('div');
    loadingEl.id = 'loading-soldier';
    loadingEl.textContent = 'LOADING SOLDIER…';
    loadingEl.style.cssText = 'margin-top:18px;color:#67e8f9;letter-spacing:3px;font-size:13px;animation:blink 1.2s infinite';
    if (menuEl) menuEl.appendChild(loadingEl);
    if (!window.LSRig.glbBuffer) {
      try {
        window.LSRig.glbBuffer = await window.LSGLB.loadBuffer('assets/soldier_rigged.glb');
      } catch (e) {
        loadingEl.textContent = 'FAILED TO LOAD SOLDIER MODEL';
        loadingEl.style.color = '#ff5d5d';
        throw e;
      }
    }
    if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);

    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1500);

    world = window.LSWorld.build(scene, renderer);
    window.COMBAT.init(scene, world);
    zone = new window.LSZone(scene);

    spawnActors();
    window.COMBAT.scatterLoot();
    bindInput();
    bindButtons();
    window.UI.showScreen('menu');

    // menu cinematic camera
    camera.position.set(90, 70, 190);
    camera.lookAt(0, 10, 0);

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    clock = new THREE.Clock();
    renderer.setAnimationLoop(tick);
  }

  function spawnActors() {
    for (const a of actors) scene.remove(a.rig.group);
    player = new window.LSPlayer(scene, world);
    bots = [];
    for (let i = 0; i < C.bots.count; i++) bots.push(new window.LSBot(scene, world, i, null));
    actors = [player].concat(bots);
    for (const b of bots) b.actors = actors;
    // wire hitboxes
    for (const a of actors) {
      a.rig.hitbox.userData.actor = a;
      a.rig.headBox.userData.actor = a;
    }
  }

  function reset() {
    spawnActors();
    zone.reset();
    window.COMBAT.scatterLoot();
    document.getElementById('killfeed').innerHTML = '';
    elapsed = 0;
    input.firing = false;
    window.UI.updateAlive();
  }

  // ---------------- state ----------------
  function lockPointer() {
    const el = renderer.domElement;
    if (document.pointerLockElement !== el) el.requestPointerLock();
  }

  function start() {
    reset();
    state = 'playing';
    window.UI.showScreen('hud');
    window.SFX.unlock(); window.SFX.uiClick();
    lockPointer();
    window.UI.centerMsg('FIND A WEAPON — SURVIVE', true, 2.6);
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    input.firing = false;
    if (document.pointerLockElement) document.exitPointerLock();
    window.UI.showScreen('pause');
  }

  function resume() {
    state = 'playing';
    window.UI.showScreen('hud');
    window.SFX.uiClick();
    lockPointer();
  }

  function toMenu() {
    state = 'menu';
    if (document.pointerLockElement) document.exitPointerLock();
    window.UI.showScreen('menu');
  }

  function end(win, placement) {
    state = 'over';
    input.firing = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const acc = player.shots > 0 ? Math.round(player.hits / player.shots * 100) : 0;
    window.UI.showResult(win, {
      placement, total: actors.length,
      kills: player.kills, dmg: player.dmgDealt, time: elapsed, acc,
    });
    window.UI.showScreen('result');
    if (win) window.SFX.win(); else window.SFX.lose();
  }

  // ---------------- input ----------------
  function bindInput() {
    const keymap = {
      KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
      ShiftLeft: 'shift', ShiftRight: 'shift', Space: 'space',
    };
    window.addEventListener('keydown', e => {
      if (e.code === 'Space') e.preventDefault();
      const k = keymap[e.code];
      if (k) input.keys[k] = true;
      if (state !== 'playing') return;
      if (e.code === 'KeyE') tryPickup();
      else if (e.code === 'KeyR') player.startReload();
      else if (e.code === 'Digit1') switchWeapon(0);
      else if (e.code === 'Digit2') switchWeapon(1);
      else if (e.code === 'KeyH') player.heal();
      else if (e.code === 'Escape') pause();
    });
    window.addEventListener('keyup', e => {
      const k = keymap[e.code];
      if (k) input.keys[k] = false;
    });
    window.addEventListener('blur', () => { input.keys = {}; input.firing = false; });

    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement === renderer.domElement && state === 'playing') {
        input.mdx += e.movementX;
        input.mdy += e.movementY;
      }
    });
    document.addEventListener('mousedown', e => {
      if (state !== 'playing') return;
      if (document.pointerLockElement !== renderer.domElement) { lockPointer(); return; }
      if (e.button === 0) {
        input.firing = true;
        if (!player.weapon.auto) window.COMBAT.playerShoot(player, camera, actors);
      } else if (e.button === 2) {
        player.aiming = true;
      }
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) input.firing = false;
      else if (e.button === 2) player.aiming = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && state === 'playing') pause();
    });
  }

  function bindButtons() {
    document.getElementById('btn-play').onclick = start;
    document.getElementById('btn-resume').onclick = resume;
    document.getElementById('btn-quit').onclick = toMenu;
    document.getElementById('btn-again').onclick = start;
    document.getElementById('btn-menu').onclick = toMenu;
  }

  function switchWeapon(i) {
    if (player.weapons[i] && player.cur !== i) {
      player.cur = i; player.reloading = 0; player.healing = 0;
      window.SFX.uiClick();
    }
  }

  function tryPickup() {
    const p = window.COMBAT.nearestPickup(player, 2.8);
    if (p) {
      const r = window.COMBAT.applyPickup(player, p);
      if (r !== 'already have') window.UI.centerMsg(p.userData.label + ' ACQUIRED', true, 1.2);
    }
  }

  function spawnLootDrop(x, z) {
    const r = Math.random();
    if (r < 0.42) window.COMBAT.spawnPickup('medkit', x + 1.5, z);
    else if (r < 0.84) window.COMBAT.spawnPickup('ammo', x - 1.5, z);
  }

  // ---------------- loop ----------------
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (state === 'playing') update(dt);
    else if (state === 'menu') {
      const t = performance.now() * 0.00004;
      camera.position.set(Math.cos(t) * 210, 85, Math.sin(t) * 210);
      camera.lookAt(0, 8, 0);
      window.COMBAT.update(dt, elapsed);
      world.update(dt);
    }
    renderer.render(scene, camera);
  }

  function update(dt) {
    elapsed += dt;
    world.update(dt);
    player.update(dt, input, camera);
    for (const b of bots) b.update(dt, zone);
    zone.update(dt, actors);
    window.COMBAT.update(dt, elapsed);

    if (input.firing && player.weapon.auto && player.alive)
      window.COMBAT.playerShoot(player, camera, actors);

    pendingPickup = player.alive ? window.COMBAT.nearestPickup(player, 2.8) : null;
    window.UI.interact(pendingPickup ? pendingPickup.userData.label : null);

    mmT -= dt;
    if (mmT <= 0) { mmT = 0.25; window.UI.drawMinimap(player, bots, zone); }
    window.UI.updateHUD(player, zone, aliveActors().length);

    const alive = aliveActors();
    if (!player.alive) end(false, alive.length + 1);
    else if (alive.length === 1) end(true, 1);
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    get player() { return player; },
    get actors() { return actors; },
    get state() { return state; },
    get scene() { return scene; },
    get camera() { return camera; },
    spawnLootDrop,
  };
})();

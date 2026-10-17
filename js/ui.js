/* LAST SIGNAL — HUD, menus, minimap, killfeed */
window.UI = (function () {
  const $ = id => document.getElementById(id);
  let msgTimer = null;

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  const mm = $('minimap').getContext('2d');

  function drawMinimap(player, bots, zone) {
    const S = 170, R = S / 2, scale = R / 310;
    mm.clearRect(0, 0, S, S);
    // island
    mm.fillStyle = 'rgba(20,34,26,.9)';
    mm.beginPath(); mm.arc(R, R, 290 * scale, 0, 7); mm.fill();
    mm.strokeStyle = 'rgba(120,160,130,.5)'; mm.stroke();
    const px = x => R + x * scale, pz = z => R + z * scale;
    // zone rings
    mm.strokeStyle = '#67e8f9'; mm.lineWidth = 1.5;
    mm.beginPath(); mm.arc(px(zone.center.x), pz(zone.center.z), zone.radius * scale, 0, 7); mm.stroke();
    mm.strokeStyle = 'rgba(255,255,255,.75)'; mm.setLineDash([4, 3]);
    mm.beginPath(); mm.arc(px(zone.nextCenter.x), pz(zone.nextCenter.z), zone.nextRadius * scale, 0, 7); mm.stroke();
    mm.setLineDash([]);
    // pickups (nearby)
    mm.fillStyle = '#ffd34d';
    for (const p of window.COMBAT.pickups) {
      const dx = p.position.x - player.pos.x, dz = p.position.z - player.pos.z;
      if (Math.hypot(dx, dz) < 90) { mm.fillRect(px(p.position.x) - 1.5, pz(p.position.z) - 1.5, 3, 3); }
    }
    // bots (nearby only)
    mm.fillStyle = '#ff5a5a';
    for (const b of bots) {
      if (!b.alive) continue;
      const dx = b.pos.x - player.pos.x, dz = b.pos.z - player.pos.z;
      if (Math.hypot(dx, dz) < 130) {
        mm.beginPath(); mm.arc(px(b.pos.x), pz(b.pos.z), 3, 0, 7); mm.fill();
      }
    }
    // player arrow
    mm.save();
    mm.translate(px(player.pos.x), pz(player.pos.z));
    mm.rotate(-player.yaw);
    mm.fillStyle = '#7ef0a8';
    mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 5); mm.lineTo(-5, 5); mm.closePath(); mm.fill();
    mm.restore();
  }

  return {
    showScreen(name) {
      ['menu-screen', 'pause-screen', 'result-screen'].forEach(hide);
      hide('hud');
      if (name === 'menu') show('menu-screen');
      else if (name === 'pause') show('pause-screen');
      else if (name === 'result') show('result-screen');
      else if (name === 'hud') show('hud');
    },

    updateHUD(player, zone, alive, mmT) {
      $('health-fill').style.width = Math.max(0, player.hp) + '%';
      $('health-fill').style.background = player.hp > 50
        ? 'linear-gradient(90deg,#37d67a,#7ef0a8)'
        : player.hp > 25 ? 'linear-gradient(90deg,#d6a137,#f0d17e)' : 'linear-gradient(90deg,#d63737,#f07e7e)';
      $('health-num').textContent = Math.ceil(Math.max(0, player.hp));
      const w = player.weapon;
      $('weapon-name').textContent = w.name + (player.reloading > 0 ? ' — RELOADING' : player.healing > 0 ? ' — HEALING' : '');
      $('ammo-mag').textContent = w.mag;
      $('ammo-reserve').textContent = '/ ' + w.reserve;
      $('zone-timer').textContent = zone.statusText();
      $('alive-count').textContent = alive;
      $('medkits').textContent = player.medkits;
      $('hud').classList.toggle('aiming', player.aiming);
      // slots
      for (let i = 0; i < 2; i++) {
        const el = $('slot-' + i);
        const wp = player.weapons[i];
        el.classList.toggle('empty', !wp);
        el.classList.toggle('active', player.cur === i && !!wp);
        el.querySelector('.slot-name').textContent = wp ? wp.name : '—';
      }
      $('slot-heal').classList.toggle('active', player.healing > 0);
    },

    updateAlive() {
      const n = window.GAME.actors.filter(a => a.alive).length;
      $('alive-count').textContent = n;
      return n;
    },

    killfeed(killer, sep, victim) {
      const kf = $('killfeed');
      const d = document.createElement('div');
      d.className = 'kill-entry';
      d.textContent = killer + ' ' + sep + ' ' + victim;
      kf.prepend(d);
      while (kf.children.length > 5) kf.lastChild.remove();
      setTimeout(() => d.remove(), 6000);
    },

    hitmarker(kill) {
      const h = $('hitmarker');
      h.classList.remove('show', 'kill');
      void h.offsetWidth;
      h.classList.add('show');
      if (kill) h.classList.add('kill');
    },

    damageFlash() {
      const v = $('damage-vignette');
      v.style.opacity = 0.9;
      setTimeout(() => v.style.opacity = 0, 160);
    },

    zoneDanger(on) { $('zone-panel').classList.toggle('danger', on); },

    interact(label) {
      if (label) { $('interact-name').textContent = label; show('interact-prompt'); }
      else hide('interact-prompt');
    },

    centerMsg(text, good, secs) {
      const el = $('center-msg');
      el.textContent = text;
      el.classList.toggle('good', !!good);
      show('center-msg');
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => hide('center-msg'), (secs || 2) * 1000);
    },

    showResult(win, stats) {
      const t = $('result-title');
      t.textContent = win ? 'VICTORY' : 'ELIMINATED';
      t.className = 'game-logo small ' + (win ? 'win' : 'lose');
      $('result-sub').textContent = '#' + stats.placement + ' of ' + stats.total;
      $('result-stats').innerHTML =
        stat(stats.kills, 'ELIMINATIONS') + stat(Math.round(stats.dmg), 'DAMAGE') +
        stat(fmtTime(stats.time), 'SURVIVED') + stat(stats.acc + '%', 'ACCURACY');
      function stat(v, k) { return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>'; }
      function fmtTime(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
    },

    drawMinimap,
  };
})();

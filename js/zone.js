/* LAST SIGNAL — the Signal Collapse (shrinking safe zone) */
window.LSZone = (function () {
  const C = window.LS_CONFIG.zone;

  class Zone {
    constructor(scene) {
      this.scene = scene;
      this.center = { x: 0, z: 0 };
      this.radius = C.startRadius;
      this.phase = 0;
      this.state = 'wait';       // wait -> shrink -> wait ...
      this.timer = C.phases[0].wait;
      this.tickT = 0;
      this.warned = false;

      const ph = C.phases[0];
      const a = Math.random() * Math.PI * 2;
      const maxOff = Math.max(0, (this.radius - ph.radius) * 0.55);
      this.nextCenter = { x: Math.cos(a) * maxOff * Math.random(), z: Math.sin(a) * maxOff * Math.random() };
      this.nextRadius = ph.radius;
      this.fromCenter = { x: 0, z: 0 };
      this.fromRadius = this.radius;

      // visuals: current safe ring + storm wall + next circle
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.0, 96), ringMat);
      this.ring.rotation.x = -Math.PI / 2;
      scene.add(this.ring);

      const nextMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      this.nextRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 96), nextMat);
      this.nextRing.rotation.x = -Math.PI / 2;
      scene.add(this.nextRing);

      const wallMat = new THREE.MeshBasicMaterial({
        color: 0xff5a3c, transparent: true, opacity: 0.13,
        side: THREE.DoubleSide, depthWrite: false,
      });
      this.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 90, 72, 1, true), wallMat);
      scene.add(this.wall);
      this.updateVisuals();
    }

    reset() {
      this.center = { x: 0, z: 0 };
      this.radius = C.startRadius;
      this.phase = 0; this.state = 'wait';
      this.timer = C.phases[0].wait;
      this.warned = false;
      const ph = C.phases[0];
      const a = Math.random() * Math.PI * 2;
      const maxOff = Math.max(0, (this.radius - ph.radius) * 0.55);
      this.nextCenter = { x: Math.cos(a) * maxOff * Math.random(), z: Math.sin(a) * maxOff * Math.random() };
      this.nextRadius = ph.radius;
      this.fromCenter = { x: 0, z: 0 };
      this.fromRadius = this.radius;
      this.updateVisuals();
    }

    get dps() { return C.phases[Math.min(this.phase, C.phases.length - 1)].dps; }

    isOutside(x, z) {
      return Math.hypot(x - this.center.x, z - this.center.z) > this.radius;
    }

    updateVisuals() {
      const y = 2;
      this.ring.position.set(this.center.x, y, this.center.z);
      this.ring.scale.set(this.radius, this.radius, 1);
      this.nextRing.position.set(this.nextCenter.x, y, this.nextCenter.z);
      this.nextRing.scale.set(this.nextRadius, this.nextRadius, 1);
      this.wall.position.set(this.center.x, 45, this.center.z);
      this.wall.scale.set(this.radius, 1, this.radius);
    }

    update(dt, actors) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.state === 'wait') {
          this.state = 'shrink';
          this.timer = C.phases[this.phase].shrink;
          this.fromCenter = { x: this.center.x, z: this.center.z };
          this.fromRadius = this.radius;
          SFX.zoneWarn();
          window.UI.centerMsg('SIGNAL COLLAPSE INCOMING', false, 2.2);
        } else {
          // shrink finished -> next phase
          this.center = { x: this.nextCenter.x, z: this.nextCenter.z };
          this.radius = this.nextRadius;
          this.phase++;
          if (this.phase < C.phases.length) {
            this.state = 'wait';
            this.timer = C.phases[this.phase].wait;
            const ph = C.phases[this.phase];
            const a = Math.random() * Math.PI * 2;
            const maxOff = Math.max(0, (this.radius - ph.radius) * 0.55);
            this.nextCenter = {
              x: this.center.x + Math.cos(a) * maxOff * Math.random(),
              z: this.center.z + Math.sin(a) * maxOff * Math.random(),
            };
            this.nextRadius = ph.radius;
          } else {
            // final: stay tiny, keep pressure
            this.state = 'wait'; this.timer = 9999;
          }
          this.warned = false;
        }
      }
      if (this.state === 'shrink') {
        const ph = C.phases[this.phase];
        const t = 1 - Math.max(0, this.timer / ph.shrink);
        const e = t * t * (3 - 2 * t); // smoothstep
        this.center.x = this.fromCenter.x + (this.nextCenter.x - this.fromCenter.x) * e;
        this.center.z = this.fromCenter.z + (this.nextCenter.z - this.fromCenter.z) * e;
        this.radius = this.fromRadius + (this.nextRadius - this.fromRadius) * e;
      }
      // 10s warning
      if (this.state === 'wait' && this.timer < 10 && !this.warned && this.phase < C.phases.length) {
        this.warned = true;
        SFX.zoneWarn();
        window.UI.centerMsg('ZONE SHRINKS IN 10s', false, 1.6);
      }
      // damage tick
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = 1;
        for (const a of actors) {
          if (!a.alive) continue;
          if (this.isOutside(a.pos.x, a.pos.z)) {
            a.takeDamage(this.dps, 'zone');
            if (a === window.GAME.player) { SFX.zoneTick(); window.UI.zoneDanger(true); }
          } else if (a === window.GAME.player) {
            window.UI.zoneDanger(false);
          }
        }
      }
      this.updateVisuals();
      // pulse wall
      this.wall.material.opacity = 0.11 + Math.sin(performance.now() * 0.003) * 0.035;
    }

    statusText() {
      if (this.phase >= C.phases.length) return 'FINAL';
      const t = Math.max(0, Math.ceil(this.timer));
      const m = Math.floor(t / 60), s = String(t % 60).padStart(2, '0');
      return (this.state === 'wait' ? 'SHRINK ' : 'MOVING ') + m + ':' + s;
    }
  }

  return Zone;
})();

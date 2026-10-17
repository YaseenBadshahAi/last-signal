/* LAST SIGNAL — tuning & balance config. All gameplay numbers live here. */
window.LS_CONFIG = {
  world: {
    islandRadius: 290,      // playable island radius (world units)
    terrainSize: 760,       // terrain mesh extent
    waterLevel: 0,
    treeCount: 240,
    rockCount: 46,
    crateCount: 40,
  },

  player: {
    hp: 100,
    walkSpeed: 7.5,
    sprintSpeed: 11.5,
    crouchSpeed: 3.6,
    aimSpeed: 4.2,
    accel: 46,
    friction: 34,
    jumpVel: 9.5,
    gravity: 26,
    eyeHeight: 2.35,
    radius: 0.55,
  },

  camera: {
    dist: 4.6,
    aimDist: 2.6,
    shoulder: 1.0,
    height: 2.5,
    sens: 0.0026,
    aimSens: 0.0016,
    pitchMin: -1.15,
    pitchMax: 1.25,
  },

  weapons: {
    pistol: {
      id: 'pistol', name: 'PISTOL', slot: 0,
      damage: 16, headMult: 1.8, range: 70,
      magSize: 12, reserveStart: 60, reloadTime: 1.4,
      fireInterval: 0.22, spread: 0.022, aimSpread: 0.008,
      auto: false, tracer: 0xffd34d, kick: 0.012,
    },
    rifle: {
      id: 'rifle', name: 'RIFLE', slot: 1,
      damage: 24, headMult: 1.8, range: 130,
      magSize: 30, reserveStart: 0, reloadTime: 2.1,
      fireInterval: 0.115, spread: 0.03, aimSpread: 0.011,
      auto: true, tracer: 0x67e8f9, kick: 0.016,
    },
  },

  loot: {
    rifleSpawns: 10,   // rifle pickups scattered
    medkitSpawns: 12,
    ammoSpawns: 14,    // +24 reserve ammo each
    medkitHeal: 55,
    healTime: 2.2,
  },

  bots: {
    count: 7,
    hp: 100,
    speed: 6.4,
    sightRange: 58,
    engageRange: 46,
    reactionTime: [0.55, 1.15],
    aimError: 0.075,       // radians of inaccuracy
    burstSize: [3, 6],
    burstPause: [0.7, 1.6],
    damage: [7, 13],
    wanderRadius: 120,
  },

  // Signal Collapse phases: { wait, shrink, radius, dps }
  zone: {
    startRadius: 270,
    phases: [
      { wait: 45, shrink: 40, radius: 170, dps: 2 },
      { wait: 30, shrink: 35, radius: 105, dps: 4 },
      { wait: 25, shrink: 30, radius: 60,  dps: 8 },
      { wait: 20, shrink: 25, radius: 28,  dps: 14 },
      { wait: 15, shrink: 20, radius: 8,   dps: 22 },
    ],
  },

  fx: {
    tracerLife: 0.09,
    hitFlashTime: 0.12,
  },
};

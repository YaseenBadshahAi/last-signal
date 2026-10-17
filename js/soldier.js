/* Realistic Tactical Soldier — procedural Three.js character.
   Original model by the user; accent param added for the player variant. */
function createSoldier(THREE, accent) {
  const soldier = new THREE.Group();
  soldier.name = "TacticalSoldier";

  const mat = (color, roughness = 0.85, metalness = 0) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness
    });

  const uniform = mat(0x354438);
  const uniformDark = mat(0x242e27);
  const armor = mat(0x202722);
  const straps = mat(0x171c19);
  const skin = mat(0xb88768, 0.75);
  const metal = mat(0x353a3b, 0.42, 0.65);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x10191b,
    roughness: 0.22,
    metalness: 0.35
  });

  function addBox(parent, name, size, material, pos, radius = 0) {
    let geometry;

    if (radius > 0 && THREE.RoundedBoxGeometry) {
      geometry = new THREE.RoundedBoxGeometry(
        size[0], size[1], size[2], 3, radius
      );
    } else {
      geometry = new THREE.BoxGeometry(...size);
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addCapsule(parent, name, radius, length, material, pos) {
    const geometry = new THREE.CapsuleGeometry(radius, length, 6, 12);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Torso and neck
  addCapsule(soldier, "Torso", 0.255, 0.48, uniform, [0, 1.43, 0]);
  addCapsule(soldier, "Neck", 0.085, 0.09, skin, [0, 1.79, 0]);

  // Head
  addCapsule(soldier, "Head", 0.13, 0.19, skin, [0, 1.99, 0]);

  // Tactical helmet
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.67),
    uniformDark
  );
  helmet.name = "Helmet";
  helmet.position.set(0, 2.095, 0);
  helmet.scale.set(1.08, 0.88, 1.05);
  helmet.castShadow = true;
  soldier.add(helmet);

  addBox(soldier, "HelmetFrontMount", [0.075, 0.055, 0.04], armor, [0, 2.065, 0.145]);
  addBox(soldier, "HelmetSideMount", [0.035, 0.065, 0.045], metal, [0.15, 2.04, 0]);

  // Face cover and eye protection
  addBox(soldier, "EyeProtection", [0.205, 0.055, 0.045], glass, [0, 2.015, 0.118]);
  addBox(soldier, "FaceCover", [0.17, 0.11, 0.045], uniformDark, [0, 1.94, 0.105]);

  // Chest plate and webbing
  addBox(soldier, "PlateCarrier", [0.43, 0.43, 0.16], armor, [0, 1.46, 0.15], 0.035);
  addBox(soldier, "FrontPlate", [0.29, 0.22, 0.025], uniformDark, [0, 1.49, 0.245]);

  for (let i = 0; i < 3; i++) {
    addBox(
      soldier,
      `MagazinePouch${i + 1}`,
      [0.075, 0.105, 0.07],
      uniformDark,
      [(i - 1) * 0.095, 1.34, 0.245],
      0.008
    );
  }

  // Shoulder pads
  for (const side of [-1, 1]) {
    const shoulder = addCapsule(
      soldier, `Shoulder_${side}`, 0.105, 0.15,
      armor, [side * 0.29, 1.61, 0]
    );
    shoulder.rotation.z = side * -0.35;
  }

  // Backpack
  addBox(soldier, "Backpack", [0.34, 0.43, 0.18], uniformDark, [0, 1.49, -0.18], 0.025);
  addBox(soldier, "BackpackTop", [0.29, 0.12, 0.19], uniform, [0, 1.72, -0.19], 0.02);
  addBox(soldier, "BackpackPocket", [0.22, 0.19, 0.035], armor, [0, 1.46, -0.28], 0.01);

  // Arms, hands, gloves
  const arms = {};

  for (const side of [-1, 1]) {
    const armPivot = new THREE.Group();
    armPivot.name = side === -1 ? "LeftArmPivot" : "RightArmPivot";
    armPivot.position.set(side * 0.30, 1.62, 0.02);
    soldier.add(armPivot);

    const upperArm = addCapsule(
      armPivot, "UpperArm", 0.085, 0.25, uniform, [0, -0.18, 0]
    );
    upperArm.rotation.z = side * -0.12;

    const elbow = addCapsule(
      armPivot, "ElbowPad", 0.073, 0.075, armor, [0, -0.34, 0.025]
    );

    const forearm = addCapsule(
      armPivot, "Forearm", 0.067, 0.22, uniform, [0, -0.48, 0.025]
    );

    addCapsule(
      armPivot, "Glove", 0.055, 0.075, uniformDark, [0, -0.64, 0.065]
    );

    arms[side] = armPivot;
  }

  // Waist and belt
  addBox(soldier, "Waist", [0.35, 0.19, 0.25], uniform, [0, 1.08, 0]);
  addBox(soldier, "UtilityBelt", [0.40, 0.055, 0.29], straps, [0, 1.12, 0]);

  for (const side of [-1, 1]) {
    addBox(
      soldier, "HipPouch", [0.10, 0.13, 0.12],
      uniformDark, [side * 0.21, 1.04, 0.015]
    );
  }

  // Legs, knee pads, and boots
  const legs = {};

  for (const side of [-1, 1]) {
    const legPivot = new THREE.Group();
    legPivot.name = side === -1 ? "LeftLegPivot" : "RightLegPivot";
    legPivot.position.set(side * 0.13, 1.02, 0);
    soldier.add(legPivot);

    addCapsule(
      legPivot, "Thigh", 0.105, 0.31, uniform, [0, -0.23, 0]
    );

    addBox(
      legPivot, "KneePad", [0.15, 0.13, 0.07],
      armor, [0, -0.43, 0.055], 0.012
    );

    addCapsule(
      legPivot, "Shin", 0.078, 0.28, uniform, [0, -0.61, 0]
    );

    addBox(
      legPivot, "Boot", [0.15, 0.13, 0.25],
      uniformDark, [0, -0.82, 0.045], 0.018
    );

    legs[side] = legPivot;
  }

  // Rifle held in front of the soldier
  const rifle = new THREE.Group();
  rifle.name = "Rifle";
  rifle.position.set(0.10, 1.40, 0.38);
  rifle.rotation.x = -0.08;
  rifle.rotation.z = -0.06;
  soldier.add(rifle);

  addBox(rifle, "RifleReceiver", [0.10, 0.105, 0.38], metal, [0, 0, 0]);
  addBox(rifle, "RifleBarrel", [0.035, 0.035, 0.42], metal, [0, 0.015, 0.38]);
  addBox(rifle, "RifleStock", [0.07, 0.075, 0.22], uniformDark, [0, 0, -0.27]);
  addBox(rifle, "RifleMagazine", [0.065, 0.17, 0.10], armor, [0, -0.115, 0.04]);
  addBox(rifle, "RifleSight", [0.045, 0.045, 0.10], uniformDark, [0, 0.075, 0.10]);
  addBox(rifle, "RifleGrip", [0.05, 0.13, 0.065], uniformDark, [0, -0.09, -0.04]);

  // Surface detail: subtle straps and seams
  addBox(soldier, "LeftShoulderStrap", [0.055, 0.38, 0.045], straps, [-0.17, 1.51, 0.235]);
  addBox(soldier, "RightShoulderStrap", [0.055, 0.38, 0.045], straps, [0.17, 1.51, 0.235]);

  // Optional accent (used for the player so they stand out from AI opponents)
  if (accent !== undefined) {
    const accMat = mat(accent, 0.65);
    helmet.material = accMat;
    const plate = soldier.getObjectByName("PlateCarrier");
    if (plate) plate.material = accMat;
  }

  // Root is centered at ground level.
  soldier.position.y = 0;
  soldier.userData.arms = arms;
  soldier.userData.legs = legs;
  soldier.userData.rifle = rifle;
  soldier.userData.animationTime = 0;

  // Basic procedural walking animation.
  soldier.userData.updateAnimation = function (delta, moving, sprinting = false) {
    this.animationTime += delta * (sprinting ? 12 : 7);

    const swing = moving ? Math.sin(this.animationTime) : 0;
    const amount = sprinting ? 0.7 : 0.4;

    legs[-1].rotation.x = swing * amount;
    legs[1].rotation.x = -swing * amount;

    // Keep the arms in a forward weapon-ready pose.
    arms[-1].rotation.x = -0.45 + swing * 0.12;
    arms[1].rotation.x = -0.50 - swing * 0.12;

    soldier.position.y = moving
      ? Math.abs(Math.sin(this.animationTime * 2)) * 0.025
      : 0;
  };

  soldier.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return soldier;
}

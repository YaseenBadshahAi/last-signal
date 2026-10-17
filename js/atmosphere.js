/* LAST SIGNAL — Cinematic Lighting & Atmosphere.
   Adapted from the user's module for Three.js r149
   (outputEncoding / encodings_fragment instead of the r152+ names). */
window.LSAtmosphere = (function () {

  function createCinematicAtmosphere(THREE, scene, renderer) {
    // ---------- COLOR MANAGEMENT (r149 API) ----------
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    // ---------- SKY AND DISTANCE FOG ----------
    const skyColor = new THREE.Color(0x819cae);
    scene.background = skyColor.clone();
    scene.fog = new THREE.FogExp2(0x91a3aa, 0.0025);

    // ---------- NATURAL AMBIENT LIGHT ----------
    const hemisphereLight = new THREE.HemisphereLight(0xb9d4e8, 0x34372b, 1.15);
    hemisphereLight.name = "AtmosphereHemisphereLight";
    scene.add(hemisphereLight);

    // ---------- CINEMATIC SUN ----------
    const sun = new THREE.DirectionalLight(0xffd4a0, 3.2);
    sun.name = "CinematicSun";
    sun.position.set(-100, 130, 75);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 4;
    scene.add(sun);
    scene.add(sun.target);

    // ---------- COOL FILL LIGHT ----------
    const fillLight = new THREE.DirectionalLight(0x9bbbd2, 0.65);
    fillLight.name = "CoolSkyFill";
    fillLight.position.set(90, 50, -100);
    scene.add(fillLight);

    // ---------- LOCAL AMBIENT LIGHT ----------
    const ambientLight = new THREE.AmbientLight(0x667785, 0.2);
    ambientLight.name = "SoftAmbient";
    scene.add(ambientLight);

    // ---------- SKY DOME ----------
    const skyGeometry = new THREE.SphereGeometry(900, 32, 20);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x416783) },
        horizonColor: { value: new THREE.Color(0xc0b6a0) },
        bottomColor: { value: new THREE.Color(0x7c8580) },
        sunDirection: { value: sun.position.clone().normalize() },
        sunColor: { value: new THREE.Color(0xffd7a2) },
        sunPower: { value: 55.0 },
        sunStrength: { value: 0.45 }
      },
      vertexShader: `
        varying vec3 vWorldDirection;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldDirection = normalize(worldPosition.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        uniform float sunPower;
        uniform float sunStrength;
        varying vec3 vWorldDirection;
        void main() {
          vec3 direction = normalize(vWorldDirection);
          float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 sky = mix(horizonColor, topColor, smoothstep(0.25, 0.95, height));
          sky = mix(bottomColor, sky, smoothstep(0.0, 0.3, height));
          float sunAmount = max(dot(direction, normalize(sunDirection)), 0.0);
          float sunGlow = pow(sunAmount, sunPower) * sunStrength;
          float haze = pow(sunAmount, 5.0) * 0.10;
          sky += sunColor * (sunGlow + haze);
          gl_FragColor = vec4(sky, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.name = "CinematicSky";
    sky.frustumCulled = false;
    scene.add(sky);

    // ---------- SUBTLE DISTANT HAZE ----------
    const hazeLayers = [];
    for (let i = 0; i < 3; i++) {
      const haze = new THREE.Mesh(
        new THREE.PlaneGeometry(650, 45),
        new THREE.MeshBasicMaterial({
          color: 0xb4c0bd, transparent: true,
          opacity: 0.035 - i * 0.006,
          depthWrite: false, side: THREE.DoubleSide
        })
      );
      haze.position.set(0, 18 + i * 14, -120 - i * 75);
      haze.rotation.x = -0.06;
      scene.add(haze);
      hazeLayers.push(haze);
    }

    // ---------- TIME-OF-DAY CONTROL ----------
    let phase = 0.0;
    function setTimeOfDay(value) {
      phase = ((value % 1) + 1) % 1;
      const angle = phase * Math.PI * 2 - Math.PI / 2;
      const horizontal = Math.cos(angle);
      const vertical = Math.sin(angle);
      sun.position.set(horizontal * 150, Math.max(8, vertical * 150), 65);
      sun.target.position.set(0, 0, 0);
      sun.target.updateMatrixWorld();
      const nightAmount = THREE.MathUtils.smoothstep(-vertical, 0.05, 0.8);
      sun.intensity = THREE.MathUtils.lerp(3.2, 0.15, nightAmount);
      hemisphereLight.intensity = THREE.MathUtils.lerp(1.15, 0.25, nightAmount);
      fillLight.intensity = THREE.MathUtils.lerp(0.65, 0.25, nightAmount);
      sun.color.setRGB(
        THREE.MathUtils.lerp(1.0, 0.42, nightAmount),
        THREE.MathUtils.lerp(0.83, 0.55, nightAmount),
        THREE.MathUtils.lerp(0.63, 0.9, nightAmount)
      );
      const skyNight = new THREE.Color(0x101a2b);
      const skyDay = new THREE.Color(0x819cae);
      const currentSky = skyDay.clone().lerp(skyNight, nightAmount);
      skyMaterial.uniforms.topColor.value.copy(currentSky);
      skyMaterial.uniforms.horizonColor.value.set(0xc0b6a0).lerp(skyNight, nightAmount);
      scene.background.copy(currentSky);
      scene.fog.color.copy(currentSky).lerp(new THREE.Color(0xa0a8a5), 0.25);
      skyMaterial.uniforms.sunDirection.value.copy(sun.position).normalize();
      skyMaterial.uniforms.sunStrength.value = THREE.MathUtils.lerp(0.45, 0.04, nightAmount);
      renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.7, nightAmount);
    }

    // Warm late-afternoon lighting.
    setTimeOfDay(0.40);

    // ---------- ANIMATION ----------
    let elapsed = 0;
    function update(deltaTime) {
      elapsed += deltaTime;
      hazeLayers.forEach((haze, i) => {
        haze.position.x = Math.sin(elapsed * 0.025 + i) * 14;
      });
    }

    function setHighQuality(enabled) {
      renderer.shadowMap.enabled = enabled;
      sun.shadow.mapSize.set(enabled ? 2048 : 1024, enabled ? 2048 : 1024);
      sun.shadow.needsUpdate = true;
    }

    return { sun, hemisphereLight, fillLight, sky, update, setTimeOfDay, setHighQuality };
  }

  return { createCinematicAtmosphere };
})();

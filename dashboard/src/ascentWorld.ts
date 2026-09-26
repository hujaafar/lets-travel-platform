import * as THREE from "three";
import { ImprovedNoise } from "three/addons/math/ImprovedNoise.js";

/** An original alpine landscape. No external models, remote textures or controls. */
export function createAscentWorld(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, innerWidth < 700 ? 1.25 : 1.6),
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#91a9ba");
  scene.fog = new THREE.FogExp2("#91a9ba", 0.003);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 1800);
  const noise = new ImprovedNoise();
  const fbm = (x: number, z: number) => {
    let value = 0,
      amplitude = 1,
      frequency = 0.016;
    for (let i = 0; i < 6; i++) {
      value +=
        (1 - Math.abs(noise.noise(x * frequency, z * frequency, 7.32))) *
        amplitude;
      frequency *= 2.15;
      amplitude *= 0.47;
    }
    return value;
  };
  const height = (x: number, z: number) => {
    const peak = (cx: number, cz: number, sx: number, sz: number, h: number) =>
      h * Math.exp(-(((x - cx) / sx) ** 2) - ((z - cz) / sz) ** 2);
    const land = Math.max(
      peak(-128, -70, 85, 160, 155),
      peak(118, -170, 80, 150, 205),
      peak(-20, -295, 100, 105, 190),
    );
    return 4 + land * (0.46 + fbm(x, z) * 0.43) + Math.sin(z * 0.025) * 3;
  };
  const mobile = innerWidth < 700;
  const terrain = new THREE.PlaneGeometry(
    700,
    900,
    mobile ? 180 : 280,
    mobile ? 240 : 360,
  );
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, height(positions.getX(i), positions.getZ(i)));
  }
  terrain.computeVertexNormals();
  const colors = new Float32Array(positions.count * 3);
  const rock = new THREE.Color("#3d505f");
  const snow = new THREE.Color("#dfebf0");
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const slope = terrain.attributes.normal.getY(i);
    const detail = noise.noise(
      positions.getX(i) * 0.12,
      positions.getZ(i) * 0.12,
      2,
    );
    const cover = THREE.MathUtils.smoothstep(slope + detail * 0.18, 0.42, 0.83);
    color
      .copy(rock)
      .lerp(snow, cover)
      .multiplyScalar(0.89 + detail * 0.13);
    color.toArray(colors, i * 3);
  }
  terrain.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const grain = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < 256 * 256; i++) {
    const x = i % 256,
      y = Math.floor(i / 256);
    const n = noise.noise(x * 0.21, y * 0.31, 4);
    const v = Math.round(128 + n * 75 + Math.sin(x * 0.8 + n * 8) * 20);
    grain.set([v, v, v, 255], i * 4);
  }
  const grainTexture = new THREE.DataTexture(grain, 256, 256);
  grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.repeat.set(75, 95);
  grainTexture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    bumpMap: grainTexture,
    bumpScale: 0.45,
  });
  scene.add(new THREE.Mesh(terrain, material));
  const distant = new THREE.PlaneGeometry(2400, 2400, 160, 160);
  distant.rotateX(-Math.PI / 2);
  const dp = distant.attributes.position;
  for (let i = 0; i < dp.count; i++)
    dp.setY(
      i,
      Math.min(
        height(dp.getX(i), dp.getZ(i)) - 8,
        -5 +
          Math.max(0, Math.abs(dp.getX(i)) - 320) * 0.13 +
          fbm(dp.getX(i), dp.getZ(i)) * 10,
      ),
    );
  distant.computeVertexNormals();
  const distantMaterial = new THREE.MeshStandardMaterial({
    color: "#a8bbc8",
    roughness: 1,
  });
  scene.add(new THREE.Mesh(distant, distantMaterial));
  scene.add(new THREE.HemisphereLight("#d1e4ff", "#273744", 2.2));
  const sun = new THREE.DirectionalLight("#fff0d5", 3.6);
  sun.position.set(-110, 190, -190);
  scene.add(sun);

  // A warm expedition line is physically anchored to the snow surface.
  const trail: THREE.Vector3[] = [];
  for (let i = 0; i < 150; i++) {
    const z = 100 - i * 2.55;
    const x = 9 + Math.sin(i * 0.037) * 21;
    trail.push(new THREE.Vector3(x, height(x, z) + 0.55, z));
  }
  const ropeGeometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(trail),
    180,
    0.14,
    5,
    false,
  );
  const ropeMaterial = new THREE.MeshStandardMaterial({
    color: "#e5a16f",
    roughness: 0.8,
  });
  scene.add(new THREE.Mesh(ropeGeometry, ropeMaterial));
  const poleGeometry = new THREE.CylinderGeometry(0.09, 0.12, 3.6, 5);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: "#39414b" });
  const flagGeometry = new THREE.PlaneGeometry(1.2, 0.62);
  const flagMaterial = new THREE.MeshStandardMaterial({
    color: "#e99558",
    side: THREE.DoubleSide,
  });
  for (let i = 3; i < trail.length; i += 8) {
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.copy(trail[i]).add(new THREE.Vector3(0, 1.1, 0));
    scene.add(pole);
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.copy(pole.position).add(new THREE.Vector3(0.6, 1.1, 0));
    scene.add(flag);
  }
  const particleCount = mobile ? 180 : 450;
  const particles = new Float32Array(particleCount * 3);
  // Deterministic coordinates make the scene stable between mounts and screenshots.
  for (let i = 0; i < particleCount; i++) {
    particles[i * 3] = Math.sin(i * 93.41) * 60;
    particles[i * 3 + 1] = Math.sin(i * 17.31) * 42;
    particles[i * 3 + 2] = Math.cos(i * 71.17) * 70;
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particles, 3),
  );
  const snowMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: `uniform float time;
      void main(){ vec3 p=position; p.y=mod(p.y-time*1.5+42.,84.)-42.; p.x+=sin(time*.18+p.z)*2.;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(165./max(1.,-mv.z),1.,6.); }`,
    fragmentShader: `void main(){float d=length(gl_PointCoord-.5);float a=1.-smoothstep(.12,.5,d);gl_FragColor=vec4(.92,.97,1.,a*.62);}`,
  });
  const snowfall = new THREE.Points(snowGeometry, snowMaterial);
  scene.add(snowfall);
  const look = new THREE.Vector3();
  const dawn = new THREE.Color("#91a9ba");
  const highSky = new THREE.Color("#526d87");
  const resize = () => {
    const { width, height: h } = canvas.getBoundingClientRect();
    renderer.setSize(width, h, false);
    camera.aspect = width / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  resize();
  return {
    resize,
    render(progress: number, time: number, pointerX = 0, pointerY = 0) {
      const z = 120 - progress * 340;
      const x = -18 + Math.sin(progress * Math.PI * 1.6) * 29;
      const y = height(x, z) + 15 + progress ** 3 * 170;
      camera.position.set(x + pointerX * 2, y + pointerY, z);
      look.set(x + 12, y + 12 - progress ** 3 * 185, z - 115);
      camera.lookAt(look);
      snowfall.position.copy(camera.position);
      snowMaterial.uniforms.time.value = time;
      scene.background = color.copy(dawn).lerp(highSky, progress);
      (scene.fog as THREE.FogExp2).color.copy(color);
      sun.intensity = 3.6 + progress * 1.3;
      renderer.render(scene, camera);
      canvas.dataset.camera = camera.position
        .toArray()
        .map((v) => v.toFixed(1))
        .join(",");
    },
    dispose() {
      [
        terrain,
        distant,
        ropeGeometry,
        poleGeometry,
        flagGeometry,
        snowGeometry,
      ].forEach((g) => g.dispose());
      [
        material,
        distantMaterial,
        ropeMaterial,
        poleMaterial,
        flagMaterial,
        snowMaterial,
      ].forEach((m) => m.dispose());
      grainTexture.dispose();
      renderer.dispose();
    },
  };
}

/* Fiona v4 — WebGL helix of real customer photos (three@0.160, pinned). Loaded lazily by app.js. */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export function mountHelix(host, photos, { onOpen } = {}) {
  const W = () => host.clientWidth, H = () => host.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, W() / H(), 0.1, 100);
  const isNarrow = () => W() < 700;

  const R = 3.4;                 // cylinder radius
  const PER_TURN = 12;            // cards per revolution
  const CW = 1.5, CH = CW * 16 / 9;
  const PITCH = 0.27;            // vertical rise per card
  const group = new THREE.Group();
  scene.add(group);

  const geo = new THREE.PlaneGeometry(CW, CH, 24, 1);
  const vert = `
    uniform float uR; uniform float uHover; uniform float uBend;
    varying vec2 vUv; varying float vShade;
    void main(){
      vUv = uv;
      vec3 p = position;
      float a = p.x / uR;
      float r = uR + uHover * 0.35;
      vec3 q = vec3(sin(a) * r, p.y * (1.0 + uHover * 0.12), cos(a) * r - uR);
      q = mix(vec3(p.x, p.y, 0.0), q, uBend);
      vec4 wp = modelMatrix * vec4(q, 1.0);
      vShade = clamp(normalize((modelMatrix * vec4(sin(a), 0.0, cos(a), 0.0)).xyz).z * 0.5 + 0.5, 0.0, 1.0);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const frag = `
    uniform sampler2D uMap; uniform float uHover; uniform float uReady; uniform vec2 uSize;
    varying vec2 vUv; varying float vShade;
    float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
    void main(){
      vec2 p = (vUv - 0.5) * uSize;
      float d = sdRound(p, uSize * 0.5, 0.11);
      float alpha = 1.0 - smoothstep(-0.006, 0.006, d);
      if (alpha < 0.01) discard;
      vec3 col = texture2D(uMap, vUv).rgb;
      col = mix(vec3(0.95, 0.55, 0.64), col, uReady);
      float facing = gl_FrontFacing ? 1.0 : 0.0;
      col *= mix(0.42, 1.0, facing);
      col *= mix(0.55, 1.0, vShade);
      col += uHover * 0.06;
      gl_FragColor = vec4(col, alpha);
      #include <colorspace_fragment>
    }`;

  const loader = new THREE.TextureLoader();
  const blank = new THREE.DataTexture(new Uint8Array([255, 205, 214, 255]), 1, 1);
  blank.needsUpdate = true;
  const meshes = [];
  const total = photos.length;
  photos.forEach((src, i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: blank }, uR: { value: R }, uHover: { value: 0 }, uBend: { value: 1 }, uReady: { value: 0 }, uSize: { value: new THREE.Vector2(CW, CH) } },
      vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide, transparent: true
    });
    const m = new THREE.Mesh(geo, mat);
    const theta = (i / PER_TURN) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.rotation.y = theta;
    pivot.position.y = (total / 2 - i) * PITCH;
    m.position.z = R;
    pivot.add(m);
    group.add(pivot);
    m.userData = { i, src, hover: 0, target: 0 };
    meshes.push(m);
    loader.load(src, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      mat.uniforms.uMap.value = tex;
      const t0 = performance.now();
      const fade = () => { const k = Math.min((performance.now() - t0) / 500, 1); mat.uniforms.uReady.value = k; if (k < 1) requestAnimationFrame(fade); else needsRender = true; };
      fade();
    });
  });

  // ------- interaction: drag with inertia, scroll-coupled spin + vertical travel -------
  let rot = 0, vel = 0.0016, dragging = false, lastX = 0, lastT = 0, downX = 0, downY = 0, moved = 0;
  let travel = 0, travelTarget = 0;
  const height = total * PITCH;
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(-9, -9);
  let hovered = null, needsRender = true, visible = false, raf = 0;

  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';
  const setMouse = e => { const r = el.getBoundingClientRect(); mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1; };
  el.addEventListener('pointerdown', e => {
    setMouse(e); dragging = true; lastX = downX = e.clientX; downY = e.clientY; lastT = performance.now(); moved = 0;
    host.classList.add('grabbing');
  });
  window.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    if (!dragging) return;
    const now = performance.now(), dx = e.clientX - lastX, dt = Math.max(now - lastT, 1);
    moved += Math.abs(dx);
    rot += dx * 0.0062;
    vel = (dx * 0.0062) / dt * 16;
    lastX = e.clientX; lastT = now;
  }, { passive: true });
  const up = e => {
    if (!dragging) return; dragging = false; host.classList.remove('grabbing');
    wasTap = moved < 8 && Math.abs(e.clientY - downY) < 8;
  };
  let wasTap = false;
  window.addEventListener('pointerup', up);
  el.addEventListener('click', e => { if (wasTap) { wasTap = false; setMouse(e); pick(); } });
  window.addEventListener('pointercancel', () => { dragging = false; host.classList.remove('grabbing'); });
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mouse.set(-9, -9); });

  function pick() {
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit && onOpen) onOpen(hit.object.userData.i);
  }

  let lastScroll = window.scrollY;
  function onScroll() {
    const r = host.getBoundingClientRect();
    const p = Math.min(Math.max((window.innerHeight - r.top) / (window.innerHeight + r.height), 0), 1);
    travelTarget = (p - 0.5) * (height - 4.5);
    const dy = window.scrollY - lastScroll; lastScroll = window.scrollY;
    vel += dy * 0.00006;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); travel = travelTarget;

  function resize() {
    const w = W(), h = H(); if (!w || !h) return;
    renderer.setSize(w, h); camera.aspect = w / h;
    camera.fov = isNarrow() ? 44 : 32;
    camera.position.set(0, 0, isNarrow() ? 13.5 : 11.6);
    camera.updateProjectionMatrix(); needsRender = true;
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!dragging) { vel *= 0.95; if (Math.abs(vel) < 0.0016) vel += (0.0016 * Math.sign(vel || 1) - vel) * 0.04; rot += vel; }
    travel += (travelTarget - travel) * 0.08;
    group.rotation.y = rot;
    group.position.y = travel;
    group.rotation.x = 0.1 + (mouse.x > -2 ? mouse.y * 0.04 : 0);
    group.rotation.z = -0.08;

    ray.setFromCamera(mouse, camera);
    const hit = !dragging && mouse.x > -2 ? ray.intersectObjects(meshes, false)[0] : null;
    const h = hit ? hit.object : null;
    if (h !== hovered) { hovered = h; host.style.cursor = h ? 'pointer' : ''; }
    meshes.forEach(m => {
      const t = m === hovered ? 1 : 0;
      m.userData.hover += (t - m.userData.hover) * 0.14;
      m.material.uniforms.uHover.value = m.userData.hover;
    });
    renderer.render(scene, camera);
  }
  const io = new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
    if (visible && !raf) tick();
    if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '100px' });
  io.observe(host);

  return {
    destroy() { io.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); renderer.dispose(); el.remove(); window.removeEventListener('scroll', onScroll); }
  };
}

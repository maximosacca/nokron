import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// Si tu versión de three no reconoce 'three/addons/...', probá con:
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const text = document.getElementById('text');

// --- Configuración básica ---
const scene = new THREE.Scene();
const fov = 75;
const aspectRatio = window.innerWidth / window.innerHeight;
const near = 0.1;
const far = 1000;

const camera = new THREE.PerspectiveCamera(fov, aspectRatio, near, far);
camera.position.set(0, 0.8, 3.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Controles de cámara (navegación real, no rotan el objeto) ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 8;
controls.enablePan = false;
controls.target.set(0, 0.8, 0);

// --- Luces base ---
const hemi = new THREE.HemisphereLight(0x88ffcc, 0x001100, 0.6);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(2, 3, 2);
scene.add(dir);
const glow = new THREE.PointLight(0x33ffaa, 1.3, 12);
glow.position.set(-2, 1, 2);
scene.add(glow);

// --- Fondo simple tipo atmósfera ---
const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 32),
    new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
        fragmentShader: `
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 top = vec3(0.02, 0.05, 0.08);
        vec3 bottom = vec3(0.0, 0.1, 0.08);
        gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.3, 0.6, h)), 1.0);
      }
    `,
    })
);
scene.add(backdrop);

// --- Cámara cúbica para reflejos en tiempo real (material "espejo") ---
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
scene.add(cubeCamera);

// --- Materiales disponibles (compartidos entre todos los planos) ---
const wireMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
});

const solidMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
});

const fresnelMat = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(0x33ffaa) } },
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `,
    fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    uniform vec3 glowColor;
    void main() {
      float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.2);
      vec3 base = vec3(0.02, 0.05, 0.04);
      vec3 col = mix(base, glowColor, fresnel);
      gl_FragColor = vec4(col, 0.35 + fresnel * 0.65);
    }
  `,
});

const mirrorMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    metalness: 1,
    roughness: 0.08,
    envMap: cubeRenderTarget.texture,
});

const materials = { wireframe: wireMat, solido: solidMat, fresnel: fresnelMat, espejo: mirrorMat };

// --- Objeto principal: Ente Varado (planos seriados) ---
const ente = new THREE.Group();
ente.position.y = 0.8;
scene.add(ente);

// Parámetros experimentales -- se pueden tocar en vivo desde el panel de abajo
const params = {
    planeCount: 40,
    totalHeight: 1.8,
    twistTurns: 0.75, // vueltas completas a lo largo de toda la pila
    spiralRadius: 0, // desplazamiento en espiral/hélice
    jitter: 0, // ruido aleatorio por plano (look "glitch"/roto)
    profile: 'huso', // huso | doble | conico | glitch | constante
    material: 'fresnel', // wireframe | solido | fresnel | espejo
    breathAmplitude: 0.05,
    breathSpeed: 3,
    idleRotSpeed: 0.2,
    touchReacts: true,
};

// Copia de los valores iniciales, para poder restablecerlos desde el panel
const DEFAULTS = { ...params };

let currentGeometry = null;

function buildGroup() {
    // Limpia la construcción anterior
    while (ente.children.length) ente.remove(ente.children[0]);
    if (currentGeometry) currentGeometry.dispose();

    const { planeCount, totalHeight, twistTurns, spiralRadius, jitter, profile, material } = params;
    const geometry = new THREE.BoxGeometry(1, 0.015, 1);
    currentGeometry = geometry;
    const mat = materials[material] || materials.fresnel;

    for (let i = 0; i < planeCount; i++) {
        const t = planeCount > 1 ? i / (planeCount - 1) : 0;

        let profileScale;
        switch (profile) {
            case 'doble':
                profileScale = Math.abs(Math.sin(t * Math.PI * 2)) * 1.4 + 0.08;
                break;
            case 'conico':
                profileScale = (1 - t) * 1.5 + 0.08;
                break;
            case 'glitch':
                profileScale = 0.3 + Math.random() * 1.3;
                break;
            case 'constante':
                profileScale = 1;
                break;
            case 'huso':
            default:
                profileScale = Math.sin(t * Math.PI) * 1.5 + 0.08;
        }

        const jitterAmt = (Math.random() - 0.5) * jitter;
        const scale = Math.max(0.03, profileScale + jitterAmt);
        const angle = t * Math.PI * 2 * twistTurns;

        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(
            Math.cos(angle) * spiralRadius,
            (t - 0.5) * totalHeight,
            Math.sin(angle) * spiralRadius
        );
        mesh.scale.set(scale, 1, scale);
        mesh.rotation.y = angle + (Math.random() - 0.5) * jitter * 2;
        mesh.userData = { baseScale: scale, t };
        ente.add(mesh);
    }
}

buildGroup();

// --- Objetos y luces de referencia, para comprobar reflejos/translucidez ---
const referenceGroup = new THREE.Group();
const refShapes = [
    { color: 0xff8844, pos: [3.2, 1.2, -1], geo: new THREE.BoxGeometry(1.2, 1.2, 1.2) },
    { color: 0x33ffee, pos: [-3, -0.5, 1.5], geo: new THREE.TorusGeometry(0.9, 0.25, 12, 32) },
    { color: 0xaa66ff, pos: [0.5, 2.6, -2.5], geo: new THREE.ConeGeometry(0.9, 1.6, 24) },
    { color: 0x22ff88, pos: [-1.5, -2.4, 2], geo: new THREE.BoxGeometry(2, 0.2, 2) },
];
refShapes.forEach((s) => {
    const m = new THREE.Mesh(s.geo, new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.4 }));
    m.position.set(...s.pos);
    referenceGroup.add(m);
});

const testLight1 = new THREE.PointLight(0xff8844, 1.2, 14);
testLight1.position.set(3, 1, -1);
const testLight2 = new THREE.PointLight(0x33ffee, 1.2, 14);
testLight2.position.set(-3, -0.5, 1.5);

let referenceVisible = false;
function setReferenceVisible(visible) {
    referenceVisible = visible;
    if (visible) {
        scene.add(referenceGroup);
        scene.add(testLight1);
        scene.add(testLight2);
    } else {
        scene.remove(referenceGroup);
        scene.remove(testLight1);
        scene.remove(testLight2);
    }
}

// --- Panel de control (inyectado por JS, no hace falta tocar el index.html) ---
const panel = document.createElement('div');
panel.style.cssText = `
  position: fixed;
  top: 12px;
  right: 12px;
  width: 270px;
  max-height: 90vh;
  overflow-y: auto;
  background: #001a0dee;
  border: 1px solid #144;
  border-radius: 8px;
  padding: 12px;
  font-family: monospace;
  font-size: 11px;
  color: #88ffcc;
  z-index: 10;
`;
document.body.appendChild(panel);

const title = document.createElement('div');
title.textContent = 'Ente Varado — laboratorio';
title.style.cssText = 'font-size: 13px; color: #66ffaa; margin-bottom: 8px;';
panel.appendChild(title);

const STRUCTURAL_KEYS = ['planeCount', 'totalHeight', 'twistTurns', 'spiralRadius', 'jitter', 'profile', 'material'];

function createResetButton(onClick) {
    const btn = document.createElement('button');
    btn.textContent = '↺';
    btn.title = 'Restablecer';
    btn.style.cssText =
        'background:#001a0d; color:#66ffaa; border:1px solid #33ffaa; border-radius:4px; cursor:pointer; font-size:11px; padding:1px 6px; line-height:1.4;';
    btn.addEventListener('click', onClick);
    return btn;
}

function addSlider(label, key, min, max, step) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px; margin-bottom:10px;';

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:6px;';

    const span = document.createElement('span');
    span.textContent = `${label}: ${params[key]}`;
    headerRow.appendChild(span);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = params[key];
    input.style.width = '100%';
    input.addEventListener('input', () => {
        params[key] = parseFloat(input.value);
        span.textContent = `${label}: ${params[key]}`;
        if (STRUCTURAL_KEYS.includes(key)) buildGroup();
    });

    const resetBtn = createResetButton(() => {
        params[key] = DEFAULTS[key];
        input.value = DEFAULTS[key];
        span.textContent = `${label}: ${params[key]}`;
        if (STRUCTURAL_KEYS.includes(key)) buildGroup();
    });
    headerRow.appendChild(resetBtn);

    wrapper.appendChild(headerRow);
    wrapper.appendChild(input);
    panel.appendChild(wrapper);
}

function addSelect(label, key, options) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px; margin-bottom:10px;';

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:6px;';

    const span = document.createElement('span');
    span.textContent = label;
    headerRow.appendChild(span);

    const select = document.createElement('select');
    select.style.cssText =
        'background:#001a0d; color:#66ffaa; border:1px solid #33ffaa; border-radius:4px; padding:4px 6px; font-family:monospace; font-size:12px; width:100%;';
    options.forEach(([value, textLabel]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = textLabel;
        if (value === params[key]) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => {
        params[key] = select.value;
        if (STRUCTURAL_KEYS.includes(key)) buildGroup();
    });

    const resetBtn = createResetButton(() => {
        params[key] = DEFAULTS[key];
        select.value = DEFAULTS[key];
        if (STRUCTURAL_KEYS.includes(key)) buildGroup();
    });
    headerRow.appendChild(resetBtn);

    wrapper.appendChild(headerRow);
    wrapper.appendChild(select);
    panel.appendChild(wrapper);
}

function addCheckbox(label, key) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;';

    const left = document.createElement('label');
    left.style.cssText = 'display:flex; align-items:center; gap:8px;';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = params[key];
    input.addEventListener('change', () => {
        params[key] = input.checked;
    });
    left.appendChild(input);

    const span = document.createElement('span');
    span.textContent = label;
    left.appendChild(span);

    wrapper.appendChild(left);

    const resetBtn = createResetButton(() => {
        params[key] = DEFAULTS[key];
        input.checked = DEFAULTS[key];
    });
    wrapper.appendChild(resetBtn);

    panel.appendChild(wrapper);
}

addSlider('Cantidad de planos', 'planeCount', 6, 120, 1);
addSlider('Altura total', 'totalHeight', 0.5, 4, 0.05);
addSlider('Vueltas de twist', 'twistTurns', 0, 6, 0.05);
addSlider('Radio de espiral', 'spiralRadius', 0, 1.5, 0.02);
addSlider('Ruido / glitch', 'jitter', 0, 1.5, 0.02);

addSelect('Perfil de silueta', 'profile', [
    ['huso', 'Huso / capullo'],
    ['doble', 'Doble lóbulo'],
    ['conico', 'Cónico'],
    ['glitch', 'Aleatorio (glitch)'],
    ['constante', 'Constante (cilindro)'],
]);

addSelect('Material', 'material', [
    ['fresnel', 'Fresnel / borde brillante'],
    ['wireframe', 'Wireframe'],
    ['solido', 'Sólido translúcido'],
    ['espejo', 'Espejo reflectante'],
]);

addSlider('Amplitud de respiración', 'breathAmplitude', 0, 0.3, 0.01);
addSlider('Velocidad de respiración', 'breathSpeed', 0, 10, 0.1);
addSlider('Rotación pasiva', 'idleRotSpeed', 0, 1.5, 0.02);
addCheckbox('Reacciona al mantener presionado (respira más agitado)', 'touchReacts');

const divider = document.createElement('div');
divider.style.cssText = 'border-top:1px solid #144; margin: 10px 0;';
panel.appendChild(divider);

const refBtn = document.createElement('button');
refBtn.textContent = 'Objetos y luces de prueba: OFF';
refBtn.style.cssText =
    'width:100%; background:#001a0d; color:#66ffaa; border:1px solid #33ffaa; border-radius:4px; cursor:pointer; font-size:11px; padding:6px; margin-bottom:6px;';
refBtn.addEventListener('click', () => {
    setReferenceVisible(!referenceVisible);
    refBtn.textContent = `Objetos y luces de prueba: ${referenceVisible ? 'ON' : 'OFF'}`;
});
panel.appendChild(refBtn);

const refHint = document.createElement('div');
refHint.textContent = 'Sirve para ver reflejos (espejo) y translucidez (sólido/fresnel) contra formas de colores.';
refHint.style.cssText = 'font-size: 10px; color:#5a9; line-height:1.4;';
panel.appendChild(refHint);

// --- Interacción táctil ---
let isPressed = false;

window.addEventListener('pointerdown', () => {
    isPressed = true;
    if (text) text.textContent = 'Se mueve';
});
window.addEventListener('pointerup', () => {
    isPressed = false;
    if (text) text.textContent = 'No se mueve';
});

// Adaptar cámara en caso de girar la pantalla del celular
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

// --- Bucle de animación ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const t = clock.getElapsedTime();

    const reacting = params.touchReacts && isPressed;
    const amp = params.breathAmplitude * (reacting ? 2.6 : 1);
    const speed = params.breathSpeed * (reacting ? 1.8 : 1);

    ente.children.forEach((slice) => {
        const bt = slice.userData.t;
        const breath = Math.sin(t * speed + bt * 5) * amp;
        const s = Math.max(0.02, slice.userData.baseScale + breath);
        slice.scale.set(s, 1, s);
    });

    const spin = params.idleRotSpeed * (reacting ? 2.2 : 1);
    ente.rotation.y += delta * spin;

    // Actualiza el reflejo en tiempo real solo cuando hace falta (material espejo)
    if (params.material === 'espejo') {
        ente.visible = false;
        cubeCamera.position.copy(ente.position);
        cubeCamera.update(renderer, scene);
        ente.visible = true;
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();
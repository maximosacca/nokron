import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Tone from 'tone';

// --- 0. MODO EXHIBICIÓN vs. MODO DESARROLLO ---
const isDevMode = new URLSearchParams(window.location.search).has('dev');
let uiVisible = isDevMode;

const text = document.getElementById('text');
if (text) text.style.display = isDevMode ? 'block' : 'none';

// --- 1. CONFIGURACIÓN BÁSICA ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0.5, 4.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- 2. CONTROLES DE CÁMARA ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 8;
controls.enablePan = false;
controls.target.set(0, 0.5, 0);

// --- 3. LUCES BASE ---
scene.add(new THREE.HemisphereLight(0x88ffcc, 0x001100, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(2, 3, 2);
scene.add(dir);
const glow = new THREE.PointLight(0x33ffaa, 1.3, 12);
glow.position.set(-2, 1, 2);
scene.add(glow);

// --- 4. AUDIO (Tone.js) ---
const synthConfigs = [
    { osc: 'sine', mod: 'square', baseHarm: 1 },
    { osc: 'triangle', mod: 'sine', baseHarm: 2 },
    { osc: 'sawtooth', mod: 'triangle', baseHarm: 0.5 },
    { osc: 'square', mod: 'sawtooth', baseHarm: 3 },
    { osc: 'sine', mod: 'sine', baseHarm: 1 },
];

let synths = [];
let synthGains = [];
let audioActivo = false;
let inicializandoAudio = false;
let wakeLockSentinel = null;
let wakeLockDeseado = false;
let masterVolume = null;
let masterLimiter = null;
let masterFilter = null;

const audioState = { freq: 100, mod: 1, harm: 1, cutoff: 3000, spread: 0 };

const alturaNormalizada = () => THREE.MathUtils.clamp((params.totalHeight - 0.5) / 3.5, 0, 1);
const cutoffDesdeAltura = (n) => Math.min(500 * Math.pow(2, n * 6), 16000); 
const spreadDesdeAltura = (n) => n * 40; 

const volToDb = (v) => (v <= -40 ? -100 : v);

const audioHint = document.createElement('div');
audioHint.textContent = 'TOCÁ LA PANTALLA PARA ACTIVAR EL SONIDO';
audioHint.style.cssText = `
    position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
    color: #88ffcc; font-family: monospace; font-size: 13px; letter-spacing: 2px;
    text-shadow: 0 0 8px #000; pointer-events: none; z-index: 5;
    opacity: 0.8; transition: opacity 1s ease-in-out; text-align: center;
`;
document.body.appendChild(audioHint);

function entrarPantallaCompleta() {
    if (isDevMode || document.fullscreenElement) return;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
        const r = req.call(el);
        if (r && r.catch) r.catch((err) => console.warn('No se pudo entrar en pantalla completa:', err));
    } catch (err) {
        console.warn('No se pudo entrar en pantalla completa:', err);
    }
}

async function pedirWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.warn('No se pudo bloquear la suspensión de pantalla:', err);
    }
}

function pedirPermisoOrientacion() {
    try {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().catch(() => {});
        }
    } catch (err) { }
}

function crearSintes() {
    const volSliderEl = document.getElementById('vol-slider');
    const startVol = volSliderEl ? parseFloat(volSliderEl.value) : -10;

    masterLimiter = new Tone.Limiter(-2).toDestination();
    masterVolume = new Tone.Volume(volToDb(startVol)).connect(masterLimiter);

    const n0 = alturaNormalizada();
    audioState.cutoff = cutoffDesdeAltura(n0);
    audioState.spread = spreadDesdeAltura(n0);
    masterFilter = new Tone.Filter({ type: 'lowpass', frequency: audioState.cutoff, rolloff: -12, Q: 1 }).connect(masterVolume);

    for (let i = 0; i < 5; i++) {
        const gainNode = new Tone.Gain(0).connect(masterFilter);
        const s = new Tone.FMSynth({
            volume: -8, // ARREGLO DIGITAL: -8dB para dar respiro al dispositivo y evitar petardeos
            harmonicity: synthConfigs[i].baseHarm,
            modulationIndex: 1,
            oscillator: { type: synthConfigs[i].osc },
            modulation: { type: synthConfigs[i].mod },
            envelope: { attack: 2, decay: 0.1, sustain: 1, release: 2 },
        }).connect(gainNode);

        s.triggerAttack('C2');
        synths.push(s);
        synthGains.push(gainNode);
    }
    synthGains[0].gain.value = 1;
}

async function onUserGesture() {
    if (audioActivo) {
        const ctx = Tone.getContext();
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
        return;
    }
    if (inicializandoAudio) return;
    inicializandoAudio = true;

    entrarPantallaCompleta();
    pedirPermisoOrientacion();
    wakeLockDeseado = true;
    pedirWakeLock();

    try {
        await Tone.start();
        if (Tone.getContext().state !== 'running') {
            throw new Error('El contexto de audio sigue suspendido');
        }
        crearSintes();
        audioActivo = true;
        audioHint.style.opacity = '0';
        console.log('Sistema de audio en línea: 5 sintes activados');
    } catch (err) {
        console.warn('El audio no arrancó, se reintentará en el próximo toque:', err);
        inicializandoAudio = false; 
    }
}

['pointerup', 'touchend', 'click', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, onUserGesture, { capture: true, passive: true })
);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (wakeLockDeseado) pedirWakeLock();
    if (audioActivo) {
        const ctx = Tone.getContext();
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
    }
});

// --- 5. FONDO 360º (Múltiples Memorias) ---
const textureLoader = new THREE.TextureLoader();
const memorias = ['fondo-nokron.jpg', 'tanques.jpg', 'base-destruida.jpg'];
let memoriaActual = 0;
let currentEnvTexture = null;

function cargarMemoria(index) {
    textureLoader.load(
        memorias[index],
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.flipY = false; 

            const anterior = currentEnvTexture;
            scene.background = new THREE.Color(0x05080a);
            scene.environment = texture;
            currentEnvTexture = texture;
            if (anterior) anterior.dispose();
        },
        undefined,
        (err) => console.warn(`No se pudo cargar la memoria "${memorias[index]}":`, err)
    );
}
cargarMemoria(memoriaActual);

// --- 6. MATERIALES ---
const wireMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.85 });
const solidMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
const fresnelMat = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(0x33ffaa) } },
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: `
        varying vec3 vNormal; varying vec3 vViewDir;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            vViewDir = normalize(-mvPos.xyz);
            gl_Position = projectionMatrix * mvPos;
        }
    `,
    fragmentShader: `
        varying vec3 vNormal; varying vec3 vViewDir; uniform vec3 glowColor;
        void main() {
            float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.2);
            vec3 base = vec3(0.02, 0.05, 0.04);
            vec3 col = mix(base, glowColor, fresnel);
            gl_FragColor = vec4(col, 0.35 + fresnel * 0.65);
        }
    `,
});
const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.05 });
const materials = { wireframe: wireMat, solido: solidMat, fresnel: fresnelMat, espejo: mirrorMat };

// --- 7. OBJETO PRINCIPAL: ENTE VARADO ---
const ente = new THREE.Group();
ente.position.y = 0.5;
scene.add(ente);

const PROFILE_CYCLE = ['huso', 'doble', 'conico', 'glitch', 'constante'];
const params = {
    gesturesEnabled: true, planeCount: 40, totalHeight: 1.8, twistTurns: 0.75, spiralRadius: 0,
    jitter: 0, profile: 'huso',
    material: isDevMode ? 'fresnel' : 'espejo',
    breathAmplitude: 0.05, breathSpeed: 3, idleRotSpeed: 0.2, touchReacts: true,
};
const DEFAULTS = { ...params };
const shared = new THREE.BoxGeometry(1, 0.002, 1);

let currentProfileIndex = 0;
let targetProfileIndex = 0;
let morphProgress = 1.0;

function buildGroup() {
    while (ente.children.length) ente.remove(ente.children[0]);
    const mat = materials[params.material] || materials.fresnel;
    for (let i = 0; i < params.planeCount; i++) {
        const t = params.planeCount > 1 ? i / (params.planeCount - 1) : 0;
        const mesh = new THREE.Mesh(shared, mat);
        mesh.userData = { t, glitchSeed: Math.random() };
        ente.add(mesh);
    }
}

function updateMaterial() {
    const mat = materials[params.material] || materials.fresnel;
    ente.children.forEach((mesh) => { mesh.material = mat; });
}
buildGroup();

function startMorph(newIndex) {
    if (newIndex < 0 || newIndex >= PROFILE_CYCLE.length) return;
    if (morphProgress < 1.0) {
        if (newIndex === targetProfileIndex) return;
        currentProfileIndex = targetProfileIndex; 
    }
    if (newIndex === currentProfileIndex) { morphProgress = 1.0; return; }
    targetProfileIndex = newIndex;
    morphProgress = 0.0;
    params.profile = PROFILE_CYCLE[newIndex];
    const uiSelect = controlsRegistry['profile']?.select;
    if (uiSelect) uiSelect.value = params.profile;
}

// --- 8. OBJETOS DE REFERENCIA (Ocultos) ---
const referenceGroup = new THREE.Group();
const refShapes = [
    { color: 0xff8844, pos: [3.2, 1.2, -1], geo: new THREE.BoxGeometry(1.2, 1.2, 1.2) },
    { color: 0x33ffee, pos: [-3, -0.5, 1.5], geo: new THREE.TorusGeometry(0.9, 0.25, 12, 32) },
];
refShapes.forEach((s) => {
    const m = new THREE.Mesh(s.geo, new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.4 }));
    m.position.set(...s.pos);
    referenceGroup.add(m);
});

// --- 9. D-PAD DE ROTACIÓN DE CÁMARA ---
const dpadCont = document.createElement('div');
dpadCont.style.cssText = `
    position: fixed; bottom: 20px; left: 20px; z-index: 10;
    display: none;
    grid-template-columns: repeat(3, 45px); grid-template-rows: repeat(3, 45px); gap: 5px; opacity: 0.85;
`;
document.body.appendChild(dpadCont);

function updateDpadVisibility() {
    dpadCont.style.display = params.gesturesEnabled ? 'grid' : 'none';
}
updateDpadVisibility();

const btnStyle = `
    background: #001a0dee; border: 1px solid #33ffaa; border-radius: 8px;
    color: #66ffaa; display: flex; align-items: center; justify-content: center;
    font-size: 20px; cursor: pointer; user-select: none; touch-action: none;
`;

const manualRotation = { x: 0, y: 0 };
function createDpadBtn(col, row, icon, prop, val) {
    const btn = document.createElement('div');
    btn.style.cssText = btnStyle + `grid-column: ${col}; grid-row: ${row};`;
    btn.innerHTML = icon;
    const start = (e) => { e.preventDefault(); manualRotation[prop] = val; };
    const end = (e) => { e.preventDefault(); manualRotation[prop] = 0; };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointerleave', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    dpadCont.appendChild(btn);
}
createDpadBtn(2, 1, '▲', 'y', -0.03);
createDpadBtn(2, 3, '▼', 'y', 0.03);
createDpadBtn(1, 2, '◀', 'x', -0.03);
createDpadBtn(3, 2, '▶', 'x', 0.03);

// --- 9.5 SLIDER DE VOLUMEN ---
const volCont = document.createElement('div');
volCont.style.cssText = `
    position: fixed; bottom: 30px; right: 20px; z-index: 10;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    color: #66ffaa; font-family: monospace; font-size: 11px; opacity: 0.85;
`;
document.body.appendChild(volCont);

const volLabel = document.createElement('span');
volLabel.textContent = 'VOLUMEN';
volCont.appendChild(volLabel);

const volSlider = document.createElement('input');
volSlider.id = 'vol-slider';
volSlider.type = 'range';
volSlider.min = -40;
volSlider.max = 0;
volSlider.step = 1;
volSlider.value = -10;
volSlider.style.cssText = 'width: 120px; accent-color: #33ffaa; cursor: pointer;';
volCont.appendChild(volSlider);

volSlider.addEventListener('input', (e) => {
    if (masterVolume) masterVolume.volume.value = volToDb(parseFloat(e.target.value));
});

// --- 9.8 SISTEMA DE INACTIVIDAD ---
const idleText = document.createElement('div');
idleText.textContent = 'INTERACTÚA CON EL OBJETO';
idleText.style.cssText = `
    position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%);
    color: #88ffcc; font-family: monospace; font-size: 14px; opacity: 0;
    pointer-events: none; transition: opacity 1.5s ease-in-out; z-index: 5;
    letter-spacing: 2px; text-shadow: 0px 0px 8px #000000;
`;
document.body.appendChild(idleText);

let idleTimer = null;
function resetIdleTimer() {
    idleText.style.opacity = '0';
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { idleText.style.opacity = '0.6'; }, 10000);
}

renderer.domElement.addEventListener('pointermove', resetIdleTimer);
renderer.domElement.addEventListener('pointerdown', resetIdleTimer);
renderer.domElement.addEventListener('touchstart', resetIdleTimer, { passive: true });
resetIdleTimer();

// --- 10. INTERFAZ DE USUARIO DEV ---
const menuToggleBtn = document.createElement('button');
menuToggleBtn.textContent = '✕ Cerrar menú';
menuToggleBtn.style.cssText = `
    position: fixed; top: 12px; right: 12px; z-index: 11; background: #001a0dee; color: #66ffaa;
    border: 1px solid #33ffaa; border-radius: 4px; padding: 6px 10px; font-family: monospace; font-size: 11px; cursor: pointer;
`;
document.body.appendChild(menuToggleBtn);

const panel = document.createElement('div');
panel.style.cssText = `
    position: fixed; top: 54px; right: 12px; width: 270px; max-height: calc(90vh - 54px); overflow-y: auto;
    background: #001a0dee; border: 1px solid #144; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 11px; color: #88ffcc; z-index: 10;
`;
document.body.appendChild(panel);

let panelOpen = true;
menuToggleBtn.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? 'block' : 'none';
    menuToggleBtn.textContent = panelOpen ? '✕ Cerrar menú' : '☰ Abrir menú';
});

function setUIVisible(visible) {
    uiVisible = visible;
    menuToggleBtn.style.display = visible ? 'block' : 'none';
    panel.style.display = visible && panelOpen ? 'block' : 'none';
}
setUIVisible(isDevMode);

const secretCorner = document.createElement('div');
secretCorner.style.cssText = 'position: fixed; top: 0; left: 0; width: 70px; height: 70px; z-index: 20;';
document.body.appendChild(secretCorner);

let secretTapCount = 0;
let secretTapTimer = null;
secretCorner.addEventListener('pointerdown', () => {
    secretTapCount += 1;
    clearTimeout(secretTapTimer);
    secretTapTimer = setTimeout(() => { secretTapCount = 0; }, 600);
    if (secretTapCount >= 5) {
        secretTapCount = 0;
        setUIVisible(!uiVisible);
    }
});

const title = document.createElement('div');
title.textContent = 'Fragmento de Memoria — laboratorio';
title.style.cssText = 'font-size: 13px; color: #66ffaa; margin-bottom: 8px;';
panel.appendChild(title);
const controlsRegistry = {};

function applySideEffects(key) {
    if (key === 'planeCount') buildGroup();
    if (key === 'material') updateMaterial();
    if (key === 'gesturesEnabled') {
        updateDpadVisibility();
        if (!params.gesturesEnabled) controls.enabled = true;
    }
    if (key === 'profile') startMorph(PROFILE_CYCLE.indexOf(params.profile));
}

function decimalsFromStep(step) {
    const s = String(step);
    return s.includes('.') ? s.split('.')[1].length : 0;
}

function createResetButton(onClick) {
    const btn = document.createElement('button');
    btn.textContent = '↺';
    btn.style.cssText = 'background:#001a0d; color:#66ffaa; border:1px solid #33ffaa; border-radius:4px; cursor:pointer; font-size:11px; padding:1px 6px; line-height:1.4;';
    btn.addEventListener('click', onClick);
    return btn;
}

function addSlider(label, key, min, max, step) {
    const decimals = decimalsFromStep(step);
    const fmt = () => `${label}: ${Number(params[key]).toFixed(decimals)}`;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px; margin-bottom:10px;';
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:6px;';
    const span = document.createElement('span');
    span.textContent = fmt();
    headerRow.appendChild(span);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step; input.value = params[key];
    input.style.width = '100%';
    input.addEventListener('input', () => {
        params[key] = parseFloat(input.value);
        span.textContent = fmt();
        applySideEffects(key);
    });

    const resetBtn = createResetButton(() => {
        params[key] = DEFAULTS[key];
        input.value = DEFAULTS[key];
        span.textContent = fmt();
        applySideEffects(key);
    });
    headerRow.appendChild(resetBtn);
    wrapper.appendChild(headerRow);
    wrapper.appendChild(input);
    panel.appendChild(wrapper);
    controlsRegistry[key] = { type: 'slider', input, span, fmt };
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
    select.style.cssText = 'background:#001a0d; color:#66ffaa; border:1px solid #33ffaa; border-radius:4px; padding:4px 6px; font-family:monospace; font-size:12px; width:100%;';
    options.forEach(([value, textLabel]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = textLabel;
        if (value === params[key]) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => { params[key] = select.value; applySideEffects(key); });

    const resetBtn = createResetButton(() => {
        params[key] = DEFAULTS[key];
        select.value = DEFAULTS[key];
        applySideEffects(key);
    });
    headerRow.appendChild(resetBtn);
    wrapper.appendChild(headerRow);
    wrapper.appendChild(select);
    panel.appendChild(wrapper);
    controlsRegistry[key] = { type: 'select', select };
}

function addCheckbox(label, key) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;';
    const left = document.createElement('label');
    left.style.cssText = 'display:flex; align-items:center; gap:8px;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = params[key];
    input.addEventListener('change', () => { params[key] = input.checked; applySideEffects(key); });
    left.appendChild(input);
    const span = document.createElement('span');
    span.textContent = label;
    left.appendChild(span);
    wrapper.appendChild(left);
    wrapper.appendChild(createResetButton(() => {
        params[key] = DEFAULTS[key];
        input.checked = DEFAULTS[key];
        applySideEffects(key);
    }));
    panel.appendChild(wrapper);
    controlsRegistry[key] = { type: 'checkbox', input };
}

addCheckbox('Interacción reactiva', 'gesturesEnabled');
addSlider('Cantidad de planos', 'planeCount', 6, 120, 1);
addSlider('Altura total (pellizco)', 'totalHeight', 0.5, 4, 0.05);
addSlider('Vueltas de twist', 'twistTurns', 0, 6, 0.05);
addSlider('Radio de espiral', 'spiralRadius', 0, 1.5, 0.02);
addSlider('Ruido / glitch', 'jitter', 0, 1.5, 0.02);
addSelect('Perfil de silueta', 'profile', [['huso', 'Huso'], ['doble', 'Doble lóbulo'], ['conico', 'Cónico'], ['glitch', 'Aleatorio'], ['constante', 'Cilindro']]);
addSelect('Material', 'material', [['fresnel', 'Fresnel'], ['wireframe', 'Wireframe'], ['solido', 'Sólido'], ['espejo', 'Espejo']]);
addSlider('Amplitud de respiración', 'breathAmplitude', 0, 0.3, 0.01);
addSlider('Velocidad de respiración', 'breathSpeed', 0, 10, 0.1);
addSlider('Rotación pasiva', 'idleRotSpeed', 0, 1.5, 0.02);
addCheckbox('Reacciona al presionar', 'touchReacts');

function syncPanelFromParams() {
    for (const key of ['totalHeight', 'jitter', 'spiralRadius']) {
        const c = controlsRegistry[key];
        if (c) { c.input.value = params[key]; c.span.textContent = c.fmt(); }
    }
}

// --- 11. INTERACCIÓN ---
let isPressed = false;
const releasePress = () => { isPressed = false; };
renderer.domElement.addEventListener('pointerdown', () => { isPressed = true; });
window.addEventListener('pointerup', releasePress);
window.addEventListener('pointercancel', releasePress);
window.addEventListener('blur', releasePress);

const dom = renderer.domElement;
dom.style.touchAction = 'none';

let touchStartTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let touchHasDragged = false;
let touchesActive = 0;
let pinchStartDist = null;
let pinchStartHeight = params.totalHeight;

let ultimoTapTime = 0;
let tapTimer = null;
const TAP_WINDOW = 400;

function handleTap() {
    const ahora = performance.now();
    if (ahora - ultimoTapTime < TAP_WINDOW) {
        clearTimeout(tapTimer);
        tapTimer = null;
        ultimoTapTime = 0;
        memoriaActual = (memoriaActual + 1) % memorias.length;
        cargarMemoria(memoriaActual);
    } else {
        ultimoTapTime = ahora;
        tapTimer = setTimeout(() => {
            tapTimer = null;
            if (morphProgress >= 1.0) startMorph((targetProfileIndex + 1) % PROFILE_CYCLE.length);
        }, TAP_WINDOW);
    }
}

function distanceBetweenTouches(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

dom.addEventListener('touchstart', (e) => {
    if (!params.gesturesEnabled) return;
    touchesActive = e.touches.length;
    controls.enabled = false;
    if (e.touches.length === 1) {
        touchStartTime = performance.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchHasDragged = false;
    } else if (e.touches.length === 2) {
        pinchStartDist = distanceBetweenTouches(e.touches);
        pinchStartHeight = params.totalHeight;
    }
}, { passive: true });

dom.addEventListener('touchmove', (e) => {
    if (!params.gesturesEnabled) return;
    touchesActive = e.touches.length;
    if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
            touchHasDragged = true;
            params.jitter = THREE.MathUtils.clamp(params.jitter + dist * 0.0015, 0, 2.0);
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    } else if (e.touches.length === 2 && pinchStartDist) {
        const dist = distanceBetweenTouches(e.touches);
        params.totalHeight = THREE.MathUtils.clamp(pinchStartHeight * (dist / pinchStartDist), 0.5, 4);
    }
}, { passive: true });

dom.addEventListener('touchend', (e) => {
    if (!params.gesturesEnabled) return;
    touchesActive = e.touches.length;
    if (e.touches.length === 0) {
        const duration = performance.now() - touchStartTime;
        if (!touchHasDragged && duration < 300) handleTap();
        pinchStartDist = null;
        controls.enabled = true;
    } else if (e.touches.length === 1) {
        pinchStartDist = null;
        touchStartTime = performance.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchHasDragged = true; 
    }
}, { passive: true });

dom.addEventListener('touchcancel', () => {
    touchesActive = 0;
    pinchStartDist = null;
    controls.enabled = true; 
}, { passive: true });

let mouseDownX = 0;
let mouseDownY = 0;
let mouseDownTime = 0;
dom.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    mouseDownTime = performance.now();
});
dom.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch' || !params.gesturesEnabled) return;
    const moved = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY);
    if (moved < 6 && performance.now() - mouseDownTime < 300) handleTap();
});

let tiltTarget = 0;
window.addEventListener('deviceorientation', (e) => {
    if (!params.gesturesEnabled) return;
    const gamma = e.gamma || 0;
    tiltTarget = Math.min(Math.abs(gamma) / 45, 1) * 1.2;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 12. LOOP DE ANIMACIÓN Y SONIDO ---
let lastFrameTime = performance.now();
let time = 0;

let interactionLevel = 0.20;
let syncPanelTimer = 0;

function obtenerEscalaPerfil(tipo, t, glitchSeed) {
    switch (tipo) {
        case 'doble': return Math.abs(Math.sin(t * Math.PI * 2)) * 1.4 + 0.08;
        case 'conico': return (1 - t) * 1.5 + 0.08;
        case 'glitch': return 0.3 + glitchSeed * 1.3;
        case 'constante': return 1.0;
        case 'huso':
        default: return Math.sin(t * Math.PI) * 1.5 + 0.08;
    }
}

function animate(now) {
    requestAnimationFrame(animate);

    const ahora = now ?? performance.now();
    const delta = Math.min((ahora - lastFrameTime) / 1000, 0.1);
    lastFrameTime = ahora;
    time += delta;

    if (params.gesturesEnabled) {
        params.spiralRadius = THREE.MathUtils.lerp(params.spiralRadius, tiltTarget, 0.05);
        if (touchesActive === 0 && params.jitter > 0) params.jitter = Math.max(0, params.jitter - delta * 0.5);
    }

    if (uiVisible) {
        syncPanelTimer += delta;
        if (syncPanelTimer > 0.2) { syncPanelTimer = 0; syncPanelFromParams(); }
    }

    if (morphProgress < 1.0) {
        morphProgress += delta * 1.2;
        if (morphProgress >= 1.0) {
            morphProgress = 1.0;
            currentProfileIndex = targetProfileIndex;
        }
    }

    const reacting = params.touchReacts && isPressed;
    const amp = params.breathAmplitude * (reacting ? 2.6 : 1);
    const speed = params.breathSpeed * (reacting ? 1.8 : 1);
    const progresoSuavizado = THREE.MathUtils.smoothstep(morphProgress, 0, 1);

    const tipoActual = PROFILE_CYCLE[currentProfileIndex];
    const tipoDestino = PROFILE_CYCLE[targetProfileIndex];

    ente.children.forEach((slice) => {
        const { t, glitchSeed } = slice.userData;
        const escalaActual = obtenerEscalaPerfil(tipoActual, t, glitchSeed);
        const escalaDestino = obtenerEscalaPerfil(tipoDestino, t, glitchSeed);
        const lerpedScale = THREE.MathUtils.lerp(escalaActual, escalaDestino, progresoSuavizado);

        const mutacionOrganica = Math.sin(t * 15.0 + time * 4.0) * Math.cos(t * 8.0 - time * 2.0) * params.jitter;
        const breath = Math.sin(time * speed + t * 5) * amp;
        const s = Math.max(0.01, lerpedScale + mutacionOrganica + breath);

        slice.scale.set(s, 1, s);
        const angle = t * Math.PI * 2 * params.twistTurns;
        slice.position.set(
            Math.cos(angle) * params.spiralRadius,
            (t - 0.5) * params.totalHeight,
            Math.sin(angle) * params.spiralRadius
        );
        slice.rotation.y = angle + mutacionOrganica;
    });

    ente.rotation.y += delta * params.idleRotSpeed * (reacting ? 2.2 : 1);

    const isInteracting = (touchesActive > 0 || isPressed);
    const targetInteraction = isInteracting ? 1.0 : 0.20;
    const fadeSpeed = isInteracting ? 2.0 : 0.4;
    interactionLevel = THREE.MathUtils.lerp(interactionLevel, targetInteraction, Math.min(delta * fadeSpeed, 1));

    if (manualRotation.x !== 0 || manualRotation.y !== 0) {
        const offset = new THREE.Vector3().copy(camera.position).sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta -= manualRotation.x;
        spherical.phi += manualRotation.y;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.1, Math.PI - 0.1);
        offset.setFromSpherical(spherical);
        camera.position.copy(controls.target).add(offset);
    }
    controls.update();

    if (audioActivo && synths.length > 0) {
        const polar = controls.getPolarAngle();
        const targetFreq = THREE.MathUtils.mapLinear(polar, 0, Math.PI, 60, 400);
        const jitterClamped = THREE.MathUtils.clamp(params.jitter, 0, 1.5);
        const targetMod = THREE.MathUtils.mapLinear(jitterClamped, 0, 1.5, 1, 50);
        const targetHarm = THREE.MathUtils.mapLinear(params.twistTurns, 0, 6, 0.5, 4);

        const k = 1 - Math.exp(-delta * 10);
        audioState.freq += (targetFreq - audioState.freq) * k;
        audioState.mod += (targetMod - audioState.mod) * k;
        audioState.harm += (targetHarm - audioState.harm) * k;

        const alturaN = alturaNormalizada();
        const targetCutoff = cutoffDesdeAltura(alturaN);
        audioState.cutoff = Math.exp(Math.log(audioState.cutoff) + (Math.log(targetCutoff) - Math.log(audioState.cutoff)) * k);
        audioState.spread += (spreadDesdeAltura(alturaN) - audioState.spread) * k;
        if (masterFilter) masterFilter.frequency.value = audioState.cutoff;

        // ARREGLO DE RENDIMIENTO: Solo actualizamos los cálculos del sintetizador que está sonando.
        // Ignoramos a los demás para que el procesador de la tablet respire y no petardee.
        const updateSynth = (index) => {
            const s = synths[index];
            s.frequency.value = audioState.freq;
            s.modulationIndex.value = audioState.mod;
            s.harmonicity.value = audioState.harm * synthConfigs[index].baseHarm;
            s.detune.value = (index - 2) * audioState.spread; 
        };

        updateSynth(currentProfileIndex);
        
        // Si hay una transformación en progreso, también actualizamos el sintetizador de destino
        if (morphProgress < 1.0 && targetProfileIndex !== currentProfileIndex) {
            updateSynth(targetProfileIndex);
        }

        for (let i = 0; i < synthGains.length; i++) {
            let g = 0;
            if (morphProgress >= 1.0) {
                if (i === currentProfileIndex) g = interactionLevel;
            } else if (i === currentProfileIndex) {
                g = (1.0 - progresoSuavizado) * interactionLevel;
            } else if (i === targetProfileIndex) {
                g = progresoSuavizado * interactionLevel;
            }
            synthGains[i].gain.value = g;
        }
    }

    renderer.render(scene, camera);
}

requestAnimationFrame(animate);
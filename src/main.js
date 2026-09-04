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
camera.position.set(0, 0.8, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Controles de cámara ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 8;
controls.enablePan = false; // sin paneo: el usuario solo orbita/zoomea
controls.target.set(0, 0.8, 0);

// --- Objeto principal: Ente Varado (Planos Seriados) ---
const ente = new THREE.Group();
ente.position.y = 0.8;
scene.add(ente);

const planeCount = 40;     // Cantidad de láminas/planos
const totalHeight = 1.8;   // Altura total de la forma

// Caja muy finita para simular el espesor del material (ej. MDF, acrílico)
const geometry = new THREE.BoxGeometry(1, 0.015, 1); 

const material = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true, // Cambiá a false si querés ver los planos sólidos
    transparent: true,
    opacity: 0.8,
});

for (let i = 0; i < planeCount; i++) {
    const slice = new THREE.Mesh(geometry, material);

    // 1. Posición en Y
    const t = i / (planeCount - 1); 
    slice.position.y = (t - 0.5) * totalHeight;

    // 2. Volumen: curva seno para forma de huso/capullo
    const scale = Math.sin(t * Math.PI) * 1.5 + 0.1;
    slice.scale.set(scale, 1, scale);

    // 3. Rotación (Twist)
    slice.rotation.y = t * Math.PI * 1.5; 

    // Guardamos la escala base para animarla después
    slice.userData = {
        baseScale: scale
    };

    ente.add(slice);
}

// --- Sistema de partículas ---
const MAX_PARTICLES = 500;
const particlePositions = new Float32Array(MAX_PARTICLES * 3);
const particleVelocities = [];
const particleLife = new Float32Array(MAX_PARTICLES);
let nextParticle = 0;

for (let i = 0; i < MAX_PARTICLES; i++) {
    particlePositions[i * 3] = 9999;
    particlePositions[i * 3 + 1] = 9999;
    particlePositions[i * 3 + 2] = 9999;
    particleVelocities.push(new THREE.Vector3());
    particleLife[i] = 0;
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

const particleMaterial = new THREE.PointsMaterial({
    color: 0x66ffaa,
    size: 0.035,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

function spawnParticle() {
    const i = nextParticle;
    nextParticle = (nextParticle + 1) % MAX_PARTICLES;

    const offset = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
    ).normalize().multiplyScalar(0.8);

    particlePositions[i * 3] = ente.position.x + offset.x;
    particlePositions[i * 3 + 1] = ente.position.y + offset.y;
    particlePositions[i * 3 + 2] = ente.position.z + offset.z;

    particleVelocities[i].set(
        (Math.random() - 0.5) * 0.15,
        0.3 + Math.random() * 0.3, 
        (Math.random() - 0.5) * 0.15
    );

    particleLife[i] = 1.5 + Math.random() * 1.5;
}

function updateParticles(delta) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (particleLife[i] > 0) {
            particleLife[i] -= delta;

            particlePositions[i * 3] += particleVelocities[i].x * delta;
            particlePositions[i * 3 + 1] += particleVelocities[i].y * delta;
            particlePositions[i * 3 + 2] += particleVelocities[i].z * delta;

            if (particleLife[i] <= 0) {
                particlePositions[i * 3] = 9999;
                particlePositions[i * 3 + 1] = 9999;
                particlePositions[i * 3 + 2] = 9999;
            }
        }
    }
    particleGeometry.attributes.position.needsUpdate = true;
}

// --- Eventos y variables de interacción ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

let isPressed = false;
let spawnTimer = 0;

window.addEventListener('pointerdown', () => {
    isPressed = true;
    if(text) text.textContent = 'Se mueve';
});
window.addEventListener('pointerup', () => {
    isPressed = false;
    if(text) text.textContent = 'No se mueve';
});

const clock = new THREE.Clock();

// --- Bucle de animación ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // Movimiento orgánico: el ente "respira" constantemente
    ente.children.forEach((slice, index) => {
        const t = index / (planeCount - 1);
        const breath = Math.sin(time * 3 + t * 5) * 0.05; 
        const currentScale = slice.userData.baseScale + breath;
        
        slice.scale.set(currentScale, 1, currentScale);
    });

    if (isPressed) {
        // Reacción al toque: el grupo gira erráticamente
        ente.rotation.y += delta * 1.2;
        ente.rotation.x += delta * 0.4;

        // Emitir partículas
        spawnTimer += delta;
        if (spawnTimer > 0.03) {
            spawnParticle();
            spawnTimer = 0;
        }
    } else {
        // Rotación pasiva constante para que no quede estático
        ente.rotation.y += delta * 0.2;
        
        // Suaviza la rotación en X para que vuelva al eje (opcional pero queda bien)
        ente.rotation.x = THREE.MathUtils.lerp(ente.rotation.x, 0, 0.05);
    }

    updateParticles(delta);
    controls.update();
    renderer.render(scene, camera);
}

animate();
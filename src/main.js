import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// Si tu versión de three no reconoce 'three/addons/...', probá con:
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const text = document.getElementById('text');

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

// --- Controles de cámara: navegación real para tablet, en vez de cámara fija ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 8;
controls.enablePan = false; // sin paneo: el usuario solo orbita/zoomea alrededor del objeto
controls.target.set(0, 0.8, 0); // apunta al objeto principal (el futuro Ente Varado)

// --- Objeto principal: reemplazo del cubo por una forma con más carácter ---
// (placeholder abstracto -- todavía no es el modelo final del Ente Varado)
const geometry = new THREE.IcosahedronGeometry(0.8, 1);
const material = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
});
const ente = new THREE.Mesh(geometry, material);
ente.position.y = 0.8;
scene.add(ente);

// --- Sistema de partículas: boceto de la mecánica del Ente Varado ---
// Idea: mientras se sostiene el toque, el ente gira/reacciona y a su
// alrededor nacen partículas que flotan hacia arriba (simulando su liberación).
const MAX_PARTICLES = 500;
const particlePositions = new Float32Array(MAX_PARTICLES * 3);
const particleVelocities = [];
const particleLife = new Float32Array(MAX_PARTICLES);
let nextParticle = 0;

for (let i = 0; i < MAX_PARTICLES; i++) {
    particlePositions[i * 3] = 9999; // fuera de cámara hasta que se active
    particlePositions[i * 3 + 1] = 9999;
    particlePositions[i * 3 + 2] = 9999;
    particleVelocities.push(new THREE.Vector3());
    particleLife[i] = 0;
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(particlePositions, 3)
);

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

    // Nace cerca de la "superficie" del ente, con dispersión aleatoria
    const offset = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
    )
        .normalize()
        .multiplyScalar(0.8);

    particlePositions[i * 3] = ente.position.x + offset.x;
    particlePositions[i * 3 + 1] = ente.position.y + offset.y;
    particlePositions[i * 3 + 2] = ente.position.z + offset.z;

    particleVelocities[i].set(
        (Math.random() - 0.5) * 0.15,
        0.3 + Math.random() * 0.3, // flotan hacia arriba
        (Math.random() - 0.5) * 0.15
    );

    particleLife[i] = 1.5 + Math.random() * 1.5; // segundos de vida
}

function updateParticles(delta) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (particleLife[i] > 0) {
            particleLife[i] -= delta;

            particlePositions[i * 3] += particleVelocities[i].x * delta;
            particlePositions[i * 3 + 1] += particleVelocities[i].y * delta;
            particlePositions[i * 3 + 2] += particleVelocities[i].z * delta;

            if (particleLife[i] <= 0) {
                // "Apaga" la partícula mandándola lejos hasta que se reutilice
                particlePositions[i * 3] = 9999;
                particlePositions[i * 3 + 1] = 9999;
                particlePositions[i * 3 + 2] = 9999;
            }
        }
    }
    particleGeometry.attributes.position.needsUpdate = true;
}

// Adaptar cámara en caso de girar la pantalla del celular
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

let isPressed = false;
let spawnTimer = 0;

window.addEventListener('pointerdown', () => {
    isPressed = true;
    text.textContent = 'Escaneando...';
});
window.addEventListener('pointerup', () => {
    isPressed = false;
    text.textContent = 'No se mueve';
});

const clock = new THREE.Clock();

// Bucle de animación
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (isPressed) {
        // Placeholder de "reacción" del ente -- se reemplaza más adelante
        // por la animación de cuerpo real (rig o shape keys desde Blender).
        ente.rotation.y += delta * 0.6;
        ente.rotation.x += delta * 0.3;

        // Emitir partículas mientras se sostiene el toque
        spawnTimer += delta;
        if (spawnTimer > 0.03) {
            spawnParticle();
            spawnTimer = 0;
        }
    }

    updateParticles(delta);
    controls.update();
    renderer.render(scene, camera);
}

animate();
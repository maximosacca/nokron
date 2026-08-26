import * as THREE from 'three';

const text = document.getElementById('text');
const mouse = { x: 0, y: 0 };
let isPressed = false;

// 1. Escuchar movimiento unificado (mouse, touch o lápiz)
window.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
});

// 2. Detectar toque o clic presionado
window.addEventListener('pointerdown', (event) => {
    isPressed = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    if (text) text.textContent = 'Se mueve';
});

// 3. Detectar cuando se suelta el dedo o mouse
window.addEventListener('pointerup', () => {
    isPressed = false;
    if (text) text.textContent = 'No se mueve';
});

// Configuración de Three.js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 3;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Evitar que el gesto táctil desplace o refresque la página en celular
renderer.domElement.style.touchAction = 'none';

const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
});
const cube = new THREE.Mesh(geometry, material);

cube.position.y = 0.8;

scene.add(cube);

// Adaptar cámara en caso de girar la pantalla del celular
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Bucle de animación
function animate() {
    requestAnimationFrame(animate);
    if (isPressed) {
        cube.rotation.y = mouse.x / 100;
        cube.rotation.x = mouse.y / 100;
    }
    renderer.render(scene, camera);
}

animate();
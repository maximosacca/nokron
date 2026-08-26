import * as THREE from 'three';



const text = document.getElementById('text')

const mouse = { x: 0, y: 0 };

window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;


});

const scene = new THREE.Scene();
const fov = 75;
const aspectRatio = window.innerWidth / window.innerHeight;
const near = 0.1;
const far = 1000;

const camera = new THREE.PerspectiveCamera(
    fov,
    aspectRatio,
    near,
    far
)

camera.position.z = 3;
camera.position.y = 0

const renderer = new THREE.WebGLRenderer();

renderer.setSize(window.innerWidth, window.innerHeight);

document.body.appendChild(renderer.domElement);

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
    if (isPressed === true) {
        cube.rotation.y = mouse.x / 100
        cube.rotation.x = mouse.y / 100
    }
    renderer.render(scene, camera)
}

animate()


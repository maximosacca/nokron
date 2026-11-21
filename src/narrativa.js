// narrativa.js
// Texto narrativo que aparece SOBRE el objeto cuando nadie interactúa.
// Arranca visible (así el primer visitante ya llega con contexto) y vuelve a aparecer
// después de un rato sin tocar la pantalla. Cualquier toque lo retira.
// Para probar rápido: agregá ?idle=5 a la URL (aparece a los 5 s sin tocar).

// ✎ TEXTOS: editá las estrofas acá. Cada estrofa es una pantalla; cada string, un renglón.
export const ESTROFAS_POR_DEFECTO = [
    [ 'LA MEMORIA NO ES NEUTRAL', 'JUZGA LO QUE HICIMOS', 'RECUERDA LO BUENO Y LO PERDIDO'],
    [ 'REFLEJA LO QUE FUIMOS', 'Y LO QUE NO SUPIMOS CUIDAR'],
    ['SE QUEDA', 'PARA QUE NO LO OLVIDEMOS'],
];

const idleDesdeUrl = parseFloat(new URLSearchParams(window.location.search).get('idle'));

export function iniciarNarrativa(opciones = {}) {
    const {
        estrofas = ESTROFAS_POR_DEFECTO,
        invitacion = 'TOCÁ LA SUPERFICIE', // línea chica al pie, siempre invita a interactuar
        idleMs = 15000, // sin tocar durante este tiempo -> aparece el texto
        visibleMs = 14000, // cuánto dura cada estrofa en pantalla
        pausaMs = 8000, // pausa entre estrofas mientras nadie toca
        opacidadFondo = 0.7, // qué tan oscuro queda el fondo detrás del texto (0 a 1)
        tamanoVh = 8, // tamaño de letra: % del alto de pantalla (se limita por el ancho si la tablet está vertical)
        // Estilo igual al del resto de los textos de main.js (cartel de sonido)
        color = '#88ffcc',
        sombra = '0 0 8px #000',
        espaciado = '0.15em', // main usa 2px sobre 13px de letra; acá se mantiene la misma proporción
        interlineado = 0.95, // separación entre renglones de una misma frase (más bajo = más junto)
        mostrarAlInicio = true,
    } = opciones;

    const idle = Number.isFinite(idleDesdeUrl) && idleDesdeUrl > 0 ? idleDesdeUrl * 1000 : idleMs;

    // Capa por encima del canvas, pero sin capturar toques (los gestos siguen llegando al objeto)
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 6;
        display: flex; flex-direction: column; align-items: center; justify-content: space-evenly;
        padding: 4vh 5vw; box-sizing: border-box;
        background: rgba(0, 0, 0, ${opacidadFondo});
        opacity: 0; pointer-events: none;
        user-select: none; -webkit-user-select: none;
        font-family: monospace; font-weight: normal; text-align: center;
        color: ${color}; text-shadow: ${sombra};
    `;
    document.body.appendChild(overlay);

    const bloque = document.createElement('div');
    bloque.style.cssText =
        'flex: 1; width: 100%; display: flex; flex-direction: column; justify-content: space-evenly; align-items: center;';
    overlay.appendChild(bloque);

    const pie = document.createElement('div');
    pie.textContent = invitacion;
    pie.style.cssText = `font-size: ${tamanoVh * 0.3}vh; letter-spacing: ${espaciado}; opacity: 0;`;
    overlay.appendChild(pie);

    function renderEstrofa(lineas) {
        bloque.innerHTML = '';
        lineas.forEach((txt, i) => {
            const l = document.createElement('div');
            l.textContent = txt;
            l.style.cssText = `
                font-size: min(${tamanoVh}vh, ${(tamanoVh * 0.9).toFixed(2)}vw);
                line-height: ${interlineado}; letter-spacing: ${espaciado}; font-weight: normal;
                text-wrap: balance; max-width: 100%;
                opacity: 0; transform: translateY(1.5vh);
                transition: opacity 1.2s ease-out ${i * 1.1}s, transform 1.2s ease-out ${i * 1.1}s;
            `;
            bloque.appendChild(l);
        });
        void bloque.offsetHeight; // fuerza el reflow para que las transiciones arranquen
        Array.from(bloque.children).forEach((l) => {
            l.style.opacity = '1';
            l.style.transform = 'translateY(0)';
        });
    }

    let timer = null;
    let indice = 0;
    let visible = false;
    let ultimoReset = 0;

    function mostrar() {
        visible = true;
        renderEstrofa(estrofas[indice % estrofas.length]);
        indice += 1;
        overlay.style.transition = 'opacity 1.6s ease-in-out';
        overlay.style.opacity = '1';
        pie.style.transition = 'opacity 1.2s ease-in-out 3.5s';
        pie.style.opacity = '0.85';
        clearTimeout(timer);
        timer = setTimeout(ocultarYEsperar, visibleMs);
    }

    function retirar(segundos) {
        visible = false;
        overlay.style.transition = `opacity ${segundos}s ease-out`;
        overlay.style.opacity = '0';
        pie.style.transition = 'none';
        pie.style.opacity = '0';
    }

    function ocultarYEsperar() {
        retirar(1.6);
        timer = setTimeout(mostrar, pausaMs);
    }

    function alInteractuar() {
        const ahora = Date.now();
        if (!visible && ahora - ultimoReset < 250) return; // pointermove dispara muchísimo; no hace falta reprogramar cada vez
        ultimoReset = ahora;
        if (visible) retirar(0.5);
        clearTimeout(timer);
        timer = setTimeout(mostrar, idle);
    }

    ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'keydown', 'wheel'].forEach((ev) =>
        window.addEventListener(ev, alInteractuar, { passive: true, capture: true })
    );

    if (mostrarAlInicio) mostrar();
    else timer = setTimeout(mostrar, idle);

    return { mostrarAhora: mostrar, retirarAhora: () => retirar(0.5) };
}
/** --- THREE.JS SYSTEM --- **/
let scene, camera, renderer, cloud, initialPos;
const PARTICLE_COUNT = 20000;
let params = { scale: 1, rotX: 0, rotY: 0, mode: "normal", hue: 0.5 };
let lerp = { scale: 1, rotX: 0, rotY: 0 };

function initThree() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
    );
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document
        .getElementById("canvas-container")
        .appendChild(renderer.domElement);

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    initialPos = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT * 3; i += 3) {
        const r = Math.random() * 2.5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        pos[i] = r * Math.sin(phi) * Math.cos(theta);
        pos[i + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i + 2] = r * Math.cos(phi);

        initialPos[i] = pos[i];
        initialPos[i + 1] = pos[i + 1];
        initialPos[i + 2] = pos[i + 2];
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0x00f2ff,
        size: 0.018,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
    });

    cloud = new THREE.Points(geo, mat);
    scene.add(cloud);

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

/** --- MEDIAPIPE HAND TRACKING --- **/
const video = document.getElementById("hand-video");
const canvas = document.getElementById("hand-canvas");
const ctx = canvas.getContext("2d");
const statusLabel = document.getElementById("gesture-status");
const zoomLabel = document.getElementById("zoom-val");

const hands = new Hands({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.75,
    minTrackingConfidence: 0.75,
});

hands.onResults((results) => {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (
        results.multiHandLandmarks &&
        results.multiHandLandmarks.length > 0
    ) {
        const marks = results.multiHandLandmarks[0];
        drawConnectors(ctx, marks, HAND_CONNECTIONS, {
            color: "#00f2ff",
            lineWidth: 4,
        });
        drawLandmarks(ctx, marks, { color: "#ffffff", radius: 2 });

        // Finger Detection Logic
        const isUp = (tip, pip) => marks[tip].y < marks[pip].y;
        const thumbUp = marks[4].x < marks[3].x; // Crude check for thumb
        const index = isUp(8, 6),
            middle = isUp(12, 10),
            ring = isUp(16, 14),
            pinky = isUp(20, 18);

        // PINCH DISTANCE (Thumb to Index)
        const pinchDist = Math.hypot(
            marks[4].x - marks[8].x,
            marks[4].y - marks[8].y,
        );

        // GESTURE DETERMINATION
        if (index && !middle && !ring && !pinky) {
            // PINCH ZOOM MODE (When Index is up and Thumb is active)
            params.mode = "normal";
            statusLabel.innerText = "👌 PINCH ZOOMING";
            // Map pinch distance (0.02 to 0.25) to scale (0.1 to 4.0)
            params.scale = THREE.MathUtils.mapLinear(
                pinchDist,
                0.03,
                0.25,
                0.2,
                4.5,
            );
        } else if (index && middle && !ring && !pinky) {
            params.mode = "vortex";
            statusLabel.innerText = "✌️ VORTEX MODE";
        } else if (index && middle && ring && pinky) {
            params.mode = "normal";
            params.scale = 2.5;
            statusLabel.innerText = "🖐 OPEN PALM";
        } else if (!index && !middle && !ring && !pinky) {
            params.mode = "normal";
            params.scale = 0.3;
            statusLabel.innerText = "✊ CLOSED FIST";
        }

        // Global Controls
        params.rotY = (marks[9].x - 0.5) * 4;
        params.rotX = (marks[9].y - 0.5) * 4;
        params.hue = marks[9].x;
        zoomLabel.innerText = `Zoom Level: ${params.scale.toFixed(2)}x`;
    } else {
        statusLabel.innerText = "SEARCHING FOR HAND...";
        params.mode = "normal";
    }
    ctx.restore();
});

/** --- ANIMATION LOOP --- **/
function animate() {
    requestAnimationFrame(animate);

    // Interpolation
    lerp.scale += (params.scale - lerp.scale) * 0.1;
    lerp.rotX += (params.rotX - lerp.rotX) * 0.1;
    lerp.rotY += (params.rotY - lerp.rotY) * 0.1;

    cloud.rotation.x = lerp.rotX;
    cloud.rotation.y = lerp.rotY;
    cloud.material.color.setHSL(params.hue, 0.8, 0.5);

    const attr = cloud.geometry.attributes.position;
    const time = Date.now() * 0.002;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        let x = initialPos[i3] * lerp.scale;
        let y = initialPos[i3 + 1] * lerp.scale;
        let z = initialPos[i3 + 2] * lerp.scale;

        if (params.mode === "vortex") {
            const speed = time + initialPos[i3] * 0.2;
            const s = Math.sin(speed),
                c = Math.cos(speed);
            const nx = x * c - z * s;
            const nz = x * s + z * c;
            x = nx;
            z = nz;
        }

        attr.array[i3] = x;
        attr.array[i3 + 1] = y;
        attr.array[i3 + 2] = z;
    }
    attr.needsUpdate = true;
    renderer.render(scene, camera);
}

// START ENGINE
const cam = new Camera(video, {
    onFrame: async () => {
        await hands.send({ image: video });
    },
    width: 640,
    height: 480,
});

initThree();
animate();
cam.start();
/* ===============================
   PHASE SYSTEM (controls escalation)
================================= */

let phase = 0;

function advancePhase() {
    phase++;
}

setTimeout(advancePhase, 8000);
setTimeout(advancePhase, 16000);
setTimeout(advancePhase, 26000);
setTimeout(advancePhase, 38000);

/* ===============================
   BEHAVIOR TRACKING
================================= */

let lastMove = Date.now();
let lastType = Date.now();
let hesitationEvents = 0;
let misclicks = 0;

document.addEventListener('mousemove', () => {
    lastMove = Date.now();
});

document.addEventListener('keydown', () => {
    lastType = Date.now();
});

document.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
        misclicks++;
    }
});

setInterval(() => {
    if (Date.now() - lastMove > 2000) {
        hesitationEvents++;
    }
}, 500);

function stressSignal() {
    const now = Date.now();

    let idle = Math.min(1, (now - lastMove) / 3000);
    let typing = Math.min(1, (now - lastType) / 3000);
    let mis = Math.min(1, misclicks / 10);

    return 0.5 * idle + 0.3 * typing + 0.2 * mis;
}

/* ===============================
   ADAPTIVE ENGINE (bandit)
================================= */

const factors = {
    blur:   { weight: 1 },
    scroll: { weight: 1 },
    color:  { weight: 1 },
    essay:  { weight: 1 },
    drift:  { weight: 1 }
};

function pickFactor() {
    const keys = Object.keys(factors);
    const weights = keys.map(k => Math.exp(factors[k].weight));

    let sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;

    for (let i = 0; i < keys.length; i++) {
        r -= weights[i];
        if (r <= 0) return keys[i];
    }

    return keys[0];
}

function updateFactor(f, reward) {
    factors[f].weight += 0.1 * reward;

    Object.keys(factors).forEach(k => {
        if (k !== f) {
            factors[k].weight *= 0.995;
        }
    });
}

/* ===============================
   ORIGINAL SYSTEMS (MODIFIED TO SCALE)
================================= */

function getRandomColor() {
    return '#' + Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0');
}

/* COLOR SCRAMBLER */
function applyColor(intensity) {
    if (phase < 1) return;

    document.documentElement.style.setProperty('--primary', getRandomColor());

    if (intensity > 1) {
        document.documentElement.style.setProperty('--accent', getRandomColor());
    }
}

/* BLUR */
const formEl = document.getElementById('formContainer');

function applyBlur(intensity) {
    if (phase < 2) return;

    formEl.style.filter = `blur(${intensity * 2}px)`;
}

/* SCROLL */
function applyScroll(intensity) {
    if (phase < 3) return;

    window.scrollBy({
        top: (Math.random() - 0.5) * 400 * intensity
    });
}

/* ESSAY CORRUPTION */
const essayBox = document.getElementById('essayBox');

function applyEssay(intensity) {
    let text = essayBox.value;

    if (text.length < 10) return;

    if (Math.random() < 0.4 * intensity) {
        text = text.replace(/authentic/gi, "strategically authentic™");
    }

    if (Math.random() < 0.3 * intensity) {
        text += " [refined]";
    }

    essayBox.value = text;
}

/* DRIFT */
function applyDrift(intensity) {
    if (phase < 4) return;

    formEl.style.transform =
        `translate(${(Math.random() - 0.5) * 10 * intensity}px,
                   ${(Math.random() - 0.5) * 10 * intensity}px)`;
}

/* ===============================
   ADAPTATION LOOP
================================= */

setInterval(() => {
    const f = pickFactor();
    const stress = stressSignal();
    const intensity = Math.min(factors[f].weight, 5);

    switch (f) {
        case 'blur':
            applyBlur(intensity);
            break;
        case 'scroll':
            applyScroll(intensity);
            break;
        case 'color':
            applyColor(intensity);
            break;
        case 'essay':
            applyEssay(intensity);
            break;
        case 'drift':
            applyDrift(intensity);
            break;
    }

    updateFactor(f, stress);

}, 1200);

/* ===============================
   PANIC TIMER
================================= */

let timeLeft = 179;
const timerDisplay = document.getElementById('panicTimer');

setInterval(() => {
    if (timeLeft <= 0) {
        timeLeft = Math.random() * 120;
    }

    let m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    let s = Math.floor(timeLeft % 60).toString().padStart(2, '0');

    timerDisplay.innerText = `PORTAL CLOSES IN: ${m}:${s}`;
    timeLeft--;

}, 1000);

/* ===============================
   STATE SHUFFLE
================================= */

const states = [
    "Alabama","Alaska","Arizona","Arkansas","California",
    "Colorado","Connecticut","Delaware","Florida","Georgia"
];

const stateSelect = document.getElementById('shufflingState');

function renderStates() {
    let shuffled = [...states].sort(() => 0.5 - Math.random());

    stateSelect.innerHTML = '';

    shuffled.forEach(s => {
        let o = document.createElement('option');
        o.value = s;
        o.innerText = s;
        stateSelect.appendChild(o);
    });
}

setInterval(renderStates, 800);

/* ===============================
   SUBMIT RESULT
================================= */

document.getElementById('casapForm').addEventListener('submit', function (e) {
    e.preventDefault();

    let score = Math.min(
        99.9,
        60 + hesitationEvents * 5 + misclicks * 2
    ).toFixed(1);

    document.getElementById('formContainer').style.display = 'none';
    document.getElementById('panicTimer').style.display = 'none';

    document.querySelector('.result-card').innerHTML = `
        <div>Stress Probability</div>
        <div style="font-size:80px">${score}%</div>
        <div>Hesitations: ${hesitationEvents}</div>
        <div>Misclicks: ${misclicks}</div>
    `;

    document.getElementById('resultContainer').style.display = 'flex';
});

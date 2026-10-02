// Quiz (end of page): 8 multiple-choice questions, each tied to a sourced fact in facts.json.
// Ends with a score and a share card drawn on a canvas.
import { getJSON, getFacts, asset } from '../../core/data.js';

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const VERDICTS = [
  [8, 'Summit, no oxygen.', 'A perfect score. You were paying attention all the way up.'],
  [6, 'Summit.', 'You made it to the top. A couple of details slipped on the way.'],
  [4, 'The Shoulder.', 'Solid progress. Scroll back through the story and try again.'],
  [0, 'Base camp.', 'The mountain will still be there. Give it another go.'],
];

function loadImage(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

async function drawCard(canvas, score, total, verdict) {
  const g = canvas.getContext('2d');
  const W = (canvas.width = 1200), H = (canvas.height = 630);
  const img = await loadImage(asset('media/og_card.jpg'));
  if (img) g.drawImage(img, 0, 0, W, H);
  else { g.fillStyle = '#07111f'; g.fillRect(0, 0, W, H); }
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(4,10,19,0.92)'); grd.addColorStop(0.6, 'rgba(4,10,19,0.55)'); grd.addColorStop(1, 'rgba(4,10,19,0.1)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  await document.fonts?.ready;
  g.fillStyle = '#bfe3ff'; g.font = '600 22px "Inter Variable", sans-serif';
  g.fillText('K2 · THE SAVAGE MOUNTAIN · QUIZ', 64, 92);
  g.fillStyle = '#f2f8fd'; g.font = '300 180px "Fraunces Variable", Georgia, serif';
  g.fillText(`${score}/${total}`, 56, 300);
  g.fillStyle = '#F2A541'; g.font = 'italic 300 54px "Fraunces Variable", Georgia, serif';
  g.fillText(verdict, 64, 380);
  g.fillStyle = '#e3f0fa'; g.font = '400 26px "Inter Variable", sans-serif';
  g.fillText('Fly up the world’s second-highest mountain in 3D.', 64, 450);
  g.fillStyle = '#9fb2c7'; g.font = '500 22px "Inter Variable", sans-serif';
  g.fillText(location.host || 'k2', 64, 560);
}

export async function mount(el) {
  const [{ questions }, facts] = await Promise.all([getJSON('data/quiz.json'), getFacts()]);
  const qs = questions.slice(0, 8);
  let i = 0;
  let score = 0;
  const marks = [];

  function renderQuestion() {
    const q = qs[i];
    el.innerHTML = `
    <div class="w quiz">
      <div class="quiz__progress" aria-hidden="true">${qs.map((_, k) => `<span class="${marks[k] === true ? 'is-right' : marks[k] === false ? 'is-wrong' : k === i ? 'is-done' : ''}"></span>`).join('')}</div>
      <p class="eyebrow">Question ${i + 1} of ${qs.length}</p>
      <p class="quiz__q" id="quiz-q">${esc(q.question)}</p>
      <div class="quiz__opts" role="group" aria-labelledby="quiz-q">
        ${q.options.map((o, k) => `<button type="button" data-k="${k}">${esc(o)}</button>`).join('')}
      </div>
      <div class="quiz__explain" aria-live="polite" hidden></div>
      <div class="w-row"><button type="button" class="btn btn--amber" data-next hidden>${i === qs.length - 1 ? 'See your score' : 'Next question'}</button></div>
    </div>`;
    el.querySelector('.quiz__opts').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      const k = Number(b.dataset.k);
      const right = k === q.answer;
      if (right) score++;
      marks[i] = right;
      el.querySelectorAll('.quiz__opts button').forEach((x, n) => {
        x.disabled = true;
        if (n === q.answer) x.classList.add('is-right');
        else if (n === k) x.classList.add('is-wrong');
      });
      const f = facts.find((x) => x.id === q.fact_id);
      const ex = el.querySelector('.quiz__explain');
      ex.hidden = false;
      ex.innerHTML = `<h3>${right ? 'Correct.' : `Not quite: ${esc(q.options[q.answer])}.`}</h3><p>${esc(q.explain || f?.body || '')}</p>
        ${f?.source_url ? `<p class="w-note" style="margin-top:6px">Source: <a href="${esc(f.source_url)}" target="_blank" rel="noopener">${esc(f.source_title || f.source_url)}</a></p>` : ''}`;
      const next = el.querySelector('[data-next]');
      next.hidden = false;
      next.focus();
    });
    el.querySelector('[data-next]').addEventListener('click', () => {
      i++;
      if (i < qs.length) { renderQuestion(); el.querySelector('.quiz__opts button').focus(); }
      else renderEnd();
    });
  }

  async function renderEnd() {
    const [, title, msg] = VERDICTS.find(([min]) => score >= min);
    el.innerHTML = `
    <div class="w quiz">
      <p class="eyebrow">Your result</p>
      <p class="quiz__score" aria-live="polite">${score}<small style="font-size:.4em;color:var(--muted)"> / ${qs.length}</small></p>
      <h3 style="font:400 28px var(--font-display);text-transform:none;letter-spacing:0;color:var(--amber)">${title}</h3>
      <p>${msg}</p>
      <div class="quiz__share"><canvas aria-label="Share card: ${score} out of ${qs.length}. ${esc(title)}"></canvas></div>
      <div class="w-row">
        <button type="button" class="btn btn--amber" data-share>Share</button>
        <button type="button" class="btn btn--ghost" data-download>Download card</button>
        <button type="button" class="btn btn--ghost" data-again>Try again</button>
      </div>
      <p class="w-note" data-status aria-live="polite"></p>
    </div>`;
    const canvas = el.querySelector('canvas');
    await drawCard(canvas, score, qs.length, title.replace(/\.$/, ''));
    const status = el.querySelector('[data-status]');
    const blob = () => new Promise((r) => canvas.toBlob(r, 'image/png'));
    el.querySelector('[data-download]').addEventListener('click', async () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await blob());
      a.download = `k2-quiz-${score}-of-${qs.length}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    el.querySelector('[data-share]').addEventListener('click', async () => {
      const text = `I scored ${score}/${qs.length} on the K2 quiz: ${title}`;
      const url = location.href.split('#')[0];
      try {
        const file = new File([await blob()], 'k2-quiz.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text, url });
        else if (navigator.share) await navigator.share({ text, url });
        else { await navigator.clipboard.writeText(`${text} ${url}`); status.textContent = 'Copied to your clipboard.'; }
      } catch (err) {
        if (err?.name !== 'AbortError') status.textContent = 'Sharing is not available here. Use "Download card" instead.';
      }
    });
    el.querySelector('[data-again]').addEventListener('click', () => { i = 0; score = 0; marks.length = 0; renderQuestion(); });
  }
  renderQuestion();
}

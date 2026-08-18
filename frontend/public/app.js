const battleEl = document.getElementById('battle');
const leaderboardEl = document.getElementById('leaderboard');
const leadersList = document.getElementById('leaders');
const btnVote = document.getElementById('btn-vote');
const btnLeaderboard = document.getElementById('btn-leaderboard');

async function loadBattle() {
  battleEl.innerHTML = '<p class="loading">Convocando candidatos…</p>';
  try {
    const res = await fetch('/api/battle');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) throw new Error('respuesta invalida');
    renderBattle(data[0], data[1]);
  } catch (e) {
    battleEl.innerHTML = `<p class="error">No se pudo cargar la votación: ${e.message}</p>`;
  }
}

function renderBattle(a, b) {
  battleEl.innerHTML = `
    <article class="card">
      <div class="emoji">${a.emoji}</div>
      <h2>${a.name}</h2>
      <p class="slogan">"${a.slogan}"</p>
      <button data-winner="${a.id}" data-loser="${b.id}">¡Voto por este!</button>
    </article>
    <div class="vs">VS</div>
    <article class="card">
      <div class="emoji">${b.emoji}</div>
      <h2>${b.name}</h2>
      <p class="slogan">"${b.slogan}"</p>
      <button data-winner="${b.id}" data-loser="${a.id}">¡Voto por este!</button>
    </article>
  `;
  battleEl.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', onVote));
}

async function onVote(e) {
  const winner_id = parseInt(e.currentTarget.dataset.winner, 10);
  const loser_id = parseInt(e.currentTarget.dataset.loser, 10);
  e.currentTarget.disabled = true;
  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner_id, loser_id }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    loadBattle();
  } catch (err) {
    battleEl.innerHTML = `<p class="error">No se pudo registrar el voto: ${err.message}</p>`;
  }
}

async function loadLeaderboard() {
  leadersList.innerHTML = '<li>Cargando…</li>';
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    leadersList.innerHTML = data
      .map(
        (c) => `
        <li>
          <span class="emoji">${c.emoji}</span>
          <span class="name">${c.name}</span>
          <span class="stats">${c.wins}W · ${c.losses}L</span>
        </li>`
      )
      .join('');
  } catch (e) {
    leadersList.innerHTML = `<li class="error">${e.message}</li>`;
  }
}

function showVoteView() {
  battleEl.hidden = false;
  leaderboardEl.hidden = true;
  btnVote.classList.add('active');
  btnLeaderboard.classList.remove('active');
  loadBattle();
}

function showLeaderboardView() {
  battleEl.hidden = true;
  leaderboardEl.hidden = false;
  btnVote.classList.remove('active');
  btnLeaderboard.classList.add('active');
  loadLeaderboard();
}

btnVote.addEventListener('click', showVoteView);
btnLeaderboard.addEventListener('click', showLeaderboardView);

showVoteView();

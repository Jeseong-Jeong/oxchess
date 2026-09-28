(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const SIDE = ['P1', 'P2'];
  const LEVEL_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };
  const LEVEL_NOTE = {
    easy: '가끔 실수하는 초보 AI예요.',
    normal: '바로 지는 수는 피하고, 가끔 끝까지 읽어요.',
    hard: '모든 경우를 끝까지 계산해요. 한 번이라도 실수하면 집니다.',
  };

  // ---------- 설정 (기기에 저장) ----------
  const opts = { aiSide: '0', aiLevel: 'normal', rules: 'classic', hints: true, hostSide: 'r' };
  try { Object.assign(opts, JSON.parse(localStorage.getItem('oxchess-opts') || '{}')); } catch (e) {}
  function saveOpts() { try { localStorage.setItem('oxchess-opts', JSON.stringify(opts)); } catch (e) {} }

  // ---------- 상태 ----------
  const S = {
    mode: null,          // 'ai' | 'local' | 'online'
    rulesKey: 'classic',
    game: null,
    solver: null,
    mySide: 0,           // ai / online에서 내 진영
    level: 'normal',
    busy: false,         // AI 생각 중
    aiTimer: null,
    resultShown: false,
    room: null,          // Net.Room
    online: { role: null, hostSide: 0, connected: false },
  };

  // ---------- 화면 전환 ----------
  function show(name) {
    $$('.screen').forEach(el => { el.hidden = el.id !== 'screen-' + name; });
    window.scrollTo(0, 0);
  }
  function go(name, push = true) {
    if (name !== 'game') stopGame();
    show(name);
    if (push) history.pushState({ screen: name }, '');
  }
  window.addEventListener('popstate', e => {
    const name = (e.state && e.state.screen) || 'home';
    if (!$('#screen-game').hidden && S.mode === 'online' && !confirm('온라인 대전을 나갈까요?')) {
      history.pushState({ screen: 'game' }, '');
      return;
    }
    $('#result').hidden = true;
    go(name, false);
  });
  $$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

  // ---------- 설정 UI ----------
  function syncSeg(name) {
    $$(`.seg[data-name="${name}"] button`).forEach(b => b.classList.toggle('on', b.dataset.v === String(opts[name])));
    const note = $(`[data-note="${name}"]`);
    if (note && name === 'aiLevel') note.textContent = LEVEL_NOTE[opts.aiLevel];
  }
  $$('.seg').forEach(seg => {
    const name = seg.dataset.name;
    seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      opts[name] = b.dataset.v;
      saveOpts();
      syncSeg(name);
    });
    syncSeg(name);
  });
  $$('input[data-name="hints"]').forEach(inp => {
    inp.checked = !!opts.hints;
    inp.addEventListener('change', () => {
      opts.hints = inp.checked;
      $$('input[data-name="hints"]').forEach(i => { i.checked = opts.hints; });
      saveOpts();
    });
  });

  // ---------- 게임 시작/종료 ----------
  function newGame(rulesKey) {
    S.rulesKey = rulesKey;
    const rules = OX.makeRules(rulesKey);
    S.game = new OX.Game(rules);
    S.solver = new OX.Solver(rules);
    S.resultShown = false;
    S.busy = false;
    clearTimeout(S.aiTimer);
    $('#result').hidden = true;
  }

  function stopGame() {
    clearTimeout(S.aiTimer);
    S.busy = false;
    if (S.room) {
      S.room.send({ t: 'bye' });
      S.room.destroy();
      S.room = null;
    }
    S.online.connected = false;
    $('#online-lobby').hidden = false;
    $('#online-wait').hidden = true;
  }

  function startAI(side) {
    S.mode = 'ai';
    S.level = opts.aiLevel;
    S.mySide = side;
    newGame(opts.rules);
    enterGame();
  }

  function startLocal() {
    S.mode = 'local';
    newGame(opts.rules);
    enterGame();
  }

  function enterGame() {
    if ($('#screen-game').hidden) go('game');
    render();
    maybeAI();
  }

  $('#start-ai').addEventListener('click', () => {
    const side = opts.aiSide === 'r' ? (Math.random() < 0.5 ? 0 : 1) : Number(opts.aiSide);
    startAI(side);
  });
  $('#start-local').addEventListener('click', startLocal);
  $('#game-back').addEventListener('click', () => {
    if (S.mode === 'online' && !confirm('온라인 대전을 나갈까요?')) return;
    go('home');
  });

  // ---------- 누가 두는가 ----------
  function isHumanTurn() {
    const g = S.game;
    if (!g || g.res !== null) return false;
    if (S.mode === 'local') return true;
    if (S.mode === 'ai') return g.turn === S.mySide && !S.busy;
    if (S.mode === 'online') return g.turn === S.mySide && S.online.connected;
    return false;
  }

  function nameOf(side) {
    if (S.mode === 'ai') return side === S.mySide ? '나' : `AI · ${LEVEL_NAME[S.level]}`;
    if (S.mode === 'online') return side === S.mySide ? '나' : '상대';
    return '';
  }

  function play(ch, source) {
    const g = S.game;
    if (!g || g.res !== null) return;
    if (source === 'human' && !isHumanTurn()) return;
    g.play(ch === 'O' ? 0 : 1);
    if (S.mode === 'online' && source === 'human') S.room && S.room.send({ t: 'move', n: g.n, c: ch });
    if (source === 'human' && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    render();
    if (g.res !== null) {
      setTimeout(showResult, 650);
      return;
    }
    maybeAI();
  }

  function maybeAI() {
    const g = S.game;
    if (S.mode !== 'ai' || g.res !== null || g.turn === S.mySide) return;
    S.busy = true;
    render();
    S.aiTimer = setTimeout(() => {
      const ch = OX.chooseMove(g, S.solver, S.level);
      S.busy = false;
      play(ch, 'ai');
    }, 450 + Math.random() * 350);
  }

  $('#btn-o').addEventListener('click', () => play('O', 'human'));
  $('#btn-x').addEventListener('click', () => play('X', 'human'));
  document.addEventListener('keydown', e => {
    if ($('#screen-game').hidden || !$('#result').hidden || e.target.tagName === 'INPUT') return;
    const k = e.key.toUpperCase();
    if (k === 'O' || k === '0') play('O', 'human');
    if (k === 'X') play('X', 'human');
  });

  $('#undo-btn').addEventListener('click', () => {
    const g = S.game;
    if (!g || g.n === 0 || S.mode === 'online') return;
    clearTimeout(S.aiTimer);
    S.busy = false;
    S.resultShown = false;
    if (S.mode === 'ai') {
      // 내 차례로 돌아갈 때까지 무르기
      do { g.undo(); } while (g.n > 0 && g.turn !== S.mySide);
      if (g.turn !== S.mySide) { render(); maybeAI(); return; }
    } else {
      g.undo();
    }
    render();
  });

  $('#hint-toggle').addEventListener('click', () => {
    opts.hints = !opts.hints;
    $$('input[data-name="hints"]').forEach(i => { i.checked = opts.hints; });
    saveOpts();
    render();
  });

  // ---------- 그리기 ----------
  function occurrences(str, pat) {
    const out = [];
    let last = -99;
    for (let p = 0; p + pat.length <= str.length; p++) {
      if (p >= last + pat.length && str.substr(p, pat.length) === pat) { out.push(p); last = p; }
    }
    return out;
  }

  function winnerText(res) {
    if (res === 0) return '무승부';
    return SIDE[res === 1 ? 0 : 1] + ' 승리';
  }

  function render() {
    const g = S.game;
    if (!g) return;
    const over = g.res !== null;
    const str = g.str;
    const human = isHumanTurn();
    const st = g.status();
    const me = g.turn === 0 ? 1 : -1;
    const showHints = opts.hints && human;

    // 제목, 플레이어
    $('#game-title').textContent = S.mode === 'ai' ? 'AI 대전' : S.mode === 'online' ? '온라인 대전' : '같이 하기';
    for (const side of [0, 1]) {
      const el = $('#pl-' + (side + 1));
      el.classList.toggle('active', !over && g.turn === side);
      const nm = nameOf(side);
      $('#pname-' + (side + 1)).textContent = nm ? `${SIDE[side]} · ${nm}` : SIDE[side];
    }

    // 상태
    const status = $('#status');
    status.className = 'status';
    let html;
    if (over) {
      status.classList.add('over');
      const why = g.winPat ? ` — ${g.winPat} ${g.res === 1 ? g.rules.th5 : g.rules.th3[OX.P3.indexOf(g.winPat)]}회` : '';
      html = `🏁 ${winnerText(g.res)}${why}<small><button class="link" id="reopen-result" style="padding:0">결과 다시 보기 ›</button></small>`;
    } else {
      const who = SIDE[g.turn];
      let head;
      if (S.mode === 'local') head = `${who} 차례`;
      else if (S.mode === 'ai') head = g.turn === S.mySide ? '당신 차례' : 'AI가 생각 중…';
      else head = !S.online.connected ? '상대 연결이 끊겼어요' : g.turn === S.mySide ? '당신 차례' : '상대 차례';
      head += ` <span class="muted" style="font-weight:400">· ${g.n + 1}번째 수</span>`;
      let sub = '';
      if (showHints && st.code === 2) {
        status.classList.add('is-check');
        const c = st.danger[0];
        const why = st.pv[c].winPat;
        head = `⚠️ 체크! ` + head;
        sub = `${c}를 두면 ${why} 완성 → 상대 승리. ${c === 'O' ? 'X' : 'O'}를 두세요.`;
      } else if (showHints && st.code === 3) {
        status.classList.add('is-mate');
        head = `🔴 체크메이트 ` + head;
        sub = `O는 ${st.pv.O.winPat}, X는 ${st.pv.X.winPat} 완성 → 뭘 둬도 상대 승리`;
      } else if (S.mode === 'online' && !S.online.connected) {
        sub = S.online.role === 'guest'
          ? '<button class="link" id="rejoin-btn" style="padding:0">다시 연결 ›</button>'
          : '상대가 같은 코드로 다시 들어오면 이어서 둘 수 있어요.';
      }
      html = head + (sub ? `<small>${sub}</small>` : '');
    }
    status.innerHTML = html;
    const reo = $('#reopen-result');
    if (reo) reo.addEventListener('click', showResult);
    const rj = $('#rejoin-btn');
    if (rj) rj.addEventListener('click', rejoin);

    // 판
    let winCells = new Set();
    if (over && g.winPat) {
      for (const p of occurrences(str, g.winPat)) for (let k = 0; k < g.winPat.length; k++) winCells.add(p + k);
    }
    const cells = [];
    for (let i = 0; i < OX.MAXLEN; i++) {
      const cls = ['cell'];
      let ch = '';
      if (i < g.n) {
        ch = str[i];
        cls.push(i % 2 === 0 ? 'p1' : 'p2');
        if (winCells.has(i)) cls.push('win');
        if (i === g.n - 1 && !over) cls.push('last');
      } else if (i === g.n && !over) {
        cls.push('next');
      } else {
        cls.push('empty-future');
      }
      cells.push(`<div class="${cls.join(' ')}" data-n="${i + 1}">${ch}</div>`);
    }
    $('#board').innerHTML = cells.join('');

    // 버튼
    for (const c of ['O', 'X']) {
      const btn = $('#btn-' + c.toLowerCase());
      btn.disabled = !human;
      let warn = '';
      btn.classList.remove('danger');
      if (showHints && st.pv && st.pv[c]) {
        if (st.pv[c].res === -me) { warn = '상대 승리'; btn.classList.add('danger'); }
        else if (st.pv[c].res === me) warn = '승리!';
      }
      $('#warn-' + c.toLowerCase()).textContent = warn;
    }
    $('#undo-btn').hidden = S.mode === 'online';
    $('#undo-btn').disabled = g.n === 0;
    $('#hint-toggle').textContent = opts.hints ? '위험 표시 켜짐' : '위험 표시 꺼짐';

    // 패턴 진행도
    $('#chips3').innerHTML = g.counts3().map(({ pat, count, need }) => {
      const cls = ['chip'];
      if (count >= need) cls.push('done');
      else if (count === need - 1) cls.push('hot');
      const pips = Array.from({ length: need }, (_, k) => `<i class="pip${k < count ? ' f' : ''}"></i>`).join('');
      const houseTag = need < g.rules.th3.reduce((a, b) => Math.max(a, b), 0) ? '<span class="house">3회</span>' : '';
      return `<span class="${cls.join(' ')}">${pat}${houseTag}<span class="pips">${pips}</span></span>`;
    }).join('');

    const five = g.counts5().filter(x => x.count > 0).sort((a, b) => b.count - a.count || a.pat.localeCompare(b.pat));
    $('#chips5').innerHTML = five.length
      ? five.map(({ pat, count, need }) => {
          const cls = ['chip', 'five'];
          if (count >= need) cls.push('done'); else if (count === need - 1) cls.push('hot');
          const pips = Array.from({ length: need }, (_, k) => `<i class="pip${k < count ? ' f' : ''}"></i>`).join('');
          return `<span class="${cls.join(' ')}">${pat}<span class="pips">${pips}</span></span>`;
        }).join('')
      : '<span class="none">아직 없음 · 5글자가 모이면 여기 표시돼요</span>';

    // 온라인 연결 배지
    const badge = $('#conn-badge');
    if (S.mode === 'online') {
      badge.hidden = false;
      badge.textContent = S.online.connected ? '● 연결됨' : '● 끊김';
      badge.className = 'bar-right ' + (S.online.connected ? 'ok' : 'bad');
    } else badge.hidden = true;
  }

  // ---------- 결과 + 복기 ----------
  function analyze(g) {
    const solver = S.solver;
    const h = new OX.Game(g.rules);
    const moves = [];
    const startValue = solver.value(h);
    for (const ch of g.str) {
      const me = h.turn === 0 ? 1 : -1;
      const ev = solver.evaluate(h);
      const couldWin = ev.O === me || ev.X === me;
      const couldDraw = ev.O === 0 || ev.X === 0;
      const got = ev[ch];
      const bad = (couldWin && got !== me) || (!couldWin && couldDraw && got === -me);
      moves.push({ ch, side: h.turn, bad, alt: ch === 'O' ? 'X' : 'O', couldWin });
      h.play(ch === 'O' ? 0 : 1);
    }
    return { startValue, moves };
  }

  function showResult() {
    const g = S.game;
    if (!g || g.res === null) return;
    S.resultShown = true;
    const winSide = g.res === 1 ? 0 : g.res === -1 ? 1 : null;
    let title, emoji;
    if (winSide === null) { title = '무승부'; emoji = '🤝'; }
    else if (S.mode === 'local') { title = `${SIDE[winSide]} 승리!`; emoji = '🎉'; }
    else if (winSide === S.mySide) { title = '승리!'; emoji = '🎉'; }
    else { title = '패배'; emoji = '😵'; }
    $('#result-emoji').textContent = emoji;
    $('#result-title').textContent = title;

    let reason = '40칸이 모두 찼어요.';
    if (g.winPat) {
      const need = g.res === 1 ? g.rules.th5 : g.rules.th3[OX.P3.indexOf(g.winPat)];
      reason = `${SIDE[winSide]}의 ${g.winPat} 패턴이 ${need}번 나왔어요 · ${g.n}수`;
    }
    $('#result-reason').textContent = reason;

    // 복기
    const a = analyze(g);
    let text = '';
    if (winSide !== null) {
      const loser = 1 - winSide;
      const loserBad = a.moves.map((m, i) => ({ ...m, i })).filter(m => m.bad && m.side === loser);
      const who = s => (S.mode === 'local' ? SIDE[s] : s === S.mySide ? '당신' : nameOf(s).startsWith('AI') ? 'AI' : '상대');
      if (loserBad.length) {
        const m = loserBad[loserBad.length - 1];
        text = `<b>승부처: ${m.i + 1}번째 수</b><br>${who(loser)}(${SIDE[loser]})의 ${m.ch} — ${m.alt}를 뒀다면 이길 수 있었어요.`;
      } else {
        text = `<b>${who(loser)}(${SIDE[loser]})에게는 처음부터 이기는 길이 없었어요.</b><br>이 규칙은 완벽하게 두면 ${SIDE[a.startValue === 1 ? 0 : 1]}가 이기는 게임이에요. 상대가 한 번도 실수하지 않았습니다.`;
      }
      const winnerBad = a.moves.filter(m => m.bad && m.side === winSide).length;
      if (winnerBad) text += `<br><span class="muted">${who(winSide)}도 이기는 흐름을 ${winnerBad}번 놓쳤지만 다시 기회를 잡았어요.</span>`;
    }
    const strip = a.moves.map(m => `<span class="mv ${m.side === 0 ? 'p1' : 'p2'}${m.bad ? ' bad' : ''}">${m.ch}</span>`).join('');
    $('#result-analysis').innerHTML = text + `<div class="moves">${strip}</div><div class="legend">빨간 칸 = 이길 수 있었는데 흐름을 놓친 수</div>`;

    $('#again-swap').hidden = S.mode === 'local';
    $('#again-same').textContent = S.mode === 'local' ? '한 판 더' : '같은 진영으로';
    $('#result').hidden = false;
  }

  function again(swap) {
    $('#result').hidden = true;
    if (S.mode === 'ai') startAI(swap ? 1 - S.mySide : S.mySide);
    else if (S.mode === 'local') startLocal();
    else if (S.mode === 'online') {
      if (S.online.role === 'host') {
        if (swap) S.online.hostSide = 1 - S.online.hostSide;
        hostStartGame();
      } else {
        if (!S.room || !S.room.send({ t: 'rematch', swap })) toast('상대와 연결되어 있지 않아요.');
        else toast('상대에게 한 판 더를 요청했어요.');
      }
    }
  }
  $('#again-swap').addEventListener('click', () => again(true));
  $('#again-same').addEventListener('click', () => again(false));
  $('#result-board').addEventListener('click', () => { $('#result').hidden = true; });
  $('#result-home').addEventListener('click', () => { $('#result').hidden = true; go('home'); });

  // ---------- 온라인 ----------
  function roomHandlers() {
    return {
      onOpen: code => {
        $('#room-code').textContent = code;
        $('#wait-msg').textContent = '상대를 기다리는 중…';
      },
      onConnect: () => {
        S.online.connected = true;
        if (S.online.role === 'host') hostStartGame(true);
        else { toast('연결됐어요!'); if (S.mode === 'online') render(); }
      },
      onData: onNetData,
      onClose: () => {
        S.online.connected = false;
        if (S.mode === 'online' && !$('#screen-game').hidden) {
          toast('상대와 연결이 끊겼어요.');
          render();
        }
      },
      onError: msg => {
        toast(msg);
        if ($('#screen-game').hidden) {
          $('#online-lobby').hidden = false;
          $('#online-wait').hidden = true;
          $('#join-btn').disabled = false;
          if (S.room) { S.room.destroy(); S.room = null; }
        }
      },
    };
  }

  // 호스트: 새 게임이면 새로 시작, 재접속이면 지금 판을 그대로 보냄
  function hostStartGame(onConnect) {
    const resume = onConnect && S.mode === 'online' && S.game && S.game.res === null && S.game.n > 0;
    if (!resume) {
      S.mode = 'online';
      newGame(S.online.rulesKey);
      S.mySide = S.online.hostSide;
    }
    S.room.send({ t: 'start', rules: S.rulesKey, guestSide: 1 - S.mySide, moves: S.game.str });
    if (resume) toast('상대가 다시 들어왔어요.');
    enterGame();
  }

  function onNetData(msg) {
    const g = S.game;
    switch (msg.t) {
      case 'start': {
        if (S.online.role !== 'guest') return;
        if (!OX.PRESETS[msg.rules] || typeof msg.moves !== 'string' || !/^[OX]{0,40}$/.test(msg.moves)) return;
        S.mode = 'online';
        newGame(msg.rules);
        S.mySide = msg.guestSide === 1 ? 1 : 0;
        for (const c of msg.moves) if (S.game.res === null) S.game.play(c === 'O' ? 0 : 1);
        enterGame();
        if (S.game.res !== null) setTimeout(showResult, 300);
        break;
      }
      case 'move': {
        if (!g || S.mode !== 'online' || (msg.c !== 'O' && msg.c !== 'X')) return;
        if (g.res === null && g.turn !== S.mySide && msg.n === g.n + 1) play(msg.c, 'remote');
        else if (msg.n > g.n) S.room.send({ t: 'sync' }); // 어긋났으면 다시 맞추기
        break;
      }
      case 'sync':
        if (S.online.role === 'host') S.room.send({ t: 'start', rules: S.rulesKey, guestSide: 1 - S.mySide, moves: g.str });
        break;
      case 'rematch':
        if (S.online.role !== 'host') return;
        toast('상대가 한 판 더를 원해요!');
        if (msg.swap) S.online.hostSide = 1 - S.online.hostSide;
        hostStartGame();
        break;
      case 'bye':
        S.online.connected = false;
        toast('상대가 나갔어요.');
        render();
        break;
    }
  }

  $('#host-btn').addEventListener('click', async () => {
    stopGame();
    S.online.role = 'host';
    S.online.rulesKey = opts.rules;
    S.online.hostSide = opts.hostSide === 'r' ? (Math.random() < 0.5 ? 0 : 1) : Number(opts.hostSide);
    S.mode = null; S.game = null;
    $('#online-lobby').hidden = true;
    $('#online-wait').hidden = false;
    $('#room-code').textContent = '·····';
    $('#wait-msg').textContent = '방을 만드는 중…';
    S.room = new Net.Room(roomHandlers());
    try { await S.room.host(); } catch (e) { roomHandlers().onError(e.message); }
  });

  function shareLink() {
    return location.origin + location.pathname + '#join=' + S.room.code;
  }
  $('#share-btn').addEventListener('click', async () => {
    if (!S.room || !S.room.code) return;
    const url = shareLink();
    if (navigator.share) {
      try { await navigator.share({ title: 'OX체스 한 판?', text: `OX체스 방 코드: ${S.room.code}`, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    copy(url, '링크를 복사했어요.');
  });
  $('#copy-btn').addEventListener('click', () => S.room && S.room.code && copy(S.room.code, '코드를 복사했어요.'));
  $('#cancel-host').addEventListener('click', () => stopGame());

  async function joinRoom(code) {
    code = Net.normalizeCode(code);
    if (code.length !== 5) { toast('방 코드 5자리를 입력해 주세요.'); return; }
    stopGame();
    S.online.role = 'guest';
    S.online.code = code;
    S.mode = null; S.game = null;
    $('#join-btn').disabled = true;
    toast('연결하는 중…');
    S.room = new Net.Room(roomHandlers());
    try { await S.room.join(code); } catch (e) { roomHandlers().onError(e.message); }
    setTimeout(() => { $('#join-btn').disabled = false; }, 4000);
  }
  function rejoin() {
    if (!S.room) return;
    toast('다시 연결하는 중…');
    S.room.join(S.online.code).catch(e => toast(e.message));
  }
  $('#join-btn').addEventListener('click', () => joinRoom($('#join-code').value));
  $('#join-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(e.target.value); });
  $('#join-code').addEventListener('input', e => { e.target.value = Net.normalizeCode(e.target.value); });

  // ---------- 유틸 ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch (e) { prompt('복사해서 보내주세요', text); }
  }

  // ---------- 시작 ----------
  history.replaceState({ screen: 'home' }, '');
  function joinFromHash() {
    const m = location.hash.match(/join=([A-Za-z0-9]{5})/);
    if (!m) return;
    history.replaceState({ screen: 'home' }, '', location.pathname);
    go('online');
    $('#join-code').value = Net.normalizeCode(m[1]);
    joinRoom(m[1]);
  }
  joinFromHash();
  window.addEventListener('hashchange', joinFromHash);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

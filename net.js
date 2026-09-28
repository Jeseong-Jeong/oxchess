// 온라인 대전: PeerJS(WebRTC P2P). 게임 서버 없이 PeerJS 공개 중계 서버로 서로를 찾은 뒤 기기끼리 직접 연결.
(function (root) {
  'use strict';

  const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'oxchess-v1-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O/1/I 제외
  const PING_MS = 3000, STALE_MS = 10000;

  let loading = null;
  function loadPeerJS() {
    if (root.Peer) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error('연결 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function randomCode() {
    let c = '';
    const buf = new Uint32Array(5);
    crypto.getRandomValues(buf);
    for (const v of buf) c += ALPHABET[v % ALPHABET.length];
    return c;
  }

  // 이 탭의 식별값 (새로고침해도 유지)
  function clientId() {
    let id = null;
    try { id = sessionStorage.getItem('oxchess-cid'); } catch (e) {}
    if (!id) {
      id = randomCode() + randomCode();
      try { sessionStorage.setItem('oxchess-cid', id); } catch (e) {}
    }
    return id;
  }

  function normalizeCode(s) {
    return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  }

  function explain(err) {
    const t = err && err.type;
    if (t === 'peer-unavailable') return '방을 찾을 수 없어요. 코드를 다시 확인해 주세요.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '연결 서버에 접속하지 못했어요. 잠시 후 다시 시도해 주세요.';
    if (t === 'browser-incompatible') return '이 브라우저는 온라인 대전을 지원하지 않아요.';
    return (err && err.message) || '연결 중 문제가 생겼어요.';
  }

  // handlers: onOpen(code), onConnect(), onData(msg), onClose(), onError(message)
  class Room {
    constructor(handlers) {
      this.h = handlers;
      this.peer = null;
      this.conn = null;
      this.code = null;
      this.role = null;
      this.lastSeen = 0;
      this.timer = null;
      this.closed = false;
    }

    async host() {
      this.role = 'host';
      await loadPeerJS();
      this._openHostPeer(0);
    }

    _openHostPeer(attempt) {
      if (this.closed) return;
      this.code = randomCode();
      const peer = new root.Peer(PREFIX + this.code, { debug: 0 });
      this.peer = peer;
      peer.on('open', () => this.h.onOpen && this.h.onOpen(this.code));
      peer.on('connection', c => {
        const cid = c.metadata && c.metadata.cid;
        // 같은 사람이 새로고침 등으로 다시 들어오면 이전 연결을 대체
        if (this.conn && this.conn.open && !(cid && cid === this.guestCid)) {
          // 이미 상대가 있으면 새 접속은 거절
          c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); });
          return;
        }
        this.guestCid = cid || null;
        this._attach(c);
      });
      peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) peer.reconnect(); });
      peer.on('error', err => {
        if (err.type === 'unavailable-id' && attempt < 5) { peer.destroy(); this._openHostPeer(attempt + 1); return; }
        this.h.onError && this.h.onError(explain(err));
      });
    }

    async join(code) {
      this.role = 'guest';
      this.code = normalizeCode(code);
      await loadPeerJS();
      if (!this.peer || this.peer.destroyed) {
        this.peer = new root.Peer({ debug: 0 });
        this.peer.on('error', err => this.h.onError && this.h.onError(explain(err)));
        this.peer.on('disconnected', () => { if (!this.closed && !this.peer.destroyed) this.peer.reconnect(); });
        await new Promise((resolve, reject) => {
          this.peer.once('open', resolve);
          this.peer.once('error', reject);
        }).catch(() => {});
      }
      if (this.peer.destroyed || !this.peer.open) return;
      this._attach(this.peer.connect(PREFIX + this.code, { reliable: true, metadata: { cid: clientId() } }));
    }

    _attach(c) {
      if (this.conn && this.conn !== c) { try { this.conn.close(); } catch (e) {} }
      this.conn = c;
      c.on('open', () => {
        this.lastSeen = Date.now();
        this._startPing();
        this.h.onConnect && this.h.onConnect();
      });
      c.on('data', msg => {
        this.lastSeen = Date.now();
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'ping') return;
        if (msg.t === 'full') { this.h.onError && this.h.onError('이미 다른 사람이 들어간 방이에요.'); return; }
        this.h.onData && this.h.onData(msg);
      });
      c.on('close', () => this._lost(c));
      c.on('error', () => this._lost(c));
    }

    _startPing() {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (!this.conn || !this.conn.open) return;
        try { this.conn.send({ t: 'ping' }); } catch (e) {}
        if (Date.now() - this.lastSeen > STALE_MS) this._lost(this.conn);
      }, PING_MS);
    }

    _lost(c) {
      if (c !== this.conn) return;
      clearInterval(this.timer);
      this.conn = null;
      try { c.close(); } catch (e) {}
      if (!this.closed) this.h.onClose && this.h.onClose();
    }

    get connected() { return !!(this.conn && this.conn.open); }

    send(msg) {
      if (!this.connected) return false;
      try { this.conn.send(msg); return true; } catch (e) { return false; }
    }

    destroy() {
      this.closed = true;
      clearInterval(this.timer);
      try { if (this.conn) this.conn.close(); } catch (e) {}
      try { if (this.peer) this.peer.destroy(); } catch (e) {}
    }
  }

  root.Net = { Room, normalizeCode };
})(window);

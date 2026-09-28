// 온라인 대전: 공개 MQTT 중계 서버(WebSocket)를 거쳐 메시지를 주고받는다.
// 기기끼리 직접 연결(WebRTC)하지 않으므로 서로 다른 네트워크(LTE/5G, 다른 와이파이)여도 된다.
// 중계 서버 두 곳에 동시에 붙어 같은 메시지를 보내고, 받는 쪽에서 중복을 걸러낸다(한 곳이 죽어도 동작).
(function (root) {
  'use strict';

  const MQTT_URL = 'https://cdn.jsdelivr.net/npm/mqtt@5.16.0/dist/mqtt.min.js';
  const BROKERS = ['wss://test.mosquitto.org:8081', 'wss://broker.emqx.io:8084/mqtt'];
  const TOPIC = 'oxchess/v2/';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O/1/I 제외
  const PING_MS = 3000, STALE_MS = 12000, CONNECT_TIMEOUT_MS = 12000, JOIN_TIMEOUT_MS = 10000;

  let loading = null;
  function loadMqtt() {
    if (root.mqtt) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = MQTT_URL;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error('연결 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function randomCode(len = 5) {
    let c = '';
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    for (const v of buf) c += ALPHABET[v % ALPHABET.length];
    return c;
  }

  // 이 탭의 식별값 (새로고침해도 유지 → 같은 사람이 다시 들어오면 알아봄)
  function clientId() {
    let id = null;
    try { id = sessionStorage.getItem('oxchess-cid'); } catch (e) {}
    if (!id) {
      id = randomCode(10);
      try { sessionStorage.setItem('oxchess-cid', id); } catch (e) {}
    }
    return id;
  }

  function normalizeCode(s) {
    return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  }

  // handlers: onOpen(code), onConnect(), onData(msg), onClose(), onError(message)
  class Room {
    constructor(handlers) {
      this.h = handlers;
      this.clients = [];
      this.code = null;
      this.role = null;
      this.me = clientId();
      this.peerId = null;      // 상대 식별값
      this.seq = 0;
      this.sess = randomCode(6); // 접속 회차: 새로고침하면 번호가 1부터 다시 시작하므로 중복 판정에 함께 씀
      this.seen = new Set();   // 중복 제거용 "보낸사람:번호"
      this.lastSeen = 0;
      this.timer = null;
      this.joinTimer = null;
      this.closed = false;
      this._connected = false;
    }

    get inbox() { return TOPIC + this.code + (this.role === 'host' ? '/h' : '/g'); }
    get outbox() { return TOPIC + this.code + (this.role === 'host' ? '/g' : '/h'); }

    async _open() {
      await loadMqtt();
      if (this.closed) return;
      await new Promise((resolve, reject) => {
        let ready = false, failed = 0;
        const timeout = setTimeout(() => { if (!ready) reject(new Error('연결 서버에 접속하지 못했어요. 잠시 후 다시 시도해 주세요.')); }, CONNECT_TIMEOUT_MS);
        for (const url of BROKERS) {
          const c = root.mqtt.connect(url, {
            clientId: 'oxc_' + this.me + '_' + randomCode(4),
            clean: true, keepalive: 30, reconnectPeriod: 2000, connectTimeout: 8000,
          });
          this.clients.push(c);
          c.on('connect', () => {
            c.subscribe(this.inbox, { qos: 1 });
            if (!ready) { ready = true; clearTimeout(timeout); resolve(); }
          });
          c.on('message', (topic, payload) => this._receive(payload));
          c.on('error', () => {
            if (++failed >= BROKERS.length && !ready) { clearTimeout(timeout); reject(new Error('연결 서버에 접속하지 못했어요. 잠시 후 다시 시도해 주세요.')); }
          });
        }
      });
    }

    async host() {
      this.role = 'host';
      this.code = randomCode();
      await this._open();
      if (!this.closed) this.h.onOpen && this.h.onOpen(this.code);
    }

    async join(code) {
      this.role = 'guest';
      this.code = normalizeCode(code);
      if (!this.clients.length) await this._open();
      if (this.closed) return;
      this._raw({ t: 'hello' });
      clearTimeout(this.joinTimer);
      this.joinTimer = setTimeout(() => {
        if (!this._connected) this.h.onError && this.h.onError('방을 찾을 수 없어요. 코드를 확인하고, 방을 만든 쪽도 앱을 새로고침한 뒤 다시 만들어 주세요.');
      }, JOIN_TIMEOUT_MS);
    }

    _raw(msg) {
      const env = JSON.stringify({ f: this.me, s: this.sess, i: ++this.seq, to: this.peerId, m: msg });
      let ok = false;
      for (const c of this.clients) if (c.connected) { c.publish(this.outbox, env, { qos: 1 }); ok = true; }
      return ok;
    }

    _receive(payload) {
      let env;
      try { env = JSON.parse(payload.toString()); } catch (e) { return; }
      if (!env || typeof env !== 'object' || !env.f || env.f === this.me || !env.m) return;
      const k = env.f + ':' + env.s + ':' + env.i;
      if (this.seen.has(k)) return;
      this.seen.add(k);
      if (this.seen.size > 2000) this.seen = new Set([...this.seen].slice(-1000));
      const msg = env.m;

      if (this.role === 'host') {
        if (msg.t === 'hello') {
          // 같은 사람이 다시 들어오거나, 비어 있거나, 기존 상대가 끊겼으면 받아줌
          if (this.peerId && this.peerId !== env.f && this._connected) {
            const saved = this.peerId; this.peerId = env.f; this._raw({ t: 'full' }); this.peerId = saved;
            return;
          }
          this.peerId = env.f;
          this._raw({ t: 'welcome' });
          this._up();
          return;
        }
        if (env.f !== this.peerId) return;
      } else {
        if (env.to && env.to !== this.me) return;
        if (msg.t === 'full') { this.h.onError && this.h.onError('이미 다른 사람이 들어간 방이에요.'); return; }
        if (msg.t === 'welcome') { this.peerId = env.f; this._up(); return; }
        if (env.f !== this.peerId) return;
      }

      this.lastSeen = Date.now();
      if (msg.t === 'ping') return;
      if (msg.t === 'bye') { this._down(); this.h.onData && this.h.onData(msg); return; }
      this.h.onData && this.h.onData(msg);
    }

    _up() {
      this.lastSeen = Date.now();
      clearTimeout(this.joinTimer);
      const was = this._connected;
      this._connected = true;
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this._raw({ t: 'ping' });
        if (this._connected && Date.now() - this.lastSeen > STALE_MS) this._down(true);
      }, PING_MS);
      if (!was || this.role === 'host') this.h.onConnect && this.h.onConnect();
    }

    _down(notify = true) {
      if (!this._connected) return;
      this._connected = false;
      if (notify && !this.closed) this.h.onClose && this.h.onClose();
    }

    get connected() { return this._connected; }

    send(msg) {
      if (!this._connected) return false;
      return this._raw(msg);
    }

    destroy() {
      this.closed = true;
      clearInterval(this.timer);
      clearTimeout(this.joinTimer);
      const cs = this.clients;
      this.clients = [];
      // 마지막으로 보낸 메시지('bye' 등)가 나갈 시간을 조금 준다
      setTimeout(() => { for (const c of cs) { try { c.end(true); } catch (e) {} } }, 400);
    }
  }

  root.Net = { Room, normalizeCode };
})(window);

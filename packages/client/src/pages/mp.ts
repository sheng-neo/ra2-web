/**
 * 多人联机（#mp）：连接 → 大厅 → 锁步对局。
 * 大厅：选阵营、准备、聊天；双方都 ready 即开局。
 * 对局：MatchView + 锁步驱动（命令经服务器中继，所有客户端同序执行）。
 */
import {
  LockstepSession,
  PROTOCOL_VERSION,
  SIM_TICKS_PER_SECOND,
  type Command,
  type LobbyPlayer,
  type MatchConfig,
  type ServerMessage,
  type Side,
} from '@ra2web/game';
import { NetClient, defaultServerUrl } from '../net-client';
import { createMatchWorld } from '../match-setup';
import { MATCH_STYLE, MatchView } from '../match-view';

const TICK_MS = 1000 / SIM_TICKS_PER_SECOND;
const HASH_EVERY = 30;

const LOBBY_STYLE = `
.mp-lobby { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: #0b0e11; color: #d8e0e6; font: 14px/1.6 system-ui, 'PingFang SC', sans-serif; }
.mp-card { width: min(460px, 92vw); background: #131a21; border: 1px solid #243039; border-radius: 10px; padding: 22px; }
.mp-card h1 { margin: 0 0 4px; font-size: 20px; }
.mp-card .sub { color: #8a97a0; font-size: 13px; margin-bottom: 16px; }
.mp-card label { display: block; font-size: 12px; color: #9aa7b0; margin: 10px 0 4px; }
.mp-card input { width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0d1318; color: #e8eef2;
  border: 1px solid #2a3a48; border-radius: 6px; font-size: 14px; }
.mp-card button { margin-top: 16px; width: 100%; padding: 10px; border: none; border-radius: 6px;
  background: #2d6fb0; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
.mp-card button:disabled { opacity: .5; cursor: not-allowed; }
.mp-card button.ghost { background: #1d2730; }
.mp-players { list-style: none; padding: 0; margin: 8px 0; }
.mp-players li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; background: #0d1318; margin-bottom: 4px; }
.mp-players .side { font-size: 12px; padding: 1px 8px; border-radius: 10px; }
.mp-players .allied { background: #1d3a5a; color: #8fc0f0; }
.mp-players .soviet { background: #5a1d1d; color: #f0a0a0; }
.mp-players .rdy { margin-left: auto; font-size: 12px; }
.mp-players .rdy.on { color: #6fce6f; }
.mp-players .rdy.off { color: #8a97a0; }
.mp-chat { height: 110px; overflow-y: auto; background: #0d1318; border: 1px solid #2a3a48; border-radius: 6px; padding: 6px 8px; font-size: 12px; margin-top: 8px; }
.mp-chat .me { color: #8fc0f0; }
.mp-err { color: #e05050; font-size: 13px; margin-top: 10px; min-height: 18px; }
.mp-row { display: flex; gap: 8px; }
.mp-row button { margin-top: 0; }
.mp-back { display:block; text-align:center; margin-top: 12px; color:#6db3e8; }
`;

export async function renderMp(root: HTMLElement): Promise<void> {
  document.title = '联机对战 — 网页版红警2';
  const style = document.createElement('style');
  style.textContent = LOBBY_STYLE + MATCH_STYLE;
  document.head.appendChild(style);

  const net = new NetClient();
  let myId = 0;
  let players: LobbyPlayer[] = [];
  let hostId = 0;
  let inMatch = false;

  // —— 邀请链接：/?room=xxx，朋友打开即自动加入同一房间（服务器按房间名匹配）。
  //    房间号放 query 而非 # 后面：微信等聊天工具转发链接时经常剥掉 #fragment——
  //    旧 #mp?room=xxx 链接被剥后朋友落在首页 → 自建房间 → 两人各在一房（互相看不见、准备凑不齐）。
  const genId = (): string => Math.random().toString(36).slice(2, 8);
  const inviteUrl = (room: string): string => `${location.origin}${location.pathname}?room=${encodeURIComponent(room)}`;
  const hashQ = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?') + 1) : '';
  const searchRoom = new URLSearchParams(location.search).get('room') ?? '';
  const urlRoom = searchRoom || (new URLSearchParams(hashQ).get('room') ?? '');
  // 进页后把 query 规范成 hash 形式：避免「返回首页」时 ?room 残留又被路由送回联机页
  if (searchRoom) history.replaceState(null, '', `${location.pathname}#mp?room=${encodeURIComponent(searchRoom)}`);
  let currentRoom = '';

  // 连接表单
  root.innerHTML = `
    <div class="mp-lobby"><div class="mp-card" id="mp-card">
      <h1>联机对战</h1>
      <div class="sub">${urlRoom ? `正在加入朋友的房间 <b style="color:#ffd98a">${escapeHtml(urlRoom)}</b>…` : '点下面按钮生成邀请链接发给朋友，对方打开即同房；链接发不过去就把房间号告诉 TA，双方手动填同一房间名。'}</div>
      ${urlRoom ? '' : '<button id="mp-invite" style="background:#2d6fb0;color:#fff;border:none;border-radius:6px;padding:10px;width:100%;cursor:pointer;font-size:15px">🔗 创建对战并邀请朋友</button>'}
      <div id="mp-invitebox" style="display:none;margin-top:8px">
        <label>把这个链接发给朋友（已复制到剪贴板）</label>
        <div style="display:flex;gap:6px"><input id="mp-invlink" readonly style="flex:1" /><button id="mp-copy" style="width:64px">复制</button></div>
      </div>
      <details style="margin-top:10px"><summary style="cursor:pointer;color:#8aa7b0">手动 / 本机双开</summary>
        <label>服务器地址</label><input id="mp-url" value="${defaultServerUrl()}" />
        <label>房间名</label><input id="mp-room" value="${urlRoom || 'room1'}" />
      </details>
      <label>昵称</label>
      <input id="mp-name" value="玩家" />
      <button id="mp-connect">${urlRoom ? '加入房间' : '连接并加入'}</button>
      <div class="mp-err" id="mp-err"></div>
      <a class="mp-back" href="#">← 返回首页</a>
    </div></div>`;

  const errEl = root.querySelector('#mp-err') as HTMLElement;
  const connectBtn = root.querySelector('#mp-connect') as HTMLButtonElement;
  const roomInput = root.querySelector('#mp-room') as HTMLInputElement;
  const nameOf = (): string => (root.querySelector('#mp-name') as HTMLInputElement).value.trim() || '玩家';
  const urlOf = (): string => (root.querySelector('#mp-url') as HTMLInputElement).value.trim();

  function showInvite(room: string): void {
    const box = root.querySelector('#mp-invitebox') as HTMLElement | null;
    const link = root.querySelector('#mp-invlink') as HTMLInputElement | null;
    if (!box || !link) return;
    box.style.display = '';
    link.value = inviteUrl(room);
    navigator.clipboard?.writeText(link.value).catch(() => undefined);
  }

  // 防重复加入：连点「创建对战」会每次生成新房间 + 留下僵尸连接（自己跟自己分房）
  let joining = false;
  const inviteBtn = root.querySelector('#mp-invite') as HTMLButtonElement | null;

  async function join(room: string): Promise<void> {
    if (joining) return;
    joining = true;
    errEl.textContent = '连接中…';
    connectBtn.disabled = true;
    if (inviteBtn) inviteBtn.disabled = true;
    try {
      await net.connect(urlOf());
      net.send({ t: 'join', room, name: nameOf(), protocol: PROTOCOL_VERSION });
    } catch {
      errEl.textContent = '连接失败：请确认服务器已启动（pnpm dev:server）。';
      joining = false;
      connectBtn.disabled = false;
      if (inviteBtn) inviteBtn.disabled = false;
    }
  }

  inviteBtn?.addEventListener('click', () => {
    if (joining) return;
    const room = genId();
    roomInput.value = room;
    showInvite(room);
    void join(room);
  });
  root.querySelector('#mp-copy')?.addEventListener('click', () => {
    const link = root.querySelector('#mp-invlink') as HTMLInputElement;
    link.select();
    navigator.clipboard?.writeText(link.value).catch(() => undefined);
  });
  connectBtn.addEventListener('click', () => void join(roomInput.value.trim() || 'room1'));

  // 经邀请链接进入：自动连接并加入该房间
  if (urlRoom) {
    showInvite(urlRoom);
    void join(urlRoom);
  }

  net.onClose = () => {
    if (!inMatch) errEl.textContent = '连接已断开。';
  };

  net.onMessage = (msg: ServerMessage) => {
    switch (msg.t) {
      case 'joined':
        myId = msg.playerId;
        currentRoom = msg.room;
        break;
      case 'lobby':
        players = msg.players;
        hostId = msg.hostId;
        if (!inMatch) renderLobby();
        break;
      case 'chat':
        appendChat(`${msg.name}: ${msg.text}`, msg.playerId === myId);
        break;
      case 'error':
        errEl.textContent = msg.message;
        joining = false;
        connectBtn.disabled = false;
        if (inviteBtn) inviteBtn.disabled = false;
        break;
      case 'start':
        inMatch = true;
        void startMatch(msg.config, msg.players);
        break;
      default:
        // tick/defeat/desync/playerLeft 在对局中由 driver 处理
        matchHandler?.(msg);
        break;
    }
  };

  let matchHandler: ((msg: ServerMessage) => void) | null = null;
  const chatLog: { text: string; me: boolean }[] = [];

  function appendChat(text: string, me: boolean): void {
    chatLog.push({ text, me });
    const box = root.querySelector('#mp-chat');
    if (box) {
      box.innerHTML = chatLog.map((c) => `<div class="${c.me ? 'me' : ''}">${escapeHtml(c.text)}</div>`).join('');
      box.scrollTop = box.scrollHeight;
    }
  }

  function renderLobby(): void {
    const me = players.find((p) => p.playerId === myId);
    const card = root.querySelector('#mp-card') as HTMLElement;
    const waiting = players.length < 2;
    card.innerHTML = `
      <h1>房间大厅</h1>
      <div class="sub">房间号 <b style="color:#ffd98a">${escapeHtml(currentRoom)}</b> · <b>${players.length}/2 人</b>${myId === hostId ? ' · 你是房主' : ''} · 满 2 人全部准备后自动开始</div>
      <div class="mp-row" style="margin:6px 0"><input id="mp-lobinv" readonly value="${inviteUrl(currentRoom)}" style="flex:1" title="发给朋友，打开即同房" /><button id="mp-lobcopy" style="width:96px">复制邀请</button></div>
      ${waiting ? `<div style="color:#e0b050;font-size:12.5px;margin:4px 0 6px;line-height:1.6">⏳ 等待朋友加入…把链接发给 TA。若 TA 打开后没出现在这里，让 TA 进「联机对战 → 手动/本机双开」，房间名填 <b>${escapeHtml(currentRoom)}</b></div>` : ''}
      <ul class="mp-players">
        ${players
          .map(
            (p) => `<li>
              <span>${escapeHtml(p.name)}${p.playerId === myId ? '（你）' : ''}</span>
              <span class="side ${p.side}">${p.side === 'allied' ? '盟军' : '苏军'}</span>
              <span class="rdy ${p.ready ? 'on' : 'off'}">${p.ready ? '✓ 已准备' : '未准备'}</span>
            </li>`,
          )
          .join('')}
      </ul>
      <div class="mp-row">
        <button class="ghost" id="mp-side">切换阵营（当前：${me?.side === 'allied' ? '盟军' : '苏军'}）</button>
        <button id="mp-ready">${me?.ready ? '取消准备' : '准备'}</button>
      </div>
      <div class="mp-chat" id="mp-chat"></div>
      <div class="mp-row" style="margin-top:8px">
        <input id="mp-chatinput" placeholder="说点什么…" />
        <button id="mp-send" style="width:80px">发送</button>
      </div>
      <a class="mp-back" href="#">← 退出房间</a>`;

    (card.querySelector('#mp-lobcopy') as HTMLButtonElement | null)?.addEventListener('click', () => {
      const link = card.querySelector('#mp-lobinv') as HTMLInputElement;
      link.select();
      navigator.clipboard?.writeText(link.value).catch(() => undefined);
    });
    (card.querySelector('#mp-side') as HTMLButtonElement).addEventListener('click', () => {
      const next: Side = me?.side === 'allied' ? 'soviet' : 'allied';
      net.send({ t: 'setSide', side: next });
    });
    (card.querySelector('#mp-ready') as HTMLButtonElement).addEventListener('click', () => {
      net.send({ t: 'ready', ready: !me?.ready });
    });
    const chatInput = card.querySelector('#mp-chatinput') as HTMLInputElement;
    const sendChat = (): void => {
      const text = chatInput.value.trim();
      if (text) net.send({ t: 'chat', text });
      chatInput.value = '';
    };
    (card.querySelector('#mp-send') as HTMLButtonElement).addEventListener('click', sendChat);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChat();
    });
    appendChat('', false);
    chatLog.pop();
    const box = root.querySelector('#mp-chat')!;
    box.innerHTML = chatLog.map((c) => `<div class="${c.me ? 'me' : ''}">${escapeHtml(c.text)}</div>`).join('');
  }

  async function startMatch(config: MatchConfig, matchPlayers: LobbyPlayer[]): Promise<void> {
    const world = createMatchWorld(config);
    const view = new MatchView(root, world, myId, config.mapWidth, config.mapHeight);
    await view.init();

    const playerIds = matchPlayers.map((p) => p.playerId).sort((a, b) => a - b);
    const session = new LockstepSession(myId, playerIds, config.inputDelay);

    // 启动空包
    for (const pkt of session.start()) net.send({ t: 'cmd', tick: pkt.tick, commands: pkt.commands });

    // 服务器消息 → 喂给 session
    matchHandler = (msg: ServerMessage) => {
      if (msg.t === 'tick') {
        for (const [pid, commands] of Object.entries(msg.commandsByPlayer)) {
          session.receive({ tick: msg.tick, playerId: Number(pid), commands: commands as Command[] });
        }
      } else if (msg.t === 'defeat') {
        // 对手掉线/认输：标记其失败（本地 sim 会在下个 tick 判我方胜）
        const p = world.players.get(msg.playerId);
        if (p) p.defeated = true;
      } else if (msg.t === 'desync') {
        view.setNetStatus(`⚠ 失同步 @${msg.tick}`, true);
      }
    };

    // 锁步驱动：定时器节拍，仅在收齐命令时推进
    let acc = 0;
    let prev = performance.now();
    const clock = setInterval(() => {
      const now = performance.now();
      acc += now - prev;
      prev = now;
      let steps = 0;
      let stalled = false;
      while (acc >= TICK_MS && steps < 8) {
        if (!session.ready()) {
          stalled = true;
          break;
        }
        const execTick = session.currentTick;
        const cmds = session.take();
        view.stepWith(cmds);
        // 本 tick 玩家操作 → 安排到未来 tick，并发服务器
        for (const c of view.takeLocalCommands()) session.queueLocal(c);
        const pkt = session.afterStep();
        net.send({ t: 'cmd', tick: pkt.tick, commands: pkt.commands });
        if (execTick % HASH_EVERY === 0) net.send({ t: 'hash', tick: execTick, hash: world.hash() });
        acc -= TICK_MS;
        steps++;
      }
      if (acc > TICK_MS * 8) acc = 0;
      const ahead = session.bufferedAhead();
      if (stalled) view.setNetStatus('⏳ 等待对方指令…', true);
      else view.setNetStatus(`t${session.currentTick} 缓冲${ahead} ${world.hash().toString(16).slice(0, 6)}`);
    }, TICK_MS);

    view.app.ticker.add(() => {
      try {
        view.render();
      } catch (e) {
        console.error('[render]', e);
      }
    });
    window.addEventListener('hashchange', () => clearInterval(clock), { once: true });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

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

  // 连接表单
  root.innerHTML = `
    <div class="mp-lobby"><div class="mp-card" id="mp-card">
      <h1>联机对战</h1>
      <div class="sub">本机双开两个浏览器标签、填同一房间名即可对战。</div>
      <label>服务器地址</label>
      <input id="mp-url" value="${defaultServerUrl()}" />
      <label>房间名</label>
      <input id="mp-room" value="room1" />
      <label>昵称</label>
      <input id="mp-name" value="玩家" />
      <button id="mp-connect">连接并加入</button>
      <div class="mp-err" id="mp-err"></div>
      <a class="mp-back" href="#">← 返回首页</a>
    </div></div>`;

  const errEl = root.querySelector('#mp-err') as HTMLElement;
  const connectBtn = root.querySelector('#mp-connect') as HTMLButtonElement;

  connectBtn.addEventListener('click', async () => {
    const url = (root.querySelector('#mp-url') as HTMLInputElement).value.trim();
    const room = (root.querySelector('#mp-room') as HTMLInputElement).value.trim() || 'room1';
    const name = (root.querySelector('#mp-name') as HTMLInputElement).value.trim() || '玩家';
    errEl.textContent = '连接中…';
    connectBtn.disabled = true;
    try {
      await net.connect(url);
      net.send({ t: 'join', room, name, protocol: PROTOCOL_VERSION });
    } catch {
      errEl.textContent = '连接失败：请确认服务器已启动（pnpm dev:server）。';
      connectBtn.disabled = false;
    }
  });

  net.onClose = () => {
    if (!inMatch) errEl.textContent = '连接已断开。';
  };

  net.onMessage = (msg: ServerMessage) => {
    switch (msg.t) {
      case 'joined':
        myId = msg.playerId;
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
        connectBtn.disabled = false;
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
    card.innerHTML = `
      <h1>房间大厅</h1>
      <div class="sub">满 2 人且全部准备后自动开始。${myId === hostId ? '（你是房主）' : ''}</div>
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

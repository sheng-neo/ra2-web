/**
 * 对战房间：大厅 + 锁步命令中继。
 * 服务器不跑 sim，只做：分配 playerId、收集每 tick 每玩家的命令包、
 * 收齐后广播（保证全端同序执行）、汇集状态哈希做 desync 检测。
 */
import type {
  ClientMessage,
  Command,
  LobbyPlayer,
  MatchConfig,
  ServerMessage,
  Side,
} from '@ra2web/game';

export interface Client {
  playerId: number;
  name: string;
  side: Side;
  ready: boolean;
  send(msg: ServerMessage): void;
  alive: boolean;
}

const SIDES: Side[] = ['allied', 'soviet'];
const INPUT_DELAY = 4;

export class Room {
  readonly clients = new Map<number, Client>();
  private nextPlayerId = 1;
  private hostId = 0;
  started = false;
  /** tick → (playerId → 命令)，收齐即广播并清除。 */
  private readonly tickBuffer = new Map<number, Map<number, Command[]>>();
  /** 已广播的最大 tick（防重复广播）。 */
  private broadcastedUpTo = -1;
  /** desync 检测：tick → (playerId → hash)。 */
  private readonly hashBuffer = new Map<number, Map<number, number>>();
  private config: MatchConfig | null = null;

  constructor(readonly name: string) {}

  get empty(): boolean {
    return this.clients.size === 0;
  }

  addClient(send: (msg: ServerMessage) => void, name?: string): Client {
    const playerId = this.nextPlayerId++;
    const usedSides = new Set([...this.clients.values()].map((c) => c.side));
    const side = SIDES.find((s) => !usedSides.has(s)) ?? 'allied';
    const client: Client = {
      playerId,
      name: name?.slice(0, 24) || `玩家${playerId}`,
      side,
      ready: false,
      send,
      alive: true,
    };
    this.clients.set(playerId, client);
    if (this.hostId === 0) this.hostId = playerId;
    send({ t: 'joined', playerId, room: this.name });
    this.broadcastLobby();
    return client;
  }

  removeClient(playerId: number): void {
    const c = this.clients.get(playerId);
    if (!c) return;
    c.alive = false;
    this.clients.delete(playerId);
    if (this.hostId === playerId) {
      this.hostId = this.clients.size > 0 ? [...this.clients.keys()][0]! : 0;
    }
    this.broadcast({ t: 'playerLeft', playerId });
    if (this.started) {
      // 对局中掉线：判负（其余玩家继续）
      this.broadcast({ t: 'defeat', playerId });
    } else {
      this.broadcastLobby();
    }
  }

  handle(playerId: number, msg: ClientMessage): void {
    const client = this.clients.get(playerId);
    if (!client) return;
    switch (msg.t) {
      case 'setSide':
        if (!this.started) {
          client.side = msg.side;
          this.broadcastLobby();
        }
        break;
      case 'ready':
        client.ready = msg.ready;
        this.broadcastLobby();
        this.maybeStart();
        break;
      case 'cmd':
        this.onCommand(playerId, msg.tick, msg.commands);
        break;
      case 'hash':
        this.onHash(playerId, msg.tick, msg.hash);
        break;
      case 'chat':
        this.broadcast({ t: 'chat', playerId, name: client.name, text: msg.text.slice(0, 200) });
        break;
      case 'join':
        break; // 由连接层处理
    }
  }

  private lobbyPlayers(): LobbyPlayer[] {
    return [...this.clients.values()].map((c) => ({
      playerId: c.playerId,
      name: c.name,
      side: c.side,
      ready: c.ready,
    }));
  }

  private broadcastLobby(): void {
    this.broadcast({ t: 'lobby', players: this.lobbyPlayers(), hostId: this.hostId });
  }

  private maybeStart(): void {
    if (this.started) return;
    if (this.clients.size < 2) return;
    if (![...this.clients.values()].every((c) => c.ready)) return;
    this.start();
  }

  private start(): void {
    this.started = true;
    const players = [...this.clients.values()];
    const mapW = 48;
    const mapH = 48;
    // 对角出生
    const spawns = players.map((c, i) => ({
      playerId: c.playerId,
      side: c.side,
      cellX: i === 0 ? 6 : mapW - 9,
      cellY: i === 0 ? 7 : mapH - 10,
    }));
    this.config = {
      seed: 0x52413257, // "RA2W"
      mapWidth: mapW,
      mapHeight: mapH,
      spawns,
      orePatches: [
        { cellX: 14, cellY: 16 },
        { cellX: mapW - 16, cellY: mapH - 18 },
        { cellX: Math.floor(mapW / 2), cellY: Math.floor(mapH / 2) },
      ],
      inputDelay: INPUT_DELAY,
    };
    this.broadcast({ t: 'start', config: this.config, players: this.lobbyPlayers() });
  }

  private onCommand(playerId: number, tick: number, commands: Command[]): void {
    if (!this.started || tick <= this.broadcastedUpTo) return;
    let byPlayer = this.tickBuffer.get(tick);
    if (!byPlayer) {
      byPlayer = new Map();
      this.tickBuffer.set(tick, byPlayer);
    }
    byPlayer.set(playerId, commands);
    this.tryBroadcastTicks();
  }

  /** 从 broadcastedUpTo+1 起，连续广播所有已收齐的 tick。 */
  private tryBroadcastTicks(): void {
    for (;;) {
      const tick = this.broadcastedUpTo + 1;
      const byPlayer = this.tickBuffer.get(tick);
      if (!byPlayer) break;
      // 需收齐所有「存活」玩家
      let complete = true;
      for (const pid of this.clients.keys()) {
        if (!byPlayer.has(pid)) {
          complete = false;
          break;
        }
      }
      if (!complete) break;
      const commandsByPlayer: Record<number, Command[]> = {};
      for (const [pid, cmds] of byPlayer) commandsByPlayer[pid] = cmds;
      this.broadcast({ t: 'tick', tick, commandsByPlayer });
      this.tickBuffer.delete(tick);
      this.broadcastedUpTo = tick;
    }
  }

  private onHash(playerId: number, tick: number, hash: number): void {
    let byPlayer = this.hashBuffer.get(tick);
    if (!byPlayer) {
      byPlayer = new Map();
      this.hashBuffer.set(tick, byPlayer);
    }
    byPlayer.set(playerId, hash);
    if (byPlayer.size === this.clients.size && this.clients.size > 1) {
      const values = [...byPlayer.values()];
      const desync = values.some((h) => h !== values[0]);
      if (desync) {
        const hashes: Record<number, number> = {};
        for (const [pid, h] of byPlayer) hashes[pid] = h;
        this.broadcast({ t: 'desync', tick, hashes });
      }
      this.hashBuffer.delete(tick);
    }
  }

  private broadcast(msg: ServerMessage): void {
    for (const c of this.clients.values()) {
      if (c.alive) c.send(msg);
    }
  }
}

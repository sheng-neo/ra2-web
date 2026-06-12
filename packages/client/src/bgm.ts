/**
 * 全局背景音乐（用户自备 /bgm.mp3）。挂在 document.body 上、跨页面存活，
 * 从首页一路放到遭遇战设置/大厅，并续播进正式对战（压低音量，见 enterMatch）。
 * 浏览器禁自动播放：须用户首次手势后 play()。无该文件则标记不可用（隐藏开关）。
 */
class Bgm {
  private el: HTMLAudioElement | null = null;
  private unavailable = false;
  private wanted = localStorage.getItem('ra2.bgm') !== 'off';
  private readonly cbs: (() => void)[] = [];

  private ensure(): HTMLAudioElement {
    if (this.el) return this.el;
    const a = document.createElement('audio');
    a.src = '/bgm.mp3';
    a.loop = true;
    a.volume = 0.5;
    a.addEventListener('error', () => {
      this.unavailable = true;
      this.cbs.forEach((c) => c());
    });
    document.body.appendChild(a);
    this.el = a;
    return a;
  }

  get isOn(): boolean {
    return this.wanted;
  }

  /** 注册「无 bgm.mp3」回调（已知或将来 error 时触发），用于隐藏开关。 */
  onUnavailable(cb: () => void): void {
    if (this.unavailable) cb();
    else this.cbs.push(cb);
  }

  /** 按当前意愿尝试播放（须在用户手势后调用方能出声）。 */
  play(): void {
    if (!this.wanted) return;
    void this.ensure()
      .play()
      .catch(() => undefined);
  }

  /** 开关；记忆到 localStorage。 */
  setOn(on: boolean): void {
    this.wanted = on;
    localStorage.setItem('ra2.bgm', on ? 'on' : 'off');
    if (on) this.play();
    else this.el?.pause();
  }

  /** 进入正式对战：不再静音战场——压低音量（让音效/EVA 盖在上面）后续播，
   *  使战斗全程也有配乐（红警的灵魂）。无 bgm.mp3 或已关闭则保持无声。 */
  enterMatch(): void {
    if (this.wanted) this.ensure().volume = 0.42; // 战斗内压低；菜单维持 0.5
    this.play();
  }

  /** 对战内"全部静音"开关联动：静音即暂停音乐，取消静音按意愿恢复（不改用户偏好）。 */
  setMatchMuted(muted: boolean): void {
    if (!this.el) return;
    if (muted) this.el.pause();
    else if (this.wanted) void this.el.play().catch(() => undefined);
  }

  /** 完全停止（返回菜单等场景）。当前对战内改用 enterMatch 续播，不再于开局调用。 */
  stop(): void {
    if (this.el) {
      this.el.pause();
      this.el.currentTime = 0;
    }
  }
}

export const bgm = new Bgm();

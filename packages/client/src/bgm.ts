/**
 * 全局背景音乐（用户自备 /bgm.mp3）。挂在 document.body 上、跨页面存活，
 * 所以从首页一路放到遭遇战设置/大厅，直到正式对战载入（MatchView.init）才停。
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

  /** 进入正式对战时停止（矿车/地图出现）。 */
  stop(): void {
    if (this.el) {
      this.el.pause();
      this.el.currentTime = 0;
    }
  }
}

export const bgm = new Bgm();

/**
 * Westwood INI（rules.ini / art.ini / 地图文件均为此格式）。
 * 规则：[节名]；key=value；';' 起为注释；节与键大小写不敏感；重复键后者覆盖。
 */
export class IniSection {
  private readonly map = new Map<string, string>();
  /** 保留原始顺序的键名（registry 列表如 [InfantryTypes] 依赖顺序）。 */
  readonly keys: string[] = [];

  constructor(readonly name: string) {}

  set(key: string, value: string): void {
    const k = key.toLowerCase();
    if (!this.map.has(k)) this.keys.push(key);
    this.map.set(k, value);
  }

  has(key: string): boolean {
    return this.map.has(key.toLowerCase());
  }

  getString(key: string, fallback = ''): string {
    return this.map.get(key.toLowerCase()) ?? fallback;
  }

  getNumber(key: string, fallback = 0): number {
    const raw = this.getString(key);
    if (raw === '') return fallback;
    const v = Number.parseFloat(raw);
    return Number.isFinite(v) ? v : fallback;
  }

  /** WW 布尔：yes/no、true/false、1/0（取首字符判断）。 */
  getBool(key: string, fallback = false): boolean {
    const raw = this.getString(key).trim().toLowerCase();
    if (raw === '') return fallback;
    return raw[0] === 'y' || raw[0] === 't' || raw[0] === '1';
  }

  getList(key: string): string[] {
    const raw = this.getString(key);
    if (raw.trim() === '') return [];
    return raw.split(',').map((s) => s.trim()).filter((s) => s !== '');
  }

  /** registry 节的全部值（按出现顺序）。 */
  values(): string[] {
    return this.keys.map((k) => this.getString(k));
  }
}

export class IniFile {
  private readonly sections = new Map<string, IniSection>();
  readonly sectionNames: string[] = [];

  constructor(text: string) {
    let current: IniSection | undefined;
    for (let rawLine of text.split(/\r\n|\r|\n/)) {
      const comment = rawLine.indexOf(';');
      if (comment !== -1) rawLine = rawLine.slice(0, comment);
      const line = rawLine.trim();
      if (line === '') continue;

      if (line.startsWith('[')) {
        const end = line.indexOf(']');
        if (end > 1) {
          const name = line.slice(1, end).trim();
          current = this.getOrCreate(name);
        }
        continue;
      }

      if (!current) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (key !== '') current.set(key, value);
    }
  }

  private getOrCreate(name: string): IniSection {
    const k = name.toLowerCase();
    let s = this.sections.get(k);
    if (!s) {
      s = new IniSection(name);
      this.sections.set(k, s);
      this.sectionNames.push(name);
    }
    return s;
  }

  getSection(name: string): IniSection | undefined {
    return this.sections.get(name.toLowerCase());
  }

  /** 解析 mix 中的 ini 字节（Latin-1，原版均为单字节编码）。 */
  static fromBytes(bytes: Uint8Array): IniFile {
    return new IniFile(new TextDecoder('latin1').decode(bytes));
  }
}

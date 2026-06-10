import { describe, expect, it } from 'vitest';
import { IniFile } from './ini';

const SAMPLE = `
; 这是注释
[General]
Name = Rhino Tank ; 行尾注释
Cost=900
Crewed=yes
Primary=120mm
Doubled=1
Doubled=2

[InfantryTypes]
1=E1
2=E2
3=DOG

[ART]
Foundation=2x2
`;

describe('IniFile', () => {
  const ini = new IniFile(SAMPLE);

  it('节与键大小写不敏感', () => {
    expect(ini.getSection('general')).toBeDefined();
    expect(ini.getSection('GENERAL')!.getString('name')).toBe('Rhino Tank');
  });

  it('注释剥离与空白裁剪', () => {
    const g = ini.getSection('General')!;
    expect(g.getString('Name')).toBe('Rhino Tank');
    expect(g.getNumber('Cost')).toBe(900);
  });

  it('WW 布尔与重复键覆盖', () => {
    const g = ini.getSection('General')!;
    expect(g.getBool('Crewed')).toBe(true);
    expect(g.getBool('Missing', false)).toBe(false);
    expect(g.getString('Doubled')).toBe('2');
  });

  it('registry 节保持顺序', () => {
    expect(ini.getSection('InfantryTypes')!.values()).toEqual(['E1', 'E2', 'DOG']);
  });

  it('列表解析', () => {
    const ini2 = new IniFile('[A]\nList=E1, E2 ,DOG\n');
    expect(ini2.getSection('A')!.getList('List')).toEqual(['E1', 'E2', 'DOG']);
  });

  it('sectionNames 保持出现顺序', () => {
    expect(ini.sectionNames).toEqual(['General', 'InfantryTypes', 'ART']);
  });
});

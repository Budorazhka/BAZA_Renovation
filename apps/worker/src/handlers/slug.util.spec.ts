import { buildSlugBase, buildSlugCandidate } from './slug.util';

describe('buildSlugBase', () => {
  it('транслитерирует кириллицу и объединяет название+город через дефис', () => {
    expect(buildSlugBase('Малибу', 'Батуми')).toBe('malibu-batumi');
  });

  it('переводит пробелы в дефисы, схлопывает повторяющиеся дефисы', () => {
    expect(buildSlugBase('Green   Hills', 'Tbilisi')).toBe('green-hills-tbilisi');
  });

  it('удаляет символы вне [a-z0-9-]', () => {
    // "солнечный" → "solnechnyy": й→y в транслитерации + окончание -ый→-yy —
    // корректное поведение таблицы транслитерации, не опечатка в тесте.
    expect(buildSlugBase('ЖК "Солнечный"!', 'Кутаиси')).toBe('zhk-solnechnyy-kutaisi');
  });

  it('возвращает fallback "development", если результат пуст', () => {
    expect(buildSlugBase('!!!', '???')).toBe('development');
  });

  it('латиница проходит без изменений (кроме lowercase)', () => {
    expect(buildSlugBase('Green Hills', 'Batumi')).toBe('green-hills-batumi');
  });
});

describe('buildSlugCandidate', () => {
  it('attempt=0 возвращает base без изменений', () => {
    expect(buildSlugCandidate('malibu-batumi', 0)).toBe('malibu-batumi');
  });

  it('attempt>0 добавляет числовой suffix', () => {
    expect(buildSlugCandidate('malibu-batumi', 1)).toBe('malibu-batumi-2');
    expect(buildSlugCandidate('malibu-batumi', 2)).toBe('malibu-batumi-3');
  });
});

import { describe, expect, it } from 'vitest';
import { driverFirstName, driverFirstNameRu } from './driver-name';

describe('driverFirstName', () => {
  it('ia al doilea cuvânt plin ca prenume', () => {
    expect(driverFirstName('Roman Vladimir')).toBe('Vladimir');
    expect(driverFirstName('Docuciaev Dumitru Petru')).toBe('Dumitru');
  });

  it('fără prenume real întoarce null', () => {
    expect(driverFirstName('Zaiț S.')).toBeNull();
    expect(driverFirstName('Goncear R I')).toBeNull();
    expect(driverFirstName('')).toBeNull();
    expect(driverFirstName(null)).toBeNull();
  });
});

describe('driverFirstNameRu', () => {
  // Латиница в русской фразе — TTS читает её по английским правилам
  // («Vladimir» → «Влэдаймер»). Имя в driver_line_ru обязано быть кириллицей.
  it('переводит имена водителей из БД в кириллицу', () => {
    expect(driverFirstNameRu('Roman Vladimir')).toBe('Владимир');
    expect(driverFirstNameRu('Baesu Anatolii')).toBe('Анатолий');
    expect(driverFirstNameRu('Barbacari Serghei')).toBe('Сергей');
    expect(driverFirstNameRu('Struna Valerii')).toBe('Валерий');
    expect(driverFirstNameRu('Chitic Ion')).toBe('Ион');
  });

  it('румынские имена не русифицирует — имя человека не переводится', () => {
    expect(driverFirstNameRu('Cebotari Vasile')).toBe('Василе');
    expect(driverFirstNameRu('Rusu Gheorghe')).toBe('Георге');
    expect(driverFirstNameRu('Popa Nicolae')).toBe('Николае');
    expect(driverFirstNameRu('Munteanu Alexandru')).toBe('Александру');
  });

  // ВАЖНО: имена ниже проверены — их НЕТ в RU_NAMES, иначе тест шёл бы
  // через словарь и транслитератор оставался бы непроверенным
  // (architecture-guardian, 24.08: прошлая версия этого блока была фиктивной).
  it('транслитерирует имя, которого нет в словаре', () => {
    expect(driverFirstNameRu('Test Adrian')).toBe('Адриан');
    expect(driverFirstNameRu('Test Cristian')).toBe('Кристиан');
    expect(driverFirstNameRu('Test Octavian')).toBe('Октавиан');
    expect(driverFirstNameRu('Test Marius')).toBe('Мариус');
    expect(driverFirstNameRu('Test Corneliu')).toBe('Корнелиу');
  });

  it('не рвёт слог на ia / iu / ea в середине слова', () => {
    for (const [name, bad] of [['Adrian', 'Адрян'], ['Cristian', 'Кристян'], ['Marius', 'Марюс']]) {
      expect(driverFirstNameRu(`Nume ${name}`)).not.toBe(bad);
    }
  });

  it('ci и gi перед гласной дают один звук', () => {
    expect(driverFirstNameRu('Test Ciobanu')).toBe('Чобану');
    expect(driverFirstNameRu('Test Giorgian')).toBe('Джорджан');
  });

  it('результат всегда без латинских букв', () => {
    for (const n of ['Adrian', 'Cristian', 'Ciprian', 'Tiberiu', 'Emilian', 'Ghiocel']) {
      expect(driverFirstNameRu(`Nume ${n}`)).not.toMatch(/[a-zA-Z]/);
    }
  });

  it('без пренуме — null, как и в румынской ветке', () => {
    expect(driverFirstNameRu('Zaiț S.')).toBeNull();
    expect(driverFirstNameRu(null)).toBeNull();
  });
});

describe('driverFirstNameRu — ключи прототипа', () => {
  // performance-reviewer, 24.08: RU_NAMES['constructor'] возвращал функцию из
  // прототипа, `??` её не ловил, и в русскую фразу уезжал код функции.
  it('не отдаёт значения из прототипа объекта', () => {
    for (const n of ['Constructor', 'ToString', 'ValueOf', 'HasOwnProperty']) {
      const got = driverFirstNameRu(`Nume ${n}`);
      expect(typeof got).toBe('string');
      expect(got).not.toMatch(/native code|function/i);
    }
  });
});

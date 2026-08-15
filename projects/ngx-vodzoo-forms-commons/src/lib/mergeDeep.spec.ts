import {mergeDeep} from './mergeDeep';

describe('mergeDeep', () => {
  afterEach(() => {
    delete (Object.prototype as any).polluted;
  });

  it('merges nested plain objects', () => {
    const target = {
      nested: {
        preserved: true
      }
    };
    const source = {
      nested: {
        added: true
      }
    };

    expect(mergeDeep(target, source)).toEqual({
      nested: {
        preserved: true,
        added: true
      }
    });
  });

  it('overwrites existing keys and adds new keys', () => {
    const target = {
      name: 'target',
      preserved: true,
      nested: {
        value: 'target',
        preserved: true
      }
    };
    const source = {
      name: 'source',
      added: 42,
      nested: {
        value: 'source',
        added: true
      }
    };

    expect(mergeDeep(target, source)).toEqual({
      name: 'source',
      preserved: true,
      added: 42,
      nested: {
        value: 'source',
        preserved: true,
        added: true
      }
    });
  });

  it('replaces arrays by default', () => {
    const sourceItems = [3, 4];
    const result = mergeDeep({items: [1, 2]}, {items: sourceItems});

    expect(result.items).toBe(sourceItems);
  });

  it('concatenates arrays when mergeArrays is enabled', () => {
    const result = mergeDeep({items: [1, 2]}, {items: [3, 4]}, {mergeArrays: true});

    expect(result.items).toEqual([1, 2, 3, 4]);
  });

  it('merges maps and lets source entries overwrite target entries', () => {
    const result = mergeDeep(
      {values: new Map([['preserved', 1], ['overwritten', 1]])},
      {values: new Map([['overwritten', 2], ['added', 3]])}
    );

    expect([...result.values.entries()]).toEqual([
      ['preserved', 1],
      ['overwritten', 2],
      ['added', 3]
    ]);
  });

  it('does not mutate the target when immutable is enabled', () => {
    const target = {
      nested: {
        preserved: true,
        value: 'target'
      }
    };

    const result = mergeDeep(target, {nested: {value: 'source', added: true}}, {immutable: true});

    expect(result).not.toBe(target);
    expect(result.nested).not.toBe(target.nested);
    expect(result).toEqual({
      nested: {
        preserved: true,
        value: 'source',
        added: true
      }
    });
    expect(target).toEqual({
      nested: {
        preserved: true,
        value: 'target'
      }
    });
  });

  it('returns a Date source without merging it', () => {
    const source = new Date('2026-08-15T00:00:00.000Z');

    expect(mergeDeep({}, source)).toBe(source);
  });

  it('blocks properties that can modify object prototypes', () => {
    const source = JSON.parse(`{
      "__proto__": {"polluted": true},
      "constructor": {"prototype": {"polluted": true}},
      "prototype": {"polluted": true},
      "nested": {
        "__proto__": {"polluted": true},
        "constructor": {"prototype": {"polluted": true}},
        "prototype": {"polluted": true}
      }
    }`);

    const result = mergeDeep({}, source);

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBeFalse();
    expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBeFalse();
    expect(Object.prototype.hasOwnProperty.call(result, 'prototype')).toBeFalse();
    expect(Object.prototype.hasOwnProperty.call(result.nested, '__proto__')).toBeFalse();
    expect(Object.prototype.hasOwnProperty.call(result.nested, 'constructor')).toBeFalse();
    expect(Object.prototype.hasOwnProperty.call(result.nested, 'prototype')).toBeFalse();
  });

  it('does not merge into prototype objects', () => {
    const result = mergeDeep(Object.prototype, {polluted: true});

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(result).toEqual({polluted: true});
  });

  it('does not invoke the __proto__ setter when creating an immutable copy', () => {
    const target = JSON.parse('{"__proto__":{"polluted":true},"preserved":true}');

    const result = mergeDeep(target, {}, {immutable: true});

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.preserved).toBeTrue();
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it('replaces non-plain objects instead of recursively merging them', () => {
    class Value {
      constructor(public value: string) {}
    }

    const targetValue = new Value('target');
    const sourceValue = new Value('source');
    const result = mergeDeep({value: targetValue}, {value: sourceValue});

    expect(result.value).toBe(sourceValue);
    expect(targetValue.value).toBe('target');
  });
});

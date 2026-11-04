import {computed, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {concat, EMPTY, finalize, Observable, of, Subject, throwError} from 'rxjs';
import {methodSignalMerge} from '../../public-api';

describe('methodSignalMerge', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('passes each source emission directly to computation, including initial values', () => {
    const count = signal(1);
    const label = signal('A');
    const computation = vi.fn(({methodParams}: {methodParams: number | string}) => methodParams);
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [count, label], computation}));

    expect(result()).toBeUndefined();
    TestBed.flushEffects();
    expect(computation).toHaveBeenCalledTimes(2);
    expect(computation.mock.calls.map(([args]) => args.methodParams)).toEqual(expect.arrayContaining([1, 'A']));
    expect(computation.mock.calls[0][0]).toEqual({
      methodParams: expect.anything(), previousMethodParams: undefined, previousMethodValue: undefined,
    });

    count.set(2);
    TestBed.flushEffects();
    expect(result()).toBe(2);
    label.set('B');
    TestBed.flushEffects();
    expect(result()).toBe('B');
    expect(computation).toHaveBeenCalledTimes(4);
  });

  it('runs once for each changed source after stabilization and coalesces writes to the same source', () => {
    const count = signal(1);
    const label = signal('A');
    const computation = vi.fn(({methodParams}: {methodParams: number | string}) => methodParams);
    TestBed.runInInjectionContext(() => methodSignalMerge({params: [count, label], computation}));
    TestBed.flushEffects();
    computation.mockClear();

    count.set(2);
    count.set(3);
    label.set('B');
    TestBed.flushEffects();

    expect(computation).toHaveBeenCalledTimes(2);
    expect(computation.mock.calls.map(([args]) => args.methodParams)).toEqual(expect.arrayContaining([3, 'B']));
  });

  it('does not discard equal values emitted by different sources', () => {
    const first = signal('same');
    const second = signal('same');
    const computation = vi.fn(({methodParams}: {methodParams: string}) => methodParams);
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [first, second], computation}));

    TestBed.flushEffects();
    expect(computation).toHaveBeenCalledTimes(2);
    expect(result()).toBe('same');

    first.set('next');
    second.set('next');
    TestBed.flushEffects();
    expect(computation).toHaveBeenCalledTimes(4);
    expect(computation.mock.calls.map(([args]) => args.methodParams)).toEqual(['same', 'same', 'next', 'next']);
  });

  it('observes every entry when the same signal appears more than once', () => {
    const source = signal('A');
    const computation = vi.fn(({methodParams}: {methodParams: string}) => methodParams);
    TestBed.runInInjectionContext(() => methodSignalMerge({params: [source, source], computation}));
    TestBed.flushEffects();
    expect(computation.mock.calls.map(([args]) => args.methodParams)).toEqual(['A', 'A']);

    source.set('B');
    TestBed.flushEffects();
    expect(computation.mock.calls.map(([args]) => args.methodParams)).toEqual(['A', 'A', 'B', 'B']);
  });

  it('respects a source that emits equal values using custom equality', () => {
    const source = signal('same', {equal: () => false});
    const computation = vi.fn(({methodParams}: {methodParams: string}) => methodParams);
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));
    TestBed.flushEffects();

    source.set('same');
    TestBed.flushEffects();
    source.set('same');
    TestBed.flushEffects();

    expect(computation).toHaveBeenCalledTimes(3);
    expect(result()).toBe('same');
  });

  it('ignores nullish emissions without cancelling active work', () => {
    const action = signal<string | null | undefined>(undefined);
    const context = signal<number | null>(null);
    const request = new Subject<string>();
    const cancelled = vi.fn();
    const computation = vi.fn(() => request.pipe(finalize(cancelled)));
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [action, context], computation}));
    TestBed.flushEffects();
    expect(computation).not.toHaveBeenCalled();

    action.set('A');
    TestBed.flushEffects();
    request.next('saved');
    for (const value of [null, undefined]) {
      action.set(value);
      TestBed.flushEffects();
      expect(computation).toHaveBeenCalledTimes(1);
      expect(cancelled).not.toHaveBeenCalled();
      expect(result()).toBe('saved');
    }

    request.next('still active');
    expect(result()).toBe('still active');
    context.set(0);
    TestBed.flushEffects();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(computation).toHaveBeenCalledTimes(2);
  });

  it('accepts zero, false, empty string and NaN emissions', () => {
    const source = signal<number | boolean | string | undefined>(undefined);
    const computation = vi.fn(({methodParams}: {methodParams: number | boolean | string}) => methodParams);
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));
    TestBed.flushEffects();

    for (const value of [0, false, '', Number.NaN]) {
      source.set(value);
      TestBed.flushEffects();
      expect(result()).toBe(value);
    }
    expect(computation).toHaveBeenCalledTimes(4);
  });

  it.each([0, false, ''])('records %j as the input of the previous result', value => {
    const source = signal<string | number | boolean>('initial');
    const computation = vi.fn((args: {
      methodParams: string | number | boolean;
      previousMethodParams?: string | number | boolean;
      previousMethodValue?: string;
    }) => `result ${args.methodParams}`);
    TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));
    TestBed.flushEffects();

    source.set(value);
    TestBed.flushEffects();
    source.set('next');
    TestBed.flushEffects();

    expect(computation.mock.lastCall?.[0]).toEqual({
      methodParams: 'next', previousMethodParams: value, previousMethodValue: `result ${value}`,
    });
  });

  it.each([0, false, '', null, undefined, Number.NaN])('emits and records %j as a result', value => {
    const source = signal('initial');
    const computation = vi.fn((args: {
      methodParams: string;
      previousMethodParams?: string;
      previousMethodValue?: string | number | boolean | null;
    }) => args.methodParams === 'value' ? value : 'saved');
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));
    TestBed.flushEffects();
    expect(result()).toBe('saved');

    source.set('value');
    TestBed.flushEffects();
    expect(result()).toBe(value);
    source.set('next');
    TestBed.flushEffects();

    expect(computation.mock.lastCall?.[0]).toEqual({
      methodParams: 'next', previousMethodParams: 'value', previousMethodValue: value,
    });
  });

  it('advances input history even when consecutive computations emit equal results', () => {
    const source = signal('A');
    const computation = vi.fn((args: {
      methodParams: string;
      previousMethodParams?: string;
      previousMethodValue?: string;
    }) => 'same result');
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));
    TestBed.flushEffects();
    source.set('B');
    TestBed.flushEffects();
    source.set('C');
    TestBed.flushEffects();

    expect(result()).toBe('same result');
    expect(computation.mock.lastCall?.[0]).toEqual({
      methodParams: 'C', previousMethodParams: 'B', previousMethodValue: 'same result',
    });
  });

  it('cancels work across sources and associates history with the last emitted result', () => {
    const first = signal<string | undefined>('A');
    const second = signal<string | undefined>(undefined);
    const requests = {A: new Subject<string>(), B: new Subject<string>(), C: new Subject<string>()};
    const cancelledA = vi.fn();
    const cancelledB = vi.fn();
    const computation = vi.fn((args: {
      methodParams: string;
      previousMethodParams?: string;
      previousMethodValue?: string;
    }) => {
      if (args.methodParams === 'A') return requests.A.pipe(finalize(cancelledA));
      if (args.methodParams === 'B') return requests.B.pipe(finalize(cancelledB));
      return requests.C;
    });
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [first, second], computation}));
    TestBed.flushEffects();
    requests.A.next('first A');
    second.set('B');
    requests.A.next('latest A');
    TestBed.flushEffects();

    expect(cancelledA).toHaveBeenCalledTimes(1);
    expect(computation.mock.calls[1][0]).toEqual({
      methodParams: 'B', previousMethodParams: 'A', previousMethodValue: 'latest A',
    });
    requests.A.next('late A');
    expect(result()).toBe('latest A');

    first.set('C');
    TestBed.flushEffects();
    expect(cancelledB).toHaveBeenCalledTimes(1);
    expect(computation.mock.calls[2][0]).toEqual({
      methodParams: 'C', previousMethodParams: 'A', previousMethodValue: 'latest A',
    });
    requests.B.next('late B');
    expect(result()).toBe('latest A');
    requests.C.next('result C');
    expect(result()).toBe('result C');
  });

  it('cancels previous work before calling computation for the next emission', () => {
    const source = signal('A');
    const request = new Subject<string>();
    const events: string[] = [];
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({
      params: [source],
      computation: ({methodParams}) => {
        events.push(`compute:${methodParams}`);
        return methodParams === 'A'
          ? request.pipe(finalize(() => events.push('cleanup:A')))
          : 'result B';
      },
    }));
    TestBed.flushEffects();

    source.set('B');
    TestBed.flushEffects();
    expect(events).toEqual(['compute:A', 'cleanup:A', 'compute:B']);
    expect(result()).toBe('result B');
  });

  it.each(['sync error', 'observable error', 'empty', 'error after emission'] as const)(
    'continues after %s and advances history only when a result is emitted', failure => {
      const action = signal('A');
      const error = new Error(failure);
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onError = vi.fn();
      const computation = vi.fn((args: {
        methodParams: string;
        previousMethodParams?: string;
        previousMethodValue?: string;
      }) => {
        if (args.methodParams !== 'failure') return `result ${args.methodParams}`;
        if (failure === 'sync error') throw error;
        if (failure === 'empty') return EMPTY;
        if (failure === 'error after emission') return concat(of('partial'), throwError(() => error));
        return throwError(() => error);
      });
      const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [action], computation, onError}));
      TestBed.flushEffects();
      action.set('failure');
      TestBed.flushEffects();

      expect(result()).toBe(failure === 'error after emission' ? 'partial' : 'result A');
      expect(logged).toHaveBeenCalledTimes(failure === 'empty' ? 0 : 1);
      expect(onError).toHaveBeenCalledTimes(failure === 'empty' ? 0 : 1);
      if (failure !== 'empty') {
        expect(logged).toHaveBeenCalledWith(error);
        expect(onError).toHaveBeenCalledWith(error);
      }

      action.set('B');
      TestBed.flushEffects();
      expect(result()).toBe('result B');
      expect(computation.mock.lastCall?.[0]).toEqual({
        methodParams: 'B',
        previousMethodParams: failure === 'error after emission' ? 'failure' : 'A',
        previousMethodValue: failure === 'error after emission' ? 'partial' : 'result A',
      });
    },
  );

  it.each(['sync', 'observable'] as const)('logs and recovers from a %s error without onError', failure => {
    const source = signal('A');
    const error = new Error('failed computation');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const computation = vi.fn(({methodParams}: {methodParams: string}) => {
      if (methodParams !== 'failure') return methodParams;
      if (failure === 'sync') throw error;
      return throwError(() => error);
    });
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));
    TestBed.flushEffects();

    source.set('failure');
    TestBed.flushEffects();
    expect(result()).toBe('A');
    expect(logged).toHaveBeenCalledExactlyOnceWith(error);

    source.set('B');
    TestBed.flushEffects();
    expect(result()).toBe('B');
    expect(computation).toHaveBeenCalledTimes(3);
  });

  it('preserves object emissions and synchronous array results as whole values', () => {
    const payload = {id: 'A'};
    const nextPayload = {id: 'B'};
    const source = signal(payload);
    const items = [payload];
    const nextItems = [nextPayload];
    const computation = vi.fn((args: {
      methodParams: {id: string};
      previousMethodParams?: {id: string};
      previousMethodValue?: {id: string}[];
    }) => args.methodParams === payload ? items : nextItems);
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));

    TestBed.flushEffects();
    expect(result()).toBe(items);
    expect(computation.mock.calls[0][0].methodParams).toBe(payload);

    source.set(nextPayload);
    TestBed.flushEffects();
    expect(result()).toBe(nextItems);
    expect(computation).toHaveBeenCalledTimes(2);
    expect(computation.mock.calls[1][0].methodParams).toBe(nextPayload);
    expect(computation.mock.calls[1][0].previousMethodParams).toBe(payload);
    expect(computation.mock.calls[1][0].previousMethodValue).toBe(items);
  });

  it('subscribes once to a finite cold computation and delivers its values in order', () => {
    const source = signal('A');
    const subscribed = vi.fn();
    const observed: Array<string | undefined> = [];
    const request = new Observable<string>(subscriber => {
      subscribed();
      subscriber.next('first');
      observed.push(result());
      subscriber.next('last');
      observed.push(result());
      subscriber.complete();
    });
    const computation = vi.fn((args: {
      methodParams: string;
      previousMethodParams?: string;
      previousMethodValue?: string;
    }) => args.methodParams === 'A' ? request : 'next result');
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));

    TestBed.flushEffects();
    expect(subscribed).toHaveBeenCalledTimes(1);
    expect(observed).toEqual(['first', 'last']);
    expect(result()).toBe('last');
    source.set('B');
    TestBed.flushEffects();
    expect(computation.mock.lastCall?.[0]).toEqual({
      methodParams: 'B', previousMethodParams: 'A', previousMethodValue: 'last',
    });
  });

  it('reports a failed cold computation without subscribing again', () => {
    const source = signal('A');
    const error = new Error('request failed');
    const subscribed = vi.fn();
    const request = new Observable<string>(subscriber => {
      subscribed();
      subscriber.error(error);
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({
      params: [source],
      computation: ({methodParams}) => methodParams === 'failure' ? request : methodParams,
      onError,
    }));
    TestBed.flushEffects();

    source.set('failure');
    TestBed.flushEffects();
    expect(subscribed).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledExactlyOnceWith(error);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(result()).toBe('A');

    source.set('B');
    TestBed.flushEffects();
    expect(result()).toBe('B');
  });

  it('stores an Observable emitted as a result without subscribing to it', () => {
    const source = signal('A');
    const subscribed = vi.fn();
    const payload = new Observable<number>(subscriber => {
      subscribed();
      subscriber.next(42);
      subscriber.complete();
    });
    const computation = vi.fn((args: {
      methodParams: string;
      previousMethodValue?: Observable<number>;
    }) => of(payload));
    const result = TestBed.runInInjectionContext(() => methodSignalMerge<[string], Observable<number>>({
      params: [source], computation,
    }));

    TestBed.flushEffects();
    expect(result()).toBe(payload);
    source.set('B');
    TestBed.flushEffects();
    expect(computation.mock.lastCall?.[0].previousMethodValue).toBe(payload);
    expect(subscribed).not.toHaveBeenCalled();
  });

  it.each(['function', 'promise'] as const)('stores a %s result and its history by reference', kind => {
    const source = signal('A');
    const callback = vi.fn(() => 42);
    const payload = kind === 'function' ? callback : Promise.resolve(42);
    const computation = vi.fn((args: {methodParams: string; previousMethodValue?: typeof payload}) => payload);
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));

    TestBed.flushEffects();
    expect(result()).toBe(payload);
    source.set('B');
    TestBed.flushEffects();
    expect(result()).toBe(payload);
    expect(computation.mock.lastCall?.[0].previousMethodValue).toBe(payload);
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([{value: null}, {value: undefined}, {value: ['whole array']}])(
    'preserves an Observable result $value and records its history', ({value}) => {
      const source = signal('initial');
      const computation = vi.fn((args: {
        methodParams: string;
        previousMethodParams?: string;
        previousMethodValue?: string | string[] | null;
      }) => of(args.methodParams === 'value' ? value : 'saved'));
      const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));
      TestBed.flushEffects();
      expect(result()).toBe('saved');

      source.set('value');
      TestBed.flushEffects();
      expect(result()).toBe(value);
      source.set('next');
      TestBed.flushEffects();
      expect(computation.mock.lastCall?.[0].previousMethodValue).toBe(value);
      expect(computation.mock.lastCall?.[0].previousMethodParams).toBe('value');
    },
  );

  it.each((['sync', 'observable'] as const).flatMap(failure =>
    [{reason: 'request failed'}, 0, false, '', null, undefined].map(payload => ({failure, payload})),
  ))('reports a non-Error $failure failure with payload $payload without replacing it', ({failure, payload}) => {
    const source = signal('failure');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({
      params: [source],
      computation: ({methodParams}) => {
        if (methodParams !== 'failure') return methodParams;
        if (failure === 'sync') throw payload;
        return throwError(() => payload);
      },
      onError,
    }));

    TestBed.flushEffects();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][0]).toBe(payload);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(payload);
    source.set('recovered');
    TestBed.flushEffects();
    expect(result()).toBe('recovered');
  });

  it('accepts a compatible Observable from another constructor', () => {
    const source = signal('A');
    const request = of('portable result');
    const portable = Object.assign(Object.create(null), {
      lift: request.lift,
      subscribe: request.subscribe.bind(request),
      pipe: request.pipe,
    }) as Observable<string>;
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({
      params: [source], computation: () => portable,
    }));

    TestBed.flushEffects();
    expect(result()).toBe('portable result');
  });

  it('uses the emission even when cancellation changes the source value', () => {
    const source = signal('A');
    const request = new Subject<string>();
    const computation = vi.fn(({methodParams}: {methodParams: string}) => methodParams === 'A'
      ? request.pipe(finalize(() => source.set('C')))
      : methodParams);
    TestBed.runInInjectionContext(() => methodSignalMerge({params: [source], computation}));
    TestBed.flushEffects();

    source.set('B');
    TestBed.flushEffects();
    expect(computation.mock.calls[1][0].methodParams).toBe('B');
  });

  it('keeps history independent across method instances', () => {
    const first = signal('A1');
    const second = signal('B1');
    type Args = {methodParams: string; previousMethodParams?: string; previousMethodValue?: string};
    const computationA = vi.fn((args: Args) => `first:${args.methodParams}`);
    const computationB = vi.fn((args: Args) => `second:${args.methodParams}`);
    const resultA = TestBed.runInInjectionContext(() => methodSignalMerge({params: [first], computation: computationA}));
    const resultB = TestBed.runInInjectionContext(() => methodSignalMerge({params: [second], computation: computationB}));
    TestBed.flushEffects();
    expect(computationB.mock.calls[0][0].previousMethodParams).toBeUndefined();
    expect(computationB.mock.calls[0][0].previousMethodValue).toBeUndefined();

    first.set('A2');
    TestBed.flushEffects();
    second.set('B2');
    TestBed.flushEffects();
    expect(resultA()).toBe('first:A2');
    expect(resultB()).toBe('second:B2');
    expect(computationA.mock.lastCall?.[0]).toEqual({
      methodParams: 'A2', previousMethodParams: 'A1', previousMethodValue: 'first:A1',
    });
    expect(computationB.mock.lastCall?.[0]).toEqual({
      methodParams: 'B2', previousMethodParams: 'B1', previousMethodValue: 'second:B1',
    });
  });

  it('updates the result when a new object has equal contents but a different reference', () => {
    const source = signal('A');
    const first = {value: {count: 1}};
    const second = {value: {count: 1}};
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({
      params: [source], computation: ({methodParams}) => methodParams === 'A' ? first : second,
    }));
    TestBed.flushEffects();
    expect(result()).toBe(first);

    source.set('B');
    TestBed.flushEffects();
    expect(result()).toBe(second);
  });

  it('preserves a source read error in the result without reporting it as a computation error', () => {
    const failing = signal(false);
    const failure = new Error('source read failed');
    const source = computed(() => {
      if (failing()) throw failure;
      return 'ready';
    });
    const onError = vi.fn();
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({
      params: [source], computation: ({methodParams}) => methodParams, onError,
    }));
    TestBed.flushEffects();
    expect(result()).toBe('ready');

    failing.set(true);
    TestBed.flushEffects();
    let caught: unknown;
    try {
      result();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not run computation for an empty source list', () => {
    const computation = vi.fn(() => 'unused');
    const result = TestBed.runInInjectionContext(() => methodSignalMerge({params: [], computation}));

    TestBed.flushEffects();
    expect(computation).not.toHaveBeenCalled();
    expect(result()).toBeUndefined();
  });
});

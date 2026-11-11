import {Signal, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {concat, of, Subject, throwError} from 'rxjs';
import {expectTypeOf} from 'vitest';
import {methodSignal, type MethodSignalErrorFn} from './method-signal';

// tsc checks these calls without executing them outside an injection context.
function acceptsErrorHandlersAndInfersResults(): void {
  interface Result {
    id: string;
  }
  interface CachedResult extends Result {
    cached: boolean;
  }
  const params = signal<string | null>('A');
  const result = methodSignal<string | null, Result, CachedResult>({
    params,
    computation: ({methodParams}) => ({id: methodParams}),
    onError: (error, {methodParams, previousMethodParams, previousMethodValue}) => {
      expectTypeOf(error).toBeAny();
      expectTypeOf(methodParams).toBeString();
      expectTypeOf(previousMethodParams).toEqualTypeOf<string | null | undefined>();
      expectTypeOf(previousMethodValue).toEqualTypeOf<CachedResult | undefined>();
    },
  });
  expectTypeOf(result).toEqualTypeOf<Signal<Result | undefined>>();

  const inferredResult = methodSignal({
    params,
    computation: ({methodParams}) => methodParams.length,
    onError: (error, {methodParams}) => {
      expectTypeOf(methodParams).toBeString();
    },
  });
  expectTypeOf(inferredResult).toEqualTypeOf<Signal<number | undefined>>();

  const onError: MethodSignalErrorFn = error => {};
  methodSignal<string | null, number>({params, computation: () => 0, onError});
}

describe('methodSignal', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('associates the previous result with the params that started its computation', () => {
    const params = signal<'A' | 'B'>('A');
    const requestA = new Subject<string>();
    const requestB = new Subject<string>();
    const calls: Array<{
      methodParams: 'A' | 'B';
      previousMethodParams?: 'A' | 'B';
      previousMethodValue?: string;
    }> = [];

    const result = TestBed.runInInjectionContext(() => methodSignal<'A' | 'B', string>({
      params,
      computation: args => {
        calls.push({...args});
        return args.methodParams === 'A' ? requestA : requestB;
      }
    }));

    TestBed.flushEffects();

    params.set('B');
    requestA.next('result A');
    expect(result()).toBe('result A');

    TestBed.flushEffects();

    expect(calls.length).toBe(2);
    expect(calls[1].previousMethodValue).toBe('result A');
    expect(calls[1].previousMethodParams).toBe('A');
  });

  it.each(['sync', 'observable', 'observable after emission'] as const)(
    'passes the failing input and latest history to onError for a %s error', failure => {
      const params = signal('A');
      const error = new Error('failed computation');
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onError = vi.fn();
      const result = TestBed.runInInjectionContext(() => methodSignal({
        params,
        computation: ({methodParams}) => {
          if (methodParams !== 'failure') return `result ${methodParams}`;
          if (failure === 'sync') throw error;
          if (failure === 'observable after emission') return concat(of('partial'), throwError(() => error));
          return throwError(() => error);
        },
        onError,
      }));
      TestBed.flushEffects();

      params.set('failure');
      TestBed.flushEffects();

      const emitted = failure === 'observable after emission';
      expect(onError).toHaveBeenCalledExactlyOnceWith(error, {
        methodParams: 'failure',
        previousMethodParams: emitted ? 'failure' : 'A',
        previousMethodValue: emitted ? 'partial' : 'result A',
      });
      expect(logged).toHaveBeenCalledExactlyOnceWith(error);
      expect(result()).toBe(emitted ? 'partial' : 'result A');

      params.set('B');
      TestBed.flushEffects();
      expect(result()).toBe('result B');
    },
  );

  it('reports the active computation input when the source changes before an asynchronous error', () => {
    const params = signal('A');
    const request = new Subject<string>();
    const error = new Error('request failed');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const result = TestBed.runInInjectionContext(() => methodSignal({
      params,
      computation: ({methodParams}) => methodParams === 'failure' ? request : `result ${methodParams}`,
      onError,
    }));
    TestBed.flushEffects();
    params.set('failure');
    TestBed.flushEffects();

    params.set('B');
    request.error(error);

    expect(onError).toHaveBeenCalledExactlyOnceWith(error, {
      methodParams: 'failure', previousMethodParams: 'A', previousMethodValue: 'result A',
    });
    expect(result()).toBe('result A');
    TestBed.flushEffects();
    expect(result()).toBe('result B');
  });

  it('checks the error callback types without executing the checked calls', () => {
    expectTypeOf(acceptsErrorHandlersAndInfersResults).toEqualTypeOf<() => void>();
  });
});

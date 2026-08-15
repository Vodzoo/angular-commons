import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {methodSignal} from './method-signal';

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
});

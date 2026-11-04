import {createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {finalize, Subject} from 'rxjs';
import {methodSignalMerge} from '../../public-api';

describe('methodSignalMerge teardown', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('cancels active work and stops observing all sources when its owner is destroyed', () => {
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    const first = signal<string | undefined>('A');
    const second = signal<string | undefined>(undefined);
    const request = new Subject<string>();
    const cancelled = vi.fn();
    const computation = vi.fn(() => request.pipe(finalize(cancelled)));
    const result = runInInjectionContext(injector, () => methodSignalMerge({params: [first, second], computation}));
    TestBed.flushEffects();
    request.next('saved result');

    injector.destroy();
    expect(cancelled).toHaveBeenCalledTimes(1);
    first.set('after destruction');
    second.set('also ignored');
    TestBed.flushEffects();
    request.next('late result');

    expect(computation).toHaveBeenCalledTimes(1);
    expect(result()).toBe('saved result');
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
});

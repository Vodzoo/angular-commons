import {Signal, signal} from '@angular/core';
import {of} from 'rxjs';
import {describe, expectTypeOf, it} from 'vitest';
import {methodSignalMerge, type MethodSignalMergeArgs} from '../../public-api';

// tsc checks these calls without executing them outside an injection context.
function infersEmittedValuesAndResults(): void {
  const text = signal<string | undefined>(undefined);
  const count = signal<number | null>(null);
  const result = methodSignalMerge({
    params: [text, count],
    computation: ({methodParams, previousMethodParams}) => {
      expectTypeOf(methodParams).toEqualTypeOf<string | number>();
      expectTypeOf(previousMethodParams).toEqualTypeOf<string | number | null | undefined>();
      return typeof methodParams === 'string' ? methodParams.length : methodParams;
    },
  });
  expectTypeOf(result).toEqualTypeOf<Signal<number | undefined>>();

  const observableResult = methodSignalMerge({
    params: [text, count],
    computation: ({methodParams}) => of(String(methodParams)),
  });
  expectTypeOf(observableResult).toEqualTypeOf<Signal<string | undefined>>();
}

function acceptsReadonlyTuplesAndSignalArrays(): void {
  const text = signal('A');
  const count = signal(1);
  const sources = [text, count] as const;
  const result = methodSignalMerge({
    params: sources,
    computation: ({methodParams}) => {
      expectTypeOf(methodParams).toEqualTypeOf<string | number>();
      return methodParams;
    },
  });
  expectTypeOf(result).toEqualTypeOf<Signal<string | number | undefined>>();

  const list: readonly Signal<number | undefined>[] = [count];
  const listResult = methodSignalMerge({
    params: list,
    computation: ({methodParams}) => {
      expectTypeOf(methodParams).toBeNumber();
      return methodParams + 1;
    },
  });
  expectTypeOf(listResult).toEqualTypeOf<Signal<number | undefined>>();
}

function acceptsExplicitTypesAndHistory(): void {
  interface Result {
    id: string;
  }
  interface CachedResult extends Result {
    cached: boolean;
  }
  const text = signal('A');
  const count = signal(1);
  const args: MethodSignalMergeArgs<[string, number], Result, CachedResult> = {
    params: [text, count],
    computation: ({methodParams, previousMethodParams, previousMethodValue}) => {
      expectTypeOf(methodParams).toEqualTypeOf<string | number>();
      expectTypeOf(previousMethodParams).toEqualTypeOf<string | number | undefined>();
      expectTypeOf(previousMethodValue).toEqualTypeOf<CachedResult | undefined>();
      return {id: String(methodParams)};
    },
  };
  expectTypeOf(methodSignalMerge(args)).toEqualTypeOf<Signal<Result | undefined>>();
  methodSignalMerge<[string, number], Result, CachedResult>(args);

  const result = methodSignalMerge<[string, number], string>({
    params: [text, count],
    computation: ({previousMethodValue}) => {
      expectTypeOf(previousMethodValue).toEqualTypeOf<string | undefined>();
      return 'result';
    },
  });
  expectTypeOf(result).toEqualTypeOf<Signal<string | undefined>>();
}

function rejectsInvalidArgumentsAndTriggerMetadata(): void {
  const value = signal('A');
  // @ts-expect-error params requires a list of signals.
  methodSignalMerge({params: value, computation: () => 0});
  // @ts-expect-error Named source maps are no longer accepted.
  methodSignalMerge({params: {value}, computation: () => 0});
  // @ts-expect-error Every list item must be a signal.
  methodSignalMerge({params: [value, 'plain value'], computation: () => 0});
  // @ts-expect-error The history type must extend the result type, like methodSignal.
  methodSignalMerge<[string], number, string>({params: [value], computation: () => 0});

  methodSignalMerge({
    params: [value],
    computation: args => {
      // @ts-expect-error The callback receives the emission without source metadata.
      args.triggeredBy;
      return args.methodParams;
    },
  });
}

describe('methodSignalMerge types', () => {
  it('checks the merge contract without executing the checked calls', () => {
    expectTypeOf(infersEmittedValuesAndResults).toEqualTypeOf<() => void>();
    expectTypeOf(acceptsReadonlyTuplesAndSignalArrays).toEqualTypeOf<() => void>();
    expectTypeOf(acceptsExplicitTypesAndHistory).toEqualTypeOf<() => void>();
    expectTypeOf(rejectsInvalidArgumentsAndTriggerMetadata).toEqualTypeOf<() => void>();
  });
});

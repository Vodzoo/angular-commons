import {Signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {catchError, EMPTY, filter, isObservable, merge, Observable, of, switchMap, tap} from 'rxjs';

/**
 * Like methodSignal, but runs for each non-nullish emission from any source.
 * methodParams is the emitted value, not a snapshot of all sources.
 * A new emission cancels the previous Observable computation via switchMap.
 *
 * Must be called in an injection context. Sources emit after signal stabilization,
 * so repeated writes to the same signal may coalesce. Different sources each emit,
 * including their initial values. History advances only when a result is emitted.
 */
export function methodSignalMerge<T extends readonly unknown[], R, P extends R = R>(
  args: MethodSignalMergeArgs<T, R, P>,
): Signal<R | undefined> {
  let previousMethodValue: P | undefined;
  let previousMethodParams: T[number] | undefined;
  return toSignal(
    merge(...args.params.map(source => toObservable<T[number]>(source))).pipe(
      filter(isNonNullable),
      switchMap(methodParams => {
        let comp: Observable<R> | R;
        try {
          comp = args.computation({methodParams, previousMethodParams, previousMethodValue});
        } catch (error) {
          console.error(error);
          args.onError?.(error);
          return EMPTY;
        }
        const result$: Observable<R> = isObservable(comp) ? comp.pipe(
          catchError(error => {
            console.error(error);
            args.onError?.(error);
            return EMPTY;
          }),
        ) : of(comp);
        return result$.pipe(
          tap(value => {
            previousMethodValue = value as P;
            previousMethodParams = methodParams;
          }),
        );
      }),
    ),
  );
}

function isNonNullable<T>(obj: T): obj is NonNullable<T> {
  return obj !== undefined && obj !== null;
}

export interface MethodSignalMergeArgs<T extends readonly unknown[], R, P extends R = R> {
  params: {[K in keyof T]: Signal<T[K]>};
  computation: (args: {
    methodParams: NonNullable<T[number]>;
    previousMethodParams?: T[number];
    previousMethodValue?: P;
  }) => Observable<R> | R;
  onError?: (error: any) => void;
}

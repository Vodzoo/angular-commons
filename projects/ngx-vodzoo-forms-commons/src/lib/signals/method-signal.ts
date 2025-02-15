import {Signal} from "@angular/core";
import {filter, isObservable, Observable, of, switchMap, tap} from "rxjs";
import {toObservable, toSignal} from "@angular/core/rxjs-interop";

export function methodSignal<T, R, P extends R = R>(
  params: Signal<NonNullable<T> | undefined>,
  computation: (args: { methodParams: NonNullable<T>, previousMethodParams?: T, previousMethodValue?: P }) => Observable<R> | R
): Signal<R | undefined> {
  let previousMethodValue: P | undefined;
  let previousMethodParams: NonNullable<T> | undefined;
  return toSignal(
    toObservable(params)
      .pipe(
        filter(isNonNullable),
        switchMap(methodParams => {
          const comp: Observable<R> | R = computation({methodParams, previousMethodParams, previousMethodValue});
          return isObservable(comp) ? comp : of(comp);
        }),
        tap(value => {
          previousMethodValue = value as P;
          previousMethodParams = params();
        })
      )
  );
}

export function isNonNullable<T>(obj: T): obj is NonNullable<T> {
  return obj !== undefined && obj !== null;
}

import {Signal} from "@angular/core";
import {filter, isObservable, Observable, of, switchMap, tap} from "rxjs";
import {toObservable, toSignal} from "@angular/core/rxjs-interop";

export function methodSignal<T, R, P extends R = R>(args: MethodSignalArgs<T, R, P>): Signal<R | undefined> {
  let previousMethodValue: P | undefined;
  let previousMethodParams: T | undefined;
  return toSignal(
    toObservable(args.params)
      .pipe(
        filter(isNonNullable),
        switchMap(methodParams => {
          const comp: Observable<R> | R = args.computation({methodParams, previousMethodParams, previousMethodValue});
          return isObservable(comp) ? comp : of(comp);
        }),
        tap(value => {
          previousMethodValue = value as P;
          previousMethodParams = args.params();
        })
      ),
  );
}

export function isNonNullable<T>(obj: T): obj is NonNullable<T> {
  return obj !== undefined && obj !== null;
}

export interface MethodSignalArgs<T, R, P extends R = R> {
  params: Signal<T>;
  computation: (args: { methodParams: NonNullable<T>, previousMethodParams?: T, previousMethodValue?: P }) => Observable<R> | R;
}

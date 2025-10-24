import {Signal} from "@angular/core";
import { catchError, EMPTY, filter, isObservable, Observable, of, switchMap, tap } from "rxjs";
import {toObservable, toSignal} from "@angular/core/rxjs-interop";

export function methodSignal<T, R, P extends R = R>(args: MethodSignalArgs<T, R, P>): Signal<R | undefined> {
  let previousMethodValue: P | undefined;
  let previousMethodParams: T | undefined;
  return toSignal(
    toObservable(args.params)
      .pipe(
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
          return isObservable(comp) ? comp.pipe(
            catchError((error) => {
              console.error(error);
              args.onError?.(error);
              return EMPTY;
            }),
          ) : of(comp);
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
  onError?: (error: any) => void;
}

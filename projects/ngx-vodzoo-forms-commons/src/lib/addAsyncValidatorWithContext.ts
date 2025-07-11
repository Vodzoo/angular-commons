import { AbstractControl, AsyncValidatorFn } from "@angular/forms";
import {ControlOptions} from "./disableWithContext";

export function switchAsyncValidators(condition: () => boolean, context: string, control: AbstractControl, asyncValidators: AsyncValidatorFn[], opts?: ControlOptions): void {
  condition() ? addAsyncValidators(context, control, asyncValidators, opts) : removeAsyncValidators(context, control, asyncValidators, opts);
}

export function addAsyncValidators(context: string, control: AbstractControl, asyncValidators: AsyncValidatorFn[], opts?: Omit<ControlOptions, 'force'>): void {
  const allContextsValidators: AsyncValidatorFn[] = getAllContextsAsyncValidators(control);
  const asyncValidatorsToAdd: AsyncValidatorFn[] = [];
  asyncValidators.forEach(asyncValidator => {
    if (!control.hasAsyncValidator(asyncValidator)) {
      asyncValidatorsToAdd.push(asyncValidator);
    } else if (!allContextsValidators.includes(asyncValidator)) {
      addExistingAsyncValidator(control, asyncValidator);
    }
  })

  setContext(control, asyncValidators, context);
  if (asyncValidatorsToAdd.length === 0) {
    return;
  }
  control.addAsyncValidators(asyncValidators);
  control.updateValueAndValidity(opts);
}

export function removeAsyncValidators(context: string, control: AbstractControl, asyncValidators?: AsyncValidatorFn[], opts?: ControlOptions): void {
  const contexts: AddAsyncValidatorsContexts | undefined = getContexts(control);
  const contextValidators: AsyncValidatorFn[] = contexts?.get(context) ?? [];
  let asyncValidatorsToRemove: AsyncValidatorFn[] = asyncValidators ?? contextValidators;

  if (asyncValidatorsToRemove.length === 0) {
    return;
  }

  if (!contexts) {
    asyncValidatorsToRemove.forEach(asyncValidator => {
      if (control.hasAsyncValidator(asyncValidator)) {
        addExistingAsyncValidator(control, asyncValidator);
      }
    });
  }

  asyncValidatorsToRemove.forEach(asyncValidatorToRemove => {
    if (!control.hasAsyncValidator(asyncValidatorToRemove)) {
      removeExistingAsyncValidator(control, asyncValidatorToRemove);
    }
  });

  if (!opts?.force) {
    asyncValidatorsToRemove = asyncValidatorsToRemove.filter(asyncValidatorToRemove => !getExistingAsyncValidators(control)?.has(asyncValidatorToRemove));
  }
  if (contexts) {
    asyncValidatorsToRemove = asyncValidatorsToRemove.filter(asyncValidatorToRemove => contextValidators.includes(asyncValidatorToRemove));
  }
  setContext(control, contextValidators.filter(contextValidator => !asyncValidatorsToRemove.includes(contextValidator)), context);

  asyncValidatorsToRemove = asyncValidatorsToRemove.filter(asyncValidatorToRemove => control.hasAsyncValidator(asyncValidatorToRemove));
  if (asyncValidatorsToRemove.length === 0) {
    return;
  }
  control.removeAsyncValidators(asyncValidatorsToRemove);
  control.updateValueAndValidity(opts);
}

export function getAsyncValidatorContexts(control: AbstractControl, asyncValidator: AsyncValidatorFn): string[] {
  const contexts: AddAsyncValidatorsContexts | undefined = getContexts(control);
  if (!contexts) {
    return [];
  }
  return [...contexts.entries()].filter(entry => entry[1].includes(asyncValidator)).map(entry => entry[0]);
}

function getContexts(control: AbstractControl): AddAsyncValidatorsContexts | undefined {
  return (control as AbstractControlWithContexts)[addAsyncValidatorsContext];
}

function getExistingAsyncValidators(control: AbstractControl): ExistingAsyncValidators | undefined {
  return (control as AbstractControlWithExistingAsyncValidators)[existingAsyncValidators];
}

function addExistingAsyncValidator(control: AbstractControl, asyncValidator: AsyncValidatorFn): void {
  const existingAsyncValidators: ExistingAsyncValidators | undefined = getExistingAsyncValidators(control) ?? new Set<AsyncValidatorFn>();
  existingAsyncValidators.add(asyncValidator);
  setExistingAsyncValidators(control, existingAsyncValidators);
}

function removeExistingAsyncValidator(control: AbstractControl, asyncValidator: AsyncValidatorFn): void {
  const existingAsyncValidators: ExistingAsyncValidators | undefined = getExistingAsyncValidators(control);
  if (!existingAsyncValidators) {
    return;
  }
  existingAsyncValidators.delete(asyncValidator);
}

function getAllContextsAsyncValidators(control: AbstractControl): AsyncValidatorFn[] {
  const context: AddAsyncValidatorsContexts | undefined = getContexts(control);
  if (!context) {
    return [];
  }
  return [...context.values()].flat();
}

function setContext(control: AbstractControl, contextValue: AsyncValidatorFn[], context: string): void {
  const contexts: AddAsyncValidatorsContexts = getContexts(control) ?? new Map();
  contexts.set(context, contextValue);
  (control as AbstractControlWithContexts)[addAsyncValidatorsContext] = contexts;
}

function setExistingAsyncValidators(control: AbstractControl, asyncValidators: ExistingAsyncValidators): void {
  (control as AbstractControlWithExistingAsyncValidators)[existingAsyncValidators] = asyncValidators;
}

const addAsyncValidatorsContext: unique symbol = Symbol('addAsyncValidatorsContext');
const existingAsyncValidators: unique symbol = Symbol('existingAsyncValidators');

export type AddAsyncValidatorsContexts = Map<string, AsyncValidatorFn[]>;
export type ExistingAsyncValidators = Set<AsyncValidatorFn>;
type AbstractControlWithContexts = AbstractControl & { [addAsyncValidatorsContext]: AddAsyncValidatorsContexts };
type AbstractControlWithExistingAsyncValidators = AbstractControl & { [existingAsyncValidators]: ExistingAsyncValidators };

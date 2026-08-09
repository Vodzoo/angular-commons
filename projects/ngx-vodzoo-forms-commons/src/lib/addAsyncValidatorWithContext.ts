import {AbstractControl, AsyncValidatorFn} from '@angular/forms';
import {ControlOptions} from './disableWithContext';

export function switchAsyncValidators(
  condition: () => boolean,
  context: string,
  control: AbstractControl,
  asyncValidators: AsyncValidatorFn[],
  opts?: ControlOptions
): void {
  condition()
    ? addAsyncValidators(context, control, asyncValidators, opts)
    : removeAsyncValidators(context, control, asyncValidators, opts);
}

export function addAsyncValidators(
  context: string,
  control: AbstractControl,
  asyncValidators: AsyncValidatorFn[],
  opts?: Omit<ControlOptions, 'force'>
): void {
  const state = getState(control);
  const validatorsToAdd = [...new Set(asyncValidators)];

  captureInitialAsyncValidators(
    control,
    state,
    validatorsToAdd
  );

  const contextValidators =
    state.contexts.get(context) ?? new Set<AsyncValidatorFn>();

  validatorsToAdd.forEach(
    validator => contextValidators.add(validator)
  );

  state.contexts.set(context, contextValidators);

  const missingValidators = validatorsToAdd.filter(
    validator => !control.hasAsyncValidator(validator)
  );

  if (missingValidators.length === 0) {
    return;
  }

  control.addAsyncValidators(missingValidators);
  control.updateValueAndValidity(opts);
}

export function removeAsyncValidators(
  context: string,
  control: AbstractControl,
  asyncValidators?: AsyncValidatorFn[],
  opts?: ControlOptions
): void {
  const state = getState(control);
  const contextValidators = state.contexts.get(context);

  const validatorsToDetach = new Set(
    asyncValidators ?? contextValidators ?? []
  );

  if (validatorsToDetach.size === 0) {
    return;
  }

  captureInitialAsyncValidators(
    control,
    state,
    validatorsToDetach
  );

  if (contextValidators) {
    validatorsToDetach.forEach(
      validator => contextValidators.delete(validator)
    );

    if (contextValidators.size === 0) {
      state.contexts.delete(context);
    }
  }

  if (opts?.force) {
    validatorsToDetach.forEach(
      validator => state.initialValidators.delete(validator)
    );
  }

  const validatorsToRemove = [...validatorsToDetach].filter(
    validator =>
      control.hasAsyncValidator(validator) &&
      !state.initialValidators.has(validator) &&
      !isUsedByAnyContext(state, validator)
  );

  if (validatorsToRemove.length === 0) {
    return;
  }

  control.removeAsyncValidators(validatorsToRemove);
  control.updateValueAndValidity(opts);
}

export function getAsyncValidatorContexts(
  control: AbstractControl,
  asyncValidator: AsyncValidatorFn
): string[] {
  const state = getExistingState(control);

  if (!state) {
    return [];
  }

  return [...state.contexts.entries()]
    .filter(([, validators]) => validators.has(asyncValidator))
    .map(([context]) => context);
}

function captureInitialAsyncValidators(
  control: AbstractControl,
  state: AsyncValidatorsState,
  validators: Iterable<AsyncValidatorFn>
): void {
  for (const validator of validators) {
    if (
      control.hasAsyncValidator(validator) &&
      !state.initialValidators.has(validator) &&
      !isUsedByAnyContext(state, validator)
    ) {
      state.initialValidators.add(validator);
    }
  }
}

function isUsedByAnyContext(
  state: AsyncValidatorsState,
  validator: AsyncValidatorFn
): boolean {
  return [...state.contexts.values()]
    .some(validators => validators.has(validator));
}

function getExistingState(
  control: AbstractControl
): AsyncValidatorsState | undefined {
  return (control as AbstractControlWithAsyncValidatorsState)[asyncValidatorsState];
}

function getState(
  control: AbstractControl
): AsyncValidatorsState {
  let state = getExistingState(control);

  if (!state) {
    state = {
      contexts: new Map(),
      initialValidators: new Set()
    };

    (control as AbstractControlWithAsyncValidatorsState)[asyncValidatorsState] = state;
  }

  return state;
}

const asyncValidatorsState: unique symbol = Symbol('asyncValidatorsState');

export type AddAsyncValidatorsContexts = Map<string, Set<AsyncValidatorFn>>;
export type InitialAsyncValidators = Set<AsyncValidatorFn>;

type AsyncValidatorsState = {
  contexts: AddAsyncValidatorsContexts;
  initialValidators: InitialAsyncValidators;
};

type AbstractControlWithAsyncValidatorsState =
  AbstractControl & {
  [asyncValidatorsState]?: AsyncValidatorsState;
};

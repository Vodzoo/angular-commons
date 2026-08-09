import {AbstractControl, ValidatorFn} from '@angular/forms';
import {ControlOptions} from './disableWithContext';

export function switchValidators(
  condition: () => boolean,
  context: string,
  control: AbstractControl,
  validators: ValidatorFn[],
  opts?: ControlOptions
): void {
  condition()
    ? addValidators(context, control, validators, opts)
    : removeValidators(context, control, validators, opts);
}

export function addValidators(
  context: string,
  control: AbstractControl,
  validators: ValidatorFn[],
  opts?: Omit<ControlOptions, 'force'>
): void {
  const state = getState(control);
  const validatorsToAdd = [...new Set(validators)];

  captureInitialValidators(control, state, validatorsToAdd);

  const contextValidators = state.contexts.get(context) ?? new Set<ValidatorFn>();

  validatorsToAdd.forEach(validator => contextValidators.add(validator));
  state.contexts.set(context, contextValidators);

  const missingValidators = validatorsToAdd.filter(
    validator => !control.hasValidator(validator)
  );

  if (missingValidators.length === 0) {
    return;
  }

  control.addValidators(missingValidators);
  updateValueAndValidity(control, opts);
}

export function removeValidators(
  context: string,
  control: AbstractControl,
  validators?: ValidatorFn[],
  opts?: ControlOptions
): void {
  const state = getState(control);
  const contextValidators = state.contexts.get(context);

  const validatorsToDetach = new Set(
    validators ?? contextValidators ?? []
  );

  if (validatorsToDetach.size === 0) {
    return;
  }

  captureInitialValidators(
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
      control.hasValidator(validator) &&
      !state.initialValidators.has(validator) &&
      !isUsedByAnyContext(state, validator)
  );

  if (validatorsToRemove.length === 0) {
    return;
  }

  control.removeValidators(validatorsToRemove);
  updateValueAndValidity(control, opts);
}

export function getValidatorContexts(
  control: AbstractControl,
  validator: ValidatorFn
): string[] {
  const state = getExistingState(control);

  if (!state) {
    return [];
  }

  return [...state.contexts.entries()]
    .filter(([, validators]) => validators.has(validator))
    .map(([context]) => context);
}

function captureInitialValidators(
  control: AbstractControl,
  state: ValidatorsState,
  validators: Iterable<ValidatorFn>
): void {
  for (const validator of validators) {
    if (
      control.hasValidator(validator) &&
      !state.initialValidators.has(validator) &&
      !isUsedByAnyContext(state, validator)
    ) {
      state.initialValidators.add(validator);
    }
  }
}

function isUsedByAnyContext(
  state: ValidatorsState,
  validator: ValidatorFn
): boolean {
  return [...state.contexts.values()]
    .some(validators => validators.has(validator));
}

function getExistingState(
  control: AbstractControl
): ValidatorsState | undefined {
  return (control as AbstractControlWithValidatorsState)[validatorsState];
}

function getState(control: AbstractControl): ValidatorsState {
  let state = getExistingState(control);

  if (!state) {
    state = {
      contexts: new Map(),
      initialValidators: new Set()
    };

    (control as AbstractControlWithValidatorsState)[validatorsState] = state;
  }

  return state;
}

function updateValueAndValidity(
  control: AbstractControl,
  opts?: Pick<ControlOptions, 'onlySelf' | 'emitEvent'>
): void {
  control.updateValueAndValidity({
    onlySelf: opts?.onlySelf,
    emitEvent: opts?.emitEvent
  });
}

const validatorsState: unique symbol = Symbol('validatorsState');

export type AddValidatorsContexts =
  Map<string, Set<ValidatorFn>>;

export type InitialValidators =
  Set<ValidatorFn>;

type ValidatorsState = {
  contexts: AddValidatorsContexts;
  initialValidators: InitialValidators;
};

type AbstractControlWithValidatorsState =
  AbstractControl & {
  [validatorsState]?: ValidatorsState;
};

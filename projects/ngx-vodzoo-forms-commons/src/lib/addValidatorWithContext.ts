import {AbstractControl, ValidatorFn} from "@angular/forms";
import {ControlOptions} from "./disableWithContext";

export function switchValidators(condition: () => boolean, context: string, control: AbstractControl, validators: ValidatorFn[], opts?: ControlOptions): void {
  condition() ? addValidators(context, control, validators, opts) : removeValidators(context, control, validators, opts);
}

export function addValidators(context: string, control: AbstractControl, validators: ValidatorFn[], opts?: Omit<ControlOptions, 'force'>): void {
  const allContextsValidators: ValidatorFn[] = getAllContextsValidators(control);
  validators.forEach(validator => {
    if (control.hasValidator(validator) && !allContextsValidators.includes(validator)) {
      addExistingValidator(control, validator);
    }
  })

  setContext(control, validators, context);
  control.addValidators(validators);
  control.updateValueAndValidity(opts);
}

export function removeValidators(context: string, control: AbstractControl, validators?: ValidatorFn[], opts?: ControlOptions): void {
  const contexts: AddValidatorsContexts | undefined = getContexts(control);
  const contextValidators: ValidatorFn[] = contexts?.get(context) ?? [];
  let validatorsToRemove: ValidatorFn[] = validators ?? contextValidators;

  if (validatorsToRemove.length === 0) {
    return;
  }

  if (!contexts) {
    validatorsToRemove.forEach(validator => {
      if (control.hasValidator(validator)) {
        addExistingValidator(control, validator);
      }
    });
  }

  validatorsToRemove.forEach(validatorToRemove => {
    if (!control.hasValidator(validatorToRemove)) {
      removeExistingValidator(control, validatorToRemove);
    }
  });

  if (!opts?.force) {
    validatorsToRemove = validatorsToRemove.filter(validatorToRemove => !getExistingValidators(control)?.has(validatorToRemove));
  }
  if (contexts) {
    validatorsToRemove = validatorsToRemove.filter(validatorToRemove => contextValidators.includes(validatorToRemove));
  }

  setContext(control, contextValidators.filter(contextValidator => !validatorsToRemove.includes(contextValidator)), context);
  control.removeValidators(validatorsToRemove);
  control.updateValueAndValidity(opts);
}

export function getValidatorContexts(control: AbstractControl, validator: ValidatorFn): string[] {
  const contexts: AddValidatorsContexts | undefined = getContexts(control);
  if (!contexts) {
    return [];
  }
  return [...contexts.entries()].filter(entry => entry[1].includes(validator)).map(entry => entry[0]);
}

function getContexts(control: AbstractControl): AddValidatorsContexts | undefined {
  return (control as AbstractControlWithContexts)[addValidatorsContext];
}

function getExistingValidators(control: AbstractControl): ExistingValidators | undefined {
  return (control as AbstractControlWithExistingValidators)[existingValidators];
}

function addExistingValidator(control: AbstractControl, validator: ValidatorFn): void {
  const existingValidators: ExistingValidators | undefined = getExistingValidators(control) ?? new Set<ValidatorFn>();
  existingValidators.add(validator);
  setExistingValidators(control, existingValidators);
}

function removeExistingValidator(control: AbstractControl, validator: ValidatorFn): void {
  const existingValidators: ExistingValidators | undefined = getExistingValidators(control);
  if (!existingValidators) {
    return;
  }
  existingValidators.delete(validator);
}

function getAllContextsValidators(control: AbstractControl): ValidatorFn[] {
  const context: AddValidatorsContexts | undefined = getContexts(control);
  if (!context) {
    return [];
  }
  return [...context.values()].flat();
}

function setContext(control: AbstractControl, contextValue: ValidatorFn[], context: string): void {
  const contexts: AddValidatorsContexts = getContexts(control) ?? new Map();
  contexts.set(context, contextValue);
  (control as AbstractControlWithContexts)[addValidatorsContext] = contexts;
}

function setExistingValidators(control: AbstractControl, validators: ExistingValidators): void {
  (control as AbstractControlWithExistingValidators)[existingValidators] = validators;
}

const addValidatorsContext: unique symbol = Symbol('addValidatorsContext');
const existingValidators: unique symbol = Symbol('existingValidators');

export type AddValidatorsContexts = Map<string, ValidatorFn[]>;
export type ExistingValidators = Set<ValidatorFn>;
type AbstractControlWithContexts = AbstractControl & { [addValidatorsContext]: AddValidatorsContexts };
type AbstractControlWithExistingValidators = AbstractControl & { [existingValidators]: ExistingValidators };

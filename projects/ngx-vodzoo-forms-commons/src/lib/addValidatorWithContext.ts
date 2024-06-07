import {AbstractControl, ValidatorFn} from "@angular/forms";
import {getControlName} from "./directives/form-field.directive";
import {ControlOptions} from "./disableWithContext";

export function addValidators(control: AbstractControl, validators: ValidatorFn[], context?: string, opts?: ControlOptions): void {
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

export function removeValidators(control: AbstractControl, context?: string, validators?: ValidatorFn[], opts?: ControlOptions): void {
  const contexts: AddValidatorsContexts | undefined = getContexts(control);
  if (!contexts) {
    return;
  }
  context = ensureContext(control, context);
  const contextValidators: ValidatorFn[] = contexts.get(context) ?? [];
  let validatorsToRemove: ValidatorFn[] = validators ?? contextValidators;
  if (validatorsToRemove.length === 0) {
    return;
  }


  setContext(control, validators ? contextValidators.filter(contextValidator => !validators.includes(contextValidator)) : [], context);
  if (getAllContextsValidators(control).some(contextValidator => validatorsToRemove.includes(contextValidator))) {
    return;
  }

  validatorsToRemove.forEach(validatorToRemove => {
    if (!control.hasValidator(validatorToRemove)) {
      removeExistingValidator(control, validatorToRemove);
    }
  });
  validatorsToRemove = validatorsToRemove.filter(validatorToRemove => !getExistingValidators(control)?.has(validatorToRemove));
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

function setContext(control: AbstractControl, contextValue: ValidatorFn[], context?: string): void {
  context = ensureContext(control, context);
  const contexts: AddValidatorsContexts = getContexts(control) ?? new Map();
  contexts.set(context, contextValue);
  (control as AbstractControlWithContexts)[addValidatorsContext] = contexts;
}

function setExistingValidators(control: AbstractControl, validators: ExistingValidators): void {
  (control as AbstractControlWithExistingValidators)[existingValidators] = validators;
}

function ensureContext(control: AbstractControl, context?: string): string {
  return context ?? getControlName(control);
}

const addValidatorsContext: unique symbol = Symbol('addValidatorsContext');
const existingValidators: unique symbol = Symbol('existingValidators');

export type AddValidatorsContexts = Map<string, ValidatorFn[]>;
export type ExistingValidators = Set<ValidatorFn>;
type AbstractControlWithContexts = AbstractControl & { [addValidatorsContext]: AddValidatorsContexts };
type AbstractControlWithExistingValidators = AbstractControl & { [existingValidators]: ExistingValidators };

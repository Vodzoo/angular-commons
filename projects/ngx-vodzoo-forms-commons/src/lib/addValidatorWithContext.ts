import {AbstractControl, ValidatorFn} from "@angular/forms";
import {getControlName} from "./directives/form-field.directive";
import {ControlOptions} from "./disableWithContext";

export function addValidators(control: AbstractControl, validators: ValidatorFn[], context?: string, opts?: ControlOptions): void {
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
  const validatorsToRemove: ValidatorFn[] = validators ?? contextValidators;
  if (validatorsToRemove.length === 0) {
    return;
  }


  setContext(control, validators ? contextValidators.filter(contextValidator => !validators.includes(contextValidator)) : [], context);
  if ([...contexts.values()].flat().some(contextValidator => validatorsToRemove.includes(contextValidator))) {
    return;
  }
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

function setContext(control: AbstractControl, contextValue: ValidatorFn[], context?: string): void {
  context = ensureContext(control, context);
  const contexts: AddValidatorsContexts = getContexts(control) ?? new Map();
  contexts.set(context, contextValue);
  (control as AbstractControlWithContexts)[addValidatorsContext] = contexts;
}

function ensureContext(control: AbstractControl, context?: string): string {
  return context ?? getControlName(control);
}

const addValidatorsContext: unique symbol = Symbol('addValidatorsContext');

export type AddValidatorsContexts = Map<string, ValidatorFn[]>;
type AbstractControlWithContexts = AbstractControl & { [addValidatorsContext]: AddValidatorsContexts };

import {AbstractControl} from "@angular/forms";
import {getControlName} from "./directives/form-field.directive";

export function disableControl(control: AbstractControl, context?: string, opts?: ControlOptions): void {
  setContext(control, true, context);
  control.disable(opts);
}

export function enableControl(control: AbstractControl, context?: string, opts?: ControlOptions): void {
  const contexts: DisableContexts | undefined = getContexts(control);
  if (!contexts) {
    control.enable(opts);
    return;
  }

  setContext(control, false, context);
  if ([...contexts.values()].some(Boolean)) {
    return;
  }
  control.enable(opts);
}

export function getDisablingContexts(control: AbstractControl): string[] {
  const contexts: DisableContexts | undefined = getContexts(control);
  if (!contexts) {
    return [];
  }
  return [...contexts.entries()].filter(entry => entry[1]).map(entry => entry[0]);
}

function getContexts(control: AbstractControl): DisableContexts | undefined {
  return (control as AbstractControlWithContexts)[disabledContext];
}

function setContext(control: AbstractControl, contextValue: boolean, context?: string): void {
  context = context ?? getControlName(control);
  const contexts: DisableContexts = getContexts(control) ?? new Map();
  contexts.set(context, contextValue);
  (control as AbstractControlWithContexts)[disabledContext] = contexts;
}

const disabledContext: unique symbol = Symbol('disabledContext');

export type DisableContexts = Map<string, boolean>;
export type ControlOptions = {
  onlySelf?: boolean;
  emitEvent?: boolean;
}
type AbstractControlWithContexts = AbstractControl & {[disabledContext]: DisableContexts};

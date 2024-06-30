import {AbstractControl} from "@angular/forms";

export function switchDisable(condition: () => boolean, context: string, control: AbstractControl, opts?: ControlOptions): void {
  condition() ? disableControl(context, control, opts) : enableControl(context, control, opts);
}

export function disableControl(context: string, control: AbstractControl, opts?: Omit<ControlOptions, 'force'>): void {
  if (context === unknownContext) {
    throw new Error('Forbidden context name!');
  }

  if (control.disabled && !hasBlockingContext(control)) {
    setContext(control, true, unknownContext);
  }

  setContext(control, true, context);
  if (control.disabled || isControlForceEnabled(control)) {
    return;
  }
  control.disable(opts);
}

export function enableControl(context: string, control: AbstractControl, opts?: ControlOptions): void {
  const contexts: DisableContexts | undefined = getContexts(control);
  if (!contexts && control.disabled) {
    setContext(control, true, unknownContext);
  }

  setContext(control, false, context);
  if (opts?.force || control.enabled) {
    setContext(control, false, unknownContext);
  }

  if (control.enabled || hasBlockingContext(control)) {
    return;
  }
  control.enable(opts);
}

export function forceEnableControl(control: AbstractControl, opts?: Omit<ControlOptions, 'force'>): void {
  (control as AbstractControlWithForce)[forceEnabled] = true;
  if (control.disabled) {
    control.enable(opts);
  }
}

export function resetForceEnableControl(control: AbstractControl, opts?: Omit<ControlOptions, 'force'>): void {
  (control as AbstractControlWithForce)[forceEnabled] = false;
  if (control.enabled && hasBlockingContext(control)) {
    control.disable(opts);
  }
}

export function isControlForceEnabled(control: AbstractControl): control is AbstractControlWithForce {
  return !!(control as AbstractControlWithForce)[forceEnabled];
}

export function getDisablingContexts(control: AbstractControl): string[] {
  const contexts: DisableContexts | undefined = getContexts(control);
  if (!contexts) {
    return [];
  }
  return [...contexts.entries()].filter(entry => entry[1]).map(entry => entry[0]);
}

function hasBlockingContext(control: AbstractControl): boolean {
  const contexts: DisableContexts | undefined = getContexts(control);
  return contexts ? [...contexts.values()].some(Boolean) : false;
}

function getContexts(control: AbstractControl): DisableContexts | undefined {
  return (control as AbstractControlWithContexts)[disabledContext];
}

function setContext(control: AbstractControl, contextValue: boolean, context: string): void {
  const contexts: DisableContexts = getContexts(control) ?? new Map();
  contexts.set(context, contextValue);
  (control as AbstractControlWithContexts)[disabledContext] = contexts;
}

const disabledContext: unique symbol = Symbol('disabledContext');
const forceEnabled: unique symbol = Symbol('forceEnabled');
const unknownContext: string = '__unknown__';

export type DisableContexts = Map<string, boolean>;
export type ControlOptions = {
  onlySelf?: boolean;
  emitEvent?: boolean;
  force?: boolean;
}
type AbstractControlWithContexts = AbstractControl & {[disabledContext]: DisableContexts};
type AbstractControlWithForce = AbstractControl & {[forceEnabled]?: boolean};

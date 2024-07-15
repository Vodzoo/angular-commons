import {ChangeDetectorRef, Directive, forwardRef, HostBinding, inject, InjectionToken, Input} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  FormControl,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
  Validators
} from "@angular/forms";
import {Observable, Subject, tap} from "rxjs";

@Directive({
  selector: '[vodzooFormField]',
  exportAs: 'vodzooFormField',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FormFieldDirective),
      multi: true
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => FormFieldDirective),
      multi: true
    }
  ]
})
export class FormFieldDirective<T extends any> implements ControlValueAccessor, Validator {
  /**
   * ------------------------------------
   * Injected services
   * ------------------------------------
   * @private
   */
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private config: FormFieldConfig = inject(FORM_FIELD_CONFIG);




  /**
   * ------------------------------------
   * Fields
   * ------------------------------------
   */
  private _formControl: FormControl<T> = new FormControl();
  private _fieldRequired: boolean = false;
  private _formControlName: string = '';
  private _value: T | null = null;
  private _isDisabled: boolean = false;
  private _baseFormControl?: AbstractControl;
  private _disabledStateChange$: Subject<boolean> = new Subject<boolean>();
  private _valueChange$: Subject<T> = new Subject<T>();

  public readonly disabledStateChange: Observable<boolean> = this._disabledStateChange$.asObservable();
  public readonly valueChange: Observable<T> = this._valueChange$.asObservable();




  /**
   * ------------------------------------
   * Inputs
   * ------------------------------------
   */
  @Input() public label: string = '';
  @Input({transform: (value: unknown) => typeof value !== 'function' ? () => null : value}) public vodzooFormField?: (control: AbstractControl) => ValidationErrors | null;




  /**
   * ------------------------------------
   * Host Bindings
   * ------------------------------------
   * @private
   */
  @HostBinding('class.form-field') private formField: boolean = true;
  @HostBinding('class') public get formControlName(): string {
    return this._formControlName;
  };




  /**
   * ------------------------------------
   * Getters
   * ------------------------------------
   */
  public get formControl(): FormControl<T> {
    return this._formControl;
  }

  public get fieldRequired(): boolean {
    return this._fieldRequired;
  };

  public get value(): T | null {
    return this._value;
  };

  public get isDisabled(): boolean {
    return this._isDisabled;
  };

  public get baseControl(): FormControl | undefined {
    return this._baseFormControl as FormControl | undefined;
  }




  /**
   * ------------------------------------
   * ControlValueAccessor
   * ------------------------------------
   * @private
   */
  public onTouched = (): void => {};
  public onChange = (value: T): void => {
    markAsUiChange(this._baseFormControl);
    this._onChange(value);
  };
  private _onChange = (value: T): void => {};



  public registerOnChange(fn: (value: T) => void): void {
    this._onChange = fn;
    this.formControl.valueChanges
      .pipe(
        tap(() => {
          if (isChangedByUiUnset(this.formControl)) {
            markAsUiChange(this._baseFormControl);
          }
          resetUiChange(this.formControl);
        })
      )
      .subscribe(fn);
  }


  public registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }


  public writeValue(obj: T): void {
    this._value = obj;
    if (isResetChange(this.baseControl)) {
      this.formControl.reset(obj, {emitEvent: false, onlySelf: true});
    } else {
      this.formControl.patchValue(obj, {emitEvent: false, onlySelf: true});
    }
    this._valueChange$.next(obj);
    this.cdr.markForCheck();
  }


  public setDisabledState(isDisabled: boolean): void {
    this._isDisabled = isDisabled;
    isDisabled ? this.formControl.disable({emitEvent: false, onlySelf: true}) : this.formControl.enable({emitEvent: false, onlySelf: true});
    this._disabledStateChange$.next(isDisabled);
    this.cdr.markForCheck();
  }




  /**
   * ------------------------------------
   * Validator method
   * ------------------------------------
   * @param control
   */
  public validate(control: AbstractControl): ValidationErrors | null {
    if (!this._formControlName) {
     this._formControlName = getControlName(control);
     this._baseFormControl = control;
    }
    this._fieldRequired = control.hasValidator(Validators.required);

    // when used as vodzooFormField directive eg.
    // <button vodzooFormField #field="vodzooFormField" ...>Button</button>
    // you can provide your own method for validation (default is () => null)
    if (this.vodzooFormField !== undefined) {
      this.cdr.markForCheck();
      return this.vodzooFormField(control);
    }

    if (this.formControl.dirty && control.pristine) {
      control.markAsDirty();
    }

    if (this.formControl.pristine && control.dirty) {
      control.markAsPristine();
    }

    if (control.errors === null && this.formControl.errors === null) {
      this.cdr.markForCheck();
      return null;
    }

    //set timeout required
    setTimeout(() => {
      let allErrors: ValidationErrors | null = control.errors;
      const localControlErrors: ValidationErrors | null = this.formControl.errors;
      if (localControlErrors) {
        allErrors = {...allErrors, ...localControlErrors};
      }
      this.formControl.setErrors(allErrors, {emitEvent: false});

      const errors: ValidationErrors | null = this.formControl.errors;
      if (this.formControl.pristine && this.formControl.untouched && errors && this.config.enableTouchOnInitialError(this.formControl, this.formControlName)) {
        this.formControl.markAsTouched({onlySelf: true});
      }
      this.cdr.markForCheck();
    });

    return this.formControl.errors;
  }
}

export const uiChange: unique symbol = Symbol('uiChange');
export const resetChange: unique symbol = Symbol('resetChange');
export const FORM_FIELD_CONFIG: InjectionToken<FormFieldConfig> = new InjectionToken<FormFieldConfig>('formFieldConfig', {
  factory: () => ({
    enableTouchOnInitialError: (control) => {
      if (Array.isArray(control.value)) {
        return !!control.value.length;
      }
      return !!control.value || control.value === false || control.value === 0
    }
  })
});


export function getControlName(control: AbstractControl): string {
  if (!control?.parent) {
    return '';
  }
  return Object.entries(control.parent.controls).find(entry => entry[1] === control)?.[0] ?? '';
}


/**
 * Reset change functions
 * @param control
 */
export function markAsResetChange(control?: AbstractControl): void {
  if (control) {
    (control.root as any)[resetChange] = true;
  }
}


export function resetResetChange(control?: AbstractControl): void {
  if (control) {
    (control.root as any)[resetChange] = undefined;
  }
}


export function isResetChange(control?: AbstractControl): boolean {
  return !!(control?.root as any)?.[resetChange];
}


/**
 * UI change functions
 */
export function markAsUiChange(control?: AbstractControl): void {
  if (control) {
    markAsChange(control, true);
  }
}

export function markAsNonUiChange(control?: AbstractControl): void {
  if (control && isChangedByUiUnset(control)) {
    markAsChange(control, false);
  }
}

export function resetUiChange(control?: AbstractControl): void {
  if (control) {
    markAsChange(control, undefined);
  }
}

export function isDataChangedByUi(control?: AbstractControl): boolean {
  return !!(control?.root as any)[uiChange];
}

export function isChangedByUiUnset(control?: AbstractControl): boolean {
  return (control?.root as any)?.[uiChange] === undefined;
}

function markAsChange(control: AbstractControl, changedByUi: boolean | undefined): void {
  (control.root as any)[uiChange] = changedByUi;
}




/**
 * ------------------------------------
 * Interfaces
 * ------------------------------------
 */
export interface FormField<T> {
  /**
   * @Component({
   *   ...
   *   hostDirectives: [
   *     {
   *       directive: FormFieldDirective,
   *       inputs: [
   *         'label'
   *       ]
   *     }
   *   ],
   * })
   *
   *   formFieldDirective = inject(FormFieldDirective);
   */
  formFieldDirective: FormFieldDirective<T>;
}

export interface FormFieldConfig {
  enableTouchOnInitialError: (control: FormControl, controlName: string) => boolean;
}

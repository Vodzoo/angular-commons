import {ChangeDetectorRef, Directive, forwardRef, HostBinding, inject, Input} from '@angular/core';
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
import {tap} from "rxjs";

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




  /**
   * ------------------------------------
   * Inputs
   * ------------------------------------
   */
  @Input() public label: string = '';




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




  /**
   * ------------------------------------
   * ControlValueAccessor
   * ------------------------------------
   * @private
   */
  public onTouched: () => void = () => {};
  public onChange: (value: T) => void = () => {};


  public registerOnChange(fn: (value: T) => void): void {
    this.onChange = fn;
    this.formControl.valueChanges
      .pipe(
        tap(() => {
          if (isChangedByUiUnset(this.formControl)) {
            resetUiChange(this.formControl);
            markAsUiChange(this._baseFormControl);
          }
        })
      )
      .subscribe(fn);
  }


  public registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }


  public writeValue(obj: T): void {
    this._value = obj;
    this.formControl.patchValue(obj, {emitEvent: false, onlySelf: true});
    this.cdr.markForCheck();
  }


  public setDisabledState(isDisabled: boolean): void {
    this._isDisabled = isDisabled;
    isDisabled ? this.formControl.disable({emitEvent: false, onlySelf: true}) : this.formControl.enable({emitEvent: false, onlySelf: true});
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

    if (this.formControl.dirty && control.pristine) {
      control.markAsDirty();
    }

    if (this.formControl.pristine && control.dirty) {
      control.markAsPristine();
    }

    if (control.errors === null && this.formControl.errors === null) {
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
      if (this.formControl.untouched && errors && this.formControl.value !== null && this.formControl.value !== undefined && this.formControl.value !== '') {
        this.formControl.markAsTouched({onlySelf: true});
      }
      this.cdr.markForCheck();
    });

    return this.formControl.errors;
  }
}

export const uiChange: unique symbol = Symbol('uiChange');


export function getControlName(control: AbstractControl): string {
  if (!control?.parent) {
    return '';
  }
  return Object.entries(control.parent.controls).find(entry => entry[1] === control)?.[0] ?? '';
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
  return (control?.root as any)[uiChange] === undefined;
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
   *   hostDirectives: [formFieldHostDirective()],
   * })
   *
   *   formFieldDirective = inject(FormFieldDirective);
   */
  formFieldDirective: FormFieldDirective<T>;
}

import {
  ChangeDetectorRef,
  DestroyRef,
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  inject,
  InjectionToken,
  Input,
  OnInit,
  Output,
  Provider,
  Type
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormControlStatus,
  FormGroup,
  ValidatorFn
} from "@angular/forms";
import {FormService, ValidatorFunctions} from "../services/form.service";
import {filter, map, Observable, pairwise, startWith, tap} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {isDataChangedByUi, markAsUiChange, resetUiChange} from "./form-field.directive";
import {FormEventService} from "../services/form-event.service";
import {FormEvent} from "./form-events.directive";


export const DEFAULT_FORM_CONFIG: FormConfig = {
  saveDataWithService: true,
  clearFormWithInitialData: true,
  saveInStorage: undefined // let service decide
} as const;

export const FORM_CONFIG: InjectionToken<FormConfig> = new InjectionToken<FormConfig>('FORM_CONFIG', {
  factory: () => DEFAULT_FORM_CONFIG
});

export interface FormConfig {
  saveDataWithService?: boolean;
  saveInStorage?: boolean;
  clearFormWithInitialData?: boolean;
}

@Directive({
  selector: '[vodzooForm]',
  exportAs: 'vodzooForm',
  standalone: true
})
export class FormDirective<T extends { [K in keyof T]: AbstractControl }, UserTypes> implements OnInit {
  /**
   * ------------------------------------
   * Injected services
   * ------------------------------------
   * @private
   */
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private formService: FormService<T, UserTypes> = inject(FormService<T, UserTypes>);
  private formEventService: FormEventService = inject(FormEventService);
  private elementRef: ElementRef = inject(ElementRef);
  private destroyRef: DestroyRef = inject(DestroyRef);
  private formConfig: FormConfig = inject(FORM_CONFIG);




  /**
   * ------------------------------------
   * Fields
   * ------------------------------------
   */
  private _initialData?: FormValue<T, UserTypes>;
  private _formIndex?: number;
  private _form: FormGroup<T> = this.formService.getFormGroup();
  private elementLocalName: string = this.elementRef.nativeElement.localName;
  private rootForm: boolean = true;
  private initialClasses: string[] = ['form', this.elementLocalName];




  /**
   * ------------------------------------
   * Inputs
   * ------------------------------------
   */
  @Input() public initialDisabledState?: FormDisabledState<T, UserTypes>; // root form only, works on init only
  @Input() public initialValidators?: FormValidators<T, UserTypes>; // root form only, works on init only
  @Input() public saveDataWithService?: boolean = this.formConfig.saveDataWithService; // root form only
  @Input() public saveInStorage?: boolean = this.formConfig.saveInStorage; // root form only
  @Input() public clearForm?: Observable<{ value?: FormValue<T, UserTypes>, options?: { onlySelf?: boolean; emitEvent?: boolean; } } | undefined>; // root form only, works on init only
  @Input() public clearFormWithInitialData?: boolean = this.formConfig.clearFormWithInitialData; // initial data or form group data
  @Input() public set initialData(value: FormValue<T, UserTypes> | undefined) {
    if (this._initialData || !value) {
      return;
    }
    this._initialData = this.formService.getFormGroup(value).getRawValue();
  };
  @Input() public set form(value: FormGroup<T>) {
    this.rootForm = false;
    this._form = value;
  }
  @Input() public set patchForm(value: FormValue<T, UserTypes> | undefined | null) {
    if (this.rootForm && value !== null && value !== undefined) {
      this.form.patchValue(value as any);
    }
  }
  @Input() public set formIndex(value: number | undefined) {
    this._formIndex = value;
    this.classes = [...this.initialClasses];
    if (this.formIndex || this.formIndex === 0) {
      this.classes.push(`form-index-${this.formIndex}`);
    }
  }




  /**
   * ------------------------------------
   * Outputs
   * ------------------------------------
   */
  @Output() public id: EventEmitter<string> = new EventEmitter(); // root form only
  @Output() public formCreated: EventEmitter<FormGroup<T>> = new EventEmitter(); // root form only
  @Output() public valueChanged: EventEmitter<ValueChanges<T, UserTypes>> = new EventEmitter(); // root form only
  @Output() public statusChanged: EventEmitter<StatusChanges> = new EventEmitter(); // root form only
  @Output() public eventEmitted: EventEmitter<FormEvent<any, string, any>> = new EventEmitter(); // root form only




  /**
   * ------------------------------------
   * Host Bindings
   * ------------------------------------
   * @private
   */
  @HostBinding('class') private classes: string[] = [];




  /**
   * ------------------------------------
   * Getters
   * ------------------------------------
   */
  public get componentId(): string {
    const formIndex: string = this.formIndex || this.formIndex === 0 ? `_${this.formIndex}` : '';
    return `${this.elementLocalName}${formIndex}`
  }


  public get form(): FormGroup<T> {
    return this._form;
  }


  public get formIndex(): number | undefined {
    return this._formIndex;
  }


  public get initialData(): FormValue<T, UserTypes> | undefined {
    return this._initialData;
  };




  /**
   * ------------------------------------
   * Lifecycle hooks
   * ------------------------------------
   */
  public ngOnInit(): void {
    this.initForm();
    this.initClasses();
    this.initClearForm();
    this.initServiceComponentId();

    this.handleStatusChanges().subscribe();
    this.handleValueChanges().subscribe();
    this.handlePatchFormValueChanges().subscribe();

    if (this.rootForm) {
      this.sendFormCreated();
      this.sendComponentId();
      this.handleEvents().subscribe();
    }
  }




  /**
   * ------------------------------------
   * Other methods
   * ------------------------------------
   */
  public getFormValues(): FormValues<T, UserTypes> {
    return {value: this.form.value, rawValue: this.form.getRawValue() as FormRawValue<T>};
  }


  public addValidators(control: AbstractControl, validators: ValidatorFn | ValidatorFn[], opts?: {
    onlySelf?: boolean;
    emitEvent?: boolean;
  }): void {
    control.addValidators(validators);
    control.updateValueAndValidity(opts);
  }


  private sendFormCreated(): void {
    if (this.formCreated.observed) {
      this.formCreated.emit(this.form);
    }
  }


  private sendComponentId() {
    if (this.id.observed) {
      this.id.emit(this.componentId);
    }
  }


  private handleValueChanges(): Observable<ValueChanges<T, UserTypes>> {
    return this.form.valueChanges
      .pipe(
        startWith(this.form.value),
        tap(() => this.cdr.markForCheck()),
        filter(() => this.rootForm),
        map<FormValue<T, UserTypes>, FormValues<T, UserTypes>>(value => ({value, rawValue: this.form.getRawValue() as FormRawValue<T>})),
        pairwise(),
        tap(value => this.saveDataWithService ? this.formService.setFormValues(value[1], this.componentId, this.saveInStorage) : null),
        filter(() => this.valueChanged.observed),
        map<[FormValues<T, UserTypes>, FormValues<T, UserTypes>], ValueChanges<T, UserTypes>>(value => ({
          uiChange: isDataChangedByUi(this.form),
          previous: value[0],
          current: value[1]
        })),
        tap(() => resetUiChange(this.form)),
        tap((value: ValueChanges<T, UserTypes>) => this.valueChanged.emit(value)),
        takeUntilDestroyed(this.destroyRef)
      ) as Observable<ValueChanges<T, UserTypes>>;
  }


  private handleStatusChanges(): Observable<StatusChanges> {
    return this.form.statusChanges
      .pipe(
        startWith(this.form.status),
        tap(() => this.cdr.markForCheck()),
        filter(() => this.statusChanged.observed && this.rootForm),
        pairwise(),
        filter(value => value[0] !== value[1]),
        map(value => ({
          previous: value[0],
          current: value[1]
        })),
        tap(value => this.statusChanged.emit(value)),
        takeUntilDestroyed(this.destroyRef)
      );
  }


  private handlePatchFormValueChanges(): Observable<FormValue<T, UserTypes>> {
    return this.formService.patchFormValueChanges
      .pipe(
        filter((value: {componentId: string, value: FormValue<T, UserTypes>}) => value.componentId === this.componentId),
        map((value: {componentId: string, value: FormValue<T, UserTypes>}) => value.value),
        tap(value => this.form.patchValue(value as any)),
        takeUntilDestroyed(this.destroyRef)
      );
  }


  private handleEvents(): Observable<FormEvent<any, string, any>> {
    return this.formEventService.events
      .pipe(
        filter(() => this.eventEmitted.observed),
        tap(event => this.eventEmitted.emit(event)),
        takeUntilDestroyed(this.destroyRef)
      );
  }


  private initForm() {
    if (!this.rootForm) {
      return;
    }
    const initialValue: FormValue<T, UserTypes> | undefined = this.saveDataWithService ? this.formService.getFormValues(this.componentId)?.rawValue as FormValue<T, UserTypes> ?? this.initialData : this.initialData;
    this._form = this.formService.getFormGroup(initialValue, this.initialDisabledState, this.initialValidators);
    if (!this.initialData) {
      this.initialData = this.formService.initialValue ?? this.formService.getFormGroup().getRawValue();
    }
  }


  private initClasses() {
    this.classes = [...this.initialClasses, ...this.classes];
  }


  private initClearForm() {
    if (!(this.clearForm && this.rootForm)) {
      return;
    }
    this.clearForm
      .pipe(
        tap(() => markAsUiChange(this.form)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(clearObject => this.form.reset(clearObject?.value ?? (this.clearFormWithInitialData ? this.initialData as any : this.formService.getFormGroup().getRawValue()), clearObject?.options));
  }


  private initServiceComponentId() {
    if (!this.rootForm) {
      return;
    }
    this.formService.defaultComponentId = this.elementLocalName;
  }
}




/**
 * ------------------------------------
 * Types
 * ------------------------------------
 */
export type FormValues<T, UserTypes> = { rawValue: FormRawValue<T>; value: FormValue<T, UserTypes> };
export type FormRawValue<T> = {
  [K in keyof T]
  : T[K] extends FormControl<infer U>
    ? U
    : T[K] extends FormArray<FormControl<infer U>>
      ? Array<U>
      : T[K] extends FormArray<FormGroup<infer U>>
        ? Array<FormRawValue<U>>
        : T[K] extends FormGroup<infer U>
          ? FormRawValue<U>
          : T[K]
}
export type FormValue<T, UserTypes> = RecursivePartial<FormRawValue<T>, UserTypes>;
export type FormDisabledState<T, UserTypes> = RecursivePartialBoolean<FormRawValue<T>, UserTypes>;
export type FormValidators<T, UserTypes> = RecursivePartialValidators<FormRawValue<T>, UserTypes>;


type AllowedTypes<UserTypes> = boolean | string | number | undefined | null | UserTypes;
type RecursivePartial<T, UserTypes> = {
  [P in keyof T]?:
    T[P] extends Array<infer U> ? Array<Value<U, UserTypes>> : Value<T[P], UserTypes>;
};
type Value<T, UserTypes> = T extends AllowedTypes<UserTypes> ? T : RecursivePartial<T, UserTypes>;


type RecursivePartialBoolean<T, UserTypes> = {
  [P in keyof T]?:
    T[P] extends Array<infer U> ? ArrayValueBoolean<U, UserTypes> : ValueBoolean<T[P], UserTypes>;
};
type ArrayValueBoolean<T, UserTypes> = T extends AllowedTypes<UserTypes> ? ValueBooleanFn : RecursivePartialBoolean<T, UserTypes>;
type ValueBoolean<T, UserTypes> = T extends AllowedTypes<UserTypes> ? ValueBooleanFn : RecursivePartialBoolean<T, UserTypes>;
export type ValueBooleanFn = (index?: number | null) => boolean;


type RecursivePartialValidators<T, UserTypes> = {
  [P in keyof T]?:
    T[P] extends Array<infer U> ? ArrayValueValidator<U, UserTypes> : ValueValidator<T[P], UserTypes>;
};
type ArrayValueValidator<T, UserTypes> = T extends AllowedTypes<UserTypes> ? ValueValidatorFn : RecursivePartialValidators<T, UserTypes>;
type ValueValidator<T, UserTypes> = T extends AllowedTypes<UserTypes> ? ValueValidatorFn : RecursivePartialValidators<T, UserTypes>;
export type ValueValidatorFn = (index?: number | null) => ValidatorFunctions;


/**
 * ------------------------------------
 * Interfaces
 * ------------------------------------
 */
export interface ValueChanges<T, UserTypes> {
  uiChange: boolean;
  previous: FormValues<T, UserTypes>;
  current: FormValues<T, UserTypes>;
}

export interface StatusChanges {
  previous: FormControlStatus;
  current: FormControlStatus;
}



export interface Form<T extends { [K in keyof T]: AbstractControl }, UserTypes> {
  /**
   * @Component({
   *   ...
   *   hostDirectives: [{
   *     directive: FormDirective,
   *     inputs: [],
   *     output: []
   *   }],
   *   providers: [formProviders(Form2Service)]
   * })
   *
   *   formDirective = inject(FormDirective);
   */
  formDirective: FormDirective<T, UserTypes>;
  getFormValue?: () => FormValues<T, UserTypes>;
  addValidators?: (
    control: AbstractControl,
    validators: ValidatorFn | ValidatorFn[],
    opts?: {
      onlySelf?: boolean;
      emitEvent?: boolean;
    }) => void;
}




/**
 * ------------------------------------
 * Functions
 * ------------------------------------
 */
export function formProviders<T extends Type<FormService<any, any>>>(service: T): Provider {
  return {
    provide: FormService,
    useExisting: service
  }
}



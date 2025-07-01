import {AbstractControl, FormArray, FormControl, FormGroup} from "@angular/forms";

export function markAllAsTouched(abstractControl: AbstractControl): void {
  if (abstractControl instanceof FormGroup || abstractControl instanceof FormArray) {
    Object.values(abstractControl.controls).forEach((control: AbstractControl) => {
      markAllAsTouched(control);
    })
  } else if (abstractControl instanceof FormControl && abstractControl.untouched) {
    abstractControl.markAsTouched({onlySelf: true});
    abstractControl.updateValueAndValidity({onlySelf: true});
  }
}

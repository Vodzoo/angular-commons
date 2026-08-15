import { TestBed } from '@angular/core/testing';
import {FormArray, FormControl, FormGroup} from '@angular/forms';
import {isChangedByUiUnset} from '../directives/form-field.directive';
import {FormService} from './form.service';

describe('FormService', () => {
  let service: FormService<any, any, any>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers : [FormService]
    });
    service = TestBed.inject(FormService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('addGroup', () => {
    it('passes the appended group index to getFormGroup', () => {
      const first = new FormGroup({});
      const second = new FormGroup({});
      const added = new FormGroup({});
      const formArray = new FormArray([first, second]);
      const getFormGroup = spyOn(service, 'getFormGroup').and.returnValue(added);

      const result = service.addGroup(formArray);

      expect(getFormGroup).toHaveBeenCalledWith(undefined, undefined, undefined, 2);
      expect(getFormGroup).toHaveBeenCalledTimes(1);
      expect(result).toBe(added);
      expect(formArray.at(2)).toBe(added);
    });
  });

  describe('removeFromArray', () => {
    it('removes a control that belongs to the array', () => {
      const first = new FormControl('first', {nonNullable: true});
      const second = new FormControl('second', {nonNullable: true});
      const formArray = new FormArray([first, second]);

      service.removeFromArray(formArray, first);

      expect(formArray.controls).toEqual([second]);
    });

    it('does nothing when the control does not belong to the array', () => {
      const first = new FormControl('first', {nonNullable: true});
      const second = new FormControl('second', {nonNullable: true});
      const foreign = new FormControl('foreign', {nonNullable: true});
      const formArray = new FormArray([first, second]);
      const removeAt = spyOn(formArray, 'removeAt').and.callThrough();

      service.removeFromArray(formArray, foreign);

      expect(removeAt).not.toHaveBeenCalled();
      expect(formArray.controls).toEqual([first, second]);
      expect(isChangedByUiUnset(formArray)).toBeTrue();
    });
  });
});

import { TestBed } from '@angular/core/testing';
import {FormService} from './form.service';

describe('FormService', () => {
  let service: FormService<any>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers : [FormService]
    });
    service = TestBed.inject(FormService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

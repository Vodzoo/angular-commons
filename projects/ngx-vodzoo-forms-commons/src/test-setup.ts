import '@angular/compiler';
import 'zone.js';
import {getTestBed} from '@angular/core/testing';
import {BrowserDynamicTestingModule, platformBrowserDynamicTesting} from '@angular/platform-browser-dynamic/testing';
import {afterEach, vi} from 'vitest';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  {teardown: {destroyAfterEach: true}},
);

afterEach(() => {
  getTestBed().resetTestingModule();
  vi.useRealTimers();
  sessionStorage.clear();
});

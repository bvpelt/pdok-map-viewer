import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextPanel } from './text-panel';

describe('TextPanel', () => {
  let component: TextPanel;
  let fixture: ComponentFixture<TextPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextPanel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TextPanel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

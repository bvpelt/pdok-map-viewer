import { Component } from '@angular/core';
//import { RouterOutlet } from '@angular/router';
import { AngularSplitModule } from 'angular-split'; // Import the splitter
import { MapPanel } from './map-panel/map-panel';
import { TextPanel } from './text-panel/text-panel';
import { signal } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    //    RouterOutlet,
    AngularSplitModule, // Add module here
    TextPanel,
    MapPanel,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('pdok-map-viewer');
  private readonly storageKey = 'pdok-map-layout-sizes';

  // Use a signal to hold the panel sizes.
  // Default to 20/80, but try loading from storage first.
  splitSizes = signal<number[]>(this.getSavedSizes());

  /**
   * This is the function called by the (dragEnd) event.
   * It receives the new size array and saves it to localStorage.
   */
  // 3. Changed event parameter type to IOutputData
  onDragEnd(event: any): void {
    // 4. Convert the incoming (number | string)[] to a clean number[]
    const newSizes = event.sizes.map((s: any) => (typeof s === 'string' ? parseFloat(s) : s));

    this.splitSizes.set(newSizes); // Update the signal
    localStorage.setItem(this.storageKey, JSON.stringify(newSizes));
    console.log('Split panel sizes saved:', newSizes);
  }

  /**
   * Helper function to load sizes from localStorage on init.
   */
  private getSavedSizes(): number[] {
    const savedSizes = localStorage.getItem(this.storageKey);
    if (savedSizes) {
      try {
        const sizes = JSON.parse(savedSizes);
        // Basic validation to ensure it's an array of two numbers
        if (Array.isArray(sizes) && sizes.length === 2 && typeof sizes[0] === 'number') {
          return sizes;
        }
      } catch (e) {
        console.error('Failed to parse saved layout sizes', e);
      }
    }
    // Default fallback
    return [20, 80];
  }
}

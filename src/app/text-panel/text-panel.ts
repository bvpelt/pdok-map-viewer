import { Component } from '@angular/core';
import { LayerManager } from '../core/services/layer-manager';
import { CommonModule } from '@angular/common'; // For @for

@Component({
  selector: 'app-text-panel',
  imports: [CommonModule],
  templateUrl: './text-panel.html',
  styleUrl: './text-panel.scss',
})
export class TextPanel {
  // Make the service public so the template can access it
  constructor(public layerManager: LayerManager) {}

  onToggle(event: Event, id: string) {
    const checkbox = event.target as HTMLInputElement;
    this.layerManager.toggleLayerVisibility(id, checkbox.checked);
  }
}
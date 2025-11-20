import { Component } from '@angular/core';
import { LayerManager, AppLayerUI } from '../core/services/layer-manager';
import { CommonModule } from '@angular/common'; // For @for

@Component({
  selector: 'app-text-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './text-panel.html',
  styleUrl: './text-panel.scss',
})
export class TextPanel {
  // Make the service public so the template can access its read-only signals
  constructor(public layerManager: LayerManager) {}

  /**
   * Handler for overlay checkboxes.
   * Only updates the user's *desired* visibility (`AppLayer.visible`).
   * The actual layer visibility is managed by the LayerManager's computed signal,
   * which considers both the desired state and the availability/zoom constraints.
   */
  onToggleOverlay(event: Event, layer: AppLayerUI) {
    // If not available, we should ignore the toggle click. The UI prevents this
    // but this is a good safety guard.
    if (!layer.isAvailable) {
      (event.target as HTMLInputElement).checked = false;
      console.warn(`Attempted to toggle unavailable layer: ${layer.id}`);
      return;
    }

    const checkbox = event.target as HTMLInputElement;
    console.log(
      'TextPanel - setting desired visibility for layer: ' +
        layer.id +
        ' to: ' +
        checkbox.checked.valueOf()
    );

    // Update the desired state in the service
    this.layerManager.toggleLayerVisibility(layer.id, checkbox.checked);
  }

  // Handler for basemap radio buttons (Unmodified)
  onBaseMapChange(event: Event): void {
    const radio = event.target as HTMLInputElement;
    console.log('TextPanel - selected map: ' + radio.value);
    this.layerManager.setActiveBaseMap(radio.value);
  }
}

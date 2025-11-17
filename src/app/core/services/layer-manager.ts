import { Injectable, signal } from '@angular/core';
import BaseLayer from 'ol/layer/Base'; // Base type for any OL layer

// A simple interface for our layer data
export interface AppLayer {
  id: string;
  name: string;
  visible: boolean;
  layer: BaseLayer; // The actual OpenLayers object
}


@Injectable({
  providedIn: 'root',
})
export class LayerManager {
  // Private signal to hold the state
  private readonly _layers = signal<AppLayer[]>([]);

  // Public readonly signal for components to subscribe to
  public readonly layers = this._layers.asReadonly();

  constructor() {
    // Here you would initialize your PDOK layers
    // e.g., this.loadPdokLayers();
  }

  // Method for the text-panel to call
  toggleLayerVisibility(id: string, visible: boolean) {
    // Update the signal
    this._layers.update(currentLayers => 
      currentLayers.map(l => 
        l.id === id ? { ...l, visible: visible } : l
      )
    );

    // Also update the map layer object directly
    const layerToUpdate = this.layers().find(l => l.id === id);
    layerToUpdate?.layer.setVisible(visible);
  }

  // Method to add new layers
  addLayer(layerData: AppLayer) {
    this._layers.update(current => [...current, layerData]);
  }
}

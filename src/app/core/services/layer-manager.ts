import { Injectable, signal, computed, inject } from '@angular/core';
import BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorTileLayer from 'ol/layer/VectorTile';
// Import only the required services for the LayerManager constructor
import { BrtLayerService } from './brt-layer';
import { OsmLayerService } from './osm-layer';
import { LuchtfotoLayer } from './luchtfoto-layer';
import { BagLayerService } from './bag-layer';

// --- INTERFACES ---
// Interface for Overlay Layers
export interface AppLayer {
  id: string;
  name: string;
  visible: boolean; // User requested visibility (desired state)
  layer: TileLayer<any> | VectorTileLayer; // The actual OpenLayers object
}

// Extended interface for UI consumption
export interface AppLayerUI extends AppLayer {
  isAvailable: boolean; // Derived state based on zoom
}

// Interface for Base Maps
export interface BaseMap {
  id: string;
  name: string;
  layer: TileLayer<any> | VectorTileLayer;
}

@Injectable({ providedIn: 'root' })
export class LayerManager {
  // --- MAP STATE ---
  private readonly _currentResolution = signal<number | null>(null);
  public readonly currentResolution = this._currentResolution.asReadonly();

  // --- BASEMAP STATE ---
  private readonly _availableBaseMaps = signal<BaseMap[]>([]);
  private readonly _activeBaseMapId = signal<string>('pdok-brt');

  // Public signals for components to read
  public readonly availableBaseMaps = this._availableBaseMaps.asReadonly();
  public readonly activeBaseMap = this._activeBaseMapId.asReadonly();

  // --- OVERLAY LAYER STATE ---
  private readonly _layers = signal<AppLayer[]>([]);
  public readonly layers = this._layers.asReadonly();

  // Computed signal to calculate availability for the UI
  public readonly layersWithAvailability = computed<AppLayerUI[]>(() => {
    const layers = this._layers();
    const resolution = this._currentResolution();

    if (resolution === null) {
      // If resolution is not yet set, assume unavailable or default to false
      return layers.map((layer) => ({ ...layer, isAvailable: false }));
    }

    return layers.map((layer) => {
      const olLayer = layer.layer;

      // Get layer resolution constraints from OpenLayers properties
      const maxRes = olLayer.getMaxResolution();
      const minRes = olLayer.getMinResolution();

      // Check if the current resolution is within the layer's defined range
      // maxResolution means the layer is visible for resolutions *smaller* than maxRes
      // minResolution means the layer is visible for resolutions *larger* than minRes
      const isAvailable = resolution <= maxRes && resolution >= minRes;

      // Crucially, update the actual OL layer visibility based on *both* availability and desired visibility
      const finalVisibility = isAvailable && layer.visible;
      if (olLayer.getVisible() !== finalVisibility) {
        olLayer.setVisible(finalVisibility);
      }

      return {
        ...layer,
        isAvailable: isAvailable,
      };
    });
  });

  // Inject layer services
  // NOTE: Assuming these services exist and are injectable for the app to work
  private readonly brtLayerService = inject(BrtLayerService);
  private readonly osmLayerService = inject(OsmLayerService);
  private readonly luchtfotoLayerService = inject(LuchtfotoLayer);
  private readonly bagLayerService = inject(BagLayerService);

  constructor() {
    // NOTE: Initialization logic remains the same.
    // The layer visibility is now managed inside the layersWithAvailability computed signal effect.
    this.initializeBaseMapsAsync().then(() => {
      console.log('LayerManager backgrounds loaded');
    });

    this.initializeDefaultOverlayAsync().then(() => {
      console.log('LayerManager overlays loaded');
    });
  }

  /**
   * Updates the current map resolution (called by MapPanel)
   * @param resolution The current map view resolution
   */
  setCurrentResolution(resolution: number): void {
    // console.log('LayerManager: Resolution updated to', resolution.toFixed(4));
    this._currentResolution.set(resolution);
  }

  /**
   * Initializes all base map layers (Unmodified)
   */
  private async initializeBaseMapsAsync(): Promise<void> {
    const baseMaps: BaseMap[] = [];

    /*
    // Mocking the async service calls for compilation purposes if services are not provided
    // In a real scenario, these calls would resolve to OpenLayers layers.
    const mockTileLayer = (id: string) =>
      ({
        get: () => id,
        set: () => {},
        setVisible: () => {},
        getMaxResolution: () => Infinity,
        getMinResolution: () => 0,
      } as any as TileLayer<any>); // Cast to satisfy interface
*/

    const osmLayer = await this.osmLayerService.createLayer(); // mockTileLayer('osm'); // Replace with this.osmLayerService.createLayer();
    osmLayer.set('id', 'osm');
    baseMaps.push({ id: 'osm', name: 'OpenStreetMap', layer: osmLayer });

    try {
      const pdokBrtLayer = await this.brtLayerService.createLayer('standaard'); // mockTileLayer('pdok-brt'); // Replace with this.brtLayerService.createLayer('standaard');
      pdokBrtLayer.set('id', 'pdok-brt');
      baseMaps.push({ id: 'pdok-brt', name: 'PDOK BRT', layer: pdokBrtLayer });
    } catch (error) {
      this._activeBaseMapId.set('osm');
    }

    try {
      const luchtfotoLayer = await this.luchtfotoLayerService.createLayer(); // mockTileLayer('luchtfoto'); // Replace with this.luchtfotoLayerService.createLayer();
      luchtfotoLayer.set('id', 'luchtfoto');
      baseMaps.push({ id: 'luchtfoto', name: 'Luchtfoto', layer: luchtfotoLayer });
    } catch (error) {}

    this._availableBaseMaps.set(baseMaps);
    this.updateBaseMapVisibility();
  }

  private async initializeDefaultOverlayAsync(): Promise<void> {
    const overlayMaps: AppLayer[] = [];

    // The BAG layer is initialized with the correct min/max resolutions in bag-layer.ts
    try {
      console.log('Initializing BAG layer...');
      const bagLayer = await this.bagLayerService.createLayer();
      bagLayer.set('id', 'bag');
      overlayMaps.push({
        id: 'bag',
        name: 'BAG',
        layer: bagLayer,
        visible: false,
      });
      console.log('BAG layer initialized successfully');
    } catch (error) {
      console.error('Could not initialize BAG layer');
    }

    this._layers.set(overlayMaps);
    console.log('LayerManager overlays loaded, count:', overlayMaps.length);
  }

  // --- BASEMAP METHODS (Unmodified) ---

  setActiveBaseMap(id: string): void {
    console.log('LayerManager - setActiveBaseMap:', id);
    this._activeBaseMapId.set(id);
    this.updateBaseMapVisibility();
  }

  private updateBaseMapVisibility(): void {
    const activeId = this.activeBaseMap();
    this.availableBaseMaps().forEach((basemap) => {
      basemap.layer.setVisible(basemap.id === activeId);
    });
  }

  addBaseMap(id: string, name: string, layer: TileLayer<any> | VectorTileLayer): void {
    layer.set('id', id);
    this._availableBaseMaps.update((current) => [...current, { id, name, layer }]);
    this.updateBaseMapVisibility();
  }

  removeBaseMap(id: string): void {
    if (this.activeBaseMap() === id) {
      console.warn('Cannot remove active base map. Switch to another base map first.');
      return;
    }
    this._availableBaseMaps.update((current) => current.filter((bm) => bm.id !== id));
  }

  // --- OVERLAY LAYER METHODS ---

  addLayer(layerData: AppLayer): void {
    // The visibility will be managed by the computed signal
    this._layers.update((current) => [...current, layerData]);
  }

  /**
   * Toggles the user's desired visibility state for an overlay layer.
   * Actual visibility on map is controlled by the computed layersWithAvailability signal.
   * @param id The ID of the layer to toggle
   * @param visible Whether the layer should be visible (user preference)
   */
  toggleLayerVisibility(id: string, visible: boolean): void {
    console.log('LayerManager: User setting desired visibility for', id, 'to', visible);
    this._layers.update((currentLayers) =>
      currentLayers.map((l) => (l.id === id ? { ...l, visible: visible } : l))
    );
    // The layersWithAvailability computed signal will handle updating the OpenLayers object.
  }

  removeLayer(id: string): void {
    this._layers.update((current) => current.filter((l) => l.id !== id));
  }
}

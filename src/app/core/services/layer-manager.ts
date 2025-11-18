import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import BaseLayer from 'ol/layer/Base';
import { TileMatrixSet, TileMatrix, OGCCollection } from '../map/map.interface';
import TileLayer from 'ol/layer/Tile';
import { OSM, XYZ } from 'ol/source';
import MVT from 'ol/format/MVT.js';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile.js';
import { firstValueFrom } from 'rxjs';
import { get as getProjection } from 'ol/proj';
import { getWidth, getTopLeft } from 'ol/extent';
import TileGrid from 'ol/tilegrid/TileGrid';

// --- INTERFACES ---
// Interface for Overlay Layers
export interface AppLayer {
  id: string;
  name: string;
  visible: boolean;
  layer: BaseLayer; // The actual OpenLayers object
}

// Interface for Base Maps
export interface BaseMap {
  id: string;
  name: string;
  layer: TileLayer<any> | VectorTileLayer;
}

@Injectable({ providedIn: 'root' })
export class LayerManager {
  // --- BASEMAP STATE ---
  private readonly _availableBaseMaps = signal<BaseMap[]>([]);
  private readonly _activeBaseMapId = signal<string>('pdok-brt');

  // Public signals for components to read
  public readonly availableBaseMaps = this._availableBaseMaps.asReadonly();
  public readonly activeBaseMap = this._activeBaseMapId.asReadonly();

  // --- OVERLAY LAYER STATE ---
  private readonly _layers = signal<AppLayer[]>([]);
  public readonly layers = this._layers.asReadonly();

  // PDOK OGC API configuration
  private readonly http = inject(HttpClient);
  private readonly pdokBaseUrl = 'https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1';
  private readonly tileMatrixSetId = 'NetherlandsRDNewQuad';

  constructor() {
    this.initializeBaseMapsAsync();
  }

  /* BRT */
  private async getTileMatrixSet(): Promise<TileMatrixSet | null> {
    try {
      const url = `${this.pdokBaseUrl}/tileMatrixSets/${this.tileMatrixSetId}`;
      const response = await firstValueFrom(
        this.http.get<TileMatrixSet>(url, {
          headers: { Accept: 'application/json' },
        })
      );
      return response;
    } catch (error) {
      console.error('Error fetching tile matrix set:', error);
      return null;
    }
  }

  private async getBrtStyle(styleName: string = 'standaard'): Promise<any | null> {
    try {
      const url = `${this.pdokBaseUrl}/styles/${styleName}?f=json`;
      const response = await firstValueFrom(
        this.http.get<any>(url, {
          headers: { Accept: 'application/json' },
        })
      );
      return response;
    } catch (error) {
      console.error('Error fetching BRT style:', error);
      return null;
    }
  }

  private async createBrtVectorTileLayer(
    tileMatrixSet: TileMatrixSet,
    styleName: string = 'standaard'
  ): Promise<VectorTileLayer> {
    // Build tile URL template for vector tiles
    const brtUrlTemplate = `${this.pdokBaseUrl}/tiles/NetherlandsRDNewQuad/{z}/{y}/{x}?f=mvt`;

    // Get the projection
    const projection = getProjection('EPSG:28992');
    if (!projection) {
      throw new Error('EPSG:28992 projection not found');
    }

    // Create resolutions from the TileMatrixSet
    const resolutions: number[] = [];
    const tileSize = 256; // Standard tile size

    // Sort tile matrices by scale (descending) to get correct zoom levels
    const sortedMatrices = [...(tileMatrixSet.tileMatrices || [])].sort(
      (a, b) => b.scaleDenominator - a.scaleDenominator
    );

    sortedMatrices.forEach((matrix: TileMatrix) => {
      // Calculate resolution from scale denominator
      // Resolution = scaleDenominator * 0.00028 (standard pixel size in meters)
      resolutions.push(matrix.scaleDenominator * 0.00028);
    });

    // Get extent from projection or use Netherlands bounds
    const extent = projection.getExtent() || [-285401.92, 22598.08, 595401.92, 903401.92];
    const origin = getTopLeft(extent);

    // Create tile grid
    const tileGrid = new TileGrid({
      origin: origin,
      resolutions: resolutions,
      tileSize: tileSize,
    });

    const vectorTileSource = new VectorTileSource({
      format: new MVT(),
      url: brtUrlTemplate,
      projection: projection,
      attributions: ['© PDOK'],
      tileGrid: tileGrid,
    });

    const vectorTileLayer = new VectorTileLayer({
      source: vectorTileSource,
      properties: {
        name: 'BRT Achtergrondkaart',
        type: 'background',
      },
    });

    // Fetch and apply the style
    const styleJson = await this.getBrtStyle(styleName);
    if (styleJson) {
      try {
        // Apply the Mapbox GL style to the vector tile layer
        await this.applyMapboxStyle(vectorTileLayer, styleJson);
        console.log(`BRT style '${styleName}' applied successfully`);
      } catch (error) {
        console.error('Error applying BRT style:', error);
      }
    }

    return vectorTileLayer;
  }

  private async applyMapboxStyle(layer: VectorTileLayer, styleJson: any): Promise<void> {
    // Use ol-mapbox-style to apply the style
    // First, we need to import the necessary function
    const { applyStyle } = await import('ol-mapbox-style');

    // Apply the style to the layer
    await applyStyle(layer, styleJson, {
      resolutions: layer.getSource()?.getTileGrid()?.getResolutions(),
    });
  }
  /* BRT */

  private async initializeBaseMapsAsync(): Promise<void> {
    const baseMaps: BaseMap[] = [];

    try {
      // 1. PDOK BRT (OGC API Vector Tiles)
      const tileMatrixSet = await this.getTileMatrixSet();

      if (!tileMatrixSet) {
        throw new Error('Failed to fetch TileMatrixSet from PDOK.');
      }

      const pdokBrtLayer = await this.createBrtVectorTileLayer(tileMatrixSet, 'standaard');
      pdokBrtLayer.set('id', 'pdok-brt');
      baseMaps.push({ id: 'pdok-brt', name: 'PDOK BRT', layer: pdokBrtLayer });

      console.log('PDOK BRT layer initialized successfully');
    } catch (error) {
      console.error('Could not initialize PDOK BRT Vector Layer:', error);
      // If PDOK fails, we'll just use OSM. Set it as active.
      this._activeBaseMapId.set('osm');
    }

    // 2. OpenStreetMap (OSM) - Always add as a fallback
    // OSM needs to be reprojected to EPSG:28992
    const osmLayer = new TileLayer({
      source: new XYZ({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attributions: ['© OpenStreetMap contributors'],
        // OSM tiles are in EPSG:3857, OpenLayers will reproject to EPSG:28992
      }),
    });
    osmLayer.set('id', 'osm');
    baseMaps.push({ id: 'osm', name: 'OpenStreetMap', layer: osmLayer });

    // 3. Set the signal with all available basemaps
    console.log('Setting availableBaseMaps signal with', baseMaps.length, 'basemaps');
    this._availableBaseMaps.set(baseMaps);
    console.log('availableBaseMaps signal set');

    // 4. Set initial visibility based on the active ID
    console.log('Calling updateBaseMapVisibility for initial state');
    this.updateBaseMapVisibility();
  }

  // --- BASEMAP METHODS ---

  setActiveBaseMap(id: string): void {
    this._activeBaseMapId.set(id);
    this.updateBaseMapVisibility();
  }

  private updateBaseMapVisibility(): void {
    const activeId = this.activeBaseMap();
    this.availableBaseMaps().forEach((basemap) => {
      basemap.layer.setVisible(basemap.id === activeId);
    });
  }

  // --- OVERLAY LAYER METHODS ---

  addLayer(layerData: AppLayer): void {
    // Ensure layer visibility matches its state
    layerData.layer.setVisible(layerData.visible);
    this._layers.update((current) => [...current, layerData]);
  }

  toggleLayerVisibility(id: string, visible: boolean): void {
    // Update the signal state
    this._layers.update((currentLayers) =>
      currentLayers.map((l) => (l.id === id ? { ...l, visible: visible } : l))
    );

    // Update the OpenLayers layer object
    const layerToUpdate = this.layers().find((l) => l.id === id);
    layerToUpdate?.layer.setVisible(visible);
  }
}

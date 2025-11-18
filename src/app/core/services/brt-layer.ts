import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { get as getProjection } from 'ol/proj';
import { getTopLeft } from 'ol/extent';
import TileGrid from 'ol/tilegrid/TileGrid';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
import { TileMatrixSet, TileMatrix } from '../map/map.interface';

@Injectable({ providedIn: 'root' })
export class BrtLayerService {
  private readonly http = inject(HttpClient);
  private readonly pdokBaseUrl = 'https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1';
  private readonly tileMatrixSetId = 'NetherlandsRDNewQuad';

  /**
   * Creates a BRT (Basisregistratie Topografie) vector tile layer
   * @param styleName The style to apply (standaard, pastel, grijs, water)
   * @returns A configured VectorTileLayer with the specified style
   */
  async createLayer(styleName: string = 'standaard'): Promise<VectorTileLayer> {
    // Fetch tile matrix set
    const tileMatrixSet = await this.getTileMatrixSet();
    if (!tileMatrixSet) {
      throw new Error('Failed to fetch TileMatrixSet from PDOK');
    }

    // Create the layer with the tile matrix set
    const layer = this.buildVectorTileLayer(tileMatrixSet);

    // Fetch and apply the style
    const styleJson = await this.getStyle(styleName);
    if (styleJson) {
      await this.applyStyle(layer, styleJson, styleName);
    }

    return layer;
  }

  /**
   * Fetches the tile matrix set from PDOK API
   */
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

  /**
   * Fetches a style definition from PDOK API
   */
  private async getStyle(styleName: string): Promise<any | null> {
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

  /**
   * Builds a vector tile layer with the correct tile grid configuration
   */
  private buildVectorTileLayer(tileMatrixSet: TileMatrixSet): VectorTileLayer {
    // Build tile URL template for vector tiles
    const urlTemplate = `${this.pdokBaseUrl}/tiles/NetherlandsRDNewQuad/{z}/{y}/{x}?f=mvt`;

    // Get the projection
    const projection = getProjection('EPSG:28992');
    if (!projection) {
      throw new Error('EPSG:28992 projection not found');
    }

    // Create resolutions from the TileMatrixSet
    const resolutions: number[] = [];
    const tileSize = 256;

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

    // Create vector tile source
    const vectorTileSource = new VectorTileSource({
      format: new MVT(),
      url: urlTemplate,
      projection: projection,
      attributions: ['© PDOK'],
      tileGrid: tileGrid,
    });

    // Create and return the layer
    const vectorTileLayer = new VectorTileLayer({
      source: vectorTileSource,
      properties: {
        name: 'BRT Achtergrondkaart',
        type: 'background',
      },
    });

    return vectorTileLayer;
  }

  /**
   * Applies a Mapbox GL style to the vector tile layer
   */
  private async applyStyle(
    layer: VectorTileLayer,
    styleJson: any,
    styleName: string
  ): Promise<void> {
    try {
      // Use ol-mapbox-style to apply the style
      const { applyStyle } = await import('ol-mapbox-style');

      // Apply the style to the layer
      await applyStyle(layer, styleJson, {
        resolutions: layer.getSource()?.getTileGrid()?.getResolutions(),
      });

      console.log(`BRT style '${styleName}' applied successfully`);
    } catch (error) {
      console.error('Error applying BRT style:', error);
      throw error;
    }
  }

  /**
   * Gets available style names for BRT layers
   */
  getAvailableStyles(): string[] {
    return ['standaard', 'pastel', 'grijs', 'water'];
  }
}

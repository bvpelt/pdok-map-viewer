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
export class BagLayerService {
  private readonly http = inject(HttpClient);
  private readonly pdokBaseUrl = 'https://api.pdok.nl/lv/bag/ogc/v1_0';
  private readonly tileMatrixSetId = 'NetherlandsRDNewQuad';

  /**
   * Creates a BAG (Basisregistratie Adressen en Gebouwen) vector tile layer
   * @returns A configured VectorTileLayer for BAG data
   */
  async createLayer(): Promise<VectorTileLayer> {
    console.log('BAG Layer Service: Starting layer creation');

    // Fetch tile matrix set
    const tileMatrixSet = await this.getTileMatrixSet();
    if (!tileMatrixSet) {
      throw new Error('Failed to fetch TileMatrixSet from PDOK for BAG');
    }

    // Create the layer with the tile matrix set
    const layer = this.buildVectorTileLayer(tileMatrixSet);

    console.log('BAG Layer Service: Layer created successfully');
    return layer;
  }

  /**
   * Fetches the tile matrix set from PDOK API
   */
  private async getTileMatrixSet(): Promise<TileMatrixSet | null> {
    try {
      const url = `${this.pdokBaseUrl}/tileMatrixSets/${this.tileMatrixSetId}`;
      console.log('BAG Layer Service: Fetching tile matrix set from:', url);

      const response = await firstValueFrom(
        this.http.get<TileMatrixSet>(url, {
          headers: { Accept: 'application/json' },
        })
      );

      console.log('BAG Layer Service: Tile matrix set fetched successfully');
      return response;
    } catch (error) {
      console.error('BAG Layer Service: Error fetching tile matrix set:', error);
      return null;
    }
  }

  /**
   * Builds a vector tile layer with the correct tile grid configuration
   */
  private buildVectorTileLayer(tileMatrixSet: TileMatrixSet): VectorTileLayer {
    // Build tile URL template for vector tiles
    // Adjust the collection name if needed (e.g., 'pand' for buildings)
    const urlTemplate = `${this.pdokBaseUrl}/tiles/NetherlandsRDNewQuad/{z}/{y}/{x}?f=mvt&collections=pand`;

    console.log('BAG Layer Service: Building layer with URL template:', urlTemplate);

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
      resolutions.push(matrix.scaleDenominator * 0.00028);
    });

    console.log('BAG Layer Service: Resolutions calculated:', resolutions.length, 'levels');

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
      attributions: ['© Kadaster'],
      tileGrid: tileGrid,
    });

    // Create and return the layer with basic styling
    const vectorTileLayer = new VectorTileLayer({
      source: vectorTileSource,
      properties: {
        name: 'BAG Panden',
        type: 'overlay',
      },
      // Add basic style for buildings
      style: {
        'stroke-color': '#ff0000',
        'stroke-width': 2,
        'fill-color': 'rgba(255, 0, 0, 0.1)',
      },
    });

    console.log('BAG Layer Service: VectorTileLayer created');
    return vectorTileLayer;
  }
}

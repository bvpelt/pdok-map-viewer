import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { get as getProjection } from 'ol/proj';
import { getTopLeft } from 'ol/extent';
import TileGrid from 'ol/tilegrid/TileGrid';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
// Fix for TS7006: Import FeatureLike for type safety
import { FeatureLike } from 'ol/Feature';
// Import necessary style components
import { Fill, Stroke, Style } from 'ol/style';
import { TileMatrixSet, TileMatrix } from '../map/map.interface';

// Define the StyleFunction type inline to fix TS2305 (missing StyleFunction export)
type StyleFunction = (feature: FeatureLike, resolution: number) => Style | Style[] | void;

@Injectable({ providedIn: 'root' })
export class BagLayerService {
  private readonly http = inject(HttpClient);
  private readonly pdokBaseUrl = 'https://api.pdok.nl/lv/bag/ogc/v1';
  private readonly tileMatrixSetId = 'NetherlandsRDNewQuad';

  /**
   * Creates a BAG (Basisregistratie Adressen en Gebouwen) vector tile layer
   * @returns A configured VectorTileLayer for BAG data
   */
  async createLayer(): Promise<VectorTileLayer> {
    console.log('BAG Layer Service: Starting layer creation');

    // Fetch required configuration
    const tileMatrixSet = await this.getTileMatrixSet();
    if (!tileMatrixSet) {
      throw new Error('Failed to fetch TileMatrixSet from PDOK for BAG');
    }

    // 1. Fetch the Style JSON from the specified endpoint
    const styleJson = await this.getStyleJson();
    if (!styleJson) {
      throw new Error('Failed to fetch style JSON from PDOK for BAG');
    }

    // 2. Create the layer with the tile matrix set and the fetched style
    const layer = this.buildVectorTileLayer(tileMatrixSet, styleJson);

    console.log('BAG Layer Service: Layer created successfully');
    return layer;
  }

  /**
   * Fetches the official PDOK style JSON for the BAG layer.
   */
  private async getStyleJson(): Promise<any> {
    try {
      const styleId = 'bag_standaardvisualisatie__netherlandsrdnewquad';
      const url = `${this.pdokBaseUrl}/styles/${styleId}?f=json`;
      console.log('BAG Layer Service: Fetching style JSON from:', url);

      const response = await firstValueFrom(
        this.http.get<any>(url, {
          headers: { Accept: 'application/json' },
        })
      );

      console.log('BAG Layer Service: Style JSON fetched successfully');
      return response;
    } catch (error) {
      console.error('BAG Layer Service: Error fetching style JSON:', error);
      return null;
    }
  }

  /**
   * Fetches the tile matrix set from PDOK API
   */
  private async getTileMatrixSet(): Promise<TileMatrixSet | null> {
    try {
      // Use the standard endpoint for the TileMatrixSet definition
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
   * Builds a vector tile layer with the correct tile grid configuration and style.
   */
  private buildVectorTileLayer(tileMatrixSet: TileMatrixSet, styleJson: any): VectorTileLayer {
    const urlTemplate = `${this.pdokBaseUrl}/tiles/${this.tileMatrixSetId}/{z}/{y}/{x}?f=mvt`;
    console.log('BAG Layer Service: Building layer with URL template:', urlTemplate);

    const projection = getProjection('EPSG:28992');
    if (!projection) {
      throw new Error('EPSG:28992 projection not found');
    }

    const resolutions: number[] = [];
    const tileSize = 256;

    // Sort tile matrices by scale (descending) to get correct zoom levels (Z0, Z1, Z2, ...)
    const sortedMatrices = [...(tileMatrixSet.tileMatrices || [])].sort(
      (a, b) => b.scaleDenominator - a.scaleDenominator
    );

    sortedMatrices.forEach((matrix: TileMatrix) => {
      // Use the scale factor 0.00028 specific to RD New/PDOK to calculate resolution from scale denominator
      resolutions.push(matrix.scaleDenominator * 0.00028);
    });

    console.log('BAG Layer Service: Resolutions calculated:', resolutions.length, 'levels');

    // --- CRITICAL FIX: Zoom Level 12 Restriction ---
    let maxResolution = Infinity;
    let minResolution = 0;

    // PDOK tiles often start at Z0, so Z12 is at index 12.
    // To restrict visibility to Z12 only:
    // 1. maxResolution: Use the resolution of Z11 (index 11). The layer is visible for resolutions *smaller* than this (i.e., Z12 and up).
    // 2. minResolution: Use the resolution of Z13 (index 13). The layer is visible for resolutions *larger* than this (i.e., Z12 and down).

    const Z11_INDEX = 11;
    const Z13_INDEX = 13;

    if (resolutions.length > Z13_INDEX) {
      maxResolution = resolutions[Z11_INDEX]; // Hide when resolution is larger than Z11's (i.e., Z0 to Z11)
      minResolution = resolutions[Z13_INDEX]; // Hide when resolution is smaller than Z13's (i.e., Z13 and up)

      console.log(
        `BAG Layer Service: Restricted visibility to Z12: MaxRes=${maxResolution.toFixed(
          2
        )}, MinRes=${minResolution.toFixed(4)}`
      );
    } else {
      console.warn(
        `BAG Layer Service: Insufficient resolutions (${resolutions.length}) to strictly define Z12 range. Layer visibility might be incorrect.`
      );
    }
    // ------------------------------------------------

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
      attributions: ['© Kadaster (BAG)'],
      tileGrid: tileGrid,
    });

    // --- Style Application (Placeholder remains) ---
    const placeholderStyle: StyleFunction = (feature: FeatureLike, resolution: number) => {
      // Check the 'layer' property on the feature to see which data layer it belongs to (e.g., 'pand')
      // const featureLayerName = feature.get('layer');

      return new Style({
        fill: new Fill({
          color: 'rgba(255, 0, 255, 0.4)',
        }),
        stroke: new Stroke({
          color: '#ff00ff',
          width: 1.5,
        }),
      });
    };

    const vectorTileLayer = new VectorTileLayer({
      source: vectorTileSource,
      properties: {
        id: 'bag',
        name: 'BAG Panden',
        type: 'overlay',
      },
      // Apply the computed resolution constraints
      maxResolution: maxResolution,
      minResolution: minResolution,
      style: placeholderStyle,
    });

    console.log('BAG Layer Service: VectorTileLayer created');
    return vectorTileLayer;
  }
}

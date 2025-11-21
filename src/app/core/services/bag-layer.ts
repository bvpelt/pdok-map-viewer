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
import { applyStyle } from 'ol-mapbox-style';

@Injectable({ providedIn: 'root' })
export class BagLayerService {
  private readonly http = inject(HttpClient);
  private readonly pdokBaseUrl = 'https://api.pdok.nl/lv/bag/ogc/v1';
  private readonly tileMatrixSetId = 'NetherlandsRDNewQuad';

  async createLayer(): Promise<VectorTileLayer> {
    console.log('BAG Layer Service: Starting layer creation');

    const tileMatrixSet = await this.getTileMatrixSet();
    if (!tileMatrixSet) {
      throw new Error('Failed to fetch TileMatrixSet from PDOK for BAG');
    }

    const styleJson = await this.getStyleJson();
    if (!styleJson) {
      throw new Error('Failed to fetch style JSON from PDOK for BAG');
    }

    const layer = await this.buildVectorTileLayer(tileMatrixSet, styleJson);

    console.log('BAG Layer Service: Layer created successfully');
    return layer;
  }

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

  private async buildVectorTileLayer(
    tileMatrixSet: TileMatrixSet,
    styleJson: any
  ): Promise<VectorTileLayer> {
    const projection = getProjection('EPSG:28992');
    if (!projection) {
      throw new Error('EPSG:28992 projection not found');
    }

    const resolutions: number[] = [];
    const tileSize = 256;

    const sortedMatrices = [...(tileMatrixSet.tileMatrices || [])].sort(
      (a, b) => b.scaleDenominator - a.scaleDenominator
    );

    sortedMatrices.forEach((matrix: TileMatrix) => {
      resolutions.push(matrix.scaleDenominator * 0.00028);
    });

    console.log('BAG Layer Service: Resolutions calculated:', resolutions.length, 'levels');

    // Zoom level restriction for Z12
    let maxResolution = Infinity;
    let minResolution = 0;

    const Z11_INDEX = 11;
    const Z13_INDEX = 13;

    if (resolutions.length > Z13_INDEX) {
      maxResolution = resolutions[Z11_INDEX];
      minResolution = resolutions[Z13_INDEX];

      console.log(
        `BAG Layer Service: Restricted visibility to Z12: MaxRes=${maxResolution.toFixed(
          2
        )}, MinRes=${minResolution.toFixed(4)}`
      );
    }

    const extent = projection.getExtent() || [-285401.92, 22598.08, 595401.92, 903401.92];
    const origin = getTopLeft(extent);

    const tileGrid = new TileGrid({
      origin: origin,
      resolutions: resolutions,
      tileSize: tileSize,
    });

    // Create tile URL function that forces Z12
    const tileUrlFunction = (tileCoord: any) => {
      if (!tileCoord) return undefined;

      const z = 12; // Force zoom level 12
      const x = tileCoord[1];
      const y = tileCoord[2];

      return `${this.pdokBaseUrl}/tiles/${this.tileMatrixSetId}/${z}/${y}/${x}?f=mvt`;
    };

    const vectorTileSource = new VectorTileSource({
      format: new MVT(),
      tileUrlFunction: tileUrlFunction,
      projection: projection,
      attributions: ['© Kadaster (BAG)'],
      tileGrid: tileGrid,
      minZoom: 12,
      maxZoom: 12,
    });

    const vectorTileLayer = new VectorTileLayer({
      source: vectorTileSource,
      properties: {
        id: 'bag',
        name: 'BAG Panden',
        type: 'overlay',
      },
      maxResolution: maxResolution,
      minResolution: minResolution,
    });

    // Apply Mapbox GL style using ol-mapbox-style
    try {
      console.log('BAG Layer Service: Applying Mapbox GL style');

      // Modify the style JSON to point to the correct source
      const modifiedStyle = {
        ...styleJson,
        sources: {
          bag: {
            type: 'vector',
            tiles: [`${this.pdokBaseUrl}/tiles/${this.tileMatrixSetId}/{z}/{y}/{x}?f=mvt`],
          },
        },
      };

      // Apply the style to the layer
      await applyStyle(vectorTileLayer, modifiedStyle, 'bag');

      console.log('BAG Layer Service: Mapbox GL style applied successfully');
    } catch (error) {
      console.error('BAG Layer Service: Error applying style, using fallback:', error);
      // Style application failed, layer will use default rendering
    }

    console.log('BAG Layer Service: VectorTileLayer created');
    return vectorTileLayer;
  }
}

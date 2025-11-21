import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { get as getProjection } from 'ol/proj';
import { getTopLeft } from 'ol/extent';
import TileGrid from 'ol/tilegrid/TileGrid';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
import { applyStyle } from 'ol-mapbox-style';

interface TileJSON {
  tilejson: string;
  name?: string;
  description?: string;
  version?: string;
  attribution?: string;
  scheme?: string;
  tiles: string[];
  minzoom?: number;
  maxzoom?: number;
  bounds?: number[];
  center?: number[];
  vector_layers?: any[];
}

@Injectable({ providedIn: 'root' })
export class BagLayerService {
  private readonly http = inject(HttpClient);
  private readonly pdokBaseUrl = 'https://api.pdok.nl/lv/bag/ogc/v1';
  private readonly tileMatrixSetId = 'NetherlandsRDNewQuad';

  async createLayer(): Promise<VectorTileLayer> {
    console.log('BAG Layer Service: Starting layer creation');

    const tileJson = await this.getTileJson();
    if (!tileJson) {
      throw new Error('Failed to fetch TileJSON from PDOK for BAG');
    }

    const styleJson = await this.getStyleJson();
    if (!styleJson) {
      throw new Error('Failed to fetch style JSON from PDOK for BAG');
    }

    const layer = await this.buildVectorTileLayer(tileJson, styleJson);

    console.log('BAG Layer Service: Layer created successfully');
    return layer;
  }

  private async getTileJson(): Promise<TileJSON | null> {
    try {
      const url = `${this.pdokBaseUrl}/tiles/${this.tileMatrixSetId}?f=tilejson`;
      console.log('BAG Layer Service: Fetching TileJSON from:', url);

      const response = await firstValueFrom(
        this.http.get<TileJSON>(url, {
          headers: { Accept: 'application/json' },
        })
      );

      console.log('BAG Layer Service: TileJSON fetched successfully');
      console.log('BAG Layer Service: Min zoom:', response.minzoom, 'Max zoom:', response.maxzoom);
      return response;
    } catch (error) {
      console.error('BAG Layer Service: Error fetching TileJSON:', error);
      return null;
    }
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

  /**
   * Creates resolutions array for RD New projection
   * Based on the standard RD New tile matrix set
   */
  private createRDNewResolutions(): number[] {
    const resolutions: number[] = [];
    // Standard RD New resolutions from PDOK
    // These match the NetherlandsRDNewQuad tile matrix set
    const maxResolution = 3440.64; // Resolution at zoom level 0

    for (let i = 0; i < 17; i++) {
      resolutions.push(maxResolution / Math.pow(2, i));
    }

    console.log('BAG Layer Service: Created', resolutions.length, 'resolution levels');
    return resolutions;
  }

  private async buildVectorTileLayer(tileJson: TileJSON, styleJson: any): Promise<VectorTileLayer> {
    const projection = getProjection('EPSG:28992');
    if (!projection) {
      throw new Error('EPSG:28992 projection not found');
    }

    const resolutions = this.createRDNewResolutions();

    // Get zoom constraints from TileJSON
    const minZoom = tileJson.minzoom ?? 0;
    const maxZoom = tileJson.maxzoom ?? 16;

    console.log(`BAG Layer Service: Layer zoom range: ${minZoom} to ${maxZoom}`);

    // Calculate resolution constraints based on zoom levels
    // We want the layer VISIBLE across multiple zoom levels (e.g., Z11-Z13)
    // but always LOAD tiles from Z12 only

    const z12Resolution = resolutions[12];

    // Make layer visible from Z11 to Z13 (reasonable range around Z12)
    // maxResolution: visible when resolution < this value
    // To include Z11 (which has HIGHER resolution than Z12), use Z11's resolution
    const maxResolution = resolutions[12]; //resolutions[11]; // ~1.68 - Layer visible when current resolution < 1.68 (includes Z11, Z12, Z13...)

    // minResolution: visible when resolution > this value
    // To include Z13 (which has LOWER resolution than Z12), use Z13's resolution
    const minResolution = resolutions[13]; // ~0.42 - Layer visible when current resolution > 0.42 (includes Z13, Z12, Z11...)

    console.log(`BAG Layer Service: Visibility window Z11-Z13:`);
    console.log(`  Z11 resolution: ${resolutions[11].toFixed(4)}`);
    console.log(`  Z12 resolution: ${z12Resolution.toFixed(4)}`);
    console.log(`  Z13 resolution: ${resolutions[13].toFixed(4)}`);
    console.log(
      `  Max resolution: ${maxResolution.toFixed(
        4
      )} (hide when resolution >= this, i.e., Z10 and more zoomed out)`
    );
    console.log(
      `  Min resolution: ${minResolution.toFixed(
        4
      )} (hide when resolution <= this, i.e., Z14 and more zoomed in)`
    );

    const extent = projection.getExtent() || [-285401.92, 22598.08, 595401.92, 903401.92];
    const origin = getTopLeft(extent);

    const fullTileGrid = new TileGrid({
      origin: origin,
      resolutions: resolutions,
      tileSize: 256,
      extent: extent,
    });

    // Use the tile URL from TileJSON
    const tileUrlTemplate = tileJson.tiles[0];
    console.log('BAG Layer Service: Using tile URL template:', tileUrlTemplate);

    // CRITICAL: Custom tile load function that always uses Z12 tiles
    // regardless of the current map zoom level
    const tileLoadFunction = (tile: any, src: string) => {
      // Extract z, x, y from the generated URL
      const match = src.match(/\/(\d+)\/(\d+)\/(\d+)\?/);
      if (match) {
        const [, z, y, x] = match;

        // Force Z12 in the URL
        const z12Url = src.replace(`/${z}/${y}/${x}?`, `/12/${y}/${x}?`);

        // Log for debugging (remove in production)
        if (z !== '12') {
          console.log(`BAG: Remapping tile request from Z${z} to Z12`);
        }

        // Set the corrected URL and load
        tile.setLoader((extent: any, resolution: number, projection: any) => {
          fetch(z12Url)
            .then((response) => response.arrayBuffer())
            .then((data) => {
              const format = tile.getFormat();
              const features = format.readFeatures(data, {
                extent: extent,
                featureProjection: projection,
              });
              tile.setFeatures(features);
            })
            .catch((error) => {
              console.error('BAG tile load error:', error);
              tile.setState(3); // ERROR state
            });
        });
      } else {
        // Fallback - shouldn't happen
        tile.setLoader(() => {
          tile.setState(3); // ERROR state
        });
      }
    };

    const vectorTileSource = new VectorTileSource({
      format: new MVT(),
      url: tileUrlTemplate,
      projection: projection,
      attributions: tileJson.attribution ? [tileJson.attribution] : ['© Kadaster (BAG)'],
      tileGrid: fullTileGrid,
      tileLoadFunction: tileLoadFunction,
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

      // The style JSON from PDOK should already have the correct source configuration
      // but we can ensure it matches our tile URL
      const modifiedStyle = {
        ...styleJson,
        sources: {
          ...styleJson.sources,
          bag: {
            type: 'vector',
            tiles: tileJson.tiles,
            minzoom: minZoom,
            maxzoom: maxZoom,
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
